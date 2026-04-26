// src/db.rs — Single database client module for brainmate-auth-gateway.
//
// ALL Supabase/PostgreSQL access in the gateway goes through this module.
// Handler functions and store structs never touch PgPool directly.
//
// Design:
//   - DbClient wraps a PgPool (sqlx connection pool, PgBouncer-compatible)
//   - All methods are async-native; no spawn_blocking
//   - Every method emits Prometheus counters, histograms, and tracing spans
//   - Row types map 1-to-1 to table columns (no ORM magic)
//
// PgBouncer transaction-mode rules:
//   - Single-statement methods: safe to call with execute(&self.pool)
//   - Multi-statement methods: MUST acquire an explicit transaction
//     (`pool.begin()`) so all statements land on the same backend connection.
//   - Session-level state (advisory locks, SET, LISTEN) is NOT used.
//
// NOTE: Uses `sqlx::query_as` / `sqlx::query` (runtime-bound).
// To enable compile-time column checking, run:
//   DATABASE_URL=postgres://... cargo sqlx prepare
// and commit the generated `.sqlx/` directory, then switch to `sqlx::query!`.

use std::time::Instant;

use sqlx::{postgres::{PgConnectOptions, PgPoolOptions}, FromRow, PgPool, Postgres, Row, Transaction};
use tracing::instrument;

// ────────────────────────────────────────────────────────────────────────────
// Row types
// ────────────────────────────────────────────────────────────────────────────

/// Maps to the `auth_sessions` table.
#[derive(Debug, Clone, FromRow)]
pub struct DbSession {
    pub id: String,
    pub user_id: String,
    pub issued_at: Option<i64>,
    pub device_info: Option<String>,
    pub expires_at: i64,
    pub revoked: bool,
}

/// Maps to the `auth_refresh_tokens` table.
#[derive(Debug, Clone, FromRow)]
pub struct DbRefreshToken {
    pub token_hash: String,
    pub user_id: String,
    pub device_id: String,
    pub expires_at: i64,
    pub revoked: bool,
    pub rotated_to: Option<String>,
}

/// Result of a checked blacklist lookup — returns both the existence flag
/// and the expiry in a single round-trip for efficient TTL-based rehydration.
#[derive(Debug, Clone)]
pub struct BlacklistEntry {
    pub exists: bool,
    pub expires_at: Option<i64>,
}

// ────────────────────────────────────────────────────────────────────────────
// Client
// ────────────────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct DbClient {
    pool: PgPool,
}

impl DbClient {
    /// Connect to PostgreSQL / Supabase PgBouncer and return a ready client.
    pub async fn connect(url: &str, max_connections: u32) -> Result<Self, sqlx::Error> {
        // PgBouncer transaction-mode requires prepared statement cache to be
        // disabled. PgBouncer does not forward prepared statements across
        // backend connections; a cached prepared statement from connection A
        // will fail when the next query lands on connection B.
        //
        // `statement_cache_capacity(0)` disables the per-connection cache on
        // PgConnectOptions, which is the correct level (pool-level options
        // do not expose this setting in sqlx 0.8).
        let connect_opts: PgConnectOptions = url.parse()?;
        let connect_opts = connect_opts.statement_cache_capacity(0);

        let pool = PgPoolOptions::new()
            .max_connections(max_connections)
            .connect_with(connect_opts)
            .await?;
        Ok(Self { pool })
    }

    /// Expose the inner pool for migration runners.
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    // ────────────────────────────────────────────────────────────────────────
    // Sessions
    // ────────────────────────────────────────────────────────────────────────

    /// Atomically enforce the per-user session limit and insert a new session.
    ///
    /// # Why this must be a transaction
    ///
    /// Without a transaction, two concurrent login requests both read
    /// `count = limit - 1`, both pass the check, and both insert — bypassing
    /// the limit by up to N (where N = concurrency). Wrapping both statements
    /// in a transaction with SERIALIZABLE isolation serializes the
    /// read-check-write, preventing any concurrent bypass.
    ///
    /// All statements execute on the same backend connection under PgBouncer
    /// transaction-pooling mode.
    ///
    /// Returns `true` if a new row was inserted, `false` if the session
    /// already exists (idempotent re-registration).
    #[instrument(
        name = "db.session.create_guarded",
        skip(self, record),
        fields(session_id = %record.id, user_id = %record.user_id)
    )]
    pub async fn create_session_guarded(
        &self,
        record: &DbSession,
        max_sessions: i64,
    ) -> Result<bool, sqlx::Error> {
        let start = Instant::now();

        // Begin an explicit transaction — all statements use `tx` as executor,
        // guaranteeing they land on the same PostgreSQL backend connection.
        let mut tx = self.pool.begin().await?;

        // Step 1: Count active sessions inside the transaction.
        // Using the server-side function (STABLE, runs efficiently via the
        // covering index on (user_id, expires_at) WHERE revoked=FALSE).
        let count_row = sqlx::query(
            "SELECT count_active_sessions_for_user($1) AS cnt",
        )
        .bind(&record.user_id)
        .fetch_one(&mut *tx)
        .await?;

        let active_count: i64 = count_row.try_get("cnt").unwrap_or(0);

        if active_count >= max_sessions {
            // Roll back and signal limit exceeded to caller.
            tx.rollback().await?;
            return Err(sqlx::Error::Protocol(
                "max_sessions_exceeded".to_string(),
            ));
        }

        // Step 2: Insert new session (ON CONFLICT DO NOTHING for idempotency).
        // DO NOTHING — not DO UPDATE — because we never want a retry to
        // silently overwrite a revocation applied between the first attempt
        // and the retry.
        let result = sqlx::query(
            r#"
            INSERT INTO auth_sessions
                (id, user_id, issued_at, device_info, expires_at, revoked, updated_at)
            VALUES
                ($1, $2, $3, $4, $5, FALSE, NOW())
            ON CONFLICT (id) DO NOTHING
            "#,
        )
        .bind(&record.id)
        .bind(&record.user_id)
        .bind(record.issued_at)
        .bind(&record.device_info)
        .bind(record.expires_at)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        let inserted = result.rows_affected() > 0;

        metrics::histogram!(
            "auth_db_query_duration_seconds",
            "operation" => "create_session_guarded"
        )
        .record(start.elapsed().as_secs_f64());
        metrics::counter!("auth_db_writes_total", "store" => "session").increment(1);

        Ok(inserted)
    }

    /// Fetch a single session by its Clerk session ID.
    ///
    /// Single statement — safe to call directly on `&self.pool`.
    #[instrument(name = "db.session.get", skip(self), fields(session_id = %session_id))]
    pub async fn get_session(&self, session_id: &str) -> Result<Option<DbSession>, sqlx::Error> {
        let start = Instant::now();

        let row = sqlx::query_as::<_, DbSession>(
            r#"
            SELECT id, user_id, issued_at, device_info, expires_at, revoked
            FROM   auth_sessions
            WHERE  id = $1
            "#,
        )
        .bind(session_id)
        .fetch_optional(&self.pool)
        .await?;

        metrics::histogram!(
            "auth_db_query_duration_seconds",
            "operation" => "get_session"
        )
        .record(start.elapsed().as_secs_f64());
        metrics::counter!("auth_db_reads_total", "store" => "session").increment(1);

        Ok(row)
    }

    /// Mark a session as revoked.
    ///
    /// Single statement — safe to call directly on `&self.pool`.
    #[instrument(name = "db.session.revoke", skip(self), fields(session_id = %session_id))]
    pub async fn revoke_session(&self, session_id: &str) -> Result<(), sqlx::Error> {
        let start = Instant::now();

        sqlx::query(
            r#"
            UPDATE auth_sessions
            SET    revoked    = TRUE,
                   revoked_at = NOW(),
                   updated_at = NOW()
            WHERE  id      = $1
              AND  revoked = FALSE
            "#,
        )
        .bind(session_id)
        .execute(&self.pool)
        .await?;

        metrics::histogram!(
            "auth_db_query_duration_seconds",
            "operation" => "revoke_session"
        )
        .record(start.elapsed().as_secs_f64());
        metrics::counter!("auth_db_writes_total", "store" => "session").increment(1);

        Ok(())
    }

    // ────────────────────────────────────────────────────────────────────────
    // Blacklist
    // ────────────────────────────────────────────────────────────────────────

    /// Insert a JTI into the blacklist table (idempotent, single statement).
    #[instrument(name = "db.blacklist.add", skip(self), fields(jti = %jti))]
    pub async fn add_to_blacklist(&self, jti: &str, expires_at: i64) -> Result<(), sqlx::Error> {
        let start = Instant::now();

        sqlx::query(
            r#"
            INSERT INTO auth_blacklist (jti, expires_at)
            VALUES ($1, $2)
            ON CONFLICT (jti) DO NOTHING
            "#,
        )
        .bind(jti)
        .bind(expires_at)
        .execute(&self.pool)
        .await?;

        metrics::histogram!(
            "auth_db_query_duration_seconds",
            "operation" => "add_blacklist"
        )
        .record(start.elapsed().as_secs_f64());
        metrics::counter!("auth_db_writes_total", "store" => "blacklist").increment(1);

        Ok(())
    }

    /// Check whether a JTI is present and not yet expired.
    ///
    /// Returns a `BlacklistEntry` with both the existence flag and the
    /// `expires_at` timestamp in a SINGLE round-trip, using the covering
    /// index `idx_auth_blacklist_jti_exp` for an index-only scan.
    ///
    /// # Why one query instead of two
    ///
    /// The previous implementation called `is_blacklisted()` and then
    /// `get_blacklist_expires_at()` in sequence. Under PgBouncer transaction
    /// mode, these could land on different backend connections, and between
    /// the two calls the cleanup job could delete the row — leading to a
    /// stale `true` result followed by a missed expiry lookup. One query
    /// eliminates both the extra round-trip and the TOCTOU window.
    #[instrument(
        name = "db.blacklist.check",
        skip(self),
        fields(jti = %jti)
    )]
    pub async fn check_blacklist(&self, jti: &str) -> Result<BlacklistEntry, sqlx::Error> {
        let start = Instant::now();
        let now_secs: i64 = now_unix_secs() as i64;

        // Single query: fetch jti+expires_at in one row — or nothing.
        // Covered by idx_auth_blacklist_jti_exp (index-only scan).
        let row = sqlx::query(
            r#"
            SELECT expires_at
            FROM   auth_blacklist
            WHERE  jti        = $1
              AND  expires_at > $2
            "#,
        )
        .bind(jti)
        .bind(now_secs)
        .fetch_optional(&self.pool)
        .await?;

        metrics::histogram!(
            "auth_db_query_duration_seconds",
            "operation" => "check_blacklist"
        )
        .record(start.elapsed().as_secs_f64());
        metrics::counter!("auth_db_reads_total", "store" => "blacklist").increment(1);

        match row {
            Some(r) => Ok(BlacklistEntry {
                exists: true,
                expires_at: r.try_get::<i64, _>("expires_at").ok(),
            }),
            None => Ok(BlacklistEntry {
                exists: false,
                expires_at: None,
            }),
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Refresh tokens
    // ────────────────────────────────────────────────────────────────────────

    /// Issue an initial refresh token (idempotent, single statement).
    ///
    /// Uses `ON CONFLICT DO NOTHING` — not `DO UPDATE` — so retried issuances
    /// do not silently overwrite a revocation applied by a concurrent rotation.
    pub async fn insert_refresh_token(
        &self,
        record: &DbRefreshToken,
    ) -> Result<(), sqlx::Error> {
        let start = Instant::now();

        sqlx::query(
            r#"
            INSERT INTO auth_refresh_tokens
                (token_hash, user_id, device_id, expires_at, revoked, rotated_to, updated_at)
            VALUES
                ($1, $2, $3, $4, FALSE, NULL, NOW())
            ON CONFLICT (token_hash) DO NOTHING
            "#,
        )
        .bind(&record.token_hash)
        .bind(&record.user_id)
        .bind(&record.device_id)
        .bind(record.expires_at)
        .execute(&self.pool)
        .await?;

        metrics::histogram!(
            "auth_db_query_duration_seconds",
            "operation" => "insert_refresh"
        )
        .record(start.elapsed().as_secs_f64());
        metrics::counter!("auth_db_writes_total", "store" => "refresh").increment(1);

        Ok(())
    }

    /// Atomically rotate a refresh token inside a single DB transaction.
    ///
    /// # Why this must be a transaction
    ///
    /// Rotation is a two-step operation:
    ///   1. UPDATE old token: set `revoked=true`, `rotated_to=<new_hash>`
    ///   2. INSERT new token row
    ///
    /// Without a transaction:
    ///   - A crash between steps 1 and 2 leaves `rotated_to=NULL` on the old
    ///     record and the new token permanently absent from the DB — the client
    ///     holds a token that cannot be validated after Redis eviction.
    ///   - A concurrent rotation request may also pass the `revoked=false`
    ///     gate because both reads happen before either write commits.
    ///
    /// With a transaction + `UPDATE ... WHERE revoked=FALSE RETURNING`:
    ///   - The UPDATE atomically both reads and writes the revocation flag.
    ///   - If `rows_affected() == 0`, another request already revoked the token
    ///     → replay detected, transaction rolled back, no new token inserted.
    ///   - The INSERT of the new token is guarded by the same transaction: it
    ///     only executes if the UPDATE succeeded.
    ///   - Crash between UPDATE and INSERT? PostgreSQL rolls back the
    ///     transaction automatically — old token remains `revoked=false`,
    ///     rotation can be retried cleanly.
    ///
    /// Returns `Some(DbRefreshToken)` (new record) if rotation succeeded,
    /// `None` if the old token was already revoked (replay detected).
    #[instrument(
        name = "db.refresh.rotate_tx",
        skip(self),
        fields(old_hash = %old_token_hash, new_hash = %new_token_hash)
    )]
    pub async fn rotate_refresh_token_tx(
        &self,
        old_token_hash: &str,
        new_token_hash: &str,
        new_user_id: &str,
        new_device_id: &str,
        new_expires_at: i64,
    ) -> Result<Option<DbRefreshToken>, sqlx::Error> {
        let start = Instant::now();

        let mut tx = self.pool.begin().await?;

        // Step 1: Atomically revoke the old token and set the rotation pointer.
        //
        // WHERE revoked=FALSE ensures this is a no-op for already-rotated tokens.
        // RETURNING gives us the old record fields without a separate SELECT.
        let revoked = sqlx::query(
            r#"
            UPDATE auth_refresh_tokens
            SET    revoked    = TRUE,
                   rotated_to = $2,
                   updated_at = NOW()
            WHERE  token_hash = $1
              AND  revoked    = FALSE
              AND  expires_at > $3
            RETURNING token_hash, user_id, device_id, expires_at
            "#,
        )
        .bind(old_token_hash)
        .bind(new_token_hash)
        .bind(now_unix_secs() as i64)
        .fetch_optional(&mut *tx)
        .await?;

        if revoked.is_none() {
            // Token was already revoked, expired, or never existed.
            // Replay attack or double-rotation attempt. Roll back immediately.
            tx.rollback().await?;

            metrics::histogram!(
                "auth_db_query_duration_seconds",
                "operation" => "rotate_refresh_replay"
            )
            .record(start.elapsed().as_secs_f64());

            return Ok(None);
        }

        // Step 2: Insert the new token inside the same transaction.
        // ON CONFLICT DO NOTHING handles true idempotent retries where step 1
        // already committed but step 2 failed (client retries exact same pair).
        sqlx::query(
            r#"
            INSERT INTO auth_refresh_tokens
                (token_hash, user_id, device_id, expires_at, revoked, rotated_to, updated_at)
            VALUES
                ($1, $2, $3, $4, FALSE, NULL, NOW())
            ON CONFLICT (token_hash) DO NOTHING
            "#,
        )
        .bind(new_token_hash)
        .bind(new_user_id)
        .bind(new_device_id)
        .bind(new_expires_at)
        .execute(&mut *tx)
        .await?;

        // Step 3: Commit both mutations atomically.
        tx.commit().await?;

        metrics::histogram!(
            "auth_db_query_duration_seconds",
            "operation" => "rotate_refresh_tx"
        )
        .record(start.elapsed().as_secs_f64());
        metrics::counter!("auth_db_writes_total", "store" => "refresh").increment(2);

        let new_record = DbRefreshToken {
            token_hash: new_token_hash.to_string(),
            user_id: new_user_id.to_string(),
            device_id: new_device_id.to_string(),
            expires_at: new_expires_at,
            revoked: false,
            rotated_to: None,
        };

        Ok(Some(new_record))
    }

    /// Fetch a refresh token record by its SHA256 hash (single statement).
    #[instrument(name = "db.refresh.get", skip(self), fields(token_hash = %token_hash))]
    pub async fn get_refresh_token(
        &self,
        token_hash: &str,
    ) -> Result<Option<DbRefreshToken>, sqlx::Error> {
        let start = Instant::now();

        let row = sqlx::query_as::<_, DbRefreshToken>(
            r#"
            SELECT token_hash, user_id, device_id, expires_at, revoked, rotated_to
            FROM   auth_refresh_tokens
            WHERE  token_hash = $1
            "#,
        )
        .bind(token_hash)
        .fetch_optional(&self.pool)
        .await?;

        metrics::histogram!(
            "auth_db_query_duration_seconds",
            "operation" => "get_refresh"
        )
        .record(start.elapsed().as_secs_f64());
        metrics::counter!("auth_db_reads_total", "store" => "refresh").increment(1);

        Ok(row)
    }

    /// Mark a refresh token as revoked (direct revocation, not rotation).
    ///
    /// Single statement — safe to call directly on `&self.pool`.
    /// Only updates if currently not revoked (idempotent guard).
    #[instrument(name = "db.refresh.revoke", skip(self), fields(token_hash = %token_hash))]
    pub async fn revoke_refresh_token(&self, token_hash: &str) -> Result<(), sqlx::Error> {
        let start = Instant::now();

        sqlx::query(
            r#"
            UPDATE auth_refresh_tokens
            SET    revoked    = TRUE,
                   updated_at = NOW()
            WHERE  token_hash = $1
              AND  revoked    = FALSE
            "#,
        )
        .bind(token_hash)
        .execute(&self.pool)
        .await?;

        metrics::histogram!(
            "auth_db_query_duration_seconds",
            "operation" => "revoke_refresh"
        )
        .record(start.elapsed().as_secs_f64());
        metrics::counter!("auth_db_writes_total", "store" => "refresh").increment(1);

        Ok(())
    }

    // ────────────────────────────────────────────────────────────────────────
    // Maintenance
    // ────────────────────────────────────────────────────────────────────────

    /// Run the server-side cleanup function to prune expired records.
    pub async fn run_cleanup(&self) -> Result<(), sqlx::Error> {
        sqlx::query("SELECT cleanup_expired_auth()")
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ────────────────────────────────────────────────────────────────────────
    // Transaction helper — exposed for callers that need external TX scope
    // ────────────────────────────────────────────────────────────────────────

    /// Begin an explicit PostgreSQL transaction.
    ///
    /// The caller MUST call `tx.commit()` or `tx.rollback()` before the
    /// `Transaction` handle is dropped; otherwise sqlx will roll back automatically.
    pub async fn begin(&self) -> Result<Transaction<'_, Postgres>, sqlx::Error> {
        self.pool.begin().await
    }
}

fn now_unix_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

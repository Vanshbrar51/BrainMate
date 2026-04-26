// src/session_store.rs — Write-through + cache-aside session store.
//
// Architecture:
//   WRITE: DB transaction (count + insert, atomic) → Redis SET NX EX (warn-only)
//   READ:  Redis first → DB fallback on miss → rehydrate Redis on DB hit
//   DELETE: DB UPDATE revoked=TRUE → Redis GETDEL (atomic Lua)
//
// Write ordering invariant:
//   The DB transaction MUST commit before any Redis write is attempted.
//   Redis is never written before the DB commit succeeds.
//   If the DB commit fails, no Redis write occurs and the error is propagated.
//
// PgBouncer compatibility:
//   - create_session uses db.create_session_guarded() — explicit transaction,
//     all statements on the same backend connection.
//   - revoke_session uses a single UPDATE statement — safe without a TX.
//   - Counter updates use Redis, not DB — no DB connection involved.
//
// When `db` is None the behaviour is identical to the original Redis-only
// implementation. All existing tests continue to pass.

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::{
    db::{DbClient, DbSession},
    error::ApiError,
    redis_client::RedisClient,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub user_id: String,
    pub issued_at: Option<u64>,
    pub device_info: Option<String>,
}

#[derive(Clone)]
pub struct SessionStore {
    redis: Arc<RedisClient>,
    db: Option<Arc<DbClient>>,
}

impl SessionStore {
    pub fn new(redis: Arc<RedisClient>, db: Option<Arc<DbClient>>) -> Self {
        Self { redis, db }
    }

    pub fn key(session_id: &str) -> String {
        format!("session:{session_id}")
    }

    pub fn user_session_count_key(user_id: &str) -> String {
        use sha2::{Digest, Sha256};
        let hash = hex::encode(Sha256::digest(user_id.as_bytes()));
        format!("session_count:{hash}")
    }

    // ── Redis counter helpers (Redis-only fast path for session counts) ─────

    pub async fn count_user_sessions(&self, user_id: &str) -> Result<u64, ApiError> {
        let key = Self::user_session_count_key(user_id);
        let val = self
            .redis
            .get_string(&key)
            .await
            .map_err(|e| ApiError::service_unavailable(format!("count read failed: {e}")))?;
        Ok(val.and_then(|s| s.parse::<u64>().ok()).unwrap_or(0))
    }

    pub async fn increment_user_session_count(
        &self,
        user_id: &str,
        ttl_secs: u64,
    ) -> Result<u64, ApiError> {
        let key = Self::user_session_count_key(user_id);
        self.redis
            .atomic_incr_ex(&key, ttl_secs)
            .await
            .map_err(|e| ApiError::service_unavailable(format!("count incr failed: {e}")))
    }

    pub async fn decrement_user_session_count(&self, user_id: &str) -> Result<(), ApiError> {
        let key = Self::user_session_count_key(user_id);
        self.redis
            .atomic_decr(&key)
            .await
            .map_err(|e| ApiError::service_unavailable(format!("count decr failed: {e}")))?;
        Ok(())
    }

    // ── create_session ─────────────────────────────────────────────────────

    /// Create a new session, atomically enforcing the per-user session limit.
    ///
    /// # Write ordering
    ///
    /// 1. DB transaction: `count_active_sessions_for_user()` + `INSERT` in one TX.
    ///    The transaction serializes concurrent login requests — no TOCTOU race.
    /// 2. Only after DB COMMIT: write to Redis (warn-only on Redis failure).
    ///
    /// This means:
    ///   - If the DB TX fails → no Redis write, error propagated to caller.
    ///   - If Redis fails after DB COMMIT → session exists in DB, Redis will
    ///     be rehydrated on the next `validate_session()` call.
    ///   - Never: Redis has a session that DB does not.
    pub async fn create_session(
        &self,
        session_id: &str,
        user_id: &str,
        issued_at: Option<u64>,
        device_info: Option<String>,
        ttl_secs: u64,
        max_sessions_per_user: u32,
    ) -> Result<(), ApiError> {
        validate_session_id(session_id)?;
        if user_id.trim().is_empty() {
            return Err(ApiError::bad_request("user_id is required"));
        }

        // ── DB path ─────────────────────────────────────────────────────────
        if let Some(ref db) = self.db {
            let expires_at = now_unix_secs() + ttl_secs;
            let db_record = DbSession {
                id: session_id.to_string(),
                user_id: user_id.to_string(),
                issued_at: issued_at.map(|v| v as i64),
                device_info: device_info.clone(),
                expires_at: expires_at as i64,
                revoked: false,
            };

            // Single transactional call: count + insert, serialized server-side.
            match db
                .create_session_guarded(&db_record, i64::from(max_sessions_per_user))
                .await
            {
                Ok(_inserted) => {
                    // DB committed. Now write to Redis (warn-only).
                    let record = SessionRecord {
                        user_id: user_id.to_string(),
                        issued_at,
                        device_info,
                    };
                    if let Err(err) = self
                        .redis
                        .set_json_nx_ex(&Self::key(session_id), &record, ttl_secs)
                        .await
                    {
                        // Redis failure is non-fatal: DB is the source of truth.
                        // validate_session() will rehydrate Redis on next access.
                        tracing::warn!(
                            session_id = %session_id,
                            "session Redis write failed after DB commit (will rehydrate on next access): {err}"
                        );
                    }
                    return Ok(());
                }
                Err(sqlx::Error::Protocol(msg)) if msg == "max_sessions_exceeded" => {
                    return Err(ApiError::bad_request(
                        "Maximum concurrent sessions exceeded for this user",
                    ));
                }
                Err(e) => {
                    return Err(ApiError::service_unavailable(format!(
                        "session db write failed: {e}"
                    )));
                }
            }
        }

        // ── Redis-only mode (db = None) ──────────────────────────────────────
        let record = SessionRecord {
            user_id: user_id.to_string(),
            issued_at,
            device_info,
        };

        let created = match self
            .redis
            .set_json_nx_ex(&Self::key(session_id), &record, ttl_secs)
            .await
        {
            Ok(v) => v,
            Err(err) => {
                return Err(ApiError::service_unavailable(format!(
                    "session write failed: {err}"
                )));
            }
        };

        if !created {
            // Key already exists in Redis — verify ownership (no DB to check).
            let existing = self
                .redis
                .get_json::<SessionRecord>(&Self::key(session_id))
                .await
                .map_err(|err| {
                    ApiError::service_unavailable(format!("session lookup failed: {err}"))
                })?;
            if let Some(existing_record) = existing {
                if existing_record.user_id != user_id {
                    return Err(ApiError::unauthorized(
                        "Session already registered to a different user",
                    ));
                }
            }
            return Ok(());
        }

        // Redis-only: use Redis counter as authoritative session count.
        let new_count = self
            .increment_user_session_count(user_id, ttl_secs)
            .await?;
        if new_count > u64::from(max_sessions_per_user) {
            let _ = self.redis.delete(&Self::key(session_id)).await;
            let _ = self.decrement_user_session_count(user_id).await;
            return Err(ApiError::bad_request(
                "Maximum concurrent sessions exceeded for this user",
            ));
        }

        Ok(())
    }

    // ── validate_session ───────────────────────────────────────────────────

    pub async fn validate_session(
        &self,
        session_id: &str,
        expected_user_id: &str,
    ) -> Result<SessionRecord, ApiError> {
        validate_session_id(session_id)?;

        // 1. Redis fast path
        match self
            .redis
            .get_json::<SessionRecord>(&Self::key(session_id))
            .await
        {
            Ok(Some(record)) => {
                metrics::counter!("session_cache_hit").increment(1);
                if record.user_id != expected_user_id {
                    return Err(ApiError::unauthorized("Session user mismatch"));
                }
                return Ok(record);
            }
            Ok(None) => {}
            Err(err) => {
                if self.db.is_none() {
                    return Err(ApiError::service_unavailable(format!(
                        "session lookup failed: {err}"
                    )));
                }
                tracing::warn!(
                    session_id = %session_id,
                    "Redis session lookup error, falling back to DB: {err}"
                );
            }
        }

        // 2. DB fallback (single statement, no TX needed for a SELECT)
        if let Some(ref db) = self.db {
            metrics::counter!("session_db_fallback").increment(1);

            let db_row = db.get_session(session_id).await.map_err(|e| {
                ApiError::service_unavailable(format!("session db lookup failed: {e}"))
            })?;

            let Some(row) = db_row else {
                return Err(ApiError::unauthorized("Session is not active"));
            };

            if row.revoked {
                return Err(ApiError::unauthorized("Session has been revoked"));
            }

            let now = now_unix_secs() as i64;
            if row.expires_at <= now {
                return Err(ApiError::unauthorized("Session has expired"));
            }

            if row.user_id != expected_user_id {
                return Err(ApiError::unauthorized("Session user mismatch"));
            }

            // 3. Rehydrate Redis (DB IS truth here, remaining TTL is authoritative)
            let remaining_ttl = (row.expires_at - now) as u64;
            let record = SessionRecord {
                user_id: row.user_id,
                issued_at: row.issued_at.map(|v| v as u64),
                device_info: row.device_info,
            };

            if let Err(err) = self
                .redis
                .set_json_ex(&Self::key(session_id), &record, remaining_ttl)
                .await
            {
                tracing::warn!(session_id = %session_id, "session Redis rehydration failed: {err}");
            } else {
                metrics::counter!("auth_cache_rehydrations_total", "store" => "session")
                    .increment(1);
            }

            return Ok(record);
        }

        Err(ApiError::unauthorized("Session is not active"))
    }

    /// Read a session without enforcing user ownership (admin/reconciliation use).
    pub async fn get_session(
        &self,
        session_id: &str,
    ) -> Result<Option<SessionRecord>, ApiError> {
        validate_session_id(session_id)?;
        self.redis
            .get_json::<SessionRecord>(&Self::key(session_id))
            .await
            .map_err(|err| ApiError::service_unavailable(format!("session lookup failed: {err}")))
    }

    // ── revoke_session ─────────────────────────────────────────────────────

    /// Revoke a session.
    ///
    /// # Write ordering
    ///
    /// 1. DB: `UPDATE auth_sessions SET revoked=TRUE WHERE id=$1 AND revoked=FALSE`
    ///    Single statement — PgBouncer-safe. The `AND revoked=FALSE` guard makes
    ///    this idempotent: a second call is a no-op in the DB.
    /// 2. Only after DB write: Redis atomic GETDEL to remove the cache entry
    ///    and retrieve the old record for counter decrement.
    ///
    /// If Redis GETDEL fails and DB is available: warn-only — DB already revoked.
    /// If Redis GETDEL fails and no DB: hard error.
    pub async fn revoke_session(&self, session_id: &str) -> Result<(), ApiError> {
        validate_session_id(session_id)?;

        // 1. DB write (authoritative, single statement, idempotent)
        if let Some(ref db) = self.db {
            db.revoke_session(session_id).await.map_err(|e| {
                ApiError::service_unavailable(format!("session db revoke failed: {e}"))
            })?;
        }

        // 2. Redis atomic GETDEL — removes the key in one round-trip and
        //    returns the value so we can decrement the session counter.
        const SESSION_GETDEL_SCRIPT: &str = r#"
local val = redis.call("GET", KEYS[1])
if val then
  redis.call("DEL", KEYS[1])
  return val
else
  return false
end
"#;
        let script_sha = {
            use sha2::{Digest, Sha256};
            let mut h = Sha256::new();
            h.update(SESSION_GETDEL_SCRIPT.as_bytes());
            hex::encode(h.finalize())
        };

        let key = Self::key(session_id);
        let existing_json: Option<String> = match self
            .redis
            .getdel_atomic(&key, SESSION_GETDEL_SCRIPT, &script_sha)
            .await
        {
            Ok(v) => v,
            Err(err) => {
                if self.db.is_some() {
                    tracing::warn!(
                        session_id = %session_id,
                        "session Redis GETDEL failed (DB already revoked): {err}"
                    );
                    return Ok(());
                } else {
                    return Err(ApiError::service_unavailable(format!(
                        "session revoke failed: {err}"
                    )));
                }
            }
        };

        // 3. Decrement Redis counter using the atomically-retrieved record.
        //    This is safe: GETDEL retrieved and deleted atomically, so we
        //    decrement exactly once per revocation.
        if let Some(json_str) = existing_json {
            if let Ok(rec) = serde_json::from_str::<SessionRecord>(&json_str) {
                let _ = self.decrement_user_session_count(&rec.user_id).await;
            }
        }

        Ok(())
    }
}

pub fn validate_session_id(session_id: &str) -> Result<(), ApiError> {
    if session_id.is_empty() || session_id.len() > 128 {
        return Err(ApiError::bad_request("invalid session id"));
    }
    if !session_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(ApiError::bad_request("invalid session id format"));
    }
    Ok(())
}

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use crate::redis_client::RedisClient;

    use super::{validate_session_id, SessionStore};

    fn make_store() -> SessionStore {
        let redis = Arc::new(RedisClient::new_in_memory());
        SessionStore::new(redis, None)
    }

    #[tokio::test]
    async fn session_roundtrip_works() {
        let store = make_store();

        store
            .create_session("sid_123", "user_123", Some(100), Some("ios".to_string()), 60, 100)
            .await
            .expect("session create should succeed");

        let record = store
            .validate_session("sid_123", "user_123")
            .await
            .expect("session should validate");

        assert_eq!(record.user_id, "user_123");
    }

    #[test]
    fn session_id_validation_blocks_bad_values() {
        assert!(validate_session_id("valid_sid-1").is_ok());
        assert!(validate_session_id("").is_err());
        assert!(validate_session_id("bad sid").is_err());
    }
}

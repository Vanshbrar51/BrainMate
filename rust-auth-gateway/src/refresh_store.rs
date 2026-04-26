// src/refresh_store.rs — Transactional refresh token store.
//
// Architecture:
//   ISSUE:   DB INSERT (single statement, ON CONFLICT DO NOTHING) → Redis SET EX
//   VALIDATE: Redis first → DB fallback → rehydrate Redis on hit
//   ROTATE:  Redis NX lock → DB atomic transaction (UPDATE old + INSERT new)
//              → only after DB COMMIT: update Redis old entry, write Redis new entry
//              → release lock
//   REVOKE:  DB UPDATE (single statement) → Redis mark-revoked
//
// Write ordering invariant for ROTATE (the critical path):
//
//   WRONG (previous implementation):
//     DB: UPDATE old (step 3)
//     Redis: SET old revoked (step 4)    ← Redis written before DB complete
//     DB: INSERT new (step 5)            ← DB crash here = half-rotated state
//     Redis: SET new (step 6)
//
//   CORRECT (this implementation):
//     DB TX BEGIN
//       UPDATE old WHERE revoked=FALSE RETURNING  ← atomic gate
//       INSERT new ON CONFLICT DO NOTHING          ← inside same TX
//     DB TX COMMIT
//     Redis: SET old revoked (warn-only)           ← only after commit
//     Redis: SET new (warn-only)                   ← only after commit
//     Redis: release lock
//
//   A crash between DB BEGIN and COMMIT → PostgreSQL auto-rollback.
//   Old token remains revoked=false; rotation can be retried cleanly.
//   No half-state is possible.
//
// PgBouncer compatibility:
//   rotate uses db.rotate_refresh_token_tx() — all statements in ONE transaction.
//   issue and revoke use single statements — pool.execute() is safe.
//
// When `db` is None, behaviour is identical to the original Redis-only impl.

use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

use crate::{
    db::{DbClient, DbRefreshToken},
    error::ApiError,
    redis_client::RedisClient,
    security_utils::hash_token_identifier,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshTokenRecord {
    pub user_id: String,
    pub device_id: String,
    pub expires_at: u64,
    pub revoked: bool,
    pub rotated_to: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RotationStatus {
    Rotated,
    ReplayDetected,
}

#[derive(Clone)]
pub struct RefreshTokenStore {
    redis: Arc<RedisClient>,
    db: Option<Arc<DbClient>>,
}

impl RefreshTokenStore {
    pub fn new(redis: Arc<RedisClient>, db: Option<Arc<DbClient>>) -> Self {
        Self { redis, db }
    }

    pub fn token_hash(raw_token_id: &str) -> String {
        hash_token_identifier(raw_token_id)
    }

    pub fn key_from_hash(token_hash: &str) -> String {
        format!("refresh:{token_hash}")
    }

    pub fn key(raw_token_id: &str) -> String {
        Self::key_from_hash(&Self::token_hash(raw_token_id))
    }

    fn lock_key(raw_token_id: &str) -> String {
        format!("refresh_lock:{}", Self::token_hash(raw_token_id))
    }

    // ── issue ──────────────────────────────────────────────────────────────

    /// Issue a new refresh token.
    ///
    /// # Write ordering
    ///
    /// 1. DB INSERT (single statement, ON CONFLICT DO NOTHING) — committed.
    /// 2. Only after commit: Redis SET EX (warn-only).
    ///
    /// `ON CONFLICT DO NOTHING` (not `DO UPDATE`) means a retry for the same
    /// token hash is a no-op in DB — a revocation applied by a concurrent
    /// rotation between the first attempt and the retry is NOT overwritten.
    pub async fn issue(
        &self,
        raw_token_id: &str,
        user_id: &str,
        device_id: &str,
        expires_at: u64,
    ) -> Result<(), ApiError> {
        validate_refresh_token_id(raw_token_id)?;
        if user_id.trim().is_empty() || device_id.trim().is_empty() {
            return Err(ApiError::bad_request("user_id and device_id are required"));
        }

        let ttl_secs = ttl_from_expires_at(expires_at)?;
        let token_hash = Self::token_hash(raw_token_id);

        // 1. DB write (authoritative, committed atomically as single statement)
        if let Some(ref db) = self.db {
            let db_record = DbRefreshToken {
                token_hash: token_hash.clone(),
                user_id: user_id.to_string(),
                device_id: device_id.to_string(),
                expires_at: expires_at as i64,
                revoked: false,
                rotated_to: None,
            };
            db.insert_refresh_token(&db_record).await.map_err(|e| {
                ApiError::service_unavailable(format!("refresh db issue failed: {e}"))
            })?;
        }

        // 2. Redis write — only reached after DB commit (warn-only with DB)
        let record = RefreshTokenRecord {
            user_id: user_id.to_string(),
            device_id: device_id.to_string(),
            expires_at,
            revoked: false,
            rotated_to: None,
        };

        if let Err(err) = self
            .redis
            .set_json_ex(&Self::key(raw_token_id), &record, ttl_secs)
            .await
        {
            if self.db.is_some() {
                tracing::warn!(
                    token_hash = %token_hash,
                    "refresh Redis write failed (DB committed, will rehydrate): {err}"
                );
            } else {
                return Err(ApiError::service_unavailable(format!(
                    "refresh issue failed: {err}"
                )));
            }
        }

        Ok(())
    }

    // ── validate ───────────────────────────────────────────────────────────

    pub async fn validate(&self, raw_token_id: &str) -> Result<RefreshTokenRecord, ApiError> {
        validate_refresh_token_id(raw_token_id)?;

        // 1. Redis fast path
        match self
            .redis
            .get_json::<RefreshTokenRecord>(&Self::key(raw_token_id))
            .await
        {
            Ok(Some(record)) => {
                metrics::counter!("auth_cache_hits_total", "store" => "refresh").increment(1);
                return validate_record(record);
            }
            Ok(None) => {}
            Err(err) => {
                if self.db.is_none() {
                    return Err(ApiError::service_unavailable(format!(
                        "refresh lookup failed: {err}"
                    )));
                }
                tracing::warn!("Redis refresh lookup error, falling back to DB: {err}");
            }
        }

        // 2. DB fallback (single statement, no TX needed for SELECT)
        if let Some(ref db) = self.db {
            metrics::counter!("auth_db_fallbacks_total", "store" => "refresh").increment(1);

            let token_hash = Self::token_hash(raw_token_id);
            let db_row = db.get_refresh_token(&token_hash).await.map_err(|e| {
                ApiError::service_unavailable(format!("refresh db lookup failed: {e}"))
            })?;

            let Some(row) = db_row else {
                return Err(ApiError::unauthorized("Refresh token is invalid"));
            };

            let record = RefreshTokenRecord {
                user_id: row.user_id,
                device_id: row.device_id,
                expires_at: row.expires_at as u64,
                revoked: row.revoked,
                rotated_to: row.rotated_to,
            };

            let validated = validate_record(record.clone())?;

            // 3. Rehydrate Redis with remaining TTL
            let now = now_unix_secs();
            if record.expires_at > now {
                let remaining = record.expires_at - now;
                if let Err(err) = self
                    .redis
                    .set_json_ex(&Self::key(raw_token_id), &record, remaining)
                    .await
                {
                    tracing::warn!("refresh Redis rehydration failed: {err}");
                } else {
                    metrics::counter!(
                        "auth_cache_rehydrations_total",
                        "store" => "refresh"
                    )
                    .increment(1);
                }
            }

            return Ok(validated);
        }

        Err(ApiError::unauthorized("Refresh token is invalid"))
    }

    // ── rotate ─────────────────────────────────────────────────────────────

    /// Rotate a refresh token atomically.
    ///
    /// # Race condition protection
    ///
    /// Two layers of protection:
    ///
    /// Layer 1 — Redis distributed lock (5-second TTL):
    ///   Prevents multiple concurrent rotation requests for the same token
    ///   from simultaneously entering the DB transaction. This reduces
    ///   contention and provides a fast-fail for duplicate concurrent requests.
    ///
    /// Layer 2 — DB transaction with `UPDATE ... WHERE revoked=FALSE RETURNING`:
    ///   The UPDATE atomically reads AND sets `revoked=true` in one statement.
    ///   Two concurrent transactions competing on the same row:
    ///   - First wins the row lock, sets revoked=true, gets RETURNING row.
    ///   - Second finds `revoked=true`, UPDATE affects 0 rows, RETURNING = NULL.
    ///   - Second returns ReplayDetected and rolls back.
    ///   This is the authoritative gate — the Redis lock is defense-in-depth.
    ///
    /// # Write ordering
    ///
    ///   1. Redis: acquire NX lock
    ///   2. DB TX: UPDATE old (atomic gate) + INSERT new (same TX)
    ///   3. DB COMMIT
    ///   4. Redis: update old cache entry (warn-only)
    ///   5. Redis: write new cache entry (warn-only)
    ///   6. Redis: release lock
    ///
    /// Steps 4 and 5 only execute after step 3 (DB committed).
    /// Crash at any point between 1 and 3 → PostgreSQL auto-rollback,
    /// old token remains `revoked=false`, retry is safe.
    pub async fn rotate(
        &self,
        old_raw_token_id: &str,
        new_raw_token_id: &str,
        new_expires_at: u64,
    ) -> Result<RotationStatus, ApiError> {
        validate_refresh_token_id(old_raw_token_id)?;
        validate_refresh_token_id(new_raw_token_id)?;
        let new_ttl = ttl_from_expires_at(new_expires_at)?;

        // Layer 1: Redis distributed lock (defense-in-depth)
        let lock_key = Self::lock_key(old_raw_token_id);
        let acquired = self
            .redis
            .set_string_nx_ex(&lock_key, "1", 5)
            .await
            .map_err(|err| ApiError::service_unavailable(format!("refresh lock failed: {err}")))?;

        if !acquired {
            return Err(ApiError::service_unavailable(
                "Refresh token rotation in progress",
            ));
        }

        let result = self
            .do_rotate(old_raw_token_id, new_raw_token_id, new_expires_at, new_ttl)
            .await;

        // Always release the lock, even on error
        let _ = self.redis.delete(&lock_key).await;
        result
    }

    async fn do_rotate(
        &self,
        old_raw_token_id: &str,
        new_raw_token_id: &str,
        new_expires_at: u64,
        new_ttl: u64,
    ) -> Result<RotationStatus, ApiError> {
        let old_key = Self::key(old_raw_token_id);
        let old_hash = Self::token_hash(old_raw_token_id);
        let new_hash = Self::token_hash(new_raw_token_id);

        if let Some(ref db) = self.db {
            return self
                .do_rotate_db(
                    old_raw_token_id,
                    new_raw_token_id,
                    &old_key,
                    &old_hash,
                    &new_hash,
                    new_expires_at,
                    new_ttl,
                    db,
                )
                .await;
        }

        // Redis-only mode
        self.do_rotate_redis_only(old_raw_token_id, new_raw_token_id, new_expires_at, new_ttl)
            .await
    }


    async fn do_rotate_db(
        &self,
        _old_raw_token_id: &str,
        new_raw_token_id: &str,
        old_key: &str,
        old_hash: &str,
        new_hash: &str,
        new_expires_at: u64,
        new_ttl: u64,
        db: &DbClient,
    ) -> Result<RotationStatus, ApiError> {
        // Step A: read the old record to get user_id and device_id.
        // Try Redis first (fastest), then DB if miss.
        let old_record = {
            let redis_record = self
                .redis
                .get_json::<RefreshTokenRecord>(old_key)
                .await
                .ok()
                .flatten();

            if let Some(r) = redis_record {
                r
            } else {
                // DB fallback read (single statement, no TX)
                let Some(row) = db.get_refresh_token(old_hash).await.map_err(|e| {
                    ApiError::service_unavailable(format!("refresh db lookup failed: {e}"))
                })?
                else {
                    // Old token not in DB → replay or already cleaned up
                    return Ok(RotationStatus::ReplayDetected);
                };

                RefreshTokenRecord {
                    user_id: row.user_id,
                    device_id: row.device_id,
                    expires_at: row.expires_at as u64,
                    revoked: row.revoked,
                    rotated_to: row.rotated_to,
                }
            }
        };

        // Pre-flight check (fast path before touching DB TX).
        // Note: the DB transaction is the authoritative gate — this just avoids
        // unnecessary TX overhead for obviously-invalid tokens.
        if old_record.revoked || old_record.expires_at <= now_unix_secs() {
            return Ok(RotationStatus::ReplayDetected);
        }

        // Step B: DB atomic transaction — this is the authoritative gate.
        //
        //   UPDATE auth_refresh_tokens
        //     SET revoked=TRUE, rotated_to=$new_hash
        //     WHERE token_hash=$old_hash AND revoked=FALSE AND expires_at > now()
        //   RETURNING ...
        //
        //   INSERT INTO auth_refresh_tokens (new token) ON CONFLICT DO NOTHING
        //
        // Both statements in a single PostgreSQL transaction.
        let new_db_record = db
            .rotate_refresh_token_tx(
                old_hash,
                new_hash,
                &old_record.user_id,
                &old_record.device_id,
                new_expires_at as i64,
            )
            .await
            .map_err(|e| {
                ApiError::service_unavailable(format!("refresh db rotation failed: {e}"))
            })?;

        let Some(new_record_from_db) = new_db_record else {
            // DB UPDATE affected 0 rows → token already revoked.
            return Ok(RotationStatus::ReplayDetected);
        };

        // Step C: Redis cache updates — ONLY after DB commit.
        // Both are warn-only; DB is now the source of truth.

        // Update old cache entry to reflect revoked state (for any in-flight
        // request that might read it from Redis in the next few ms).
        let mut revoked_old = old_record.clone();
        revoked_old.revoked = true;
        revoked_old.rotated_to = Some(new_hash.to_string());
        let old_remaining_ttl = old_record.expires_at.saturating_sub(now_unix_secs()).max(60);

        if let Err(err) = self
            .redis
            .set_json_ex(old_key, &revoked_old, old_remaining_ttl)
            .await
        {
            tracing::warn!(
                old_hash = %old_hash,
                "rotate: Redis old entry update failed (DB committed): {err}"
            );
        }

        // Write new token cache entry.
        let new_cache_record = RefreshTokenRecord {
            user_id: new_record_from_db.user_id,
            device_id: new_record_from_db.device_id,
            expires_at: new_record_from_db.expires_at as u64,
            revoked: false,
            rotated_to: None,
        };

        if let Err(err) = self
            .redis
            .set_json_ex(&Self::key(new_raw_token_id), &new_cache_record, new_ttl)
            .await
        {
            tracing::warn!(
                new_hash = %new_hash,
                "rotate: Redis new entry write failed (DB committed, client will fallback to DB): {err}"
            );
        }

        Ok(RotationStatus::Rotated)
    }

    // Redis-only rotation (db = None) — kept for backward compatibility.
    // Uses the Redis lock as the sole race-condition guard.
    async fn do_rotate_redis_only(
        &self,
        old_raw_token_id: &str,
        new_raw_token_id: &str,
        new_expires_at: u64,
        new_ttl: u64,
    ) -> Result<RotationStatus, ApiError> {
        let old_key = Self::key(old_raw_token_id);

        let current_opt: Option<RefreshTokenRecord> = self
            .redis
            .get_json(&old_key)
            .await
            .map_err(|e| ApiError::service_unavailable(format!("refresh lookup failed: {e}")))?;

        let Some(mut current) = current_opt else {
            return Ok(RotationStatus::ReplayDetected);
        };

        if current.revoked || current.expires_at <= now_unix_secs() {
            return Ok(RotationStatus::ReplayDetected);
        }

        current.revoked = true;
        current.rotated_to = Some(Self::token_hash(new_raw_token_id));

        let old_remaining_ttl = current.expires_at.saturating_sub(now_unix_secs()).max(60);

        // Update old entry first
        self.redis
            .set_json_ex(&old_key, &current, old_remaining_ttl)
            .await
            .map_err(|e| {
                ApiError::service_unavailable(format!("refresh revoke failed: {e}"))
            })?;

        // Write new entry
        let new_record = RefreshTokenRecord {
            user_id: current.user_id,
            device_id: current.device_id,
            expires_at: new_expires_at,
            revoked: false,
            rotated_to: None,
        };

        self.redis
            .set_json_ex(&Self::key(new_raw_token_id), &new_record, new_ttl)
            .await
            .map_err(|e| {
                ApiError::service_unavailable(format!("refresh rotate failed: {e}"))
            })?;

        Ok(RotationStatus::Rotated)
    }

    // ── revoke ─────────────────────────────────────────────────────────────

    /// Directly revoke a refresh token (not rotation — e.g. logout).
    ///
    /// # Write ordering
    ///
    /// 1. DB: `UPDATE ... SET revoked=TRUE WHERE token_hash=$1 AND revoked=FALSE`
    ///    Single statement, idempotent, committed before Redis write.
    /// 2. Redis: GET → mark revoked → SET (warn-only with DB).
    ///
    /// The `AND revoked=FALSE` DB guard means a second revocation is a no-op
    /// in the DB — idempotent.
    pub async fn revoke(&self, raw_token_id: &str) -> Result<(), ApiError> {
        validate_refresh_token_id(raw_token_id)?;

        let token_hash = Self::token_hash(raw_token_id);

        // 1. DB: mark revoked (single statement, committed immediately)
        if let Some(ref db) = self.db {
            db.revoke_refresh_token(&token_hash).await.map_err(|e| {
                ApiError::service_unavailable(format!("refresh db revoke failed: {e}"))
            })?;
        }

        // 2. Redis: GET + mark revoked + reSET (warn-only with DB)
        let key = Self::key(raw_token_id);
        let mut record = match self
            .redis
            .get_json::<RefreshTokenRecord>(&key)
            .await
            .map_err(|err| {
                ApiError::service_unavailable(format!("refresh lookup failed: {err}"))
            })? {
            Some(r) => r,
            None => {
                // Not in Redis — DB revoke already applied, we're done.
                return Ok(());
            }
        };

        record.revoked = true;
        let ttl = ttl_from_expires_at(record.expires_at).unwrap_or(60).max(60);

        if let Err(err) = self.redis.set_json_ex(&key, &record, ttl).await {
            if self.db.is_some() {
                tracing::warn!(
                    token_hash = %token_hash,
                    "refresh Redis revoke mark failed (DB already committed): {err}"
                );
            } else {
                return Err(ApiError::service_unavailable(format!(
                    "refresh revoke failed: {err}"
                )));
            }
        }

        Ok(())
    }
}

// ── Validation helpers ─────────────────────────────────────────────────────

fn validate_record(record: RefreshTokenRecord) -> Result<RefreshTokenRecord, ApiError> {
    if record.revoked {
        return Err(ApiError::unauthorized("Refresh token replay detected"));
    }
    if record.expires_at <= now_unix_secs() {
        return Err(ApiError::unauthorized("Refresh token expired"));
    }
    Ok(record)
}

pub fn validate_refresh_token_id(raw_token_id: &str) -> Result<(), ApiError> {
    let trimmed = raw_token_id.trim();

    if trimmed.is_empty() {
        return Err(ApiError::bad_request("refresh token id must not be empty"));
    }
    if trimmed.len() < 32 {
        return Err(ApiError::bad_request(
            "refresh token id must be at least 32 characters",
        ));
    }
    if trimmed.len() > 4096 {
        return Err(ApiError::bad_request(
            "refresh token id must not exceed 4096 characters",
        ));
    }
    Ok(())
}

fn ttl_from_expires_at(expires_at: u64) -> Result<u64, ApiError> {
    let now = now_unix_secs();
    if expires_at <= now {
        return Err(ApiError::bad_request("token is already expired"));
    }
    Ok(expires_at.saturating_sub(now))
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

    use super::{RefreshTokenStore, RotationStatus};

    fn make_store() -> RefreshTokenStore {
        let redis = Arc::new(RedisClient::new_in_memory());
        RefreshTokenStore::new(redis, None)
    }

    #[tokio::test]
    async fn rotate_detects_replay() {
        let store = make_store();

        let exp = 4_102_444_800; // 2100-01-01 UTC
        store
            .issue(
                "old-token-0123456789012345678901",
                "user_1",
                "device_1",
                exp,
            )
            .await
            .expect("issue should succeed");

        let first = store
            .rotate(
                "old-token-0123456789012345678901",
                "new-token-0123456789012345678901",
                exp,
            )
            .await
            .expect("first rotation should succeed");
        assert_eq!(first, RotationStatus::Rotated);

        let second = store
            .rotate(
                "old-token-0123456789012345678901",
                "newer-token-01234567890123456789",
                exp,
            )
            .await
            .expect("second rotation should return replay");
        assert_eq!(second, RotationStatus::ReplayDetected);
    }
}

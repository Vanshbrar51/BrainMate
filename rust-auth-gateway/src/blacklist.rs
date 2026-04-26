// src/blacklist.rs — DB-backed token blacklist with Redis cache.
//
// SECURITY INVARIANT: is_blacklisted MUST NOT return Ok(false) when the
// check cannot be established with certainty. If both Redis and DB are
// unavailable, the method returns Err(ServiceUnavailable). The caller in
// auth.rs propagates this error — access is never granted on a failed check.
//
// Architecture:
//   REVOKE: DB INSERT (single statement) → Redis SET EX (warn-only)
//   CHECK:  Redis EXISTS fast path (O(1), no heap read)
//             → On Redis miss/error: DB single query returning jti+expires_at
//             → On DB hit: rehydrate Redis with correct remaining TTL
//           Both stores unavailable → Err (fail secure)
//
// PgBouncer compatibility:
//   All DB operations are single statements; no multi-statement sequences;
//   no explicit transaction required for either read or write paths.
//
// When `db` is None, behaviour is identical to the original Redis-only impl.

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    db::{DbClient},
    error::ApiError,
    redis_client::RedisClient,
};

#[derive(Clone)]
pub struct TokenBlacklist {
    redis: Arc<RedisClient>,
    db: Option<Arc<DbClient>>,
}

impl TokenBlacklist {
    pub fn new(redis: Arc<RedisClient>, db: Option<Arc<DbClient>>) -> Self {
        Self { redis, db }
    }

    pub fn key(jti: &str) -> String {
        format!("blacklist:{jti}")
    }

    // ── revoke ─────────────────────────────────────────────────────────────

    /// Revoke a JTI.
    ///
    /// # Write ordering
    ///
    /// 1. DB INSERT (single statement, idempotent via ON CONFLICT DO NOTHING).
    ///    This commits before any Redis write is attempted.
    /// 2. Redis SET EX — warn-only. If Redis is down, the DB write is durable.
    ///    On the next `is_blacklisted()` call for this JTI, the DB fallback
    ///    will find the entry and rehydrate Redis.
    ///
    /// This means:
    ///   - Never: Redis has a blacklisted JTI that DB does not.
    ///   - Possible: DB has a blacklisted JTI that Redis does not (handled
    ///     by DB fallback in is_blacklisted).
    pub async fn revoke(&self, jti: &str, ttl_secs: u64) -> Result<(), ApiError> {
        validate_token_id(jti)?;

        // 1. DB write (authoritative, committed before Redis write)
        if let Some(ref db) = self.db {
            let expires_at = now_unix_secs() as i64 + ttl_secs as i64;
            db.add_to_blacklist(jti, expires_at).await.map_err(|e| {
                ApiError::service_unavailable(format!("blacklist db write failed: {e}"))
            })?;
        }

        // 2. Redis write (cache layer, warn-only)
        if let Err(err) = self
            .redis
            .set_string_ex(&Self::key(jti), "1", ttl_secs)
            .await
        {
            if self.db.is_some() {
                tracing::warn!(
                    jti = %jti,
                    "blacklist Redis write failed (DB already committed, will rehydrate): {err}"
                );
            } else {
                return Err(ApiError::service_unavailable(format!(
                    "blacklist write failed: {err}"
                )));
            }
        }

        Ok(())
    }

    // ── is_blacklisted ─────────────────────────────────────────────────────

    /// Check whether a token has been revoked.
    ///
    /// # Security invariant
    ///
    /// This method NEVER returns `Ok(false)` when the result cannot be
    /// established. If Redis says "not found" and a DB is configured, we fall
    /// through to the DB. If the DB is also unavailable (or errors), we return
    /// `Err(ServiceUnavailable)` — the caller must reject the request.
    ///
    /// # Single DB query for both existence and TTL
    ///
    /// `db.check_blacklist()` returns both `exists: bool` and `expires_at`
    /// in a single round-trip, using the covering index
    /// `idx_auth_blacklist_jti_exp` for an index-only scan. This eliminates
    /// the previous two-query pattern (`is_blacklisted` then
    /// `get_blacklist_expires_at`) which had a TOCTOU window where the cleanup
    /// job could delete the row between the two calls.
    pub async fn is_blacklisted(&self, jti: &str) -> Result<bool, ApiError> {
        validate_token_id(jti)?;

        // 1. Redis fast path — O(1) EXISTS (no JSON parsing, no heap read)
        let redis_result = self.redis.exists(&Self::key(jti)).await;

        match redis_result {
            Ok(true) => {
                metrics::counter!("auth_cache_hits_total", "store" => "blacklist").increment(1);
                return Ok(true);
            }
            Ok(false) => {
                if self.db.is_none() {
                    // Redis-only mode: trust the Redis answer.
                    return Ok(false);
                }
                // Fall through to DB check (always verify on Redis miss when DB available).
            }
            Err(err) => {
                if self.db.is_none() {
                    // No DB backup: fail secure — unknown state.
                    return Err(ApiError::service_unavailable(format!(
                        "blacklist lookup failed: {err}"
                    )));
                }
                tracing::warn!(
                    jti = %jti,
                    "Redis blacklist lookup error, falling back to DB: {err}"
                );
                // Fall through to DB check.
            }
        }

        // 2. DB fallback — single query → (exists, expires_at)
        let db = self.db.as_ref().expect("checked above");
        metrics::counter!("auth_db_fallbacks_total", "store" => "blacklist").increment(1);

        let entry = db.check_blacklist(jti).await.map_err(|e| {
            // Both stores failed — MUST fail secure.
            ApiError::service_unavailable(format!(
                "blacklist check failed (both stores unavailable): {e}"
            ))
        })?;

        // 3. If blacklisted → rehydrate Redis with the correct remaining TTL.
        //    Both pieces of information (exists + expires_at) came from the
        //    same DB query — no TOCTOU gap.
        if entry.exists {
            if let Some(expires_at) = entry.expires_at {
                let now = now_unix_secs() as i64;
                let remaining = (expires_at - now).max(1) as u64;
                if let Err(err) = self
                    .redis
                    .set_string_ex(&Self::key(jti), "1", remaining)
                    .await
                {
                    tracing::warn!(jti = %jti, "blacklist Redis rehydration failed: {err}");
                } else {
                    metrics::counter!(
                        "auth_cache_rehydrations_total",
                        "store" => "blacklist"
                    )
                    .increment(1);
                }
            }
        }

        Ok(entry.exists)
    }
}

pub fn validate_token_id(jti: &str) -> Result<(), ApiError> {
    if jti.is_empty() || jti.len() > 256 {
        return Err(ApiError::unauthorized("Token id claim is invalid"));
    }
    if !jti
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
    {
        return Err(ApiError::unauthorized("Token id claim is invalid"));
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

    use super::TokenBlacklist;

    fn make_blacklist() -> TokenBlacklist {
        let redis = Arc::new(RedisClient::new_in_memory());
        TokenBlacklist::new(redis, None)
    }

    #[tokio::test]
    async fn blacklist_roundtrip_works() {
        let blacklist = make_blacklist();

        blacklist
            .revoke("jti_123", 60)
            .await
            .expect("revoke should succeed");

        assert!(blacklist
            .is_blacklisted("jti_123")
            .await
            .expect("lookup should succeed"));
    }

    #[tokio::test]
    async fn not_blacklisted_returns_false() {
        let blacklist = make_blacklist();
        assert!(!blacklist
            .is_blacklisted("jti_not_revoked")
            .await
            .expect("lookup should succeed"));
    }
}

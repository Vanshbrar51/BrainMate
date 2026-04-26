// src/reconciliation.rs — Background reconciliation worker
//
// Uses a Redis sorted set as a durable queue:
//   reconciliation:pending — ZSET (score = next retry timestamp ms)
//   reconciliation:dlq     — ZSET (permanently failed, 7 day TTL)
//   reconciliation:lock:{id} — ephemeral worker lock (SET NX EX 15)
//   reconciliation:idem:{id} — idempotency key (24h TTL)
//
// Each instance uses a unique worker ID. The ZREM-after-lock pattern
// ensures exactly-once delivery across multiple gateway instances.

use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tokio::sync::watch;
use tracing::Instrument;
use tracing::{error, info, warn};

use crate::blacklist::TokenBlacklist;
use crate::db::DbClient;
use crate::redis_client::RedisClient;
use crate::session_store::SessionStore;

/// How often to schedule a DbCleanup operation (6 hours in milliseconds).
const DB_CLEANUP_INTERVAL_MS: u64 = 6 * 60 * 60 * 1000;

const PENDING_QUEUE: &str = "reconciliation:pending";
const DLQ_QUEUE: &str = "reconciliation:dlq";
const IDEM_PREFIX: &str = "reconciliation:idem:";
const LOCK_PREFIX: &str = "reconciliation:lock:";
const IDEM_TTL_SECS: u64 = 86_400; // 24 hours
const LOCK_TTL_SECS: u64 = 15; // worker holds lock for max 15s
const POLL_INTERVAL: Duration = Duration::from_secs(5);
const MAX_ATTEMPTS: u32 = 5;
const BASE_DELAY_MS: u64 = 1_000;
const BATCH_SIZE: usize = 10;
const DLQ_ENTRY_TTL_MS: u64 = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueEntry {
    pub id: String,
    pub op: ReconciliationOp,
    pub attempt: u32,
    #[serde(rename = "maxAttempts", alias = "max_attempts")]
    pub max_attempts: u32,
    #[serde(rename = "createdAt", alias = "created_at")]
    pub created_at: u64,
    #[serde(rename = "lastError", alias = "last_error", default)]
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ReconciliationOp {
    #[serde(rename = "token_revocation")]
    TokenRevocation { jti: String, ttl_secs: u64 },
    #[serde(rename = "session_sync")]
    SessionSync {
        #[serde(rename = "sessionId", alias = "session_id")]
        session_id: String,
        #[serde(rename = "userId", alias = "user_id")]
        user_id: String,
        #[serde(rename = "expiresAt", alias = "expires_at")]
        expires_at: u64,
        #[serde(rename = "expectedVersion", alias = "expected_version", default)]
        expected_version: Option<u64>,
    },
    #[serde(rename = "session_revoke")]
    SessionRevoke {
        #[serde(rename = "sessionId", alias = "session_id")]
        session_id: String,
        jti: Option<String>,
        #[serde(rename = "tokenExp", alias = "token_exp", default)]
        token_exp: Option<u64>,
        #[serde(rename = "targetVersion", alias = "target_version", default)]
        target_version: Option<u64>,
    },
    /// Periodically prune expired records from the DB.
    /// Scheduled automatically every 6 hours by the worker spawn loop.
    #[serde(rename = "db_cleanup")]
    DbCleanup,
}

impl ReconciliationOp {
    fn id(&self) -> String {
        match self {
            Self::TokenRevocation { jti, .. } => format!("revoke:{jti}"),
            Self::SessionSync {
                session_id,
                expected_version,
                ..
            } => expected_version
                .map(|version| format!("sync:{session_id}:v{version}"))
                .unwrap_or_else(|| format!("sync:{session_id}")),
            Self::SessionRevoke {
                session_id,
                target_version,
                ..
            } => target_version
                .map(|version| format!("logout:{session_id}:v{version}"))
                .unwrap_or_else(|| format!("logout:{session_id}")),
            Self::DbCleanup => "db_cleanup:periodic".to_string(),
        }
    }

    fn type_name(&self) -> &'static str {
        match self {
            Self::TokenRevocation { .. } => "token_revocation",
            Self::SessionSync { .. } => "session_sync",
            Self::SessionRevoke { .. } => "session_revoke",
            Self::DbCleanup => "db_cleanup",
        }
    }
}

pub struct ReconciliationWorker {
    redis: Arc<RedisClient>,
    session_store: Arc<SessionStore>,
    blacklist: Arc<TokenBlacklist>,
    /// Optional DB client for the DbCleanup operation.
    db: Option<Arc<DbClient>>,
    max_session_ttl_secs: u64,
    max_sessions_per_user: u32,
    worker_id: String,
}

impl ReconciliationWorker {
    pub fn new(
        redis: Arc<RedisClient>,
        session_store: Arc<SessionStore>,
        blacklist: Arc<TokenBlacklist>,
        db: Option<Arc<DbClient>>,
        max_session_ttl_secs: u64,
        max_sessions_per_user: u32,
    ) -> Self {
        let worker_id = format!("worker:{}", uuid::Uuid::new_v4());
        Self {
            redis,
            session_store,
            blacklist,
            db,
            max_session_ttl_secs,
            max_sessions_per_user,
            worker_id,
        }
    }

    /// Enqueue a failed operation for async retry.
    /// Idempotent: if the operation is already queued, this is a no-op.
    pub async fn enqueue(&self, op: ReconciliationOp) {
        let entry = QueueEntry {
            id: op.id(),
            op,
            attempt: 0,
            max_attempts: MAX_ATTEMPTS,
            created_at: now_ms(),
            last_error: None,
        };

        let idem_key = format!("{IDEM_PREFIX}{}", entry.id);

        // Idempotency check — skip if already queued
        match self
            .redis
            .set_string_nx_ex(&idem_key, "1", IDEM_TTL_SECS)
            .await
        {
            Ok(true) => {}
            Ok(false) => {
                info!(op_id = %entry.id, "reconciliation: idempotent skip (already queued)");
                return;
            }
            Err(err) => {
                error!("reconciliation: idempotency key write failed: {err}");
                // Proceed anyway — worst case we process it twice (idempotent ops)
            }
        }

        let json = match serde_json::to_string(&entry) {
            Ok(j) => j,
            Err(err) => {
                error!("reconciliation: serialize failed: {err}");
                return;
            }
        };

        if let Err(err) = self
            .redis
            .zadd_score(PENDING_QUEUE, now_ms() as f64, &json)
            .await
        {
            error!("reconciliation: zadd failed: {err}");
            return;
        }

        info!(
            op_type = %entry.op.type_name(),
            op_id = %entry.id,
            "reconciliation: enqueued"
        );
        metrics::counter!("reconciliation_enqueued_total", "op_type" => entry.op.type_name())
            .increment(1);
    }

    /// Spawn the background worker loop.
    ///
    /// Also schedules a DbCleanup op every 6 hours if a DB client is present.
    pub fn spawn(self: Arc<Self>, mut shutdown_rx: watch::Receiver<bool>) {
        // Schedule periodic DB cleanup
        if self.db.is_some() {
            let worker = self.clone();
            tokio::spawn(
                async move {
                    // Stagger the first cleanup by a small amount so it doesn't
                    // fire immediately at startup.
                    tokio::time::sleep(Duration::from_secs(60)).await;
                    loop {
                        worker.enqueue(ReconciliationOp::DbCleanup).await;
                        tokio::time::sleep(Duration::from_millis(DB_CLEANUP_INTERVAL_MS)).await;
                    }
                }
                .instrument(tracing::info_span!("reconciliation.db_cleanup_scheduler")),
            );
        }

        tokio::spawn(
            async move {
                info!(worker_id = %self.worker_id, "reconciliation: worker started");

                loop {
                    tokio::select! {
                        _ = tokio::time::sleep(POLL_INTERVAL) => {
                            if let Err(err) = self.process_batch().await {
                                error!("reconciliation: batch error: {err}");
                            }
                        }
                        _ = shutdown_rx.changed() => {
                            if *shutdown_rx.borrow() {
                                info!("reconciliation: worker shutting down");
                                let _ = self.process_batch().await;
                                break;
                            }
                        }
                    }
                }
            }
            .instrument(tracing::info_span!("reconciliation.worker")),
        );
    }

    async fn process_batch(&self) -> Result<(), String> {
        let now = now_ms() as f64;

        // Get entries whose retry timestamp has passed
        let entries = self
            .redis
            .zrangebyscore(PENDING_QUEUE, now, BATCH_SIZE)
            .await
            .map_err(|e| e.to_string())?;

        for entry_json in entries {
            let mut entry: QueueEntry = match serde_json::from_str(&entry_json) {
                Ok(e) => e,
                Err(err) => {
                    warn!("reconciliation: malformed entry: {err}");
                    let _ = self.redis.zrem(PENDING_QUEUE, &entry_json).await;
                    continue;
                }
            };

            // Acquire worker lock — prevents two instances processing same entry
            let lock_key = format!("{LOCK_PREFIX}{}", entry.id);
            let lock_value = format!("{}:{}", self.worker_id, now_ms());
            match self
                .redis
                .set_string_nx_ex(&lock_key, &lock_value, LOCK_TTL_SECS)
                .await
            {
                Ok(true) => {}
                Ok(false) => continue,
                Err(err) => {
                    warn!("reconciliation: lock acquire failed: {err}");
                    continue;
                }
            }

            // Remove from pending. If 0 removed, another worker claimed it.
            match self.redis.zrem(PENDING_QUEUE, &entry_json).await {
                Ok(0) => {
                    let _ = self.redis.delete(&lock_key).await;
                    continue;
                }
                Ok(_) => {}
                Err(err) => {
                    warn!("reconciliation: zrem failed: {err}");
                    let _ = self.redis.delete(&lock_key).await;
                    continue;
                }
            }

            entry.attempt += 1;

            match self.execute(&entry.op).await {
                Ok(()) => {
                    let idem_key = format!("{IDEM_PREFIX}{}", entry.id);
                    let _ = self.redis.delete(&idem_key).await;
                    let _ = self.redis.delete(&lock_key).await;

                    metrics::counter!(
                        "reconciliation_processed_total",
                        "op_type" => entry.op.type_name()
                    )
                    .increment(1);
                    info!(
                        op_type = %entry.op.type_name(),
                        op_id = %entry.id,
                        attempt = entry.attempt,
                        "reconciliation: succeeded"
                    );
                }
                Err(err) => {
                    entry.last_error = Some(err.clone());

                    if entry.attempt >= entry.max_attempts {
                        let dlq_json = serde_json::to_string(&entry).unwrap_or_default();
                        let dlq_score = now_ms() as f64;
                        let _ = self.redis.zadd_score(DLQ_QUEUE, dlq_score, &dlq_json).await;
                        // Prune DLQ entries older than 7 days.
                        // Remove members with score < (now - 7 days).
                        let cutoff = (now_ms().saturating_sub(DLQ_ENTRY_TTL_MS)) as f64;
                        let _ = self.redis.zremrangebyscore(DLQ_QUEUE, 0.0, cutoff).await;

                        let idem_key = format!("{IDEM_PREFIX}{}", entry.id);
                        let _ = self.redis.delete(&idem_key).await;
                        let _ = self.redis.delete(&lock_key).await;

                        metrics::counter!(
                            "reconciliation_dlq_total",
                            "op_type" => entry.op.type_name()
                        )
                        .increment(1);
                        error!(
                            op_type = %entry.op.type_name(),
                            op_id = %entry.id,
                            attempts = entry.attempt,
                            error = %err,
                            "reconciliation: moved to DLQ"
                        );
                    } else {
                        let delay_ms = BASE_DELAY_MS * 2u64.pow(entry.attempt - 1);
                        let next_score = (now_ms() + delay_ms) as f64;
                        let updated_json = serde_json::to_string(&entry).unwrap_or_default();
                        let _ = self
                            .redis
                            .zadd_score(PENDING_QUEUE, next_score, &updated_json)
                            .await;
                        let _ = self.redis.delete(&lock_key).await;

                        metrics::counter!(
                            "reconciliation_retried_total",
                            "op_type" => entry.op.type_name()
                        )
                        .increment(1);
                        warn!(
                            op_type = %entry.op.type_name(),
                            op_id = %entry.id,
                            attempt = entry.attempt,
                            max = entry.max_attempts,
                            retry_in_ms = delay_ms,
                            "reconciliation: will retry"
                        );
                    }
                }
            }
        }

        Ok(())
    }

    async fn execute(&self, op: &ReconciliationOp) -> Result<(), String> {
        match op {
            ReconciliationOp::TokenRevocation { jti, ttl_secs } => self
                .blacklist
                .revoke(jti, *ttl_secs)
                .await
                .map_err(|e| format!("token revocation failed: {e}")),
            ReconciliationOp::SessionSync {
                session_id,
                user_id,
                expires_at,
                expected_version,
            } => {
                if let Some(expected_version) = expected_version {
                    let current_version = self
                        .current_session_version(session_id)
                        .await
                        .map_err(|e| format!("session version lookup failed: {e}"))?;
                    if current_version != *expected_version {
                        return Ok(());
                    }
                }

                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                let ttl = expires_at
                    .saturating_sub(now)
                    .min(self.max_session_ttl_secs);

                if ttl == 0 {
                    return Ok(());
                }

                self.session_store
                    .create_session(
                        session_id,
                        user_id,
                        None,
                        None,
                        ttl,
                        self.max_sessions_per_user,
                    )
                    .await
                    .map_err(|e| format!("session sync failed: {e}"))
            }
            ReconciliationOp::SessionRevoke {
                session_id,
                jti,
                token_exp,
                ..
            } => {
                self.session_store
                    .revoke_session(session_id)
                    .await
                    .map_err(|e| format!("session revoke failed: {e}"))?;

                if let (Some(jti), Some(exp)) = (jti.as_deref(), token_exp) {
                    let now = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();
                    let ttl = exp.saturating_sub(now);
                    if ttl > 0 {
                        self.blacklist
                            .revoke(jti, ttl)
                            .await
                            .map_err(|e| format!("token blacklist failed: {e}"))?;
                    }
                }
                Ok(())
            }
            ReconciliationOp::DbCleanup => {
                if let Some(ref db) = self.db {
                    db.run_cleanup()
                        .await
                        .map_err(|e| format!("db cleanup failed: {e}"))?;
                    info!("reconciliation: db cleanup completed");
                } else {
                    info!("reconciliation: db cleanup skipped (no DB client)");
                }
                Ok(())
            }
        }
    }

    async fn current_session_version(&self, session_id: &str) -> Result<u64, String> {
        let key = format!("session_version:{session_id}");
        let raw = self
            .redis
            .get_string(&key)
            .await
            .map_err(|e| e.to_string())?;
        Ok(raw.and_then(|value| value.parse::<u64>().ok()).unwrap_or(0))
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::ReconciliationOp;

    #[test]
    fn operation_ids_are_deterministic() {
        let revoke = ReconciliationOp::TokenRevocation {
            jti: "jti_123".to_string(),
            ttl_secs: 60,
        };
        let sync = ReconciliationOp::SessionSync {
            session_id: "sid_123".to_string(),
            user_id: "user_123".to_string(),
            expires_at: 60,
            expected_version: Some(2),
        };
        let logout = ReconciliationOp::SessionRevoke {
            session_id: "sid_123".to_string(),
            jti: None,
            token_exp: None,
            target_version: Some(3),
        };
        assert_eq!(revoke.id(), "revoke:jti_123");
        assert_eq!(sync.id(), "sync:sid_123:v2");
        assert_eq!(logout.id(), "logout:sid_123:v3");
    }
}

use std::sync::Arc;

use serde::Serialize;

use crate::{error::ApiError, redis_client::RedisClient};

const WAF_BLOCK_KEY_PREFIX: &str = "waf:block:ip:";
const WAF_AUDIT_KEY_PREFIX: &str = "waf:audit:";

#[derive(Clone)]
pub struct WafFeedback {
    redis: Arc<RedisClient>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuditEvent {
    pub request_id: String,
    pub user_id: String,
    pub ip: String,
    pub risk_level: String,
    pub risk_action: String,
    pub blocked: bool,
    pub timestamp: u64,
}

impl WafFeedback {
    pub fn new(redis: Arc<RedisClient>) -> Self {
        Self { redis }
    }

    pub async fn is_ip_blocked(&self, ip: &str) -> Result<bool, ApiError> {
        if ip.trim().is_empty() || ip == "unknown" {
            return Ok(false);
        }

        self.redis
            .exists(&format!("{WAF_BLOCK_KEY_PREFIX}{ip}"))
            .await
            .map_err(|err| {
                ApiError::service_unavailable(format!("waf blocklist lookup failed: {err}"))
            })
    }

    pub async fn block_ip(&self, ip: &str, ttl_secs: u64) -> Result<(), ApiError> {
        if ip.trim().is_empty() || ip == "unknown" || ttl_secs == 0 {
            return Ok(());
        }

        self.redis
            .set_string_ex(&format!("{WAF_BLOCK_KEY_PREFIX}{ip}"), "1", ttl_secs)
            .await
            .map_err(|err| ApiError::service_unavailable(format!("waf block write failed: {err}")))
    }

    pub async fn record_audit_event(&self, event: &AuditEvent) -> Result<(), ApiError> {
        let key = format!("{WAF_AUDIT_KEY_PREFIX}{}", event.request_id);
        self.redis
            .set_json_ex(&key, event, 86_400)
            .await
            .map_err(|err| ApiError::service_unavailable(format!("waf audit write failed: {err}")))
    }
}

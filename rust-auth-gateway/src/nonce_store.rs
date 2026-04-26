use std::sync::Arc;

use crate::{error::ApiError, redis_client::RedisClient};

const NONCE_TTL_SECS: u64 = 300;

#[derive(Clone)]
pub struct NonceStore {
    redis: Arc<RedisClient>,
    region_id: String,
}

impl NonceStore {
    pub fn new(redis: Arc<RedisClient>, region_id: String) -> Self {
        Self { redis, region_id }
    }

    pub fn key(region_id: &str, request_id: &str) -> String {
        format!("nonce:{region_id}:{request_id}")
    }

    pub async fn register_nonce(
        &self,
        request_id: &str,
        request_region: Option<&str>,
    ) -> Result<bool, ApiError> {
        validate_request_id(request_id)?;
        let region = request_region
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(self.region_id.as_str());
        validate_region_id(region)?;

        self.redis
            .set_string_nx_ex(&Self::key(region, request_id), "1", NONCE_TTL_SECS)
            .await
            .map_err(|err| ApiError::service_unavailable(format!("nonce write failed: {err}")))
    }
}

fn validate_request_id(request_id: &str) -> Result<(), ApiError> {
    if request_id.trim().is_empty() || request_id.len() > 256 {
        return Err(ApiError::bad_request("invalid request nonce"));
    }

    if !request_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(ApiError::bad_request("invalid request nonce format"));
    }

    Ok(())
}

fn validate_region_id(region_id: &str) -> Result<(), ApiError> {
    if region_id.trim().is_empty() || region_id.len() > 64 {
        return Err(ApiError::bad_request("invalid nonce region"));
    }

    if !region_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(ApiError::bad_request("invalid nonce region format"));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use crate::redis_client::RedisClient;

    use super::NonceStore;

    #[tokio::test]
    async fn nonce_rejects_replay() {
        let redis = Arc::new(RedisClient::new_in_memory());
        let store = NonceStore::new(redis, "test-region".to_string());

        assert!(store
            .register_nonce("req-1", None)
            .await
            .expect("first nonce write should succeed"));

        assert!(!store
            .register_nonce("req-1", None)
            .await
            .expect("second nonce write should be replay"));
    }

    #[tokio::test]
    async fn nonce_is_region_scoped() {
        let redis = Arc::new(RedisClient::new_in_memory());
        let store = NonceStore::new(redis, "default-region".to_string());

        assert!(store
            .register_nonce("req-2", Some("region-a"))
            .await
            .expect("region-a nonce should register"));
        assert!(store
            .register_nonce("req-2", Some("region-b"))
            .await
            .expect("region-b nonce should register separately"));
    }
}

use sha2::{Digest, Sha256};
use std::sync::Arc;

use crate::{
    error::ApiError,
    redis_client::RedisClient,
    security_utils::{constant_time_eq, hash_otp_with_pepper},
};

const OTP_TTL_SECS: u64 = 5 * 60;

const OTP_GETDEL_SCRIPT: &str = r#"
local val = redis.call("GET", KEYS[1])
if val then
  redis.call("DEL", KEYS[1])
  return val
else
  return false
end
"#;

#[derive(Clone)]
pub struct OtpStore {
    redis: Arc<RedisClient>,
    pepper: String,
}

impl OtpStore {
    pub fn new(redis: Arc<RedisClient>, pepper: String) -> Result<Self, ApiError> {
        if pepper.trim().is_empty() {
            return Err(ApiError::bad_request("OTP_PEPPER must be set"));
        }

        Ok(Self { redis, pepper })
    }

    pub fn key(user_id: &str) -> String {
        format!("otp:{user_id}")
    }

    pub async fn upsert_otp(&self, user_id: &str, otp: &str) -> Result<(), ApiError> {
        validate_user_id(user_id)?;
        validate_otp(otp)?;

        let hash = hash_otp_with_pepper(otp, &self.pepper);
        self.redis
            .set_string_ex(&Self::key(user_id), &hash, OTP_TTL_SECS)
            .await
            .map_err(|err| ApiError::service_unavailable(format!("otp write failed: {err}")))
    }

    pub async fn verify_and_consume(&self, user_id: &str, otp: &str) -> Result<bool, ApiError> {
        validate_user_id(user_id)?;
        validate_otp(otp)?;

        // Compute hash BEFORE any Redis call — eliminates timing oracle (MFA-03 fix)
        let candidate_hash = hash_otp_with_pepper(otp, &self.pepper);

        let key = Self::key(user_id);

        // Atomically GET-and-DELETE the stored hash in one Lua script call
        // This prevents the race condition where two concurrent calls both
        // GET the hash before either DELETEs it (MFA-05 fix)
        let script = OTP_GETDEL_SCRIPT;
        let script_sha = {
            let mut h = Sha256::new();
            h.update(script.as_bytes());
            hex::encode(h.finalize())
        };

        // Use evalsha with fallback to eval on NOSCRIPT
        let expected_hash_opt: Option<String> = self
            .redis
            .getdel_atomic(&key, script, &script_sha)
            .await
            .map_err(|err| ApiError::service_unavailable(format!("otp verify failed: {err}")))?;

        let Some(expected_hash) = expected_hash_opt else {
            // No OTP found — hash already computed above for constant time
            let _ = constant_time_eq(&candidate_hash, &candidate_hash); // dummy comparison
            return Ok(false);
        };

        Ok(constant_time_eq(&candidate_hash, &expected_hash))
    }
}

fn validate_user_id(user_id: &str) -> Result<(), ApiError> {
    if user_id.trim().is_empty() || user_id.len() > 128 {
        return Err(ApiError::bad_request("invalid user id"));
    }
    // Only allow alphanumeric + _ and - (same policy as session IDs)
    if !user_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(ApiError::bad_request("invalid user id format"));
    }
    Ok(())
}

fn validate_otp(otp: &str) -> Result<(), ApiError> {
    if otp.len() < 4 || otp.len() > 16 || !otp.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(ApiError::bad_request("invalid otp format"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use crate::redis_client::RedisClient;

    use super::OtpStore;

    #[tokio::test]
    async fn otp_is_verified_once() {
        let redis = Arc::new(RedisClient::new_in_memory());
        let store = OtpStore::new(redis, "pepper".to_string()).expect("otp store should build");

        store
            .upsert_otp("user_1", "123456")
            .await
            .expect("otp write should work");

        assert!(store
            .verify_and_consume("user_1", "123456")
            .await
            .expect("otp verify should work"));

        assert!(!store
            .verify_and_consume("user_1", "123456")
            .await
            .expect("otp should be consumed"));
    }
}

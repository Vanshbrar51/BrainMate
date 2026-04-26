use std::sync::Arc;

use crate::{error::ApiError, models::ClerkClaims, redis_client::RedisClient};

#[derive(Clone)]
pub struct AuthResultCache {
    redis: Arc<RedisClient>,
    ttl_secs: u64,
}

impl AuthResultCache {
    pub fn new(redis: Arc<RedisClient>, ttl_secs: u64) -> Result<Self, ApiError> {
        if !(30..=60).contains(&ttl_secs) {
            return Err(ApiError::bad_request(
                "AUTH_CACHE_TTL_SECS must be between 30 and 60",
            ));
        }

        Ok(Self { redis, ttl_secs })
    }

    pub fn key(token_hash: &str) -> String {
        format!("auth:{token_hash}")
    }

    pub async fn get(&self, token_hash: &str) -> Result<Option<ClerkClaims>, ApiError> {
        validate_token_hash(token_hash)?;
        self.redis
            .get_json::<ClerkClaims>(&Self::key(token_hash))
            .await
            .map_err(|err| {
                ApiError::service_unavailable(format!("auth cache lookup failed: {err}"))
            })
    }

    pub async fn put(&self, token_hash: &str, claims: &ClerkClaims) -> Result<(), ApiError> {
        validate_token_hash(token_hash)?;
        self.redis
            .set_json_ex(&Self::key(token_hash), claims, self.ttl_secs)
            .await
            .map_err(|err| ApiError::service_unavailable(format!("auth cache write failed: {err}")))
    }

    /// Invalidate a cached auth result (e.g. on logout/revocation).
    /// Errors are intentionally swallowed by callers — cache invalidation
    /// is best-effort; the blacklist is the security backstop.
    pub async fn invalidate(&self, token_hash: &str) -> Result<(), ApiError> {
        validate_token_hash(token_hash)?;
        self.redis
            .delete(&Self::key(token_hash))
            .await
            .map(|_| ())
            .map_err(|err| {
                ApiError::service_unavailable(format!("auth cache invalidate failed: {err}"))
            })
    }
}

fn validate_token_hash(token_hash: &str) -> Result<(), ApiError> {
    if token_hash.len() != 64 || !token_hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(ApiError::bad_request("invalid token hash"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use crate::{
        models::ClerkClaims, redis_client::RedisClient, security_utils::hash_token_identifier,
    };

    use super::AuthResultCache;

    #[tokio::test]
    async fn auth_cache_roundtrip_works() {
        let redis = Arc::new(RedisClient::new_in_memory());
        let cache = AuthResultCache::new(redis, 45).expect("cache should build");

        let claims = ClerkClaims {
            sub: "user_1".to_string(),
            sid: "sid_1".to_string(),
            jti: "jti_1".to_string(),
            iss: "https://issuer.example".to_string(),
            iat: Some(1),
            exp: 4_102_444_800,
            azp: Some("azp".to_string()),
            org_id: None,
            org_role: None,
        };

        let key = hash_token_identifier("token");
        cache
            .put(&key, &claims)
            .await
            .expect("cache put should work");

        let loaded = cache
            .get(&key)
            .await
            .expect("cache get should work")
            .expect("value should exist");

        assert_eq!(loaded.sub, claims.sub);
    }
}

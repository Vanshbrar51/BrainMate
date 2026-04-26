use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use jsonwebtoken::DecodingKey;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tracing::Instrument;

use crate::{error::ApiError, redis_client::RedisClient};

const JWKS_CACHE_KEY: &str = "jwks:cache";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JwkSet {
    keys: Vec<Jwk>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CachedJwks {
    fetched_at: u64,
    set: JwkSet,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Jwk {
    kid: String,
    kty: String,
    #[serde(rename = "use")]
    use_type: Option<String>,
    alg: Option<String>,
    n: String,
    e: String,
}

#[derive(Clone)]
pub struct JwksCache {
    redis: Arc<RedisClient>,
    http_client: reqwest::Client,
    jwks_url: String,
    hard_ttl_secs: u64,
    soft_ttl_secs: u64,
    refresh_lock: Arc<Mutex<()>>,
}

impl JwksCache {
    pub fn new(
        redis: Arc<RedisClient>,
        http_client: reqwest::Client,
        jwks_url: String,
        hard_ttl_secs: u64,
        soft_ttl_secs: u64,
    ) -> Result<Self, ApiError> {
        if hard_ttl_secs == 0 {
            return Err(ApiError::bad_request(
                "JWKS hard ttl must be greater than zero",
            ));
        }

        if soft_ttl_secs == 0 || soft_ttl_secs > hard_ttl_secs {
            return Err(ApiError::bad_request(
                "JWKS soft ttl must be > 0 and <= hard ttl",
            ));
        }

        Ok(Self {
            redis,
            http_client,
            jwks_url,
            hard_ttl_secs,
            soft_ttl_secs,
            refresh_lock: Arc::new(Mutex::new(())),
        })
    }

    pub async fn warmup(&self) -> Result<(), ApiError> {
        self.refresh_and_cache().await.map(|_| ())
    }

    pub async fn force_refresh(&self) -> Result<(), ApiError> {
        let _guard = self.refresh_lock.lock().await;
        self.refresh_and_cache().await.map(|_| ())
    }

    pub async fn get_decoding_key(&self, kid: &str) -> Result<DecodingKey, ApiError> {
        if kid.trim().is_empty() {
            return Err(ApiError::unauthorized("Token key id (kid) is missing"));
        }

        if let Some(key) = self.lookup_cached_key(kid).await? {
            return Ok(key);
        }

        let _guard = self.refresh_lock.lock().await;

        if let Some(key) = self.lookup_cached_key(kid).await? {
            return Ok(key);
        }

        let fetched = self.refresh_and_cache().await?;
        decode_key_from_set(&fetched, kid)
            .ok_or_else(|| ApiError::unauthorized("Signing key not found in JWKS"))
    }

    async fn lookup_cached_key(&self, kid: &str) -> Result<Option<DecodingKey>, ApiError> {
        let Some(cached) = self
            .redis
            .get_json::<CachedJwks>(JWKS_CACHE_KEY)
            .await
            .map_err(|err| {
                ApiError::service_unavailable(format!("jwks cache lookup failed: {err}"))
            })?
        else {
            return Ok(None);
        };

        let age_secs = now_unix_secs().saturating_sub(cached.fetched_at);
        if age_secs > self.hard_ttl_secs {
            return Ok(None);
        }

        if age_secs > self.soft_ttl_secs {
            let cache = self.clone();
            tokio::spawn(
                async move {
                    let _ = cache.force_refresh().await;
                }
                .instrument(tracing::info_span!("jwks.refresh.background")),
            );
        }

        Ok(decode_key_from_set(&cached.set, kid))
    }

    async fn refresh_and_cache(&self) -> Result<JwkSet, ApiError> {
        let response = self
            .http_client
            .get(&self.jwks_url)
            .send()
            .await
            .map_err(|_| ApiError::service_unavailable("Failed to fetch Clerk JWKS"))?;

        if !response.status().is_success() {
            return Err(ApiError::service_unavailable(
                "Clerk JWKS endpoint returned non-success",
            ));
        }

        let set = response
            .json::<JwkSet>()
            .await
            .map_err(|_| ApiError::service_unavailable("Invalid JWKS response payload"))?;

        if set.keys.is_empty() {
            return Err(ApiError::service_unavailable(
                "JWKS payload contains no keys",
            ));
        }

        let payload = CachedJwks {
            fetched_at: now_unix_secs(),
            set: set.clone(),
        };

        self.redis
            .set_json_ex(JWKS_CACHE_KEY, &payload, self.hard_ttl_secs)
            .await
            .map_err(|err| {
                ApiError::service_unavailable(format!("jwks cache write failed: {err}"))
            })?;

        Ok(set)
    }

    #[cfg(test)]
    async fn set_for_test(&self, payload: &str) {
        let _ = self
            .redis
            .set_string_ex(JWKS_CACHE_KEY, payload, self.hard_ttl_secs)
            .await;
    }

    #[cfg(test)]
    async fn cached_key_count_for_test(&self) -> usize {
        self.redis
            .get_json::<CachedJwks>(JWKS_CACHE_KEY)
            .await
            .ok()
            .flatten()
            .map(|set| set.set.keys.len())
            .unwrap_or(0)
    }
}

fn decode_key_from_set(set: &JwkSet, kid: &str) -> Option<DecodingKey> {
    let jwk = set.keys.iter().find(|item| {
        item.kid == kid
            && item.kty == "RSA"
            && item.use_type.as_deref() == Some("sig")
            && item.alg.as_deref() == Some("RS256")
    })?;

    DecodingKey::from_rsa_components(&jwk.n, &jwk.e).ok()
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

    use super::JwksCache;

    #[tokio::test]
    async fn caches_jwks_payload_in_redis() {
        let redis = Arc::new(RedisClient::new_in_memory());
        let http = reqwest::Client::new();
        let cache = JwksCache::new(
            redis,
            http,
            "https://example.com/.well-known/jwks.json".to_string(),
            300,
            60,
        )
        .expect("jwks cache should initialize");

        cache
            .set_for_test(
                r#"{"fetched_at":4102444800,"set":{"keys":[{"kid":"kid_1","kty":"RSA","use":"sig","alg":"RS256","n":"0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiLQxkQk8vXx4Y7vRl6VwBEm90LkAMPxQqvOB0fOkHn84qxd6QbaO5jM90_hzGyF_F7fsRG3Gzdh0dX8GZFODdgNpTi27C3l2qCkCmZJLdnOjFkMrDXLI4YAlnXrhIRbkIuWGHWxirMRHkRkNvztNFVQVw1Gc7YCOUMIqFZ3VAb9YSEuxsjjXNHzvEihQ6UkNzxaz2YsmiVjCwXTlzAIXazhbugzuDUFcPRl1BDpRP70dNDO7xjMnIKh4jqqcgUp3NEPoPFcAckS4iigFsMghvYDn8ApX2HFqRSbuuSSMzdON3NofM8Q","e":"AQAB"}]}}"#,
            )
            .await;

        assert_eq!(cache.cached_key_count_for_test().await, 1);
    }
}

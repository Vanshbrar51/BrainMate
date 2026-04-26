use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;

use crate::{error::ApiError, redis_client::RedisClient, security_utils::sha256_hex};

const RATE_LIMIT_SCRIPT: &str = r#"
local key = KEYS[1]
local burst = tonumber(ARGV[1])
local refill_per_sec = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local bucket = redis.call("GET", key)
local tokens = burst
local last_refill = now

if bucket then
  local delim = string.find(bucket, "|")
  if delim then
    tokens = tonumber(string.sub(bucket, 1, delim - 1)) or burst
    last_refill = tonumber(string.sub(bucket, delim + 1)) or now
  end
end

local elapsed = math.max(0, now - last_refill)
tokens = math.min(burst, tokens + (elapsed * refill_per_sec))

if tokens >= 1 then
  tokens = tokens - 1
  redis.call("SET", key, tostring(tokens) .. "|" .. tostring(now), "EX", math.ceil(burst / refill_per_sec) * 2)
  return {1, 0}
else
  local wait_secs = math.ceil((1 - tokens) / refill_per_sec)
  return {0, wait_secs}
end
"#;

#[derive(Debug, Clone, Copy)]
pub enum RateLimitScope {
    User,
    Ip,
    Endpoint,
}

impl RateLimitScope {
    fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Ip => "ip",
            Self::Endpoint => "endpoint",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct RateLimitExceeded {
    pub wait_secs: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RateLimitError {
    Limited { wait_secs: u64 },
    Unavailable,
}

#[derive(Clone)]
pub struct RateLimiter {
    redis: Arc<RedisClient>,
    burst: u32,
    refill_per_sec: u32,
    script_sha: String,
}

impl RateLimiter {
    pub async fn new(
        redis: Arc<RedisClient>,
        burst: u32,
        refill_per_sec: u32,
    ) -> Result<Self, ApiError> {
        if burst == 0 || refill_per_sec == 0 {
            return Err(ApiError::bad_request(
                "rate limit burst and refill must be greater than zero",
            ));
        }

        let script_sha = redis.script_load(RATE_LIMIT_SCRIPT).await.map_err(|err| {
            ApiError::service_unavailable(format!("rate-limit script load failed: {err}"))
        })?;

        Ok(Self {
            redis,
            burst,
            refill_per_sec,
            script_sha,
        })
    }

    pub fn redis_key(scope: RateLimitScope, id: &str) -> String {
        let stable_id = sha256_hex(id);
        format!("rate_limit:{}:{stable_id}", scope.as_str())
    }

    pub async fn check(&self, scope: RateLimitScope, id: &str) -> Result<(), RateLimitError> {
        let key = Self::redis_key(scope, id);

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs_f64()
            .to_string();

        let args = vec![self.burst.to_string(), self.refill_per_sec.to_string(), now];

        let res = self
            .redis
            .evalsha_i64(&self.script_sha, RATE_LIMIT_SCRIPT, &key, args)
            .await;

        let values = match res {
            Ok(v) => v,
            Err(_) => {
                return Err(RateLimitError::Unavailable);
            }
        };

        if values.len() != 2 {
            return Ok(());
        }

        if values[0] == 1 {
            Ok(())
        } else {
            Err(RateLimitError::Limited {
                wait_secs: values[1].max(1) as u64,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use crate::redis_client::RedisClient;

    use super::{RateLimitError, RateLimitScope, RateLimiter};

    #[tokio::test]
    async fn rate_limiter_throttles() {
        let redis = Arc::new(RedisClient::new_in_memory());
        let limiter = RateLimiter::new(redis, 1, 1)
            .await
            .expect("limiter should initialize");

        limiter
            .check(RateLimitScope::Ip, "127.0.0.1")
            .await
            .expect("first request should pass");

        assert!(limiter
            .check(RateLimitScope::Ip, "127.0.0.1")
            .await
            .is_err_and(|err| matches!(err, RateLimitError::Limited { .. })));
    }
}

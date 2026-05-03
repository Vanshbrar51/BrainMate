use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use redis::{aio::MultiplexedConnection, Client, RedisError};
use serde::{de::DeserializeOwned, Serialize};
use tokio::sync::Mutex;
use tracing::info;

#[derive(Debug, thiserror::Error)]
pub enum RedisLayerError {
    #[error("redis unavailable: {0}")]
    Unavailable(String),
    #[error("redis command failed: {0}")]
    Command(String),
    #[error("serialization failed: {0}")]
    Serialization(String),
}

#[derive(Clone)]
pub struct RedisClient {
    backend: Backend,
}

#[derive(Clone)]
enum Backend {
    Redis(MultiplexedConnection),
    Memory(Arc<InMemoryRedis>),
}

/// Redact the password component of a Redis URL for safe logging.
pub fn mask_redis_url(url: &str) -> String {
    if let Some(scheme_end) = url.find("://") {
        let after_scheme = &url[scheme_end + 3..];
        if let Some(at_pos) = after_scheme.rfind('@') {
            let scheme = &url[..scheme_end + 3];
            let credentials = &after_scheme[..at_pos];
            let host_rest = &after_scheme[at_pos..];
            let masked_creds = if let Some(colon) = credentials.find(':') {
                let user = &credentials[..colon];
                if user.is_empty() {
                    "***".to_string()
                } else {
                    format!("{user}:***")
                }
            } else {
                "***".to_string()
            };
            return format!("{scheme}{masked_creds}{host_rest}");
        }
    }
    url.to_string()
}

impl RedisClient {
    pub async fn connect(url: &str, connect_timeout: Duration) -> Result<Self, RedisLayerError> {
        let masked = mask_redis_url(url);
        info!(url = %masked, "initializing redis-rs connection");

        let client = Client::open(url)
            .map_err(|e| RedisLayerError::Unavailable(format!("invalid redis url: {e}")))?;

        let conn = tokio::time::timeout(connect_timeout, client.get_multiplexed_async_connection())
            .await
            .map_err(|_| RedisLayerError::Unavailable("connection timeout".to_string()))?
            .map_err(|e| RedisLayerError::Unavailable(format!("failed to connect to redis: {e}")))?;

        let instance = Self {
            backend: Backend::Redis(conn),
        };

        if !instance.ping().await {
            return Err(RedisLayerError::Unavailable("smoke test PING failed".to_string()));
        }

        info!(url = %masked, "redis-rs connection established and verified");
        Ok(instance)
    }

    pub async fn ping(&self) -> bool {
        match &self.backend {
            Backend::Redis(conn) => {
                let mut conn = conn.clone();
                let res: Result<String, RedisError> = redis::cmd("PING").query_async(&mut conn).await;
                matches!(res, Ok(s) if s.eq_ignore_ascii_case("PONG"))
            }
            Backend::Memory(store) => store.available.load(Ordering::Relaxed),
        }
    }

    pub async fn quit(&self) {}

    pub async fn get_string(&self, key: &str) -> Result<Option<String>, RedisLayerError> {
        match &self.backend {
            Backend::Redis(conn) => {
                let mut conn = conn.clone();
                redis::cmd("GET")
                    .arg(key)
                    .query_async(&mut conn)
                    .await
                    .map_err(Self::map_redis_err)
            }
            Backend::Memory(store) => store.get_string(key).await,
        }
    }

    pub async fn get_json<T: DeserializeOwned>(
        &self,
        key: &str,
    ) -> Result<Option<T>, RedisLayerError> {
        let Some(raw) = self.get_string(key).await? else {
            return Ok(None);
        };
        serde_json::from_str::<T>(&raw)
            .map(Some)
            .map_err(|err| RedisLayerError::Serialization(err.to_string()))
    }

    pub async fn set_string_ex(
        &self,
        key: &str,
        value: &str,
        ttl_secs: u64,
    ) -> Result<(), RedisLayerError> {
        match &self.backend {
            Backend::Redis(conn) => {
                let mut conn = conn.clone();
                redis::cmd("SETEX")
                    .arg(key)
                    .arg(ttl_secs)
                    .arg(value)
                    .query_async(&mut conn)
                    .await
                    .map_err(Self::map_redis_err)
            }
            Backend::Memory(store) => store.set_string_ex(key, value, ttl_secs).await,
        }
    }

    pub async fn atomic_incr_ex(&self, key: &str, ttl_secs: u64) -> Result<u64, RedisLayerError> {
        match &self.backend {
            Backend::Redis(conn) => {
                let mut conn = conn.clone();
                let script = redis::Script::new(r#"
                    local val = redis.call("INCR", KEYS[1])
                    redis.call("EXPIRE", KEYS[1], ARGV[1])
                    return val
                "#);
                let val: u64 = script
                    .key(key)
                    .arg(ttl_secs)
                    .invoke_async(&mut conn)
                    .await
                    .map_err(Self::map_redis_err)?;
                Ok(val)
            }
            Backend::Memory(store) => store.atomic_incr_ex(key, ttl_secs).await,
        }
    }

    pub async fn atomic_decr(&self, key: &str) -> Result<i64, RedisLayerError> {
        match &self.backend {
            Backend::Redis(conn) => {
                let mut conn = conn.clone();
                redis::cmd("DECR")
                    .arg(key)
                    .query_async(&mut conn)
                    .await
                    .map_err(Self::map_redis_err)
            }
            Backend::Memory(store) => store.atomic_decr(key).await,
        }
    }

    pub async fn set_json_ex<T: Serialize>(
        &self,
        key: &str,
        value: &T,
        ttl_secs: u64,
    ) -> Result<(), RedisLayerError> {
        let payload = serde_json::to_string(value)
            .map_err(|err| RedisLayerError::Serialization(err.to_string()))?;
        self.set_string_ex(key, &payload, ttl_secs).await
    }

    pub async fn set_json_nx_ex<T: Serialize>(
        &self,
        key: &str,
        value: &T,
        ttl_secs: u64,
    ) -> Result<bool, RedisLayerError> {
        let payload = serde_json::to_string(value)
            .map_err(|err| RedisLayerError::Serialization(err.to_string()))?;
        self.set_string_nx_ex(key, &payload, ttl_secs).await
    }

    pub async fn set_string_nx_ex(
        &self,
        key: &str,
        value: &str,
        ttl_secs: u64,
    ) -> Result<bool, RedisLayerError> {
        match &self.backend {
            Backend::Redis(conn) => {
                let mut conn = conn.clone();
                let res: Option<String> = redis::cmd("SET")
                    .arg(key)
                    .arg(value)
                    .arg("NX")
                    .arg("EX")
                    .arg(ttl_secs)
                    .query_async(&mut conn)
                    .await
                    .map_err(Self::map_redis_err)?;
                Ok(res.is_some())
            }
            Backend::Memory(store) => store.set_string_nx_ex(key, value, ttl_secs).await,
        }
    }

    pub async fn exists(&self, key: &str) -> Result<bool, RedisLayerError> {
        match &self.backend {
            Backend::Redis(conn) => {
                let mut conn = conn.clone();
                redis::cmd("EXISTS")
                    .arg(key)
                    .query_async(&mut conn)
                    .await
                    .map_err(Self::map_redis_err)
            }
            Backend::Memory(store) => store.exists(key).await,
        }
    }

    pub async fn delete(&self, key: &str) -> Result<u64, RedisLayerError> {
        match &self.backend {
            Backend::Redis(conn) => {
                let mut conn = conn.clone();
                redis::cmd("DEL")
                    .arg(key)
                    .query_async(&mut conn)
                    .await
                    .map_err(Self::map_redis_err)
            }
            Backend::Memory(store) => store.delete(key).await,
        }
    }

    pub async fn zadd_score(
        &self,
        key: &str,
        score: f64,
        member: &str,
    ) -> Result<u64, RedisLayerError> {
        match &self.backend {
            Backend::Redis(conn) => {
                let mut conn = conn.clone();
                redis::cmd("ZADD")
                    .arg(key)
                    .arg(score)
                    .arg(member)
                    .query_async(&mut conn)
                    .await
                    .map_err(Self::map_redis_err)
            }
            Backend::Memory(_) => Ok(0),
        }
    }

    pub async fn zrangebyscore(
        &self,
        key: &str,
        max_score: f64,
        limit: usize,
    ) -> Result<Vec<String>, RedisLayerError> {
        match &self.backend {
            Backend::Redis(conn) => {
                let mut conn = conn.clone();
                redis::cmd("ZRANGEBYSCORE")
                    .arg(key)
                    .arg("-inf")
                    .arg(max_score)
                    .arg("LIMIT")
                    .arg(0)
                    .arg(limit)
                    .query_async(&mut conn)
                    .await
                    .map_err(Self::map_redis_err)
            }
            Backend::Memory(_) => Ok(vec![]),
        }
    }

    pub async fn zrem(&self, key: &str, member: &str) -> Result<u64, RedisLayerError> {
        match &self.backend {
            Backend::Redis(conn) => {
                let mut conn = conn.clone();
                redis::cmd("ZREM")
                    .arg(key)
                    .arg(member)
                    .query_async(&mut conn)
                    .await
                    .map_err(Self::map_redis_err)
            }
            Backend::Memory(_) => Ok(0),
        }
    }

    pub async fn zremrangebyscore(
        &self,
        key: &str,
        min: f64,
        max: f64,
    ) -> Result<u64, RedisLayerError> {
        match &self.backend {
            Backend::Redis(conn) => {
                let mut conn = conn.clone();
                redis::cmd("ZREMRANGEBYSCORE")
                    .arg(key)
                    .arg(min)
                    .arg(max)
                    .query_async(&mut conn)
                    .await
                    .map_err(Self::map_redis_err)
            }
            Backend::Memory(_) => Ok(0),
        }
    }

    pub async fn script_load(&self, script: &str) -> Result<String, RedisLayerError> {
        match &self.backend {
            Backend::Redis(conn) => {
                let mut conn = conn.clone();
                redis::cmd("SCRIPT")
                    .arg("LOAD")
                    .arg(script)
                    .query_async(&mut conn)
                    .await
                    .map_err(Self::map_redis_err)
            }
            Backend::Memory(_) => Ok(sha1_hex(script)),
        }
    }

    pub async fn evalsha_i64(
        &self,
        _script_sha: &str,
        script_src: &str,
        key: &str,
        args: Vec<String>,
    ) -> Result<Vec<i64>, RedisLayerError> {
        match &self.backend {
            Backend::Redis(conn) => {
                let mut conn = conn.clone();
                let script = redis::Script::new(script_src);
                let mut script_inv = script.key(key);
                for arg in args {
                    script_inv.arg(arg);
                }
                script_inv.invoke_async(&mut conn).await.map_err(Self::map_redis_err)
            }
            Backend::Memory(store) => store.evalsha_i64(key, args).await,
        }
    }

    pub async fn getdel_atomic(
        &self,
        key: &str,
        script_src: &str,
        _script_sha: &str,
    ) -> Result<Option<String>, RedisLayerError> {
        match &self.backend {
            Backend::Redis(conn) => {
                let mut conn = conn.clone();
                let script = redis::Script::new(script_src);
                script.key(key).invoke_async(&mut conn).await.map_err(Self::map_redis_err)
            }
            Backend::Memory(store) => store.getdel(key).await,
        }
    }

    fn map_redis_err(err: RedisError) -> RedisLayerError {
        RedisLayerError::Command(err.to_string())
    }

    pub fn new_in_memory() -> Self {
        Self {
            backend: Backend::Memory(Arc::new(InMemoryRedis::new(true))),
        }
    }

    pub fn new_unavailable_in_memory() -> Self {
        Self {
            backend: Backend::Memory(Arc::new(InMemoryRedis::new(false))),
        }
    }
}

// ---------------------------------------------------------------------------
// In-Memory Fallback
// ---------------------------------------------------------------------------

struct InMemoryRedis {
    available: AtomicBool,
    state: Mutex<HashMap<String, MemoryValue>>,
}

#[derive(Clone)]
struct MemoryValue {
    value: String,
    expires_at: Option<Instant>,
}

impl InMemoryRedis {
    fn new(available: bool) -> Self {
        Self {
            available: AtomicBool::new(available),
            state: Mutex::new(HashMap::new()),
        }
    }

    fn ensure_available(&self) -> Result<(), RedisLayerError> {
        if !self.available.load(Ordering::Relaxed) {
            return Err(RedisLayerError::Unavailable("redis is unavailable".to_string()));
        }
        Ok(())
    }

    async fn get_string(&self, key: &str) -> Result<Option<String>, RedisLayerError> {
        self.ensure_available()?;
        let mut state = self.state.lock().await;
        prune_expired(&mut state, key);
        Ok(state.get(key).map(|entry| entry.value.clone()))
    }

    async fn getdel(&self, key: &str) -> Result<Option<String>, RedisLayerError> {
        self.ensure_available()?;
        let mut state = self.state.lock().await;
        prune_expired(&mut state, key);
        Ok(state.remove(key).map(|entry| entry.value))
    }

    async fn set_string_ex(&self, key: &str, value: &str, ttl_secs: u64) -> Result<(), RedisLayerError> {
        self.ensure_available()?;
        let mut state = self.state.lock().await;
        state.insert(key.to_string(), MemoryValue {
            value: value.to_string(),
            expires_at: Some(Instant::now() + Duration::from_secs(ttl_secs)),
        });
        Ok(())
    }

    async fn atomic_incr_ex(&self, key: &str, ttl_secs: u64) -> Result<u64, RedisLayerError> {
        self.ensure_available()?;
        let mut state = self.state.lock().await;
        prune_expired(&mut state, key);
        let entry = state.entry(key.to_string()).or_insert(MemoryValue {
            value: "0".to_string(),
            expires_at: Some(Instant::now() + Duration::from_secs(ttl_secs)),
        });
        let current: i64 = entry.value.parse().unwrap_or(0);
        let next = current + 1;
        entry.value = next.to_string();
        entry.expires_at = Some(Instant::now() + Duration::from_secs(ttl_secs));
        Ok(next as u64)
    }

    async fn atomic_decr(&self, key: &str) -> Result<i64, RedisLayerError> {
        self.ensure_available()?;
        let mut state = self.state.lock().await;
        prune_expired(&mut state, key);
        let entry = state.entry(key.to_string()).or_insert(MemoryValue {
            value: "0".to_string(),
            expires_at: None,
        });
        let current: i64 = entry.value.parse().unwrap_or(0);
        let next = (current - 1).max(0);
        entry.value = next.to_string();
        Ok(next)
    }

    async fn set_string_nx_ex(&self, key: &str, value: &str, ttl_secs: u64) -> Result<bool, RedisLayerError> {
        self.ensure_available()?;
        let mut state = self.state.lock().await;
        prune_expired(&mut state, key);
        if state.contains_key(key) {
            return Ok(false);
        }
        state.insert(key.to_string(), MemoryValue {
            value: value.to_string(),
            expires_at: Some(Instant::now() + Duration::from_secs(ttl_secs)),
        });
        Ok(true)
    }

    async fn exists(&self, key: &str) -> Result<bool, RedisLayerError> {
        self.ensure_available()?;
        let mut state = self.state.lock().await;
        prune_expired(&mut state, key);
        Ok(state.contains_key(key))
    }

    async fn delete(&self, key: &str) -> Result<u64, RedisLayerError> {
        self.ensure_available()?;
        let mut state = self.state.lock().await;
        Ok(if state.remove(key).is_some() { 1 } else { 0 })
    }

    async fn evalsha_i64(&self, key: &str, args: Vec<String>) -> Result<Vec<i64>, RedisLayerError> {
        self.ensure_available()?;
        let mut state = self.state.lock().await;

        // Specialized handler for the rate limit Lua script
        if key.starts_with("rate_limit:") && args.len() == 3 {
            let burst: f64 = args[0].parse().unwrap_or(0.0);
            let refill_per_sec: f64 = args[1].parse().unwrap_or(0.0);
            let now: f64 = args[2].parse().unwrap_or(0.0);

            let mut tokens = burst;
            let mut last_refill = now;

            if let Some(entry) = state.get(key) {
                if let Some(delim) = entry.value.find('|') {
                    tokens = entry.value[..delim].parse().unwrap_or(burst);
                    last_refill = entry.value[delim + 1..].parse().unwrap_or(now);
                }
            }

            let elapsed = (now - last_refill).max(0.0);
            tokens = (tokens + (elapsed * refill_per_sec)).min(burst);

            if tokens >= 1.0 {
                tokens -= 1.0;
                state.insert(
                    key.to_string(),
                    MemoryValue {
                        value: format!("{}|{}", tokens, now),
                        expires_at: Some(
                            Instant::now() + Duration::from_secs((burst / refill_per_sec) as u64 * 2),
                        ),
                    },
                );
                return Ok(vec![1, 0]);
            } else {
                let wait_secs = ((1.0 - tokens) / refill_per_sec).ceil() as i64;
                return Ok(vec![0, wait_secs]);
            }
        }

        // Default behavior for other scripts (mock "Success")
        Ok(vec![1, 0])
    }
}

fn prune_expired(state: &mut HashMap<String, MemoryValue>, key: &str) {
    if let Some(entry) = state.get(key) {
        if let Some(expires_at) = entry.expires_at {
            if Instant::now() >= expires_at {
                state.remove(key);
            }
        }
    }
}

fn sha1_hex(input: &str) -> String {
    use sha1::{Digest, Sha1};
    let mut hasher = Sha1::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

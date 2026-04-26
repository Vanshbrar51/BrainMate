pub mod auth;
pub mod auth_cache;
pub mod blacklist;
pub mod config;
pub mod db;
pub mod error;
pub mod jwks_cache;
pub mod migrations;
pub mod models;
pub mod nonce_store;
pub mod otp_store;
pub mod rate_limiter;
pub mod reconciliation;
pub mod redis_client;
pub mod refresh_store;
pub mod risk_engine;
pub mod secrets;
pub mod security_utils;
pub mod session_store;
pub mod telemetry;
pub mod waf_feedback;

use std::sync::Arc;

use anyhow::{Context, Result};
use tokio::sync::RwLock;

use crate::{
    auth_cache::AuthResultCache,
    blacklist::TokenBlacklist,
    config::Config,
    db::DbClient,
    jwks_cache::JwksCache,
    nonce_store::NonceStore,
    otp_store::OtpStore,
    rate_limiter::RateLimiter,
    reconciliation::ReconciliationWorker,
    redis_client::RedisClient,
    refresh_store::RefreshTokenStore,
    risk_engine::RiskEngine,
    session_store::SessionStore,
    waf_feedback::WafFeedback,
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub internal_api_tokens: Arc<RwLock<Vec<String>>>,
    pub redis: Arc<RedisClient>,
    pub jwks_cache: Arc<JwksCache>,
    pub session_store: Arc<SessionStore>,
    pub blacklist: Arc<TokenBlacklist>,
    pub refresh_store: Arc<RefreshTokenStore>,
    pub auth_cache: Arc<AuthResultCache>,
    pub rate_limiter: Arc<RateLimiter>,
    pub otp_store: Arc<OtpStore>,
    pub nonce_store: Arc<NonceStore>,
    pub risk_engine: Arc<RiskEngine>,
    pub waf_feedback: Arc<WafFeedback>,
    pub reconciliation: Option<Arc<ReconciliationWorker>>,
    /// Supabase/PostgreSQL client. `None` when `DATABASE_URL` is not set
    /// (Redis-only mode — identical behaviour to the pre-DB implementation).
    pub db: Option<Arc<DbClient>>,
}

pub async fn build_state(
    config: Arc<Config>,
    internal_api_tokens: Vec<String>,
    reconciliation: Option<Arc<ReconciliationWorker>>,
) -> Result<AppState> {
    // ── Redis ──────────────────────────────────────────────────────────────
    let connect_timeout = std::time::Duration::from_secs(config.redis_connect_timeout_secs);
    let redis_result = RedisClient::connect(&config.redis_primary_url, connect_timeout).await;

    let redis = Arc::new(match redis_result {
        Ok(client) => client,
        Err(err) if !config.require_redis_for_auth => {
            tracing::warn!(
                error = %err,
                require_redis_for_auth = false,
                "Redis unavailable — falling back to in-memory backend"
            );
            RedisClient::new_in_memory()
        }
        Err(err) => {
            return Err(anyhow::anyhow!("failed to initialize redis client: {}", err)
                .context("REQUIRE_REDIS_FOR_AUTH=true; cannot continue without Redis"));
        }
    });

    // ── PostgreSQL / Supabase (optional) ───────────────────────────────────
    let db: Option<Arc<DbClient>> = match &config.db_url {
        Some(url) => {
            let client = DbClient::connect(url, config.db_max_connections)
                .await
                .with_context(|| "failed to connect to Supabase/PostgreSQL")?;
            Some(Arc::new(client))
        }
        None => {
            tracing::warn!(
                "DATABASE_URL not set — running in Redis-only mode (no persistent storage)"
            );
            None
        }
    };

    // ── HTTP client ────────────────────────────────────────────────────────
    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(config.request_timeout_secs))
        .build()
        .with_context(|| "failed to initialize HTTP client")?;

    // ── Per-component construction ─────────────────────────────────────────
    let jwks_cache = Arc::new(
        JwksCache::new(
            redis.clone(),
            http_client,
            config.clerk_jwks_url.clone(),
            config.jwks_hard_ttl_secs,
            config.jwks_soft_ttl_secs,
        )
        .with_context(|| "failed to initialize jwks cache")?,
    );

    let auth_cache = Arc::new(
        AuthResultCache::new(redis.clone(), config.auth_cache_ttl_secs)
            .with_context(|| "failed to initialize auth cache")?,
    );

    let session_store = Arc::new(SessionStore::new(redis.clone(), db.clone()));
    let blacklist = Arc::new(TokenBlacklist::new(redis.clone(), db.clone()));
    let refresh_store = Arc::new(RefreshTokenStore::new(redis.clone(), db.clone()));
    let nonce_store = Arc::new(NonceStore::new(redis.clone(), config.region_id.clone()));
    let risk_engine = Arc::new(RiskEngine::new(redis.clone()));
    let waf_feedback = Arc::new(WafFeedback::new(redis.clone()));
    let otp_store = Arc::new(
        OtpStore::new(redis.clone(), config.otp_pepper.clone())
            .with_context(|| "failed to initialize otp store")?,
    );

    let rate_limiter = Arc::new(
        RateLimiter::new(
            redis.clone(),
            config.rate_limit_burst,
            config.rate_limit_per_sec,
        )
        .await
        .with_context(|| "failed to initialize rate limiter")?,
    );

    Ok(AppState {
        config,
        internal_api_tokens: Arc::new(RwLock::new(internal_api_tokens)),
        redis,
        jwks_cache,
        session_store,
        blacklist,
        refresh_store,
        auth_cache,
        rate_limiter,
        otp_store,
        nonce_store,
        risk_engine,
        waf_feedback,
        reconciliation,
        db,
    })
}

impl AppState {
    pub fn with_reconciliation(mut self, worker: Arc<ReconciliationWorker>) -> Self {
        self.reconciliation = Some(worker);
        self
    }
}

#[cfg(test)]
pub async fn build_test_state() -> AppState {
    use std::net::SocketAddr;

    let config = Arc::new(Config {
        bind_addr: "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        tls_cert_path: None,
        tls_key_path: None,
        require_tls: false,
        enforce_tls_for_public_listener: false,
        enable_reconciliation_worker: false,
        metrics_bind_addr: "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        metrics_optional: true,
        internal_bind_addr: "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        internal_api_tokens: vec!["internal_test_token".to_string()],
        internal_api_tokens_file: None,
        internal_api_tokens_reload_secs: 30,
        request_body_limit_bytes: 64 * 1024,
        require_redis_for_auth: true,
        clerk_jwks_url: "https://example.com/.well-known/jwks.json".to_string(),
        clerk_issuer: "https://issuer.example.com".to_string(),
        clerk_audience: None,
        clerk_authorized_party: Some("test-azp".to_string()),
        allowed_origins: vec!["http://localhost:3000".to_string()],
        allow_wildcard_cors: false,
        trust_x_forwarded_for: false,
        trusted_proxy_cidrs: vec![],
        region_id: "test-region".to_string(),
        rate_limit_burst: 1_000,
        rate_limit_per_sec: 1_000,
        auth_cache_ttl_secs: 45,
        request_timeout_secs: 5,
        redis_connect_timeout_secs: 1,
        redis_primary_url: "redis://127.0.0.1:6379".to_string(),
        jwks_cache_ttl_secs: 3600,
        jwks_soft_ttl_secs: 60,
        jwks_hard_ttl_secs: 300,
        jwks_backoff_base_secs: 1,
        jwks_backoff_max_secs: 60,
        max_session_ttl_secs: 86_400,
        max_sessions_per_user: 100,
        otp_pepper: "pepper".to_string(),
        db_url: None,
        db_max_connections: 20,
    });

    let redis = Arc::new(RedisClient::new_in_memory());
    let jwks_cache = Arc::new(
        JwksCache::new(
            redis.clone(),
            reqwest::Client::new(),
            config.clerk_jwks_url.clone(),
            config.jwks_hard_ttl_secs,
            config.jwks_soft_ttl_secs,
        )
        .unwrap(),
    );

    AppState {
        config: config.clone(),
        internal_api_tokens: Arc::new(RwLock::new(vec!["internal_test_token".to_string()])),
        redis: redis.clone(),
        jwks_cache,
        // db = None: Redis-only mode for all tests
        session_store: Arc::new(SessionStore::new(redis.clone(), None)),
        blacklist: Arc::new(TokenBlacklist::new(redis.clone(), None)),
        refresh_store: Arc::new(RefreshTokenStore::new(redis.clone(), None)),
        auth_cache: Arc::new(AuthResultCache::new(redis.clone(), 45).unwrap()),
        rate_limiter: Arc::new(RateLimiter::new(redis.clone(), 1_000, 1_000).await.unwrap()),
        otp_store: Arc::new(OtpStore::new(redis.clone(), "pepper".to_string()).unwrap()),
        nonce_store: Arc::new(NonceStore::new(redis.clone(), config.region_id.clone())),
        risk_engine: Arc::new(RiskEngine::new(redis.clone())),
        waf_feedback: Arc::new(WafFeedback::new(redis.clone())),
        reconciliation: None,
        db: None,
    }
}

#[cfg(test)]
pub async fn build_unavailable_test_state() -> AppState {
    use std::net::SocketAddr;

    let config = Arc::new(Config {
        bind_addr: "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        tls_cert_path: None,
        tls_key_path: None,
        require_tls: false,
        enforce_tls_for_public_listener: false,
        enable_reconciliation_worker: false,
        metrics_bind_addr: "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        metrics_optional: true,
        internal_bind_addr: "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        internal_api_tokens: vec!["internal_test_token".to_string()],
        internal_api_tokens_file: None,
        internal_api_tokens_reload_secs: 30,
        request_body_limit_bytes: 64 * 1024,
        require_redis_for_auth: true,
        clerk_jwks_url: "https://example.com/.well-known/jwks.json".to_string(),
        clerk_issuer: "https://issuer.example.com".to_string(),
        clerk_audience: None,
        clerk_authorized_party: Some("test-azp".to_string()),
        allowed_origins: vec!["http://localhost:3000".to_string()],
        allow_wildcard_cors: false,
        trust_x_forwarded_for: false,
        trusted_proxy_cidrs: vec![],
        region_id: "test-region".to_string(),
        rate_limit_burst: 1_000,
        rate_limit_per_sec: 1_000,
        auth_cache_ttl_secs: 45,
        request_timeout_secs: 5,
        redis_connect_timeout_secs: 1,
        redis_primary_url: "redis://127.0.0.1:6379".to_string(),
        jwks_cache_ttl_secs: 3600,
        jwks_soft_ttl_secs: 60,
        jwks_hard_ttl_secs: 300,
        jwks_backoff_base_secs: 1,
        jwks_backoff_max_secs: 60,
        max_session_ttl_secs: 86_400,
        max_sessions_per_user: 100,
        otp_pepper: "pepper".to_string(),
        db_url: None,
        db_max_connections: 20,
    });

    let redis = Arc::new(RedisClient::new_unavailable_in_memory());
    let jwks_cache = Arc::new(
        JwksCache::new(
            redis.clone(),
            reqwest::Client::new(),
            config.clerk_jwks_url.clone(),
            config.jwks_hard_ttl_secs,
            config.jwks_soft_ttl_secs,
        )
        .unwrap(),
    );

    AppState {
        config: config.clone(),
        internal_api_tokens: Arc::new(RwLock::new(vec!["internal_test_token".to_string()])),
        redis: redis.clone(),
        jwks_cache,
        // db = None: Redis-only mode for all tests
        session_store: Arc::new(SessionStore::new(redis.clone(), None)),
        blacklist: Arc::new(TokenBlacklist::new(redis.clone(), None)),
        refresh_store: Arc::new(RefreshTokenStore::new(redis.clone(), None)),
        auth_cache: Arc::new(AuthResultCache::new(redis.clone(), 45).unwrap()),
        rate_limiter: Arc::new(RateLimiter::new(redis.clone(), 1_000, 1_000).await.unwrap()),
        otp_store: Arc::new(OtpStore::new(redis.clone(), "pepper".to_string()).unwrap()),
        nonce_store: Arc::new(NonceStore::new(redis.clone(), config.region_id.clone())),
        risk_engine: Arc::new(RiskEngine::new(redis.clone())),
        waf_feedback: Arc::new(WafFeedback::new(redis.clone())),
        reconciliation: None,
        db: None,
    }
}

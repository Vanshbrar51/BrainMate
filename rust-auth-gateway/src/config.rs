use std::{env, net::SocketAddr};

use anyhow::{Context, Result};
use reqwest::Url;

#[derive(Clone, Debug)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub tls_cert_path: Option<String>,
    pub tls_key_path: Option<String>,
    pub require_tls: bool,
    pub enforce_tls_for_public_listener: bool,
    pub enable_reconciliation_worker: bool,
    pub metrics_bind_addr: SocketAddr,
    pub metrics_optional: bool,
    pub internal_bind_addr: SocketAddr,
    pub internal_api_tokens: Vec<String>,
    pub internal_api_tokens_file: Option<String>,
    pub internal_api_tokens_reload_secs: u64,
    pub request_body_limit_bytes: usize,
    pub require_redis_for_auth: bool,
    pub clerk_jwks_url: String,
    pub clerk_issuer: String,
    pub clerk_audience: Option<String>,
    pub clerk_authorized_party: Option<String>,
    pub allowed_origins: Vec<String>,
    pub allow_wildcard_cors: bool,
    pub trust_x_forwarded_for: bool,
    pub trusted_proxy_cidrs: Vec<ipnet::IpNet>,
    pub region_id: String,
    pub rate_limit_burst: u32,
    pub rate_limit_per_sec: u32,
    pub auth_cache_ttl_secs: u64,
    pub request_timeout_secs: u64,
    pub redis_connect_timeout_secs: u64,
    pub redis_primary_url: String,
    pub jwks_cache_ttl_secs: u64,
    pub jwks_soft_ttl_secs: u64,
    pub jwks_hard_ttl_secs: u64,
    pub jwks_backoff_base_secs: u64,
    pub jwks_backoff_max_secs: u64,
    pub max_session_ttl_secs: u64,
    pub max_sessions_per_user: u32,
    pub otp_pepper: String,
    /// Supabase/PostgreSQL connection URL. When `None` the gateway operates in
    /// Redis-only mode with identical behaviour to the pre-DB version.
    pub db_url: Option<String>,
    /// Maximum connections in the sqlx PgPool. Default: 20.
    pub db_max_connections: u32,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let bind_addr = env::var("AUTH_GATEWAY_BIND_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:8081".to_string())
            .parse::<SocketAddr>()
            .context("AUTH_GATEWAY_BIND_ADDR must be a valid socket address")?;
        let tls_cert_path = optional("TLS_CERT_PATH");
        let tls_key_path = optional("TLS_KEY_PATH");
        let require_tls = env_bool("REQUIRE_TLS").unwrap_or(false);
        let enforce_tls_for_public_listener =
            env_bool("ENFORCE_TLS_FOR_PUBLIC_LISTENER").unwrap_or(false);
        let enable_reconciliation_worker =
            env_bool("ENABLE_RECONCILIATION_WORKER").unwrap_or(false);

        let metrics_bind_addr = env::var("AUTH_GATEWAY_METRICS_BIND_ADDR")
            .unwrap_or_else(|_| "127.0.0.1:9090".to_string())
            .parse::<SocketAddr>()
            .context("AUTH_GATEWAY_METRICS_BIND_ADDR must be a valid socket address")?;
        let metrics_optional = env_bool("METRICS_OPTIONAL").unwrap_or(false);

        let internal_bind_addr = env::var("AUTH_GATEWAY_INTERNAL_BIND_ADDR")
            .unwrap_or_else(|_| "127.0.0.1:9091".to_string())
            .parse::<SocketAddr>()
            .context("AUTH_GATEWAY_INTERNAL_BIND_ADDR must be a valid socket address")?;
        let mut internal_api_tokens = csv("INTERNAL_API_TOKENS");
        if internal_api_tokens.is_empty() {
            if let Some(token) = optional("INTERNAL_API_TOKEN") {
                internal_api_tokens.push(token);
            }
        }
        let internal_api_tokens_file = optional("INTERNAL_API_TOKENS_FILE");
        let internal_api_tokens_reload_secs = env::var("INTERNAL_API_TOKENS_RELOAD_SECS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(30);
        let request_body_limit_bytes = env::var("REQUEST_BODY_LIMIT_BYTES")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(64 * 1024)
            .try_into()
            .context("REQUEST_BODY_LIMIT_BYTES must fit into usize")?;
        let require_redis_for_auth = env_bool("REQUIRE_REDIS_FOR_AUTH").unwrap_or(false);

        let clerk_jwks_url = required("CLERK_JWKS_URL")?;
        let clerk_issuer = required("CLERK_ISSUER")?;
        let clerk_audience = optional("CLERK_AUDIENCE");
        let clerk_authorized_party = optional("CLERK_AUTHORIZED_PARTY");
        validate_clerk_urls(&clerk_issuer, &clerk_jwks_url)?;

        let allowed_origins = env::var("ALLOWED_ORIGINS")
            .unwrap_or_else(|_| "http://localhost:3000".to_string())
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToString::to_string)
            .collect::<Vec<_>>();

        let allow_wildcard_cors = env_bool("ALLOW_WILDCARD_CORS").unwrap_or(false);
        let trust_x_forwarded_for = env_bool("TRUST_X_FORWARDED_FOR").unwrap_or(false);

        let trusted_proxy_cidrs = env::var("TRUSTED_PROXY_CIDRS")
            .unwrap_or_else(|_| "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16".to_string())
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| {
                s.parse::<ipnet::IpNet>()
                    .with_context(|| format!("Invalid CIDR: {}", s))
            })
            .collect::<Result<Vec<_>>>()?;
        let region_id = env::var("AUTH_REGION_ID")
            .or_else(|_| env::var("REGION"))
            .unwrap_or_else(|_| "global".to_string());

        let rate_limit_burst = env::var("RATE_LIMIT_BURST")
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(20);

        let rate_limit_per_sec = env::var("RATE_LIMIT_PER_SEC")
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(10);

        let auth_cache_ttl_secs = env::var("AUTH_CACHE_TTL_SECS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(45);

        let request_timeout_secs = env::var("REQUEST_TIMEOUT_SECS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(10);

        let redis_connect_timeout_secs = env::var("REDIS_CONNECT_TIMEOUT_SECS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(2);

        let jwks_cache_ttl_secs = env::var("JWKS_CACHE_TTL_SECS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(3600);
        let jwks_soft_ttl_secs = env::var("JWKS_SOFT_TTL_SECS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(60);
        let jwks_hard_ttl_secs = env::var("JWKS_HARD_TTL_SECS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(300);

        let jwks_backoff_base_secs = env::var("JWKS_BACKOFF_BASE_SECS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(30);

        let jwks_backoff_max_secs = env::var("JWKS_BACKOFF_MAX_SECS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(300);

        let max_session_ttl_secs = env::var("MAX_SESSION_TTL_SECS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(86_400);

        let max_sessions_per_user = env::var("MAX_SESSIONS_PER_USER")
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(10);

        let otp_pepper = required("OTP_PEPPER")?;

        let redis_primary_url = env::var("REDIS_PRIMARY_URL")
            .or_else(|_| env::var("REDIS_URL"))
            .or_else(|_| env::var("AUTH_REDIS_PRIMARY_URL"))
            .unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());

        // Optional: leave unset to run in Redis-only mode.
        // Use Supabase's PgBouncer pooler URL (port 6543) in production.
        let db_url = optional("DATABASE_URL");
        let db_max_connections = env::var("DB_MAX_CONNECTIONS")
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(20_u32);

        Ok(Self {
            bind_addr,
            tls_cert_path,
            tls_key_path,
            require_tls,
            enforce_tls_for_public_listener,
            enable_reconciliation_worker,
            metrics_bind_addr,
            metrics_optional,
            internal_bind_addr,
            internal_api_tokens,
            internal_api_tokens_file,
            internal_api_tokens_reload_secs,
            request_body_limit_bytes,
            require_redis_for_auth,
            clerk_jwks_url,
            clerk_issuer,
            clerk_audience,
            clerk_authorized_party,
            allowed_origins,
            allow_wildcard_cors,
            trust_x_forwarded_for,
            trusted_proxy_cidrs,
            region_id,
            rate_limit_burst,
            rate_limit_per_sec,
            auth_cache_ttl_secs,
            request_timeout_secs,
            redis_connect_timeout_secs,
            redis_primary_url,
            jwks_cache_ttl_secs,
            jwks_soft_ttl_secs,
            jwks_hard_ttl_secs,
            jwks_backoff_base_secs,
            jwks_backoff_max_secs,
            max_session_ttl_secs,
            max_sessions_per_user,
            otp_pepper,
            db_url,
            db_max_connections,
        })
    }
}

fn required(name: &str) -> Result<String> {
    env::var(name).with_context(|| format!("{name} is required"))
}

fn optional(name: &str) -> Option<String> {
    env::var(name).ok().and_then(|v| {
        let trimmed = v.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn csv(name: &str) -> Vec<String> {
    env::var(name)
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn env_bool(name: &str) -> Option<bool> {
    env::var(name)
        .ok()
        .and_then(|v| match v.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "y" => Some(true),
            "0" | "false" | "no" | "n" => Some(false),
            _ => None,
        })
}

fn validate_clerk_urls(issuer: &str, jwks_url: &str) -> Result<()> {
    if issuer.contains("REPLACE") || jwks_url.contains("REPLACE") {
        anyhow::bail!(
            "CLERK_ISSUER/CLERK_JWKS_URL contain placeholder values. Set real Clerk domain values."
        );
    }

    let issuer_url = Url::parse(issuer).context("CLERK_ISSUER must be a valid URL")?;
    let jwks = Url::parse(jwks_url).context("CLERK_JWKS_URL must be a valid URL")?;

    if issuer_url.scheme() != "https" || jwks.scheme() != "https" {
        anyhow::bail!("CLERK_ISSUER and CLERK_JWKS_URL must both use https");
    }

    let issuer_host = issuer_url
        .host_str()
        .context("CLERK_ISSUER must include host")?;
    let jwks_host = jwks
        .host_str()
        .context("CLERK_JWKS_URL must include host")?;

    if issuer_host != jwks_host {
        anyhow::bail!("CLERK_JWKS_URL host must match CLERK_ISSUER host");
    }

    if !jwks.path().ends_with("/.well-known/jwks.json") {
        anyhow::bail!("CLERK_JWKS_URL must end with /.well-known/jwks.json");
    }

    Ok(())
}

pub fn validate_redis_url_security(redis_url: &str) -> Result<()> {
    let url = Url::parse(redis_url).context("REDIS_URL must be a valid URL")?;

    match url.scheme() {
        "redis" | "rediss" => {}
        _ => anyhow::bail!("REDIS_URL must use redis:// or rediss://"),
    }

    let host = url
        .host_str()
        .context("REDIS_URL must include a host")?
        .to_ascii_lowercase();
    let is_loopback = matches!(host.as_str(), "localhost" | "127.0.0.1" | "::1");

    if !is_loopback && url.scheme() != "rediss" {
        // Some managed Redis providers (e.g. RedisLabs/Upstash) terminate TLS at
        // their infrastructure edge and expose a plain-TCP port to the client.
        // In those cases the connection is still encrypted end-to-end at the
        // network level, but the application-facing port speaks raw RESP.
        // Set ALLOW_REMOTE_PLAINTEXT_REDIS=true to acknowledge this topology.
        let allow = std::env::var("ALLOW_REMOTE_PLAINTEXT_REDIS")
            .ok()
            .and_then(|v| match v.trim().to_ascii_lowercase().as_str() {
                "1" | "true" | "yes" => Some(true),
                _ => None,
            })
            .unwrap_or(false);

        if allow {
            // Warn loudly but allow startup — operator has acknowledged the topology.
            eprintln!(
                "WARNING: REDIS_URL uses redis:// (plaintext) for a remote host. \
                 Ensure your network path is encrypted (VPN, TLS proxy, or managed-cloud topology). \
                 Set ALLOW_REMOTE_PLAINTEXT_REDIS=false and switch to rediss:// when possible."
            );
        } else {
            anyhow::bail!(
                "Remote Redis must use TLS (rediss://) or set \
                 ALLOW_REMOTE_PLAINTEXT_REDIS=true if your provider terminates TLS at the edge \
                 (e.g. RedisLabs, Upstash). Current URL: {redis_url}"
            );
        }
    }

    Ok(())
}


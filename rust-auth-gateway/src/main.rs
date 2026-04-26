use std::{collections::HashSet, net::SocketAddr, sync::Arc, time::Duration};

use anyhow::{Context, Result};
use axum::{
    extract::State,
    http::header,
    middleware,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use axum_server::tls_rustls::RustlsConfig;
use brainmate_auth_gateway::{
    auth, build_state,
    config::{validate_redis_url_security, Config},
    telemetry, AppState,
};
use http::header::HeaderName;
use http::{HeaderValue, Method, StatusCode};
use metrics_exporter_prometheus::{Matcher, PrometheusBuilder};
use serde_json::json;
use tower_http::{
    cors::{Any, CorsLayer},
    limit::RequestBodyLimitLayer,
    set_header::SetResponseHeaderLayer,
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use tracing::Instrument;
use tracing::{error, info, warn};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize OpenTelemetry tracing
    dotenv::dotenv().ok();
    
    

    telemetry::init_tracing()?;

    install_crypto_provider()?;

    // Initialize SecretManager and pre-warm config-critical secrets.
    let secret_manager = Arc::new(brainmate_auth_gateway::secrets::SecretManager::new());
    for secret_name in &["OTP_PEPPER", "REDIS_URL", "INTERNAL_API_TOKEN"] {
        let value = secret_manager.get_secret(secret_name).await;
        if !value.is_empty() {
            // SAFETY: single-threaded at this point (before tokio::spawn).
            std::env::set_var(secret_name, &value);
        }
    }
    secret_manager.clone().spawn_rotation_checker();

    let config = Arc::new(Config::from_env()?);
    let internal_api_tokens = load_internal_api_tokens(&config).await?;
    validate_security_posture(&config, &internal_api_tokens)?;
    info!(
        bind_addr = %config.bind_addr,
        internal_bind_addr = %config.internal_bind_addr,
        tls_enabled = config.tls_cert_path.is_some(),
        enforce_tls = config.enforce_tls_for_public_listener,
        secret_provider = std::env::var("SECRET_PROVIDER").unwrap_or_else(|_| "env".to_string()),
        redis_url_masked = mask_redis_url(&config.redis_primary_url),
        region_id = %config.region_id,
        rate_limit_burst = config.rate_limit_burst,
        rate_limit_per_sec = config.rate_limit_per_sec,
        max_sessions_per_user = config.max_sessions_per_user,
        reconciliation_worker = config.enable_reconciliation_worker,
        "gateway starting"
    );

    if config.allow_wildcard_cors {
        warn!("ALLOW_WILDCARD_CORS is enabled; this is not safe in production");
    }

    metrics::describe_histogram!(
        "auth_latency_seconds",
        metrics::Unit::Seconds,
        "Auth middleware latency"
    );

    let metrics_builder = PrometheusBuilder::new()
        .with_http_listener(config.metrics_bind_addr)
        .set_buckets_for_metric(
            Matcher::Full("auth_latency_seconds".to_string()),
            &[0.001, 0.005, 0.010, 0.025, 0.050, 0.100, 0.250, 0.500, 1.0],
        )?;

    if let Err(err) = metrics_builder.install() {
        if config.metrics_optional {
            warn!("metrics exporter unavailable: {err}");
        } else {
            return Err(anyhow::anyhow!(
                "metrics exporter unavailable and METRICS_OPTIONAL=false: {err}"
            ));
        }
    }

    // Run pending database migrations when DATABASE_URL is configured.
    // This is a no-op when the DB is already up-to-date.
    if let Ok(db_url) = std::env::var("DATABASE_URL") {
        if !db_url.trim().is_empty() {
            info!("DATABASE_URL configured; connecting to run migrations");
            match brainmate_auth_gateway::db::DbClient::connect(&db_url, 2).await {
                Ok(migration_client) => {
                    if let Err(err) =
                        brainmate_auth_gateway::migrations::run_migrations(
                            migration_client.pool(),
                        )
                        .await
                    {
                        return Err(anyhow::anyhow!("migration failed: {err}"));
                    }
                }
                Err(err) => {
                    return Err(anyhow::anyhow!(
                        "failed to connect for migrations: {err}"
                    ));
                }
            }
        }
    }

    let mut state = build_state(config.clone(), internal_api_tokens, None).await?;

    if let Some(path) = config.internal_api_tokens_file.as_deref() {
        spawn_internal_token_reloader(state.clone(), path.to_string());
    }

    let mut recon_shutdown_tx = None;
    if config.enable_reconciliation_worker {
        // Spawn reconciliation worker for durable async retry.
        let (tx, recon_shutdown_rx) = tokio::sync::watch::channel(false);
        let recon_worker = Arc::new(
            brainmate_auth_gateway::reconciliation::ReconciliationWorker::new(
                state.redis.clone(),
                state.session_store.clone(),
                state.blacklist.clone(),
                state.db.clone(),
                config.max_session_ttl_secs,
                config.max_sessions_per_user,
            ),
        );
        recon_worker.clone().spawn(recon_shutdown_rx);
        state = state.with_reconciliation(recon_worker);
        recon_shutdown_tx = Some(tx);
    }

    if let Err(err) = state.jwks_cache.warmup().await {
        warn!("jwks warmup failed at startup: {err}");
    }

    let cors = build_cors_layer(&config)?;

    let protected_routes = Router::new()
        .route("/v1/auth/session", get(auth::session))
        .route("/v1/auth/logout", post(auth::logout))
        .with_state(state.clone())
        .route_layer(middleware::from_fn({
            let state = state.clone();
            move |request, next| {
                let state = state.clone();
                async move { auth::require_auth(state, request, next).await }
            }
        }));

    let internal_routes = Router::new()
        .route("/v1/auth/session", post(auth::create_session))
        .route("/v1/auth/session/{sid}", delete(auth::revoke_session))
        .route("/v1/auth/refresh/issue", post(auth::issue_refresh))
        .route("/v1/auth/refresh/rotate", post(auth::rotate_refresh))
        .route("/v1/auth/refresh/revoke", post(auth::revoke_refresh))
        .route("/v1/auth/otp/issue", post(auth::issue_otp))
        .route("/v1/auth/otp/verify", post(auth::verify_otp))
        .route_layer(middleware::from_fn({
            let state = state.clone();
            move |request, next| {
                let state = state.clone();
                async move { auth::require_internal_api_access(state, request, next).await }
            }
        }))
        .with_state(state.clone());

    let app = Router::new()
        .route("/healthz", get(readyz))
        .route("/healthz/live", get(livez))
        .route("/healthz/ready", get(readyz))
        .route("/healthz/redis", get(redis_healthz))
        .merge(protected_routes)
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::REFERRER_POLICY,
            HeaderValue::from_static("strict-origin-when-cross-origin"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static("default-src 'none'; frame-ancestors 'none'; base-uri 'none'"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static("max-age=31536000; includeSubDomains"),
        ))
        .layer(RequestBodyLimitLayer::new(config.request_body_limit_bytes))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(config.request_timeout_secs),
        ))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state.clone());

    let internal_listener = tokio::net::TcpListener::bind(config.internal_bind_addr).await?;
    info!(
        "internal auth gateway listening on {}",
        internal_listener.local_addr()?
    );
    let internal_server = axum::serve(
        internal_listener,
        internal_routes.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal());

    let public_server: std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send>> =
        if let (Some(cert_path), Some(key_path)) = (
            config.tls_cert_path.as_deref(),
            config.tls_key_path.as_deref(),
        ) {
            info!("auth gateway TLS enabled on {}", config.bind_addr);
            let tls_config = RustlsConfig::from_pem_file(cert_path, key_path).await?;
            let handle = axum_server::Handle::new();
            let shutdown_handle = handle.clone();
            tokio::spawn(
                async move {
                    shutdown_signal().await;
                    shutdown_handle.graceful_shutdown(Some(Duration::from_secs(10)));
                }
                .instrument(tracing::info_span!("tls.shutdown_watcher")),
            );

            Box::pin(async move {
                axum_server::bind_rustls(config.bind_addr, tls_config)
                    .handle(handle)
                    .serve(app.into_make_service_with_connect_info::<SocketAddr>())
                    .await
                    .map_err(anyhow::Error::from)?;
                Ok(())
            })
        } else {
            let listener = tokio::net::TcpListener::bind(config.bind_addr).await?;
            info!("auth gateway listening on {}", listener.local_addr()?);
            Box::pin(async move {
                axum::serve(
                    listener,
                    app.into_make_service_with_connect_info::<SocketAddr>(),
                )
                .with_graceful_shutdown(shutdown_signal())
                .await
                .map_err(anyhow::Error::from)?;
                Ok(())
            })
        };

    let (public_res, internal_res) = tokio::join!(public_server, internal_server);
    public_res?;
    internal_res?;

    if let Some(tx) = recon_shutdown_tx {
        let _ = tx.send(true);
        tokio::time::sleep(Duration::from_secs(2)).await;
    }

    // Flush all buffered OpenTelemetry spans before shutdown
    telemetry::shutdown_tracing();

    state.redis.quit().await;

    Ok(())
}

use uuid::Uuid;

async fn livez() -> impl IntoResponse {
    let request_id = Uuid::new_v4().to_string();
    let mut response = Json(json!({ "status": "ok", "probe": "live" })).into_response();
    if let Ok(val) = HeaderValue::from_str(&request_id) {
        response.headers_mut().insert("x-request-id", val);
    }
    response
}

async fn redis_healthz(State(state): State<AppState>) -> impl IntoResponse {
    let request_id = Uuid::new_v4().to_string();
    let pong = state.redis.ping().await;
    let status = if pong {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    let body = json!({
        "status": if pong { "ok" } else { "unavailable" },
        "redis": pong,
        "probe": "redis",
    });
    let mut response = (status, Json(body)).into_response();
    if let Ok(val) = HeaderValue::from_str(&request_id) {
        response.headers_mut().insert("x-request-id", val);
    }
    response
}

async fn readyz(State(state): State<AppState>) -> impl IntoResponse {
    let jwks_cache_value = state.redis.get_string("jwks:cache").await;
    let redis_ready = jwks_cache_value.is_ok();
    let jwks_ready = jwks_cache_value.ok().flatten().is_some();

    let ready = redis_ready && jwks_ready;
    let body = json!({
        "status": if ready { "ready" } else { "degraded" },
        "probe": "ready",
        "redis": redis_ready,
        "jwks": jwks_ready,
    });

    let request_id = Uuid::new_v4().to_string();
    let status = if ready {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    let mut response = (status, Json(body)).into_response();
    if let Ok(val) = HeaderValue::from_str(&request_id) {
        response.headers_mut().insert("x-request-id", val);
    }
    response
}

fn build_cors_layer(config: &Config) -> Result<CorsLayer> {
    let mut cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::OPTIONS])
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ACCEPT,
            HeaderName::from_static("traceparent"),
            HeaderName::from_static("tracestate"),
            HeaderName::from_static("baggage"),
            HeaderName::from_static("x-request-nonce"),
            HeaderName::from_static("x-device-fingerprint"),
            HeaderName::from_static("x-request-id"),
            HeaderName::from_static("x-waf-client-id"),
            HeaderName::from_static("x-client-region"),
        ]);

    if config.allowed_origins.iter().any(|origin| origin == "*") {
        if !config.allow_wildcard_cors {
            anyhow::bail!(
                "Wildcard CORS is blocked. Set ALLOW_WILDCARD_CORS=true only for local development."
            );
        }
        cors = cors.allow_origin(Any);
    } else {
        let origins = config
            .allowed_origins
            .iter()
            .map(|origin| HeaderValue::from_str(origin))
            .collect::<std::result::Result<Vec<_>, _>>()?;
        cors = cors.allow_origin(origins);
    }

    Ok(cors)
}

fn validate_security_posture(config: &Config, internal_api_tokens: &[String]) -> Result<()> {
    let has_tls_cert = config.tls_cert_path.is_some();
    let has_tls_key = config.tls_key_path.is_some();

    if has_tls_cert ^ has_tls_key {
        anyhow::bail!("TLS_CERT_PATH and TLS_KEY_PATH must both be set when enabling TLS");
    }

    if internal_api_tokens.is_empty() {
        anyhow::bail!(
            "INTERNAL_API_TOKENS (or INTERNAL_API_TOKEN/INTERNAL_API_TOKENS_FILE) is required"
        );
    }

    if config.request_body_limit_bytes == 0 {
        anyhow::bail!("REQUEST_BODY_LIMIT_BYTES must be greater than zero");
    }

    if !config.internal_bind_addr.ip().is_loopback() {
        anyhow::bail!("AUTH_GATEWAY_INTERNAL_BIND_ADDR must be loopback-only for security");
    }

    if config.require_tls && !(has_tls_cert && has_tls_key) {
        anyhow::bail!("REQUIRE_TLS=true but TLS_CERT_PATH/TLS_KEY_PATH are not fully configured");
    }

    if !(has_tls_cert && has_tls_key) && !config.bind_addr.ip().is_loopback() {
        if config.enforce_tls_for_public_listener {
            anyhow::bail!(
                "ENFORCE_TLS_FOR_PUBLIC_LISTENER=true but TLS certs are not configured. Set TLS_CERT_PATH and TLS_KEY_PATH, or set AUTH_GATEWAY_BIND_ADDR to a loopback address for local development."
            );
        } else {
            warn!(
                "Public auth listener is not loopback and TLS is disabled. Set ENFORCE_TLS_FOR_PUBLIC_LISTENER=true and configure TLS for production."
            );
        }
    }

    if !config.metrics_bind_addr.ip().is_loopback() {
        warn!("metrics endpoint is not loopback-only; restrict AUTH_GATEWAY_METRICS_BIND_ADDR");
    }

    if !(30..=60).contains(&config.auth_cache_ttl_secs) {
        anyhow::bail!("AUTH_CACHE_TTL_SECS must be between 30 and 60");
    }

    if config.jwks_soft_ttl_secs == 0 || config.jwks_soft_ttl_secs > config.jwks_hard_ttl_secs {
        anyhow::bail!("JWKS_SOFT_TTL_SECS must be > 0 and <= JWKS_HARD_TTL_SECS");
    }

    validate_redis_url_security(&config.redis_primary_url)?;

    Ok(())
}

fn mask_redis_url(url: &str) -> String {
    brainmate_auth_gateway::redis_client::mask_redis_url(url)
}

async fn load_internal_api_tokens(config: &Config) -> Result<Vec<String>> {
    let mut tokens = config.internal_api_tokens.clone();
    if let Ok(previous) = std::env::var("INTERNAL_API_TOKENS_PREVIOUS") {
        tokens.extend(parse_token_list(&previous));
    }

    if let Some(path) = config.internal_api_tokens_file.as_deref() {
        let raw = tokio::fs::read_to_string(path)
            .await
            .with_context(|| format!("failed to read INTERNAL_API_TOKENS_FILE at {path}"))?;
        if raw.trim().is_empty() {
            anyhow::bail!("INTERNAL_API_TOKENS_FILE at {path} is empty");
        }
        tokens.extend(parse_token_list(&raw));
    }

    let normalized = normalize_tokens(tokens);
    if normalized.is_empty() {
        anyhow::bail!("no internal API tokens configured");
    }

    Ok(normalized)
}

fn spawn_internal_token_reloader(state: AppState, path: String) {
    tokio::spawn(
        async move {
            let static_tokens = {
                let mut tokens = state.config.internal_api_tokens.clone();
                if let Ok(previous) = std::env::var("INTERNAL_API_TOKENS_PREVIOUS") {
                    tokens.extend(parse_token_list(&previous));
                }
                normalize_tokens(tokens)
            };

            let mut consecutive_failures: u32 = 0;
            let mut interval = tokio::time::interval(Duration::from_secs(
                state.config.internal_api_tokens_reload_secs.max(1),
            ));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

            loop {
                interval.tick().await;
                match tokio::fs::read_to_string(&path).await {
                    Ok(raw) => {
                        let mut next_tokens = static_tokens.clone();
                        next_tokens.extend(parse_token_list(&raw));
                        let next_tokens = normalize_tokens(next_tokens);
                        if next_tokens.is_empty() {
                            consecutive_failures = consecutive_failures.saturating_add(1);
                            metrics::counter!("internal_token_reload_failures_total").increment(1);
                            if consecutive_failures >= 5 {
                                error!(
                                    "internal API token file has produced an empty token set {} times in a row",
                                    consecutive_failures
                                );
                            } else {
                                warn!("internal token reload produced empty token set");
                            }
                            continue;
                        }

                        consecutive_failures = 0;
                        let mut current = state.internal_api_tokens.write().await;
                        if *current != next_tokens {
                            *current = next_tokens;
                            info!("internal API tokens reloaded");
                        }
                    }
                    Err(err) => {
                        consecutive_failures = consecutive_failures.saturating_add(1);
                        metrics::counter!("internal_token_reload_failures_total").increment(1);
                        if consecutive_failures >= 5 {
                            error!(
                                "internal API token file failed to reload {} times in a row: {}",
                                consecutive_failures, err
                            );
                        } else {
                            warn!("failed to reload internal API tokens: {err}");
                        }
                    }
                }
            }
        }
        .instrument(tracing::info_span!("internal_api_token_reloader")),
    );
}

fn parse_token_list(raw: &str) -> Vec<String> {
    raw.split(|c| c == ',' || c == '\n' || c == '\r')
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn normalize_tokens(tokens: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    for token in tokens {
        let trimmed = token.trim();
        if trimmed.is_empty() {
            continue;
        }

        if seen.insert(trimmed.to_string()) {
            normalized.push(trimmed.to_string());
        }
    }

    normalized
}

fn install_crypto_provider() -> Result<()> {
    // rustls may compile with multiple crypto backends in this workspace.
    // Install one explicitly at process start to avoid runtime panics.
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    jsonwebtoken::crypto::rust_crypto::DEFAULT_PROVIDER
        .install_default()
        .map_err(|_| anyhow::anyhow!("Failed to install rust_crypto provider"))?;
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    info!("signal received, waiting for in-flight requests to complete");
}

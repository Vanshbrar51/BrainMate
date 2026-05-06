use std::sync::Arc;
use std::time::Duration;
use std::net::SocketAddr;

use axum::{
    extract::{Query, State},
    http::{header, HeaderName, HeaderValue, Method, StatusCode},
    middleware,
    response::{IntoResponse, Json},
    routing::{delete, get, post},
    Router,
};
use serde::{Deserialize};
use serde_json::json;
use tower_http::{
    cors::{Any, CorsLayer},
    limit::RequestBodyLimitLayer,
    set_header::SetResponseHeaderLayer,
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use uuid::Uuid;
use anyhow::{Result};

use crate::{
    auth,
    config::Config,
    AppState,
};

pub fn create_router(state: AppState) -> Router {
    let config = state.config.clone();
    let cors = build_cors_layer(&config).unwrap_or_else(|_| CorsLayer::permissive());

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

    Router::new()
        .route("/healthz", get(readyz))
        .route("/healthz/live", get(livez))
        .route("/healthz/ready", get(readyz))
        .route("/healthz/redis", get(redis_healthz))
        .route("/v1/tools/calendar.ics", get(calendar_ics))
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
        .with_state(state)
}

pub fn create_internal_router(state: AppState) -> Router {
    Router::new()
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
        .with_state(state)
}

async fn livez() -> impl IntoResponse {
    let request_id = Uuid::new_v4().to_string();
    let mut response = (StatusCode::OK, Json(json!({"status": "live", "probe": "live"}))).into_response();
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

#[derive(Debug, Deserialize)]
struct CalendarQuery {
    pub title: String,
    pub time: String,
    pub description: Option<String>,
}

async fn calendar_ics(Query(query): Query<CalendarQuery>) -> impl IntoResponse {
    let now = chrono::Utc::now();
    let stamp = now.format("%Y%m%dT%H%M%SZ").to_string();
    let uid = Uuid::new_v4();

    let escape = |s: &str| -> String {
        s.replace('\\', "\\\\")
            .replace(',', "\\,")
            .replace(';', "\\;")
            .replace('\n', "\\n")
            .replace('\r', "")
    };

    let safe_title = escape(&query.title);
    let safe_time = escape(&query.time);
    let safe_desc = query
        .description
        .as_deref()
        .map(escape)
        .unwrap_or_default();

    let ics = format!(
        "BEGIN:VCALENDAR\r\n\
         VERSION:2.0\r\n\
         PRODID:-//BrainMate AI//WriteRight//EN\r\n\
         CALSCALE:GREGORIAN\r\n\
         BEGIN:VEVENT\r\n\
         UID:{}@brainmateai.com\r\n\
         DTSTAMP:{}\r\n\
         DTSTART:{}\r\n\
         SUMMARY:{}\r\n\
         DESCRIPTION:Meeting Time: {}\\n\\n{}\r\n\
         TRANSP:OPAQUE\r\n\
         END:VEVENT\r\n\
         END:VCALENDAR\r\n",
        uid, stamp, stamp, safe_title, safe_time, safe_desc
    );

    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/calendar; charset=utf-8"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"meeting.ics\"",
            ),
            (header::CACHE_CONTROL, "no-store"),
        ],
        ics,
    )
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

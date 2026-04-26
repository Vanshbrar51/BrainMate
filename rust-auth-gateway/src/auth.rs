use std::{
    net::SocketAddr,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use axum::{
    body::Body,
    extract::{ConnectInfo, Extension, Json, Path, Query, State},
    http::{header, HeaderValue, Method, Request as HttpRequest, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use jsonwebtoken::{decode, decode_header, Algorithm, Validation};
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;

use crate::{
    blacklist::validate_token_id,
    error::ApiError,
    models::{ClerkClaims, SessionResponse, UserContext},
    rate_limiter::{RateLimitError, RateLimitScope},
    refresh_store::RotationStatus,
    risk_engine::{RequestContext as RiskRequestContext, RiskAction},
    security_utils::hash_token_identifier,
    session_store::validate_session_id,
    AppState,
};

#[derive(Clone, Debug)]
pub struct RequestId(#[allow(dead_code)] pub String);

#[derive(Debug, Deserialize)]
pub struct RevokeQuery {
    pub jti: Option<String>,
    pub token_exp: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    pub sid: String,
    pub user_id: String,
    pub issued_at: Option<u64>,
    pub device_info: Option<String>,
    pub expires_at: u64,
}

#[derive(Debug, Deserialize)]
pub struct IssueRefreshRequest {
    pub token_id: String,
    pub user_id: String,
    pub device_id: String,
    pub expires_at: u64,
}

#[derive(Debug, Deserialize)]
pub struct RotateRefreshRequest {
    pub old_token_id: String,
    pub new_token_id: String,
    pub new_expires_at: u64,
}

#[derive(Debug, Deserialize)]
pub struct RevokeRefreshRequest {
    pub token_id: String,
}

#[derive(Debug, Deserialize)]
pub struct OtpRequest {
    pub user_id: String,
    pub otp: String,
}

#[derive(Debug, Serialize)]
pub struct RotateRefreshResponse {
    pub rotated: bool,
    pub replay_detected: bool,
}

#[derive(Debug, Serialize)]
pub struct VerifyOtpResponse {
    pub valid: bool,
}

enum ClaimsSource {
    Cache,
    Jwks,
}

pub async fn require_auth(state: AppState, mut request: HttpRequest<Body>, next: Next) -> Response {
    let started = Instant::now();
    let request_id = extract_request_id(&request);
    inject_request_id(&mut request, &request_id);

    let remote_ip = extract_remote_ip(
        &request,
        state.config.trust_x_forwarded_for,
        &state.config.trusted_proxy_cidrs,
    );
    let endpoint_id = format!("{}:{}", request.method(), request.uri().path());

    if let Err(response) =
        enforce_pre_auth_rate_limits(&state, &request_id, &remote_ip, &endpoint_id).await
    {
        return response;
    }

    let token = match extract_bearer_token(&request) {
        Ok(token) => token,
        Err(err) => return error_with_request_id(err, &request_id),
    };

    if let Ok(true) = state.waf_feedback.is_ip_blocked(&remote_ip).await {
        return error_with_request_id(
            ApiError::unauthorized("Request blocked by dynamic WAF policy"),
            &request_id,
        );
    }

    let (claims, claims_source) = match get_or_validate_claims(&state, &token).await {
        Ok(claims) => claims,
        Err(err) => return error_with_request_id(err, &request_id),
    };

    let risk_ctx = build_risk_request_context(&claims, &remote_ip, &request);
    let risk = match state.risk_engine.evaluate(&risk_ctx).await {
        Ok(assessment) => assessment,
        Err(err) => return error_with_request_id(err, &request_id),
    };

    match risk.action {
        RiskAction::BlockAndInvalidate => {
            let ttl = remaining_ttl(claims.exp);
            if ttl > 0 {
                let _ = state.blacklist.revoke(&claims.jti, ttl).await;
            }
            let _ = state.session_store.revoke_session(&claims.sid).await;
            let _ = state.waf_feedback.block_ip(&remote_ip, 900).await;
            let _ = state
                .waf_feedback
                .record_audit_event(&crate::waf_feedback::AuditEvent {
                    request_id: request_id.clone(),
                    user_id: claims.sub.clone(),
                    ip: remote_ip.clone(),
                    risk_level: risk.level.as_str().to_string(),
                    risk_action: risk.action.as_str().to_string(),
                    blocked: true,
                    timestamp: now_unix_secs(),
                })
                .await;
            return error_with_request_id(
                ApiError::unauthorized("High-risk request blocked"),
                &request_id,
            );
        }
        RiskAction::RequireStepUp => {
            let mut response = error_with_request_id(
                ApiError::unauthorized("Step-up authentication required"),
                &request_id,
            );
            response
                .headers_mut()
                .insert("x-step-up-required", HeaderValue::from_static("true"));
            response.headers_mut().insert(
                "x-risk-score",
                HeaderValue::from_str(&risk.score.to_string())
                    .unwrap_or(HeaderValue::from_static("0")),
            );
            response.headers_mut().insert(
                "x-risk-level",
                HeaderValue::from_str(risk.level.as_str())
                    .unwrap_or(HeaderValue::from_static("unknown")),
            );
            response.headers_mut().insert(
                "x-risk-action",
                HeaderValue::from_str(risk.action.as_str())
                    .unwrap_or(HeaderValue::from_static("require_step_up")),
            );
            return response;
        }
        RiskAction::Allow | RiskAction::LogAndMonitor => {}
    }

    let blacklist_check = state.blacklist.is_blacklisted(&claims.jti).await;
    let session_check = state
        .session_store
        .validate_session(&claims.sid, &claims.sub)
        .await;

    let is_blacklisted = match blacklist_check {
        Ok(v) => v,
        Err(err) => return error_with_request_id(err, &request_id),
    };

    if is_blacklisted {
        return error_with_request_id(
            ApiError::unauthorized("Token has been revoked"),
            &request_id,
        );
    }

    match session_check {
        Ok(_) => {}
        Err(ApiError::ServiceUnavailable(_)) => {
            // Controlled degradation:
            // - only for read-only methods
            // - only when claims came from short-lived cache
            // - never bypass blacklist checks (already enforced above)
            if is_state_changing_method(request.method())
                || !matches!(claims_source, ClaimsSource::Cache)
            {
                return error_with_request_id(
                    ApiError::service_unavailable(
                        "Session store unavailable for high-risk operation",
                    ),
                    &request_id,
                );
            }
            metrics::counter!("auth_degraded_mode_total").increment(1);
        }
        Err(err) => return error_with_request_id(err, &request_id),
    }

    if let Err(response) = enforce_user_rate_limit(&state, &claims.sub, &request_id).await {
        return response;
    }

    let request_method = request.method().clone();
    let nonce_region = request
        .headers()
        .get("x-client-region")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(ToString::to_string);
    let request_nonce = request
        .headers()
        .get("x-request-nonce")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);

    if let Err(err) =
        enforce_nonce_protection(&state, &request_method, request_nonce, nonce_region).await
    {
        return error_with_request_id(err, &request_id);
    }

    let user_context = UserContext {
        user_id: claims.sub.clone(),
        session_id: claims.sid.clone(),
        token_id: claims.jti.clone(),
        issuer: claims.iss.clone(),
        org_id: claims.org_id.clone(),
        org_role: claims.org_role.clone(),
        issued_at: claims.iat,
        expires_at: claims.exp,
    };

    request
        .extensions_mut()
        .insert(RequestId(request_id.clone()));
    request.extensions_mut().insert(user_context.clone());

    if let Ok(value) = HeaderValue::from_str(&user_context.user_id) {
        request.headers_mut().insert("x-user-id", value);
    }
    if let Ok(value) = HeaderValue::from_str(&user_context.session_id) {
        request.headers_mut().insert("x-session-id", value);
    }

    let mut response = next.run(request).await;
    response.headers_mut().insert(
        "x-request-id",
        HeaderValue::from_str(&request_id).unwrap_or(HeaderValue::from_static("unknown")),
    );
    response.headers_mut().insert(
        "x-risk-score",
        HeaderValue::from_str(&risk.score.to_string()).unwrap_or(HeaderValue::from_static("0")),
    );
    response.headers_mut().insert(
        "x-risk-level",
        HeaderValue::from_str(risk.level.as_str()).unwrap_or(HeaderValue::from_static("unknown")),
    );
    response.headers_mut().insert(
        "x-risk-action",
        HeaderValue::from_str(risk.action.as_str()).unwrap_or(HeaderValue::from_static("allow")),
    );

    let _ = state
        .waf_feedback
        .record_audit_event(&crate::waf_feedback::AuditEvent {
            request_id: request_id.clone(),
            user_id: user_context.user_id.clone(),
            ip: remote_ip.clone(),
            risk_level: risk.level.as_str().to_string(),
            risk_action: risk.action.as_str().to_string(),
            blocked: false,
            timestamp: now_unix_secs(),
        })
        .await;

    metrics::histogram!("auth_latency_seconds").record(started.elapsed().as_secs_f64());
    response
}

pub async fn require_internal_api_access(
    state: AppState,
    request: HttpRequest<Body>,
    next: Next,
) -> Response {
    let internal_tokens = state.internal_api_tokens.read().await;
    if internal_tokens.is_empty() {
        return ApiError::unauthorized("Internal API is disabled").into_response();
    }

    let candidate = request
        .headers()
        .get("x-internal-api-token")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|v| !v.is_empty());

    let is_valid = candidate
        .map(|candidate| {
            let candidate_bytes = candidate.as_bytes();
            internal_tokens.iter().any(|expected| {
                let expected_bytes = expected.as_bytes();
                candidate_bytes.len() == expected_bytes.len()
                    && bool::from(candidate_bytes.ct_eq(expected_bytes))
            })
        })
        .unwrap_or(false);

    if !is_valid {
        return ApiError::unauthorized("Invalid internal API token").into_response();
    }

    next.run(request).await
}

pub async fn session(
    Extension(ctx): Extension<UserContext>,
) -> Result<impl IntoResponse, ApiError> {
    Ok((
        [
            (header::CACHE_CONTROL, "no-store"),
            (header::PRAGMA, "no-cache"),
        ],
        Json(SessionResponse {
            user_id: ctx.user_id,
            session_id: ctx.session_id,
            issued_at: ctx.issued_at,
            expires_at: ctx.expires_at,
            issuer: ctx.issuer,
        }),
    ))
}

pub async fn logout(
    State(state): State<AppState>,
    Extension(ctx): Extension<UserContext>,
) -> Result<impl IntoResponse, ApiError> {
    let ttl = remaining_ttl(ctx.expires_at);

    // Step 1: Blacklist token — most critical, must succeed.
    if ttl > 0 {
        if let Err(err) = state.blacklist.revoke(&ctx.token_id, ttl).await {
            if let Some(recon) = &state.reconciliation {
                recon
                    .enqueue(crate::reconciliation::ReconciliationOp::TokenRevocation {
                        jti: ctx.token_id.clone(),
                        ttl_secs: ttl,
                    })
                    .await;
            }
            tracing::error!(
                token_id = %ctx.token_id,
                "logout: blacklist failed, enqueued for reconciliation: {err}"
            );
        }
    }

    // Step 2: Revoke session. Enqueue on failure.
    if let Err(err) = state.session_store.revoke_session(&ctx.session_id).await {
        if let Some(recon) = &state.reconciliation {
            recon
                .enqueue(crate::reconciliation::ReconciliationOp::SessionRevoke {
                    session_id: ctx.session_id.clone(),
                    jti: Some(ctx.token_id.clone()),
                    token_exp: Some(ctx.expires_at),
                    target_version: None,
                })
                .await;
        }
        tracing::error!(session_id = %ctx.session_id, "logout: session revoke failed, enqueued for reconciliation: {err}");
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn create_session(
    State(state): State<AppState>,
    Json(payload): Json<CreateSessionRequest>,
) -> Result<impl IntoResponse, ApiError> {
    validate_session_id(&payload.sid)?;
    let remaining = remaining_ttl(payload.expires_at);
    if remaining == 0 {
        return Err(ApiError::bad_request("expires_at must be in the future"));
    }

    let ttl = remaining.min(state.config.max_session_ttl_secs);
    state
        .session_store
        .create_session(
            &payload.sid,
            &payload.user_id,
            payload.issued_at,
            payload.device_info,
            ttl,
            state.config.max_sessions_per_user,
        )
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "status": "created" })),
    ))
}

pub async fn revoke_session(
    State(state): State<AppState>,
    Path(sid): Path<String>,
    Query(query): Query<RevokeQuery>,
) -> Result<impl IntoResponse, ApiError> {
    state.session_store.revoke_session(&sid).await?;

    if let (Some(jti), Some(token_exp)) = (query.jti.as_deref(), query.token_exp) {
        let ttl = remaining_ttl(token_exp);
        if ttl > 0 {
            state.blacklist.revoke(jti, ttl).await?;
        }
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn issue_refresh(
    State(state): State<AppState>,
    Json(payload): Json<IssueRefreshRequest>,
) -> Result<impl IntoResponse, ApiError> {
    state
        .refresh_store
        .issue(
            &payload.token_id,
            &payload.user_id,
            &payload.device_id,
            payload.expires_at,
        )
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "status": "issued" })),
    ))
}

pub async fn rotate_refresh(
    State(state): State<AppState>,
    Json(payload): Json<RotateRefreshRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let status = state
        .refresh_store
        .rotate(
            &payload.old_token_id,
            &payload.new_token_id,
            payload.new_expires_at,
        )
        .await?;

    let response = match status {
        RotationStatus::Rotated => RotateRefreshResponse {
            rotated: true,
            replay_detected: false,
        },
        RotationStatus::ReplayDetected => RotateRefreshResponse {
            rotated: false,
            replay_detected: true,
        },
    };

    let code = if response.replay_detected {
        StatusCode::UNAUTHORIZED
    } else {
        StatusCode::OK
    };

    Ok((code, Json(response)))
}

pub async fn revoke_refresh(
    State(state): State<AppState>,
    Json(payload): Json<RevokeRefreshRequest>,
) -> Result<impl IntoResponse, ApiError> {
    state.refresh_store.revoke(&payload.token_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn issue_otp(
    State(state): State<AppState>,
    Json(payload): Json<OtpRequest>,
) -> Result<impl IntoResponse, ApiError> {
    state
        .otp_store
        .upsert_otp(&payload.user_id, &payload.otp)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn verify_otp(
    State(state): State<AppState>,
    Json(payload): Json<OtpRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let valid = state
        .otp_store
        .verify_and_consume(&payload.user_id, &payload.otp)
        .await?;
    Ok((StatusCode::OK, Json(VerifyOtpResponse { valid })))
}

async fn get_or_validate_claims(
    state: &AppState,
    token: &str,
) -> Result<(ClerkClaims, ClaimsSource), ApiError> {
    let token_hash = hash_token_identifier(token);

    if let Some(cached) = state.auth_cache.get(&token_hash).await? {
        if cached.exp > now_unix_secs() {
            return Ok((cached, ClaimsSource::Cache));
        }
    }

    let claims = validate_token(state, token).await?;
    state.auth_cache.put(&token_hash, &claims).await?;
    Ok((claims, ClaimsSource::Jwks))
}

async fn validate_token(state: &AppState, token: &str) -> Result<ClerkClaims, ApiError> {
    let header = decode_header(token)
        .map_err(|_| ApiError::unauthorized("Invalid authorization token header"))?;

    if header.alg != Algorithm::RS256 {
        return Err(ApiError::unauthorized("Unsupported token algorithm"));
    }

    let kid = header
        .kid
        .ok_or_else(|| ApiError::unauthorized("Token key id (kid) is missing"))?;

    let key = state.jwks_cache.get_decoding_key(&kid).await?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(std::slice::from_ref(&state.config.clerk_issuer));
    validation.set_required_spec_claims(&["sub", "sid", "jti", "iss", "exp"]);
    validation.validate_nbf = true;
    validation.leeway = 10;

    if let Some(audience) = state.config.clerk_audience.as_ref() {
        validation.set_audience(std::slice::from_ref(audience));
    }

    let token_data = match decode::<ClerkClaims>(token, &key, &validation) {
        Ok(v) => v,
        Err(_) => {
            // Signature failures can happen during Clerk key rotation.
            // Force a JWKS refresh once and retry decode.
            state.jwks_cache.force_refresh().await?;
            let refreshed_key = state.jwks_cache.get_decoding_key(&kid).await?;
            decode::<ClerkClaims>(token, &refreshed_key, &validation)
                .map_err(|_| ApiError::unauthorized("Invalid, expired, or revoked token"))?
        }
    };

    if let Some(expected_azp) = &state.config.clerk_authorized_party {
        if token_data.claims.azp.as_deref() != Some(expected_azp.as_str()) {
            return Err(ApiError::unauthorized(
                "Token authorized party does not match policy",
            ));
        }
    }

    validate_session_id(&token_data.claims.sid)?;
    validate_token_id(&token_data.claims.jti)?;

    Ok(token_data.claims)
}

async fn enforce_pre_auth_rate_limits(
    state: &AppState,
    request_id: &str,
    remote_ip: &str,
    endpoint_id: &str,
) -> Result<(), Response> {
    match state
        .rate_limiter
        .check(RateLimitScope::Ip, remote_ip)
        .await
    {
        Ok(()) => {}
        Err(RateLimitError::Limited { wait_secs }) => {
            return Err(rate_limited(wait_secs, request_id));
        }
        Err(RateLimitError::Unavailable) => {
            return Err(error_with_request_id(
                ApiError::service_unavailable("Rate limit backend unavailable"),
                request_id,
            ));
        }
    }

    match state
        .rate_limiter
        .check(RateLimitScope::Endpoint, endpoint_id)
        .await
    {
        Ok(()) => Ok(()),
        Err(RateLimitError::Limited { wait_secs }) => Err(rate_limited(wait_secs, request_id)),
        Err(RateLimitError::Unavailable) => Err(error_with_request_id(
            ApiError::service_unavailable("Rate limit backend unavailable"),
            request_id,
        )),
    }
}

async fn enforce_user_rate_limit(
    state: &AppState,
    user_id: &str,
    request_id: &str,
) -> Result<(), Response> {
    match state
        .rate_limiter
        .check(RateLimitScope::User, user_id)
        .await
    {
        Ok(()) => Ok(()),
        Err(RateLimitError::Limited { wait_secs }) => Err(rate_limited(wait_secs, request_id)),
        Err(RateLimitError::Unavailable) => Err(error_with_request_id(
            ApiError::service_unavailable("Rate limit backend unavailable"),
            request_id,
        )),
    }
}

async fn enforce_nonce_protection(
    state: &AppState,
    method: &Method,
    request_nonce: Option<String>,
    nonce_region: Option<String>,
) -> Result<(), ApiError> {
    if !is_state_changing_method(method) {
        return Ok(());
    }

    let nonce = request_nonce
        .as_deref()
        .ok_or_else(|| ApiError::bad_request("x-request-nonce is required"))?;

    let is_fresh = state
        .nonce_store
        .register_nonce(nonce, nonce_region.as_deref())
        .await?;
    if !is_fresh {
        return Err(ApiError::unauthorized("Replay attack detected"));
    }

    Ok(())
}

fn build_risk_request_context(
    claims: &ClerkClaims,
    remote_ip: &str,
    request: &HttpRequest<Body>,
) -> RiskRequestContext {
    let user_agent = request
        .headers()
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();

    let device_fingerprint = request
        .headers()
        .get("x-device-fingerprint")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_string());

    // Extract geo from Cloudflare or custom WAF headers.
    let geo = extract_geo_from_headers(request);

    RiskRequestContext {
        user_id: claims.sub.clone(),
        ip: remote_ip.to_string(),
        user_agent,
        geo,
        device_fingerprint,
    }
}

fn extract_geo_from_headers(request: &HttpRequest<Body>) -> Option<crate::risk_engine::GeoInfo> {
    let cf_lat = request
        .headers()
        .get("cf-iplatitude")
        .or_else(|| request.headers().get("x-geo-lat"))
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<f64>().ok());

    let cf_lon = request
        .headers()
        .get("cf-iplongitude")
        .or_else(|| request.headers().get("x-geo-lon"))
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<f64>().ok());

    let country = request
        .headers()
        .get("cf-ipcountry")
        .or_else(|| request.headers().get("x-geo-country"))
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_uppercase())
        .filter(|s| s.len() == 2 && s.chars().all(|c| c.is_ascii_alphabetic()))
        .filter(|s| s != "T1" && s != "XX" && s != "ZZ");

    match (cf_lat, cf_lon, country) {
        (Some(lat), Some(lon), Some(country)) => Some(crate::risk_engine::GeoInfo {
            country,
            city: None,
            latitude: lat,
            longitude: lon,
        }),
        (_, _, Some(country)) => {
            let (lat, lon) = country_centroid(&country);
            Some(crate::risk_engine::GeoInfo {
                country,
                city: None,
                latitude: lat,
                longitude: lon,
            })
        }
        _ => None,
    }
}

fn country_centroid(iso2: &str) -> (f64, f64) {
    match iso2 {
        "US" => (37.09, -95.71),
        "GB" => (55.38, -3.44),
        "DE" => (51.17, 10.45),
        "FR" => (46.23, 2.21),
        "IN" => (20.59, 78.96),
        "CN" => (35.86, 104.19),
        "JP" => (36.20, 138.25),
        "AU" => (-25.27, 133.78),
        "BR" => (-14.24, -51.93),
        "RU" => (61.52, 105.32),
        "CA" => (56.13, -106.35),
        "SG" => (1.35, 103.82),
        "KR" => (35.91, 127.77),
        "NG" => (9.08, 8.68),
        "ZA" => (-30.56, 22.94),
        "PK" => (30.38, 69.35),
        "ID" => (-0.79, 113.92),
        "MX" => (23.63, -102.55),
        "SA" => (23.89, 45.08),
        "AE" => (23.42, 53.85),
        "TR" => (38.96, 35.24),
        "UA" => (48.38, 31.17),
        "PL" => (51.92, 19.15),
        "NL" => (52.13, 5.29),
        "SE" => (60.13, 18.64),
        "NO" => (60.47, 8.47),
        "IT" => (41.87, 12.57),
        "ES" => (40.46, -3.75),
        "AR" => (-38.42, -63.62),
        "IL" => (31.05, 34.85),
        "TH" => (15.87, 100.99),
        "VN" => (14.06, 108.28),
        "PH" => (12.88, 121.77),
        "MY" => (4.21, 101.98),
        "EG" => (26.82, 30.80),
        "IR" => (32.43, 53.69),
        _ => (0.0, 0.0),
    }
}

fn is_state_changing_method(method: &Method) -> bool {
    matches!(
        *method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    )
}

fn extract_bearer_token(request: &HttpRequest<Body>) -> Result<String, ApiError> {
    let header_value = request
        .headers()
        .get(header::AUTHORIZATION)
        .ok_or_else(|| ApiError::unauthorized("Authorization header is missing"))?;

    let value = header_value
        .to_str()
        .map_err(|_| ApiError::bad_request("Authorization header is malformed"))?;

    let (scheme, token) = value
        .split_once(' ')
        .ok_or_else(|| ApiError::bad_request("Authorization header must be Bearer token"))?;

    if scheme != "Bearer" || token.trim().is_empty() {
        return Err(ApiError::unauthorized("Bearer token is missing"));
    }

    if token.len() < 32 || token.len() > 8192 {
        return Err(ApiError::bad_request("Bearer token length is invalid"));
    }

    Ok(token.to_string())
}

fn extract_request_id(request: &HttpRequest<Body>) -> String {
    request
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string())
}

fn inject_request_id(request: &mut HttpRequest<Body>, request_id: &str) {
    request.headers_mut().insert(
        "x-request-id",
        HeaderValue::from_str(request_id).unwrap_or(HeaderValue::from_static("unknown")),
    );
}

fn extract_remote_ip(
    request: &HttpRequest<Body>,
    trust_x_forwarded_for: bool,
    trusted_proxy_cidrs: &[ipnet::IpNet],
) -> String {
    if let Some(edge_id) = request
        .headers()
        .get("x-waf-client-id")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        return edge_id.to_string();
    }

    let socket_ip = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0.ip());

    if trust_x_forwarded_for {
        let is_trusted_proxy = socket_ip
            .map(|ip| trusted_proxy_cidrs.iter().any(|cidr| cidr.contains(&ip)))
            .unwrap_or(false);

        if is_trusted_proxy {
            if let Some(forwarded) = request.headers().get("x-forwarded-for") {
                if let Ok(raw) = forwarded.to_str() {
                    // Walk the X-Forwarded-For chain RIGHT-TO-LEFT.
                    // Return the first (rightmost) IP that is NOT in trusted_proxy_cidrs.
                    // This correctly identifies the client IP in multi-proxy chains.
                    // If all IPs are trusted proxies, fall through to socket_ip.
                    for segment in raw.rsplit(',') {
                        let ip_str = segment.trim();
                        if ip_str.is_empty() {
                            continue;
                        }
                        if let Ok(ip) = ip_str.parse::<std::net::IpAddr>() {
                            if !trusted_proxy_cidrs.iter().any(|cidr| cidr.contains(&ip)) {
                                return ip_str.to_string();
                            }
                        } else {
                            // Non-parseable IP — treat as untrusted client identifier
                            return ip_str.to_string();
                        }
                    }
                }
            }
        }
    }

    socket_ip
        .map(|ip| ip.to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

fn rate_limited(wait_secs: u64, request_id: &str) -> Response {
    let mut response = (
        StatusCode::TOO_MANY_REQUESTS,
        [
            (
                header::RETRY_AFTER,
                HeaderValue::from_str(&wait_secs.to_string())
                    .unwrap_or(HeaderValue::from_static("1")),
            ),
            (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
        ],
        Json(serde_json::json!({
            "code": "TOO_MANY_REQUESTS",
            "message": "Too many requests. Please retry later."
        })),
    )
        .into_response();

    response.headers_mut().insert(
        "x-request-id",
        HeaderValue::from_str(request_id).unwrap_or(HeaderValue::from_static("unknown")),
    );
    response
}

fn error_with_request_id(error: ApiError, request_id: &str) -> Response {
    let mut response = error.into_response();
    response.headers_mut().insert(
        "x-request-id",
        HeaderValue::from_str(request_id).unwrap_or(HeaderValue::from_static("unknown")),
    );
    response
}

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn remaining_ttl(expires_at: u64) -> u64 {
    expires_at.saturating_sub(now_unix_secs())
}

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
        middleware,
        routing::{get, post},
        Router,
    };
    use tower::ServiceExt;

    use crate::{
        build_test_state, build_unavailable_test_state, models::ClerkClaims,
        security_utils::hash_token_identifier,
    };

    use super::{require_auth, session};

    fn make_claims(exp: u64) -> ClerkClaims {
        ClerkClaims {
            sub: "user_1".to_string(),
            sid: "sid_1".to_string(),
            jti: "jti_1".to_string(),
            iss: "https://issuer.example.com".to_string(),
            iat: Some(1),
            exp,
            azp: Some("test-azp".to_string()),
            org_id: None,
            org_role: None,
        }
    }

    fn auth_header(token: &str) -> String {
        format!("Bearer {token}")
    }

    #[tokio::test]
    async fn integration_auth_flow_allows_valid_cached_claims() {
        let state = build_test_state().await;
        let token = "abcdefghijklmnopqrstuvwxyz0123456789.jwt.token.payload";
        let claims = make_claims(4_102_444_800);

        state
            .auth_cache
            .put(&hash_token_identifier(token), &claims)
            .await
            .expect("cache write should work");
        state
            .session_store
            .create_session("sid_1", "user_1", Some(1), None, 3600, 100)
            .await
            .expect("session write should work");

        let app = Router::new()
            .route("/v1/auth/session", get(session))
            .layer(middleware::from_fn({
                let state = state.clone();
                move |request, next| {
                    let state = state.clone();
                    async move { require_auth(state, request, next).await }
                }
            }))
            .with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/v1/auth/session")
                    .header("authorization", auth_header(token))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("request should execute");

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn integration_fails_when_redis_unavailable() {
        let state = build_unavailable_test_state().await;
        let token = "abcdefghijklmnopqrstuvwxyz0123456789.jwt.token.payload";

        let app = Router::new()
            .route("/v1/auth/session", get(session))
            .layer(middleware::from_fn({
                let state = state.clone();
                move |request, next| {
                    let state = state.clone();
                    async move { require_auth(state, request, next).await }
                }
            }))
            .with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/v1/auth/session")
                    .header("authorization", auth_header(token))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("request should execute");

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn integration_replay_nonce_is_rejected() {
        let state = build_test_state().await;
        let token = "abcdefghijklmnopqrstuvwxyz0123456789.jwt.token.payload";
        let claims = make_claims(4_102_444_800);

        state
            .auth_cache
            .put(&hash_token_identifier(token), &claims)
            .await
            .expect("cache write should work");
        state
            .session_store
            .create_session("sid_1", "user_1", Some(1), None, 3600, 100)
            .await
            .expect("session write should work");

        let app = Router::new()
            .route("/protected", post(|| async { StatusCode::OK }))
            .layer(middleware::from_fn({
                let state = state.clone();
                move |request, next| {
                    let state = state.clone();
                    async move { require_auth(state, request, next).await }
                }
            }))
            .with_state(state);

        let first = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/protected")
                    .header("authorization", auth_header(token))
                    .header("x-request-nonce", "nonce-123")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("request should execute");
        assert_eq!(first.status(), StatusCode::OK);

        let second = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/protected")
                    .header("authorization", auth_header(token))
                    .header("x-request-nonce", "nonce-123")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("request should execute");

        assert_eq!(second.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn integration_rejects_expired_cached_claims() {
        let state = build_test_state().await;
        let token = "abcdefghijklmnopqrstuvwxyz0123456789.jwt.token.payload";
        let claims = make_claims(1);

        state
            .auth_cache
            .put(&hash_token_identifier(token), &claims)
            .await
            .expect("cache write should work");
        state
            .session_store
            .create_session("sid_1", "user_1", Some(1), None, 3600, 100)
            .await
            .expect("session write should work");

        let app = Router::new()
            .route("/v1/auth/session", get(session))
            .layer(middleware::from_fn({
                let state = state.clone();
                move |request, next| {
                    let state = state.clone();
                    async move { require_auth(state, request, next).await }
                }
            }))
            .with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/v1/auth/session")
                    .header("authorization", auth_header(token))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("request should execute");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn integration_rejects_blacklisted_token_even_with_cached_claims() {
        let state = build_test_state().await;
        let token = "abcdefghijklmnopqrstuvwxyz0123456789.jwt.token.payload";
        let claims = make_claims(4_102_444_800);

        state
            .auth_cache
            .put(&hash_token_identifier(token), &claims)
            .await
            .expect("cache write should work");
        state
            .session_store
            .create_session("sid_1", "user_1", Some(1), None, 3600, 100)
            .await
            .expect("session write should work");
        state
            .blacklist
            .revoke("jti_1", 3600)
            .await
            .expect("blacklist write should work");

        let app = Router::new()
            .route("/v1/auth/session", get(session))
            .layer(middleware::from_fn({
                let state = state.clone();
                move |request, next| {
                    let state = state.clone();
                    async move { require_auth(state, request, next).await }
                }
            }))
            .with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/v1/auth/session")
                    .header("authorization", auth_header(token))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("request should execute");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
}

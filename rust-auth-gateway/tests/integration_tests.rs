use std::sync::Arc;
use axum::http::StatusCode;
use brainmate_auth_gateway::{Config, build_state};

// Helper to start the gateway in a background task
async fn spawn_test_gateway() -> String {
    // Config with random ports
    let config = Arc::new(Config {
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        internal_bind_addr: "127.0.0.1:0".parse().unwrap(),
        metrics_bind_addr: "127.0.0.1:0".parse().unwrap(),
        internal_api_tokens: vec!["test_secret_token".to_string()],
        require_redis_for_auth: false, // Use in-memory fallback
        ..Default::default()
    });

    let state = build_state(config.clone(), config.internal_api_tokens.clone(), None)
        .await
        .expect("failed to build state");

    let app = brainmate_auth_gateway::router::create_router(state.clone());

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    format!("http://127.0.0.1:{}", port)
}

// Helper for internal router
async fn spawn_test_internal_gateway() -> String {
    let config = Arc::new(Config {
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        internal_bind_addr: "127.0.0.1:0".parse().unwrap(),
        metrics_bind_addr: "127.0.0.1:0".parse().unwrap(),
        internal_api_tokens: vec!["test_secret_token".to_string()],
        require_redis_for_auth: false,
        ..Default::default()
    });

    let state = build_state(config.clone(), config.internal_api_tokens.clone(), None)
        .await
        .expect("failed to build state");

    let app = brainmate_auth_gateway::router::create_internal_router(state.clone());

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    format!("http://127.0.0.1:{}", port)
}

#[tokio::test]
async fn test_health_check_live() {
    let base_url = spawn_test_gateway().await;
    let client = reqwest::Client::new();

    let resp = client.get(format!("{}/healthz/live", base_url))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_internal_api_protection() {
    let base_url = spawn_test_internal_gateway().await;
    let client = reqwest::Client::new();

    // 1. Missing token
    let resp = client.get(format!("{}/v1/auth/session/active", base_url))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);

    // 2. Invalid token
    let resp = client.get(format!("{}/v1/auth/session/active", base_url))
        .header("x-internal-api-token", "wrong")
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);

    // 3. Valid token (using a known route from router.rs)
    let resp = client.post(format!("{}/v1/auth/otp/issue", base_url))
        .header("x-internal-api-token", "test_secret_token")
        .json(&serde_json::json!({"email": "test@example.com"}))
        .send()
        .await
        .unwrap();
    
    // It might return 500 or something if Clerk is not mocked, but NOT 401.
    assert_ne!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_adversarial_jwt_tampering() {
    let base_url = spawn_test_gateway().await;
    let client = reqwest::Client::new();

    // Try to access a protected route with a tampered JWT
    let tampered_jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoyNTE2MjM5MDIyfQ.tampered_signature";
    
    let resp = client.get(format!("{}/v1/auth/session", base_url))
        .header("Authorization", format!("Bearer {}", tampered_jwt))
        .send()
        .await
        .unwrap();

    // Should be unauthorized
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_calendar_ics_generation() {
    let base_url = spawn_test_gateway().await;
    let client = reqwest::Client::new();

    let resp = client.get(format!("{}/v1/tools/calendar.ics", base_url))
        .query(&[
            ("title", "Project Meeting"),
            ("time", "Tomorrow at 3 PM"),
            ("description", "Discuss implementation details"),
        ])
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(resp.headers()["content-type"], "text/calendar; charset=utf-8");
    
    let body = resp.text().await.unwrap();
    assert!(body.contains("BEGIN:VCALENDAR"));
    assert!(body.contains("SUMMARY:Project Meeting"));
    assert!(body.contains("DESCRIPTION:Meeting Time: Tomorrow at 3 PM"));
    assert!(body.contains("Discuss implementation details"));
    assert!(body.contains("END:VCALENDAR"));
}

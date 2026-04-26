use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ClerkClaims {
    pub sub: String,
    pub sid: String,
    pub jti: String,
    pub iss: String,
    pub iat: Option<u64>,
    pub exp: u64,
    pub azp: Option<String>,
    pub org_id: Option<String>,
    pub org_role: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserContext {
    pub user_id: String,
    pub session_id: String,
    pub token_id: String,
    pub issuer: String,
    pub org_id: Option<String>,
    pub org_role: Option<String>,
    pub issued_at: Option<u64>,
    pub expires_at: u64,
}

#[derive(Debug, Serialize)]
pub struct SessionResponse {
    pub user_id: String,
    pub session_id: String,
    pub issued_at: Option<u64>,
    pub expires_at: u64,
    pub issuer: String,
}

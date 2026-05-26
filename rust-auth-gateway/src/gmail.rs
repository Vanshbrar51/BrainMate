//! Gmail OAuth, token encryption, and Gmail REST API client.
//!
//! Security invariants:
//! - GOOGLE_CLIENT_SECRET never leaves this module.
//! - Plaintext OAuth tokens exist only as local stack variables.
//! - AES-256-GCM with a fresh random 96-bit IV on every encryption call.
//! - `get_valid_access_token` is private — handlers never hold raw tokens.
//! - HTML email bodies stripped to plain text via ammonia before returning.
//! - State tokens are HMAC-SHA256 signed with a separate key.

use std::time::Duration;

use aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use anyhow::{anyhow, bail, Context, Result};
use chrono::Utc;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{config::Config, db::DbClient};

// ─── Constants ────────────────────────────────────────────────────────────────

const GOOGLE_TOKEN_URL:    &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_LIST_URL:      &str = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GMAIL_MSG_BASE_URL:  &str = "https://gmail.googleapis.com/gmail/v1/users/me/messages/";
const GMAIL_SCOPES:        &str = concat!(
    "https://www.googleapis.com/auth/gmail.readonly ",
    "https://www.googleapis.com/auth/userinfo.email ",
    "https://www.googleapis.com/auth/userinfo.profile"
);
/// Proactively refresh the access token this many seconds before expiry.
const REFRESH_BUFFER_SECS: i64  = 300;
const GCM_NONCE_LEN:       usize = 12;
const HMAC_BLOCK_LEN:      usize = 64;

// ─── AES-256-GCM Token Encryption ─────────────────────────────────────────────

fn parse_enc_key(hex_key: &str) -> Result<Key<Aes256Gcm>> {
    let bytes = hex::decode(hex_key)
        .context("GMAIL_TOKEN_ENCRYPTION_KEY must be valid hex")?;
    if bytes.len() != 32 {
        bail!("GMAIL_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (64 hex chars)");
    }
    Ok(*Key::<Aes256Gcm>::from_slice(&bytes))
}

/// Encrypts `plaintext` with AES-256-GCM.
/// Output: hex(random_12_byte_nonce || gcm_ciphertext_with_auth_tag)
pub fn encrypt_token(plaintext: &str, hex_key: &str) -> Result<String> {
    let key    = parse_enc_key(hex_key)?;
    let cipher = Aes256Gcm::new(&key);

    let mut nonce_bytes = [0u8; GCM_NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ct = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|_| anyhow!("AES-GCM encryption failed"))?;

    let mut out = Vec::with_capacity(GCM_NONCE_LEN + ct.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(hex::encode(out))
}

/// Decrypts a value produced by `encrypt_token`.
/// NEVER log the return value — it contains a raw OAuth token.
fn decrypt_token(hex_enc: &str, hex_key: &str) -> Result<String> {
    let raw = hex::decode(hex_enc)
        .context("Stored token is not valid hex")?;
    if raw.len() <= GCM_NONCE_LEN {
        bail!("Stored token is too short to be a valid GCM ciphertext");
    }
    let key    = parse_enc_key(hex_key)?;
    let cipher = Aes256Gcm::new(&key);
    let nonce  = Nonce::from_slice(&raw[..GCM_NONCE_LEN]);
    let pt     = cipher
        .decrypt(nonce, &raw[GCM_NONCE_LEN..])
        .map_err(|_| anyhow!("AES-GCM decryption failed (corrupt data or wrong key)"))?;
    String::from_utf8(pt).context("Decrypted token is not valid UTF-8")
}

// ─── HMAC-SHA256 State Tokens ──────────────────────────────────────────────────

/// Generates a signed state token embedding `clerk_user_id` and expiry.
/// Format: base64url(json) + "." + base64url(hmac)
pub fn generate_state_token(clerk_user_id: &str, hmac_key_hex: &str) -> Result<String> {
    let mut nonce = [0u8; 24];
    OsRng.fill_bytes(&mut nonce);

    let payload = serde_json::json!({
        "uid": clerk_user_id,
        "n":   hex::encode(nonce),
        "exp": Utc::now().timestamp() + 600,
    })
    .to_string();

    let payload_b64 = base64url_encode(payload.as_bytes());
    let sig = hmac_sha256_hex(hmac_key_hex, payload_b64.as_bytes())?;
    Ok(format!("{payload_b64}.{sig}"))
}

/// Verifies signature, expiry, and returns the embedded `clerk_user_id`.
pub fn verify_state_token(state: &str, hmac_key_hex: &str) -> Result<String> {
    let dot = state.find('.').ok_or_else(|| anyhow!("Invalid state token format"))?;
    let (payload_b64, provided_sig) = (&state[..dot], &state[dot + 1..]);

    let expected_sig = hmac_sha256_hex(hmac_key_hex, payload_b64.as_bytes())?;

    // Constant-time comparison — prevents timing oracle on the signature
    if !crate::security_utils::constant_time_eq(&expected_sig, provided_sig) {
        bail!("State token HMAC verification failed");
    }

    let payload_bytes = base64url_decode(payload_b64)
        .context("State payload is not valid base64url")?;
    let v: serde_json::Value = serde_json::from_slice(&payload_bytes)
        .context("State payload is not valid JSON")?;

    if Utc::now().timestamp() > v["exp"].as_i64().unwrap_or(0) {
        bail!("State token has expired");
    }

    v["uid"].as_str().map(ToString::to_string)
        .context("State token missing uid")
}

fn hmac_sha256_hex(key_hex: &str, data: &[u8]) -> Result<String> {
    let key_raw = hex::decode(key_hex)
        .context("GMAIL_STATE_HMAC_KEY must be valid hex")?;

    // Derive the padded key (hash if > block size)
    let padded: Vec<u8> = if key_raw.len() > HMAC_BLOCK_LEN {
        let mut h = Sha256::new(); h.update(&key_raw);
        let mut v = h.finalize().to_vec(); v.resize(HMAC_BLOCK_LEN, 0); v
    } else {
        let mut v = key_raw.clone(); v.resize(HMAC_BLOCK_LEN, 0); v
    };

    let ipad: Vec<u8> = padded.iter().map(|b| b ^ 0x36).collect();
    let opad: Vec<u8> = padded.iter().map(|b| b ^ 0x5c).collect();

    let mut inner = Sha256::new(); inner.update(&ipad); inner.update(data);
    let inner_hash = inner.finalize();

    let mut outer = Sha256::new(); outer.update(&opad); outer.update(inner_hash);
    Ok(hex::encode(outer.finalize()))
}

fn base64url_encode(b: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(b)
}
fn base64url_decode(s: &str) -> Result<Vec<u8>> {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(s)
        .context("base64url decode failed")
}

// ─── Google API Types ──────────────────────────────────────────────────────────

#[derive(Deserialize)] struct GoogleTokenResponse {
    access_token:  String,
    refresh_token: Option<String>,
    expires_in:    Option<i64>,
}
#[derive(Deserialize)] struct GoogleUserInfo {
    email:   String,
    name:    Option<String>,
    picture: Option<String>,
}

/// Returned by `exchange_auth_code` — contains encrypted blobs, not plaintext.
#[derive(Debug, Serialize, Clone)]
pub struct TokenExchangeResult {
    pub gmail_email:       String,
    pub display_name:      String,
    pub avatar_url:        Option<String>,
    pub access_token_enc:  String,
    pub refresh_token_enc: String,
    pub expiry:            chrono::DateTime<chrono::Utc>,
}

// ─── OAuth ────────────────────────────────────────────────────────────────────

/// Generates the Google OAuth consent URL with a signed state token.
pub fn generate_auth_url(clerk_user_id: &str, config: &Config) -> Result<String> {
    let (client_id, _, redirect_uri) = config.require_gmail_credentials()?;
    let hmac_key = config.gmail_state_hmac_key.as_deref()
        .context("GMAIL_STATE_HMAC_KEY required")?;
    let state = generate_state_token(clerk_user_id, hmac_key)?;

    Ok(format!(
        "https://accounts.google.com/o/oauth2/v2/auth?{}",
        form_urlencoded::Serializer::new(String::new())
            .append_pair("client_id",     client_id)
            .append_pair("redirect_uri",  redirect_uri)
            .append_pair("response_type", "code")
            .append_pair("scope",         GMAIL_SCOPES)
            .append_pair("access_type",   "offline")
            .append_pair("prompt",        "consent")
            .append_pair("state",         &state)
            .finish()
    ))
}

/// Exchanges the authorization code for tokens.
/// Returns encrypted blobs — plaintext tokens exist only as local stack variables.
pub async fn exchange_auth_code(
    code:   &str,
    config: &Config,
    http:   &reqwest::Client,
) -> Result<TokenExchangeResult> {
    let (client_id, client_secret, redirect_uri) = config.require_gmail_credentials()?;
    let enc_key = config.gmail_token_encryption_key.as_deref()
        .context("GMAIL_TOKEN_ENCRYPTION_KEY required")?;

    let params = [
        ("code", code), ("client_id", client_id),
        ("client_secret", client_secret), ("redirect_uri", redirect_uri),
        ("grant_type", "authorization_code"),
    ];

    let resp = http.post(GOOGLE_TOKEN_URL)
        .form(&params).timeout(Duration::from_secs(10))
        .send().await.context("Token endpoint request failed")?;

    if !resp.status().is_success() {
        let s = resp.status(); let _ = resp.bytes().await; // consume without logging
        bail!("Google token endpoint returned HTTP {s}");
    }

    let tr: GoogleTokenResponse = resp.json().await
        .context("Failed to parse token response")?;
    let refresh = tr.refresh_token.ok_or_else(|| anyhow!(
        "Google did not return refresh_token. Ensure prompt=consent and access_type=offline."
    ))?;

    let user: GoogleUserInfo = http.get(GOOGLE_USERINFO_URL)
        .bearer_auth(&tr.access_token).timeout(Duration::from_secs(5))
        .send().await.context("userinfo request failed")?
        .json().await.context("Failed to parse userinfo")?;

    let expiry = Utc::now() + chrono::Duration::seconds(tr.expires_in.unwrap_or(3600));

    // Encrypt immediately — tokens never leave as plaintext
    let access_token_enc  = encrypt_token(&tr.access_token, enc_key)?;
    let refresh_token_enc = encrypt_token(&refresh, enc_key)?;

    Ok(TokenExchangeResult {
        gmail_email: user.email.clone(),
        display_name: user.name.unwrap_or(user.email),
        avatar_url: user.picture,
        access_token_enc,
        refresh_token_enc,
        expiry,
    })
}

// ─── Token Refresh (private) ───────────────────────────────────────────────────

/// Returns a valid plaintext access token, refreshing if needed.
/// This function is PRIVATE to this module — handlers never hold raw tokens.
async fn get_valid_access_token(
    clerk_user_id: &str,
    db:     &DbClient,
    config: &Config,
    http:   &reqwest::Client,
) -> Result<String> {
    let conn = db.get_active_gmail_connection(clerk_user_id).await
        .context("DB error")?
        .ok_or_else(|| anyhow!("No active Gmail connection for user"))?;

    let enc_key = config.gmail_token_encryption_key.as_deref()
        .context("GMAIL_TOKEN_ENCRYPTION_KEY required")?;

    // Refresh if expiring within buffer window
    if Utc::now().timestamp() >= conn.token_expiry.timestamp() - REFRESH_BUFFER_SECS {
        let (client_id, client_secret, _) = config.require_gmail_credentials()?;
        let refresh_pt = decrypt_token(&conn.refresh_token_enc, enc_key)?;

        let params = [
            ("client_id", client_id), ("client_secret", client_secret),
            ("refresh_token", refresh_pt.as_str()), ("grant_type", "refresh_token"),
        ];

        let resp = http.post(GOOGLE_TOKEN_URL)
            .form(&params).timeout(Duration::from_secs(10))
            .send().await.context("Token refresh request failed")?;

        if !resp.status().is_success() {
            let s = resp.status(); let _ = resp.bytes().await;
            bail!("Token refresh returned HTTP {s} — user must reconnect");
        }

        let tr: GoogleTokenResponse = resp.json().await
            .context("Failed to parse refresh response")?;

        let new_expiry = Utc::now()
            + chrono::Duration::seconds(tr.expires_in.unwrap_or(3600));
        let new_enc = encrypt_token(&tr.access_token, enc_key)?;

        db.update_gmail_access_token(clerk_user_id, &new_enc, new_expiry)
            .await.context("Failed to persist refreshed token")?;

        return Ok(tr.access_token);
    }

    decrypt_token(&conn.access_token_enc, enc_key)
}

// ─── Email Parsing ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct GmailEmail {
    pub id:           String,
    pub thread_id:    String,
    pub subject:      String,
    pub sender_email: String,
    pub sender_name:  String,
    pub snippet:      String,
    pub body_plain:   String,
    pub body_preview: String,
    pub timestamp:    String,
    pub is_unread:    bool,
    pub labels:       Vec<String>,
    pub word_count:   usize,
}

#[derive(Debug, Serialize)]
pub struct GmailListResponse {
    pub emails:          Vec<GmailEmail>,
    pub next_page_token: Option<String>,
    pub total_estimate:  u64,
}

// Internal deserialization types (Google API shapes)
#[derive(Deserialize)] struct ApiListResp {
    messages: Option<Vec<ApiMsgRef>>,
    #[serde(rename="nextPageToken")]  next_page_token: Option<String>,
    #[serde(rename="resultSizeEstimate")] result_size_estimate: Option<u64>,
}
#[derive(Deserialize)] struct ApiMsgRef { id: String }
#[derive(Deserialize)] struct ApiMsg {
    id: String,
    #[serde(rename="threadId")]    thread_id:     String,
    snippet:                                      Option<String>,
    #[serde(rename="labelIds")]    label_ids:     Option<Vec<String>>,
    payload:                                      Option<ApiPayload>,
    #[serde(rename="internalDate")] internal_date: Option<String>,
}
#[derive(Deserialize)] struct ApiPayload {
    headers:  Option<Vec<ApiHeader>>,
    #[serde(rename="mimeType")] mime_type: Option<String>,
    body:     Option<ApiBody>,
    parts:    Option<Vec<ApiPart>>,
}
#[derive(Deserialize)] struct ApiPart {
    #[serde(rename="mimeType")] mime_type: Option<String>,
    body:  Option<ApiBody>,
    parts: Option<Vec<ApiPart>>,
}
#[derive(Deserialize)] struct ApiBody { data: Option<String> }
#[derive(Deserialize)] struct ApiHeader { name: String, value: String }

fn b64url_to_string(enc: &str) -> Option<String> {
    base64url_decode(enc).ok()
        .and_then(|b| String::from_utf8(b).ok())
}

fn extract_plain(parts: &[ApiPart]) -> String {
    for p in parts {
        if p.mime_type.as_deref() == Some("text/plain") {
            if let Some(s) = p.body.as_ref().and_then(|b| b.data.as_deref())
                .and_then(b64url_to_string) { return s; }
        }
        if let Some(sub) = &p.parts {
            let r = extract_plain(sub); if !r.is_empty() { return r; }
        }
    }
    String::new()
}

/// Strip HTML to plain text — removes scripts, styles, links, attributes.
/// ammonia::Builder::empty() allows zero tags; only text nodes survive.
fn sanitize_html_to_text(html: &str) -> String {
    let stripped = ammonia::Builder::empty()
        .tags(std::collections::HashSet::new())
        .clean(html)
        .to_string();
    // Normalize whitespace
    stripped.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn extract_html_as_text(parts: &[ApiPart]) -> String {
    for p in parts {
        if p.mime_type.as_deref() == Some("text/html") {
            if let Some(html) = p.body.as_ref().and_then(|b| b.data.as_deref())
                .and_then(b64url_to_string) { return sanitize_html_to_text(&html); }
        }
        if let Some(sub) = &p.parts {
            let r = extract_html_as_text(sub); if !r.is_empty() { return r; }
        }
    }
    String::new()
}

fn parse_from_header(raw: &str) -> (String, String) {
    if let (Some(s), Some(e)) = (raw.rfind('<'), raw.rfind('>')) {
        if s < e {
            let email = raw[s+1..e].trim().to_string();
            let name  = raw[..s].trim().trim_matches('"').to_string();
            return (email.clone(), if name.is_empty() { email } else { name });
        }
    }
    let e = raw.trim().to_string(); (e.clone(), e)
}

fn parse_message(msg: ApiMsg) -> GmailEmail {
    let headers = msg.payload.as_ref()
        .and_then(|p| p.headers.as_ref()).map(|h| h.as_slice()).unwrap_or(&[]);

    let get = |name: &str| -> String {
        headers.iter().find(|h| h.name.eq_ignore_ascii_case(name))
            .map(|h| h.value.clone()).unwrap_or_default()
    };

    let subject = { let s = get("Subject"); if s.is_empty() { "(no subject)".into() } else { s } };
    let (sender_email, sender_name) = parse_from_header(&get("From"));

    let body_plain = if let Some(p) = &msg.payload {
        let parts = p.parts.as_deref().unwrap_or(&[]);
        let from_parts = extract_plain(parts);
        if !from_parts.is_empty() { from_parts }
        else if p.mime_type.as_deref() == Some("text/plain") {
            p.body.as_ref().and_then(|b| b.data.as_deref())
                .and_then(b64url_to_string).unwrap_or_default()
        } else { extract_html_as_text(parts) }
    } else { String::new() };

    let word_count  = body_plain.split_whitespace().count();
    let body_preview: String = body_plain.chars().take(500).collect();
    let labels = msg.label_ids.unwrap_or_default();
    let is_unread = labels.contains(&"UNREAD".to_string());

    let timestamp = {
        let date = get("Date");
        if !date.is_empty() { date } else {
            msg.internal_date.as_deref()
                .and_then(|d| d.parse::<i64>().ok())
                .and_then(|ms| chrono::DateTime::from_timestamp(ms / 1000, 0))
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_else(|| Utc::now().to_rfc3339())
        }
    };

    GmailEmail {
        id: msg.id, thread_id: msg.thread_id,
        subject, sender_email, sender_name,
        snippet: msg.snippet.unwrap_or_default(),
        body_preview, body_plain, timestamp, is_unread, labels, word_count,
    }
}

// ─── Public Fetch API ──────────────────────────────────────────────────────────

pub async fn fetch_emails(
    clerk_user_id: &str,
    max_results:   u8,
    unread_only:   bool,
    label:         &str,
    page_token:    Option<&str>,
    db:     &DbClient,
    config: &Config,
    http:   &reqwest::Client,
) -> Result<GmailListResponse> {
    let token = get_valid_access_token(clerk_user_id, db, config, http).await?;

    let mut req = http.get(GMAIL_LIST_URL).bearer_auth(&token)
        .query(&[("maxResults", max_results.to_string()), ("labelIds", label.to_string())]);
    if unread_only         { req = req.query(&[("q", "is:unread")]); }
    if let Some(pt) = page_token { req = req.query(&[("pageToken", pt)]); }

    let list: ApiListResp = req.timeout(Duration::from_secs(15))
        .send().await.context("Gmail list request failed")?
        .json().await.context("Failed to parse Gmail list")?;

    let refs = list.messages.unwrap_or_default();
    let next_page_token = list.next_page_token;
    let total_estimate  = list.result_size_estimate.unwrap_or(0);

    // Parallel fetch — bounded to 20
    let mut handles = Vec::with_capacity(refs.len().min(20));
    for r in refs.into_iter().take(20) {
        let url  = format!("{}{}", GMAIL_MSG_BASE_URL, r.id);
        let http = http.clone();
        let tok  = token.clone();
        handles.push(tokio::spawn(async move {
            http.get(&url).bearer_auth(&tok)
                .query(&[("format", "full")])
                .timeout(Duration::from_secs(10))
                .send().await?.json::<ApiMsg>().await
        }));
    }

    let mut emails = Vec::with_capacity(handles.len());
    for h in handles {
        match h.await {
            Ok(Ok(msg)) => emails.push(parse_message(msg)),
            Ok(Err(e))  => tracing::warn!(error = %e, "gmail message fetch failed"),
            Err(e)      => tracing::warn!(error = %e, "gmail task panicked"),
        }
    }

    Ok(GmailListResponse { emails, next_page_token, total_estimate })
}

pub async fn fetch_email_by_id(
    clerk_user_id: &str,
    message_id:    &str,
    db:     &DbClient,
    config: &Config,
    http:   &reqwest::Client,
) -> Result<GmailEmail> {
    let token = get_valid_access_token(clerk_user_id, db, config, http).await?;
    let url   = format!("{}{}", GMAIL_MSG_BASE_URL, message_id);

    let msg: ApiMsg = http.get(&url).bearer_auth(&token)
        .query(&[("format", "full")]).timeout(Duration::from_secs(10))
        .send().await.context("Single message fetch failed")?
        .json().await.context("Failed to parse message")?;

    Ok(parse_message(msg))
}

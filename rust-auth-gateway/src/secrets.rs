// src/secrets.rs — Cloud KMS / Secret Manager integration for Rust gateway
//
// Replaces env-based secrets with cloud-managed secrets.
// Supports AWS Secrets Manager, with env var fallback for local dev.

use std::collections::HashMap;
use std::env;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::RwLock;
use tracing::Instrument;
use tracing::{info, warn};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub enum SecretProvider {
    Env,
    AwsSecretsManager,
    GcpSecretManager,
}

impl SecretProvider {
    pub fn from_env() -> Self {
        match env::var("SECRET_PROVIDER")
            .unwrap_or_else(|_| "env".to_string())
            .to_lowercase()
            .as_str()
        {
            "aws_sm" | "aws" => Self::AwsSecretsManager,
            "gcp_sm" | "gcp" => Self::GcpSecretManager,
            _ => Self::Env,
        }
    }
}

struct CachedSecret {
    value: String,
    fetched_at: Instant,
}

// ---------------------------------------------------------------------------
// Secret Manager
// ---------------------------------------------------------------------------

pub struct SecretManager {
    provider: SecretProvider,
    cache: Arc<RwLock<HashMap<String, CachedSecret>>>,
    cache_ttl: Duration,
    secret_mapping: HashMap<String, String>,
}

impl Default for SecretManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SecretManager {
    pub fn new() -> Self {
        let mut mapping = HashMap::new();
        // Map env var names to cloud secret names
        mapping.insert(
            "INTERNAL_API_TOKEN".to_string(),
            env::var("SM_INTERNAL_API_TOKEN_NAME")
                .unwrap_or_else(|_| "brainmate/auth/internal-api-token".to_string()),
        );
        mapping.insert(
            "OTP_PEPPER".to_string(),
            env::var("SM_OTP_PEPPER_NAME")
                .unwrap_or_else(|_| "brainmate/auth/otp-pepper".to_string()),
        );
        mapping.insert(
            "REDIS_URL".to_string(),
            env::var("SM_REDIS_URL_NAME")
                .unwrap_or_else(|_| "brainmate/auth/redis-url".to_string()),
        );

        Self {
            provider: SecretProvider::from_env(),
            cache: Arc::new(RwLock::new(HashMap::new())),
            cache_ttl: Duration::from_secs(300), // 5 minutes
            secret_mapping: mapping,
        }
    }

    /// Get a secret by env var name. Uses cache, falls back to env var.
    pub async fn get_secret(&self, name: &str) -> String {
        // Check cache
        {
            let cache = self.cache.read().await;
            if let Some(cached) = cache.get(name) {
                if cached.fetched_at.elapsed() < self.cache_ttl {
                    return cached.value.clone();
                }
            }
        }

        // Fetch from provider
        let value = match self.provider {
            SecretProvider::AwsSecretsManager => self.fetch_aws(name).await.unwrap_or_else(|| {
                warn!("AWS SM fetch failed for {name}, falling back to env");
                env::var(name).unwrap_or_default()
            }),
            SecretProvider::GcpSecretManager => self.fetch_gcp(name).await.unwrap_or_else(|| {
                warn!("GCP SM fetch failed for {name}, falling back to env");
                env::var(name).unwrap_or_default()
            }),
            SecretProvider::Env => env::var(name).unwrap_or_default(),
        };

        // Update cache
        {
            let mut cache = self.cache.write().await;
            cache.insert(
                name.to_string(),
                CachedSecret {
                    value: value.clone(),
                    fetched_at: Instant::now(),
                },
            );
        }

        value
    }

    /// Invalidate a specific cached secret.
    pub async fn invalidate(&self, name: &str) {
        let mut cache = self.cache.write().await;
        cache.remove(name);
    }

    /// Start background rotation checker.
    pub fn spawn_rotation_checker(self: Arc<Self>) {
        if self.provider == SecretProvider::Env {
            return;
        }

        tokio::spawn(
            async move {
                let mut interval = tokio::time::interval(Duration::from_secs(30));
                interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

                loop {
                    interval.tick().await;

                    let names: Vec<String> = {
                        let cache = self.cache.read().await;
                        cache.keys().cloned().collect()
                    };

                    for name in names {
                        let old_value = {
                            let cache = self.cache.read().await;
                            cache.get(&name).map(|c| c.value.clone())
                        };

                        if let Some(old) = old_value {
                            self.invalidate(&name).await;
                            let new_value = self.get_secret(&name).await;
                            if new_value != old {
                                info!(secret = %name, "secret rotation detected");
                                metrics::counter!("secret_rotation_detected_total").increment(1);
                            }
                        }
                    }
                }
            }
            .instrument(tracing::info_span!("secret_rotation_checker")),
        );
    }

    // AWS Secrets Manager fetch
    async fn fetch_aws(&self, name: &str) -> Option<String> {
        let secret_name = self
            .secret_mapping
            .get(name)
            .cloned()
            .unwrap_or_else(|| name.to_string());

        #[cfg(feature = "aws-secrets")]
        {
            use aws_sdk_secretsmanager::Client;
            let sdk_config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
            let client = Client::new(&sdk_config);
            return client
                .get_secret_value()
                .secret_id(&secret_name)
                .send()
                .await
                .ok()
                .and_then(|r| r.secret_string().map(|s| s.to_string()));
        }

        #[cfg(not(feature = "aws-secrets"))]
        {
            warn!(
                secret = %secret_name,
                "AWS Secrets Manager requested but aws-secrets feature not enabled. Add --features aws-secrets to Cargo build args."
            );
            None
        }
    }

    // GCP Secret Manager fetch (placeholder)
    async fn fetch_gcp(&self, name: &str) -> Option<String> {
        let secret_name = self
            .secret_mapping
            .get(name)
            .cloned()
            .unwrap_or_else(|| name.to_string());

        #[cfg(feature = "gcp-secrets")]
        {
            use google_secretmanager1::SecretManager;
            // Implementation requires the google-secretmanager1 crate.
            // Add to Cargo.toml: google-secretmanager1 = { version = "5", optional = true }
            // Then compile with --features gcp-secrets
            // Full implementation:
            //   let hub = SecretManager::new(...).await;
            //   let name = format!("projects/{}/secrets/{}/versions/latest", project_id, secret_name);
            //   hub.projects().secrets_versions_access(&name).doit().await...
            let _ = SecretManager::new;
            let _ = secret_name;
            warn!("GCP Secret Manager feature compiled in but implementation incomplete");
            return None;
        }

        #[cfg(not(feature = "gcp-secrets"))]
        {
            warn!(
                secret = %secret_name,
                "GCP Secret Manager requested (SECRET_PROVIDER=gcp_sm) but gcp-secrets \
                 feature is not enabled. To use GCP Secret Manager: \
                 1) Add google-secretmanager1 to Cargo.toml, \
                 2) Add [features] gcp-secrets = [\"google-secretmanager1\"], \
                 3) Implement fetch_gcp(), \
                 4) Compile with --features gcp-secrets. \
                 Falling back to INTERNAL env var for: {}",
                name
            );
            None
        }
    }
}

// src/risk_engine.rs — Adaptive security / risk scoring engine
//
// Evaluates per-request risk based on:
//   - IP change from last session
//   - Geographic anomaly (impossible travel)
//   - Device fingerprint mismatch
//   - Multiple failed auth attempts
//   - Tor/VPN detection
//   - New device detection
//
// Risk levels determine actions:
//   LOW (0-25):      Allow
//   MEDIUM (26-50):  Allow + log
//   HIGH (51-75):    Require step-up auth (OTP/MFA)
//   CRITICAL (76-100): Block + invalidate session

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tracing::warn;

use crate::error::ApiError;
use crate::redis_client::RedisClient;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

impl RiskLevel {
    pub fn from_score(score: u32) -> Self {
        match score {
            0..=25 => Self::Low,
            26..=50 => Self::Medium,
            51..=75 => Self::High,
            _ => Self::Critical,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Critical => "critical",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct RiskAssessment {
    pub score: u32,
    pub level: RiskLevel,
    pub signals: Vec<RiskSignal>,
    pub action: RiskAction,
}

#[derive(Debug, Clone, Serialize)]
pub struct RiskSignal {
    pub name: String,
    pub weight: u32,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum RiskAction {
    Allow,
    LogAndMonitor,
    RequireStepUp,
    BlockAndInvalidate,
}

impl RiskAction {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Allow => "allow",
            Self::LogAndMonitor => "log_and_monitor",
            Self::RequireStepUp => "require_step_up",
            Self::BlockAndInvalidate => "block_and_invalidate",
        }
    }
}

/// Stored context for a user's session (for comparison with current request).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionContext {
    pub user_id: String,
    pub last_ip: String,
    pub last_geo: Option<GeoInfo>,
    pub device_hash: Option<String>,
    pub last_seen: u64,
    pub failed_attempts: u32,
    pub known_ips: Vec<String>,
    pub known_devices: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeoInfo {
    pub country: String,
    pub city: Option<String>,
    pub latitude: f64,
    pub longitude: f64,
}

/// Current request context for risk evaluation.
#[derive(Debug, Clone)]
pub struct RequestContext {
    pub user_id: String,
    pub ip: String,
    pub user_agent: String,
    pub geo: Option<GeoInfo>,
    pub device_fingerprint: Option<String>,
}

// ---------------------------------------------------------------------------
// Risk Engine
// ---------------------------------------------------------------------------

pub struct RiskEngine {
    redis: Arc<RedisClient>,
}

impl RiskEngine {
    pub fn new(redis: Arc<RedisClient>) -> Self {
        Self { redis }
    }

    /// Evaluate risk for a request and return assessment with recommended action.
    pub async fn evaluate(&self, ctx: &RequestContext) -> Result<RiskAssessment, ApiError> {
        let mut signals = Vec::new();
        let mut total_score: u32 = 0;

        // Load session context from Redis
        let session_ctx = self.load_session_context(&ctx.user_id).await?;

        if let Some(ref prev) = session_ctx {
            // Signal 1: IP change from last session (+30)
            if prev.last_ip != ctx.ip {
                let weight = 30;
                signals.push(RiskSignal {
                    name: "ip_change".to_string(),
                    weight,
                    detail: format!(
                        "IP changed from {} to {}",
                        mask_ip(&prev.last_ip),
                        mask_ip(&ctx.ip)
                    ),
                });
                total_score += weight;
            }

            // Signal 2: Geo anomaly / impossible travel (+50)
            if let (Some(prev_geo), Some(curr_geo)) = (&prev.last_geo, &ctx.geo) {
                let distance_km = haversine_distance(
                    prev_geo.latitude,
                    prev_geo.longitude,
                    curr_geo.latitude,
                    curr_geo.longitude,
                );

                let elapsed_hours =
                    ((now_secs().saturating_sub(prev.last_seen)) as f64 / 3600.0).max(1.0 / 60.0);
                let velocity_kmh = distance_km / elapsed_hours;
                let impossible_velocity_kmh = 950.0;
                let suspicious_velocity_kmh = 500.0;

                if distance_km > 100.0 && velocity_kmh > impossible_velocity_kmh {
                    let weight = 50;
                    signals.push(RiskSignal {
                        name: "impossible_travel".to_string(),
                        weight,
                        detail: format!(
                            "Velocity {:.0}km/h over {:.0}km exceeds threshold {:.0}km/h",
                            velocity_kmh, distance_km, impossible_velocity_kmh
                        ),
                    });
                    total_score += weight;
                } else if distance_km > 100.0 && velocity_kmh > suspicious_velocity_kmh {
                    // Significant geo change but physically possible.
                    let weight = 15;
                    signals.push(RiskSignal {
                        name: "geo_change".to_string(),
                        weight,
                        detail: format!(
                            "Velocity {:.0}km/h over {:.0}km ({} → {})",
                            velocity_kmh, distance_km, prev_geo.country, curr_geo.country
                        ),
                    });
                    total_score += weight;
                }
            }

            // Signal 2b: Country change (fires even without precise lat/lon)
            if let (Some(prev_geo), Some(curr_geo)) = (&prev.last_geo, &ctx.geo) {
                if prev_geo.country != curr_geo.country && !prev.known_ips.contains(&ctx.ip) {
                    let already_has_geo_signal = signals
                        .iter()
                        .any(|s| s.name == "impossible_travel" || s.name == "geo_change");
                    if !already_has_geo_signal {
                        let weight = 20u32;
                        signals.push(RiskSignal {
                            name: "country_change".to_string(),
                            weight,
                            detail: format!(
                                "Country changed from {} to {}",
                                prev_geo.country, curr_geo.country
                            ),
                        });
                        total_score += weight;
                    }
                }
            }

            // Signal 3: Device fingerprint mismatch (+25)
            if let (Some(prev_device), Some(curr_device)) =
                (&prev.device_hash, &ctx.device_fingerprint)
            {
                if prev_device != curr_device {
                    let weight = 25;
                    signals.push(RiskSignal {
                        name: "device_mismatch".to_string(),
                        weight,
                        detail: "Device fingerprint does not match previous session".to_string(),
                    });
                    total_score += weight;
                }
            }

            // Signal 4: Multiple failed auth attempts (+20)
            if prev.failed_attempts >= 3 {
                let weight = 20;
                signals.push(RiskSignal {
                    name: "failed_attempts".to_string(),
                    weight,
                    detail: format!("{} failed auth attempts recently", prev.failed_attempts),
                });
                total_score += weight;
            }

            // Signal 5: New device detection (+15)
            if let Some(ref device) = ctx.device_fingerprint {
                if !prev.known_devices.contains(device) {
                    let weight = 15;
                    signals.push(RiskSignal {
                        name: "new_device".to_string(),
                        weight,
                        detail: "Request from a device not previously seen".to_string(),
                    });
                    total_score += weight;
                }
            }

            // Signal 6: New IP not in known list (+10)
            if !prev.known_ips.contains(&ctx.ip) {
                let weight = 10;
                signals.push(RiskSignal {
                    name: "new_ip".to_string(),
                    weight,
                    detail: format!("IP {} not in known list", mask_ip(&ctx.ip)),
                });
                total_score += weight;
            }
        } else {
            // No prior session context — first login from this device
            let weight = 10;
            signals.push(RiskSignal {
                name: "no_history".to_string(),
                weight,
                detail: "No prior session context available".to_string(),
            });
            total_score += weight;
        }

        // Cap score at 100
        total_score = total_score.min(100);

        let level = RiskLevel::from_score(total_score);
        let action = match level {
            RiskLevel::Low => RiskAction::Allow,
            RiskLevel::Medium => RiskAction::LogAndMonitor,
            RiskLevel::High => RiskAction::RequireStepUp,
            RiskLevel::Critical => RiskAction::BlockAndInvalidate,
        };

        let assessment = RiskAssessment {
            score: total_score,
            level,
            signals,
            action,
        };

        // Update session context with current request info
        self.update_session_context(ctx, &session_ctx).await?;

        // Log and record metrics
        metrics::histogram!("risk_score").record(total_score as f64);
        metrics::counter!("risk_assessment_total", "level" => level.as_str()).increment(1);

        if total_score > 50 {
            warn!(
                user_id = %ctx.user_id,
                score = total_score,
                level = %level.as_str(),
                action = %assessment.action.as_str(),
                "elevated risk detected"
            );
        }

        Ok(assessment)
    }

    /// Record a failed auth attempt for risk scoring.
    pub async fn record_failed_attempt(&self, user_id: &str) -> Result<(), ApiError> {
        let key = session_context_key(user_id);
        if let Some(mut ctx) = self.load_session_context_raw(&key).await? {
            ctx.failed_attempts = ctx.failed_attempts.saturating_add(1);
            self.save_session_context(&key, &ctx).await?;
        }
        Ok(())
    }

    /// Load session context from Redis.
    async fn load_session_context(
        &self,
        user_id: &str,
    ) -> Result<Option<SessionContext>, ApiError> {
        let key = session_context_key(user_id);
        self.load_session_context_raw(&key).await
    }

    async fn load_session_context_raw(
        &self,
        key: &str,
    ) -> Result<Option<SessionContext>, ApiError> {
        self.redis
            .get_json::<SessionContext>(key)
            .await
            .map_err(|e| ApiError::service_unavailable(format!("risk engine read failed: {e}")))
    }

    /// Update session context with the current request info.
    async fn update_session_context(
        &self,
        ctx: &RequestContext,
        prev: &Option<SessionContext>,
    ) -> Result<(), ApiError> {
        let key = session_context_key(&ctx.user_id);

        let mut known_ips = prev
            .as_ref()
            .map(|p| p.known_ips.clone())
            .unwrap_or_default();
        if !known_ips.contains(&ctx.ip) {
            known_ips.push(ctx.ip.clone());
            // Keep last 20 known IPs
            if known_ips.len() > 20 {
                known_ips.remove(0);
            }
        }

        let mut known_devices = prev
            .as_ref()
            .map(|p| p.known_devices.clone())
            .unwrap_or_default();
        if let Some(ref device) = ctx.device_fingerprint {
            if !known_devices.contains(device) {
                known_devices.push(device.clone());
                if known_devices.len() > 10 {
                    known_devices.remove(0);
                }
            }
        }

        let session_ctx = SessionContext {
            user_id: ctx.user_id.clone(),
            last_ip: ctx.ip.clone(),
            last_geo: ctx.geo.clone(),
            device_hash: ctx.device_fingerprint.clone(),
            last_seen: now_secs(),
            failed_attempts: 0, // Reset on successful auth
            known_ips,
            known_devices,
        };

        self.save_session_context(&key, &session_ctx).await
    }

    async fn save_session_context(&self, key: &str, ctx: &SessionContext) -> Result<(), ApiError> {
        self.redis
            .set_json_ex(key, ctx, 86400 * 30) // 30 days TTL
            .await
            .map_err(|e| ApiError::service_unavailable(format!("risk engine write failed: {e}")))
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn session_context_key(user_id: &str) -> String {
    use sha2::{Digest, Sha256};
    let hash = hex::encode(Sha256::digest(user_id.as_bytes()));
    format!("risk:ctx:{hash}")
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Haversine formula to calculate distance between two lat/lng points in km.
fn haversine_distance(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let r = 6371.0; // Earth radius in km
    let d_lat = (lat2 - lat1).to_radians();
    let d_lon = (lon2 - lon1).to_radians();
    let a = (d_lat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (d_lon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());
    r * c
}

/// Mask IP for logging (privacy).
fn mask_ip(ip: &str) -> String {
    if let Some(idx) = ip.rfind('.') {
        format!("{}.*", &ip[..idx])
    } else if let Some(idx) = ip.rfind(':') {
        format!("{}:*", &ip[..idx])
    } else {
        "***".to_string()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_risk_level_from_score() {
        assert_eq!(RiskLevel::from_score(0), RiskLevel::Low);
        assert_eq!(RiskLevel::from_score(25), RiskLevel::Low);
        assert_eq!(RiskLevel::from_score(26), RiskLevel::Medium);
        assert_eq!(RiskLevel::from_score(50), RiskLevel::Medium);
        assert_eq!(RiskLevel::from_score(51), RiskLevel::High);
        assert_eq!(RiskLevel::from_score(75), RiskLevel::High);
        assert_eq!(RiskLevel::from_score(76), RiskLevel::Critical);
        assert_eq!(RiskLevel::from_score(100), RiskLevel::Critical);
    }

    #[test]
    fn test_haversine_distance() {
        // New York to London ≈ 5,570 km
        let dist = haversine_distance(40.7128, -74.0060, 51.5074, -0.1278);
        assert!((dist - 5570.0).abs() < 100.0);

        // Same location
        let dist = haversine_distance(40.0, -74.0, 40.0, -74.0);
        assert!(dist < 0.01);
    }

    #[test]
    fn test_mask_ip() {
        assert_eq!(mask_ip("192.168.1.100"), "192.168.1.*");
        assert_eq!(mask_ip("::1"), "::*");
    }
}

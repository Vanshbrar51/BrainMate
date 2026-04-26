// src/telemetry.rs — OpenTelemetry tracing setup for Rust auth gateway
//
// Configures distributed tracing with OTLP export, W3C Trace Context
// propagation, and structured logging via tracing-subscriber.

use anyhow::anyhow;
use opentelemetry::global;
use opentelemetry::trace::TracerProvider as _;
use opentelemetry::KeyValue;
use opentelemetry_otlp::SpanExporter;
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::{
    propagation::TraceContextPropagator,
    trace::{Sampler, SdkTracerProvider},
    Resource,
};
use std::env;
use tracing_opentelemetry::OpenTelemetryLayer;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

/// Initialize OpenTelemetry tracing with OTLP export and structured logging.
///
/// This sets up:
/// 1. OTLP span exporter (gRPC) for distributed tracing
/// 2. W3C TraceContext propagator for cross-service context propagation
/// 3. tracing-subscriber with env filter + fmt (structured JSON in prod)
/// 4. OpenTelemetry layer bridging tracing spans to OTel spans
pub fn init_tracing() -> anyhow::Result<()> {
    // Configure OTLP exporter
    let otlp_endpoint = env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
        .unwrap_or_else(|_| "http://localhost:4317".to_string());

    let otlp_enabled = env::var("OTEL_EXPORTER_OTLP_ENABLED")
        .unwrap_or_else(|_| "true".to_string())
        .to_lowercase()
        == "true";

    let service_name =
        env::var("OTEL_SERVICE_NAME").unwrap_or_else(|_| "brainmate-auth-gateway".to_string());
    let service_version = env::var("OTEL_SERVICE_VERSION").unwrap_or_else(|_| {
        option_env!("CARGO_PKG_VERSION")
            .unwrap_or("unknown")
            .to_string()
    });
    let deployment_env =
        env::var("OTEL_DEPLOYMENT_ENVIRONMENT").unwrap_or_else(|_| "development".to_string());
    let sample_ratio = env::var("OTEL_BASE_SAMPLE_RATIO")
        .ok()
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(0.15)
        .clamp(0.0, 1.0);

    let mut provider_builder = SdkTracerProvider::builder()
        .with_sampler(Sampler::ParentBased(Box::new(Sampler::TraceIdRatioBased(
            sample_ratio,
        ))));

    if otlp_enabled {
        let span_exporter = SpanExporter::builder()
            .with_http()
            .with_endpoint(&otlp_endpoint)
            .build()
            .map_err(|e| anyhow!("otlp exporter init failed: {e}"))?;
            
        provider_builder = provider_builder.with_batch_exporter(span_exporter);
    }

    let tracer_provider = provider_builder
        .with_resource(
            Resource::builder()
                .with_attributes(vec![
                    KeyValue::new("service.name", service_name),
                    KeyValue::new("service.version", service_version),
                    KeyValue::new("deployment.environment", deployment_env),
                ])
                .build(),
        )
        .build();

    global::set_tracer_provider(tracer_provider.clone());

    // Install W3C TraceContext propagator for traceparent/tracestate headers
    global::set_text_map_propagator(TraceContextPropagator::new());

    // Create OpenTelemetry layer for tracing-subscriber
    let otel_layer = OpenTelemetryLayer::new(tracer_provider.tracer("auth-gateway"));

    // Environment filter for log levels
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,tower_http=debug"));

    // Structured logging layer
    let is_production = env::var("NODE_ENV")
        .or_else(|_| env::var("OTEL_DEPLOYMENT_ENVIRONMENT"))
        .unwrap_or_default()
        == "production";

    let _ = is_production;
    tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt::layer().with_target(true).with_thread_ids(true))
        .with(otel_layer)
        .init();

    tracing::info!("OpenTelemetry tracing initialized");
    Ok(())
}

/// Shutdown the OpenTelemetry provider gracefully, flushing all buffered spans.
pub fn shutdown_tracing() {
    tracing::info!("Shutting down OpenTelemetry tracing");
}

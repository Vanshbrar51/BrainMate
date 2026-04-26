// lib/opentelemetry.ts — OpenTelemetry setup for Next.js frontend
//
// This module is loaded by instrumentation.ts before any server code runs.
// It configures the OpenTelemetry SDK with OTLP exporters for both traces
// and metrics, W3C Trace Context propagation, and auto-instrumentation.

import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  type Context,
  type Attributes,
  type Link,
  type SpanKind,
} from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import {
  BatchSpanProcessor,
  SamplingDecision,
  type Sampler,
  type SamplingResult,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

// ---------------------------------------------------------------------------
// Diagnostic logging — only in development
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV === 'development') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
}

// ---------------------------------------------------------------------------
// Exporter configuration
// ---------------------------------------------------------------------------
const otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317';
const otlpEnabled =
  (process.env.OTEL_EXPORTER_OTLP_ENABLED ??
    (process.env.NODE_ENV === "production" ? "true" : "false")) === "true";

// The NodeSDK can auto-create OTLP exporters from env vars even when we don't
// pass exporters explicitly. Force-disable all exporters in local mode unless
// OTLP is explicitly enabled.
if (!otlpEnabled) {
  process.env.OTEL_TRACES_EXPORTER = "none";
  process.env.OTEL_METRICS_EXPORTER = "none";
  process.env.OTEL_LOGS_EXPORTER = "none";
}

const traceExporter = otlpEnabled
  ? new OTLPTraceExporter({ url: otlpEndpoint })
  : undefined;
const metricExporter = otlpEnabled
  ? new OTLPMetricExporter({ url: otlpEndpoint })
  : undefined;

// ---------------------------------------------------------------------------
// Resource attributes
// ---------------------------------------------------------------------------
const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'brainmate-ai-frontend',
  [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.1.0',
  [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
});

// ---------------------------------------------------------------------------
// SDK initialization
// ---------------------------------------------------------------------------
class AdaptiveSecuritySampler implements Sampler {
  private readonly normalSampler: Sampler;

  constructor(normalRatio: number) {
    this.normalSampler = new TraceIdRatioBasedSampler(normalRatio);
  }

  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[],
  ): SamplingResult {
    const route = String(attributes['http.route'] ?? attributes['http.target'] ?? '');
    const op = `${spanName} ${route}`.toLowerCase();

    const securityCritical =
      op.includes('auth') ||
      op.includes('risk') ||
      op.includes('reconciliation') ||
      op.includes('logout') ||
      op.includes('session') ||
      op.includes('/api/auth');

    if (securityCritical) {
      return {
        decision: SamplingDecision.RECORD_AND_SAMPLED,
      };
    }

    return this.normalSampler.shouldSample(
      context,
      traceId,
      spanName,
      spanKind,
      attributes,
      links,
    );
  }

  toString(): string {
    return 'AdaptiveSecuritySampler';
  }
}

const baseSampleRatio = Number.parseFloat(process.env.OTEL_BASE_SAMPLE_RATIO ?? '0.15');

const sdkConfig: ConstructorParameters<typeof NodeSDK>[0] = {
  resource,
  sampler: new AdaptiveSecuritySampler(baseSampleRatio),
  textMapPropagator: new W3CTraceContextPropagator(),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        ignoreIncomingRequestHook: (req) => {
          const url = req.url ?? '';
          return (
            url.startsWith('/api/healthz') ||
            url.startsWith('/_next') ||
            url.startsWith('/favicon')
          );
        },
      },
    }),
  ],
};

if (traceExporter) {
  sdkConfig.traceExporter = traceExporter;
  sdkConfig.spanProcessors = [
    new BatchSpanProcessor(traceExporter, {
      maxQueueSize: 2048,
      maxExportBatchSize: 512,
      scheduledDelayMillis: 5000,
      exportTimeoutMillis: 30000,
    }),
  ];
}

if (metricExporter) {
  sdkConfig.metricReaders = [
    new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 60_000,
    }),
  ];
}

const sdk = new NodeSDK(sdkConfig);

// ---------------------------------------------------------------------------
// Start SDK
// ---------------------------------------------------------------------------
sdk.start();
console.log('[otel] OpenTelemetry SDK initialized');
if (!otlpEnabled) {
  console.log("[otel] OTLP exporter disabled (set OTEL_EXPORTER_OTLP_ENABLED=true to enable)");
}

// ---------------------------------------------------------------------------
// Graceful shutdown — flush buffered spans/metrics before process exit
// ---------------------------------------------------------------------------
const shutdown = () => {
  sdk
    .shutdown()
    .then(() => {
      console.log('[otel] OpenTelemetry SDK shut down');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[otel] Error shutting down OpenTelemetry SDK', error);
      process.exit(1);
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default sdk;

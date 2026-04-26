# Brainmate AI — Infrastructure Blueprint

Production-grade architecture for the authentication system. Equivalent to Stripe / AWS Cognito internal systems.

---

## 1. Full Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           EDGE LAYER                                    │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────────┐     │
│  │ Cloudflare   │  │ AWS WAF      │  │ CDN / DDoS Protection      │     │
│  │ WAF Rules    │  │ Rate Limits  │  │ Bot Detection, IP Reputation│     │
│  └──────┬──────┘  └──────┬───────┘  └────────────┬───────────────┘     │
│         └────────────────┼───────────────────────┘                      │
│                          │ traceparent header                          │
└──────────────────────────┼──────────────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        APPLICATION LAYER                                 │
│                                                                          │
│  ┌─────────────────────────────────────────────────┐                     │
│  │             Next.js (Clerk Auth)                 │                     │
│  │                                                  │                     │
│  │  proxy.ts ──────── OTel spans ───► /api/auth/*   │                     │
│  │       │              traceparent        │         │                     │
│  │       │                                 │         │                     │
│  │       ▼                                 ▼         │                     │
│  │  tracing.ts        rust-auth.ts (gateway client) │                     │
│  │   │                    │   │                      │                     │
│  │   │     syncSession    │   │  forceRevokeSession  │                     │
│  │   │         │          │   │         │            │                     │
│  │   │         │    ┌─────┘   │         │            │                     │
│  │   │         ▼    ▼         │         ▼            │                     │
│  │   │   reconciliation-     secrets.ts              │                     │
│  │   │   worker.ts           (AWS SM / GCP SM)       │                     │
│  │   │   (Redis queue)                               │                     │
│  └───┼───────────┼───────────────────────────────────┘                     │
│      │           │  traceparent                                           │
│      │           ▼                                                        │
│  ┌───┼───────────────────────────────────────────────┐                     │
│  │   │     Rust Auth Gateway (Axum)                  │                     │
│  │   │                                               │                     │
│  │   │  ┌──────────┐  ┌──────────┐  ┌────────────┐  │                     │
│  │   │  │ auth.rs  │  │ risk_    │  │ reconcili- │  │                     │
│  │   │  │(JWT,RBAC)│  │engine.rs │  │ation.rs   │  │                     │
│  │   │  └────┬─────┘  └────┬─────┘  └─────┬─────┘  │                     │
│  │   │       │              │              │         │                     │
│  │   │  ┌────▼──────────────▼──────────────▼──────┐  │                     │
│  │   │  │ session_store │ blacklist │ rate_limiter │  │                     │
│  │   │  │ jwks_cache    │ nonce    │ otp_store    │  │                     │
│  │   │  └───────────────┬──────────┴──────────────┘  │                     │
│  │   │                  │                             │                     │
│  └───┼──────────────────┼─────────────────────────────┘                     │
│      │                  │                                                   │
└──────┼──────────────────┼───────────────────────────────────────────────────┘
       │                  │
       ▼                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                        │
│                                                                          │
│  ┌──────────────────────────────────────┐  ┌────────────────────────┐   │
│  │         Redis (Multi-Region)          │  │  Cloud KMS / HSM       │   │
│  │                                       │  │                        │   │
│  │  Primary (write) ──► Replica (read)  │  │  - INTERNAL_API_TOKEN  │   │
│  │       │                   │           │  │  - OTP_PEPPER          │   │
│  │       ▼                   ▼           │  │  - Rotation policy     │   │
│  │  Sentinel (failover monitoring)       │  │                        │   │
│  │                                       │  └────────────────────────┘   │
│  │  Keys:                                │                               │
│  │  - session:{sid}     (session data)   │                               │
│  │  - blacklist:{jti}   (revoked JWTs)   │                               │
│  │  - risk:ctx:{hash}   (risk signals)   │                               │
│  │  - rate_limit:*      (token buckets)  │                               │
│  │  - nonce:{value}     (replay guard)   │                               │
│  │  - reconciliation:*  (retry queue)    │                               │
│  └──────────────────────────────────────┘                               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      OBSERVABILITY LAYER                                 │
│                                                                          │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────────────────────┐   │
│  │ OTel Collector  │  │ Jaeger/Tempo │  │ Grafana (Dashboards)       │   │
│  │ (OTLP gRPC)    │──│ (Traces)     │──│ - Auth latency p50/p99     │   │
│  └────────────────┘  └──────────────┘  │ - Risk score distribution  │   │
│                                         │ - Reconciliation queue     │   │
│  ┌────────────────┐  ┌──────────────┐  │ - Error rate by endpoint   │   │
│  │ Prometheus     │──│ Metrics      │──│ - Redis health             │   │
│  │ (auth-gateway) │  │ Exporter     │  └────────────────────────────┘   │
│  └────────────────┘  └──────────────┘                                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Request Lifecycle (Traced)

```
[Browser] ──POST /api/auth/sync──►
  │ traceparent: 00-{traceId}-{parentSpanId}-01
  ▼
[Cloudflare WAF] ── rate check, bot detect ──►
  ▼
[Next.js Proxy]
  span: middleware-auth-processing
    ├─ span: clerk-auth-protect
    │    └─ Clerk JWT validation
    └─ span: session-sync-to-gateway
         ├─ inject traceparent header
         └─ POST /api/auth/sync
              ▼
         [Next.js API Route]
           span: api.auth.sync
             └─ span: gateway.sync-session
                  ├─ inject traceparent header
                  └─ POST internal:9091/v1/auth/session
                       ▼
                  [Rust Gateway]
                    span: create_session
                      ├─ span: redis.set_json_nx (session write)
                      └─ span: redis.atomic_incr (session counter)
```

---

## 3. Multi-Region Redis Architecture

### Recommended: Primary + Replicas with Sentinel

```
Region A (Primary)           Region B (Replica)
┌──────────────┐             ┌──────────────┐
│ Redis Primary │────────────│ Redis Replica │
│ (writes)      │  async     │ (reads)       │
└──────┬───────┘  repl.      └──────┬───────┘
       │                            │
┌──────▼───────┐             ┌──────▼───────┐
│ Sentinel 1   │             │ Sentinel 2   │
│ Sentinel 2   │             │ Sentinel 3   │
└──────────────┘             └──────────────┘
```

| Operation | Target | Consistency |
|-----------|--------|-------------|
| Session write (create) | Primary | Strong |
| Session read (validate) | Replica (fallback: Primary) | Eventual (sub-second lag) |
| Blacklist write | Primary | Strong |
| Blacklist read | Primary | Strong (critical security) |
| Rate limit | Primary | Strong |
| Risk context write | Primary | Strong |
| Risk context read | Replica | Eventual (acceptable) |

**Failover**: Sentinel promotes replica to primary within **5 seconds**. Fred client reconnects automatically.

### Alternative: Active-Active (Redis Enterprise)

For zero-downtime global deployment with CRDTs:
- Sessions: Last-Writer-Wins (LWW)
- Blacklist: Add-only set (union merge)
- Rate limiters: Local per-region (acceptable)
- Recommended for 10M+ MAU

---

## 4. Failure Mode Analysis

### Scenario 1: Region Outage
| What happens | System behavior |
|---|---|
| Primary region goes down | Sentinel promotes replica (5s). Clients reconnect via Sentinel. |
| Gateway in downed region | Load balancer routes to healthy region. Sessions are available via replica-now-primary. |
| Next.js in downed region | DNS failover to standby region. Session sync via reconciliation queue catches up. |

### Scenario 2: Redis Failure
| What happens | System behavior |
|---|---|
| Redis primary crashes | Sentinel failover (<5s). In-flight writes fail, retry via reconciliation. |
| Redis fully unavailable | Auth middleware returns **503** (fail-closed). All requests blocked. |
| Redis network partition | Primary continues writes. Partitioned replicas go read-only. Sentinel resolves on heal. |

### Scenario 3: Gateway Crash
| What happens | System behavior |
|---|---|
| Single gateway crashes | Load balancer health check detects failure. Removes from pool in **10s**. |
| All gateways crash | Next.js falls back to Clerk-only auth. Session sync enqueued to reconciliation. |
| Gateway OOM | Request body limit (64KB) + timeout (10s) prevent memory growth. Auto-restart via process manager. |

### Scenario 4: Network Partition
| What happens | System behavior |
|---|---|
| Next.js ↔ Gateway partition | `fetchWithRetry` retries 3x with backoff. Falls back to reconciliation queue. |
| Gateway ↔ Redis partition | Redis client reconnects. Auth returns 503 (fail-closed). |
| Gateway ↔ Clerk JWKS partition | Serves from Redis JWKS cache (TTL: 5min). Retries with exponential backoff. |

---

## 5. Observability Strategy

### Metrics (Prometheus)
| Metric | Type | Description |
|--------|------|-------------|
| `auth_latency_seconds` | Histogram | Auth middleware latency (p50, p95, p99) |
| `risk_score` | Histogram | Risk assessment scores |
| `risk_assessment_total` | Counter | Risk assessments by level |
| `reconciliation_enqueued_total` | Counter | Ops enqueued for retry |
| `reconciliation_processed_total` | Counter | Ops successfully retried |
| `reconciliation_dlq_total` | Counter | Ops moved to dead-letter |
| `secret_rotation_detected_total` | Counter | Secret rotations detected |
| `internal_token_reload_failures_total` | Counter | Token file reload failures |

### Traces (OpenTelemetry → Jaeger/Tempo/Datadog)
- Every request gets a **trace ID** that flows: Next.js → Gateway → Redis
- Spans: `middleware-auth-processing`, `clerk-auth-protect`, `gateway.validate-token`, `redis.get_json`, `jwks.refresh`
- Errors automatically recorded as span exceptions

### Logs (Structured JSON in production)
- Rust gateway: `tracing` crate with JSON formatter
- Next.js: `console.log/error` with context objects
- Correlation: Every log entry includes `trace_id` and `span_id` from active OTel context

### Debugging an Incident
1. Get `x-request-id` from error response or alert
2. Search Jaeger/Tempo by trace ID → see full request lifecycle
3. Identify failing span → check span attributes + error message
4. Cross-reference with Prometheus metrics for pattern (latency spike, rate limit hit, etc.)
5. Check reconciliation queue for pending retries

---

## 6. Final Hardening Checklist

### Pre-Deploy
- [ ] All env secrets migrated to AWS Secrets Manager / GCP Secret Manager
- [ ] WAF rules deployed to Cloudflare/AWS (edge layer)
- [ ] TLS certificates provisioned for gateway (`REQUIRE_TLS=true`)
- [ ] Redis Sentinel configured with 3+ nodes across AZs
- [ ] OTel Collector deployed with production exporter (Datadog/Tempo)
- [ ] `ALLOW_WILDCARD_CORS=false` confirmed
- [ ] `TRUST_X_FORWARDED_FOR=true` only when behind trusted proxy
- [ ] Internal gateway bound to loopback only (`127.0.0.1:9091`)
- [ ] Rate limits tuned for expected traffic (`RATE_LIMIT_BURST`, `RATE_LIMIT_PER_SEC`)
- [ ] Reconciliation worker deployed as separate process/sidecar

### Runtime
- [ ] Prometheus scraping gateway metrics endpoint
- [ ] Grafana dashboards configured (auth latency, risk scores, reconciliation queue)
- [ ] Alerting rules set:
  - `auth_latency_seconds{quantile="0.99"} > 1.0` → P2 alert
  - `reconciliation_dlq_total` increasing → P1 alert
  - `risk_assessment_total{level="critical"}` spike → P1 alert
  - Redis sentinel failover event → P2 alert
- [ ] Secret rotation schedule: every 90 days for API tokens, 180 days for OTP pepper
- [ ] JWKS cache TTL: 5 minutes (balance freshness vs. availability)
- [ ] Log retention: 30 days hot, 90 days warm, 1 year cold

### Incident Response
- [ ] **Runbook: Auth outage** — Check Redis health → Gateway health → Clerk JWKS → reconciliation queue
- [ ] **Runbook: Elevated risk** — Review risk signals → Geo analysis → Device analysis → decide block/allow
- [ ] **Runbook: Credential stuffing** — Check WAF logs → Verify rate limits → Add IP blocks → Rotate tokens
- [ ] **Runbook: Secret compromise** — Rotate via KMS → Invalidate all sessions → Force re-auth → Post-mortem
- [ ] **Runbook: DLQ overflow** — Investigate root cause → Fix upstream → Replay DLQ items → Clear

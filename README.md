# BrainMate AI

BrainMate AI is an enterprise-grade SaaS platform featuring a highly secure, microservices-based architecture. It provides a premium, AI-powered user experience backed by robust authentication, high-performance background processing, and strict data security protocols.

## 🏗 System Architecture

The codebase is fundamentally divided into three primary services, each utilizing a specialized technology stack optimized for its specific domain.

### 1. Frontend & Core Application (TypeScript / Next.js)
**Tech Stack:** Next.js 14 (App Router), React 19, Clerk Auth, Tailwind CSS, OpenTelemetry.

**Role & Responsibilities:**
- **User Interface:** Drives the entire user-facing application, including the landing page, premium authentication flows (`/sign-in`, `/sign-up`), and the highly interactive `/dashboard` modules (e.g., WriteRight, DevHelper).
- **Design System:** Implements a strict, premium design system using custom CSS variables (no raw hex colors or unstructured utility classes). It supports dynamic color themes, micro-animations, and fluid typography.
- **Route Protection:** Uses Clerk middleware (`proxy.ts`) to ensure strict boundary protection for the dashboard and internal API routes.
- **State & Data:** Communicates with the Auth Gateway for secure interactions and connects to Supabase/PostgreSQL for real-time application data via strictly typed server actions.

### 2. Auth Gateway (Rust / Axum)
**Tech Stack:** Rust, Axum, Redis, OpenTelemetry.

**Role & Responsibilities:**
- **Stateless + Stateful Auth:** Acts as a hybrid authentication gateway. It validates stateless Clerk JWTs (via RS256 JWKS signature verification) while enforcing stateful controls via Redis.
- **Session & Token Management:** Uses Redis to manage critical auth states that raw JWTs cannot, including session existence, token revocation (blacklisting), token rotation, and distributed rate limiting.
- **Security Enforcement:** Implements strict security policies including replay protection (nonce caching), MFA/OTP state validation, and strict CORS/header injection. It fails closed on Redis outages to prevent unauthorized access.
- **Internal APIs:** Exposes heavily guarded internal endpoints (secured by `x-internal-api-token`) for internal services to orchestrate session revocation, refresh workflows, and reconciliation.

### 3. Background AI Worker (Python / FastAPI)
**Tech Stack:** Python, FastAPI, Asyncio, Redis, Supabase.

**Role & Responsibilities:**
- **Asynchronous AI Processing:** Serves as a background job processor for executing long-running, resource-intensive AI operations (such as the WriteRight AI processing pipeline) without blocking the Next.js frontend.
- **Queue Consumption:** Listens to Redis-backed message queues to pick up and process incoming AI generation jobs concurrently.
- **Data Persistence:** Connects directly to Supabase (PostgreSQL) to read user prompts and persist the resulting AI-generated outputs securely.
- **Observability:** fully instrumented with OpenTelemetry to trace AI task durations, failure rates, and system health endpoints (`/healthz`).

---

## 📂 Repository Structure

```text
.
├── app/                  # Next.js App Router (Pages, API routes, Layouts)
├── components/           # React UI components (Dashboard, Shared, Chat UI)
├── lib/                  # Shared TS utilities (Supabase, Redis, Tracing, Errors)
├── proxy.ts              # Next.js Clerk route protection middleware
├── rust-auth-gateway/    # Rust Axum Authentication Gateway
│   ├── src/              # Gateway logic, routing, telemetry
│   └── Cargo.toml        # Rust package configuration
├── python-worker/        # Python FastAPI AI Worker
│   ├── app/              # Core worker logic, queues, and Supabase integration
│   ├── main.py           # FastAPI entry point & lifespan manager
│   └── requirements.txt  # Python dependencies
└── supabase/             # Supabase migrations, configurations, and edge functions
```

---

## 🛠 Local Development Setup

### 1. Environment Configuration
Copy the environment template and populate it with your Clerk and Supabase credentials:
```bash
cp .env.example .env
```
Ensure the following are set in your `.env`:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` & `CLERK_SECRET_KEY`
- `CLERK_JWKS_URL` & `CLERK_ISSUER`
- `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL`

For the Rust Gateway, generate an internal API token:
```bash
mkdir -p .secrets && chmod 700 .secrets
openssl rand -hex 32 > .secrets/internal_api_tokens.txt
chmod 600 .secrets/internal_api_tokens.txt
```

### 2. Run Next.js Frontend
```bash
npm install
npm run dev
# Frontend runs on http://localhost:3000
```

### 3. Run Rust Auth Gateway
```bash
# Load environment variables and start the gateway
set -a; source .env; set +a 
cargo run --manifest-path rust-auth-gateway/Cargo.toml
# Gateway runs on AUTH_GATEWAY_BIND_ADDR (default: 0.0.0.0:8081)
```

### 4. Run Python AI Worker
```bash
cd python-worker
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

---

## 🚀 Production Deployment Checklist

Before deploying to production, strictly verify the following criteria:

### TLS & Network
- [ ] `REQUIRE_TLS=true` with valid `TLS_CERT_PATH` and `TLS_KEY_PATH`.
- [ ] `ENFORCE_TLS_FOR_PUBLIC_LISTENER=true` on the Rust Gateway.
- [ ] `AUTH_GATEWAY_BIND_ADDR` bound to production IP, while `AUTH_GATEWAY_INTERNAL_BIND_ADDR` must remain loopback/VPC-only.

### Secrets Management
- [ ] Use a cloud secret manager (`SECRET_PROVIDER=aws_sm` or `gcp_sm`).
- [ ] **NEVER** set `OTP_PEPPER` or `INTERNAL_API_TOKEN` in plaintext environment variables.
- [ ] Regularly rotate `CLERK_SECRET_KEY` and `REDIS_URL` credentials.

### Redis & State Resiliency
- [ ] Ensure Redis Sentinel or Cluster is configured for High Availability (HA).
- [ ] Enable Redis TLS (`rediss://` scheme) if communicating across network boundaries.
- [ ] Enable the `ENABLE_RECONCILIATION_WORKER=true` in production to handle dead-letter queues.

### Observability & Metrics
- [ ] Set `OTEL_EXPORTER_OTLP_ENDPOINT` pointing to your collector.
- [ ] Set `OTEL_DEPLOYMENT_ENVIRONMENT=production`.
- [ ] Configure PromQL alerts for `risk_assessment_total{level="critical"}`, `reconciliation_dlq_total`, and `auth_degraded_mode_total`.

---

## 🎨 Design System & UI Guidelines

BrainMate AI utilizes a highly specific custom CSS design system located in `app/globals.css`. **You must strictly adhere to these variables for any UI modifications.**

### Core Principles
- **No Hardcoded Hex:** Never use raw hex colors or Tailwind color classes (e.g., `text-blue-500`).
- **Semantic Variables:** Always map to semantic variables like `var(--bg)`, `var(--surface)`, `var(--text-1)`.
- **CSS Classes over Utilities:** Rely on pre-built structural classes (e.g., `.chat-workspace`, `.chat-messages`) rather than composing massive Tailwind utility strings.

### Key CSS Variables
- **Surfaces:** `--bg` (page background), `--surface` (cards), `--bg-subtle`
- **Text:** `--text-1` (primary), `--text-2` (secondary), `--text-3` (muted), `--text-inv` (inverted)
- **Accents:** `--accent` (Anthropic terracotta), `--mod-write` (WriteRight Purple)
- **Typography:** `--font-display` (Instrument Serif), `--font-body` (Geist Sans), `--font-mono` (Geist Mono)

By adhering to this structure, BrainMate AI maintains absolute consistency across microservices, state management, and user interfaces.

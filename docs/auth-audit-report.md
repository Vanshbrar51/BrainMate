# Authentication Audit Report

Date: 2026-03-26

## Scope

- Next.js frontend with Clerk integration
- Rust auth gateway (`rust-auth-gateway`)
- Redis-backed auth/session state
- Cross-service reconciliation and logout/session-sync flows

## Executed Validation

- `cargo test --manifest-path rust-auth-gateway/Cargo.toml`
- `npm run build`
- `npm run lint`
- Live probe to Clerk JWKS endpoint
- Live gateway startup attempt with local `.env`
- Live Next.js startup attempt with local `.env`

## Confirmed Findings

### Critical

1. Redis connectivity is currently broken in the configured environment.
   - The Rust gateway fails during startup before serving auth traffic.
   - Observed failure: Redis authentication rejected the configured credentials.
   - Impact: all gateway-backed authentication checks are unavailable.

2. The frontend is misconfigured for Clerk at runtime.
   - The Next.js app starts, but requests fail with `Publishable key not valid`.
   - Impact: sign-in, protected-route rendering, and Clerk session bootstrap fail.

3. A real secret was present in `rust-auth-gateway/README.md`.
   - Removed as part of this audit.
   - Impact: credential exposure risk if the file was ever shared or committed.

### High

4. Reconciliation formats were split between Next.js and Rust workers.
   - Queue names differed.
   - The TypeScript worker used an internal endpoint path that does not exist.
   - Rust and TypeScript queue payloads were not interoperable.
   - Impact: failed session sync / logout recovery could silently stall.

5. Remote Redis was configured over `redis://` instead of `rediss://`.
   - Impact: plaintext transport risk for a non-local Redis deployment.

### Medium

6. Middleware sync failures did not always enqueue recovery directly.
   - If the internal `/api/auth/sync` fetch failed before the route executed, recovery could be skipped.

7. Frontend lint warnings remain.
   - They are not auth blockers, but they are still open quality issues.

## Implemented Fixes

### Code

- Unified reconciliation queue names between Rust and Next.js.
- Added shared queue payload compatibility for Rust worker deserialization.
- Added `session_sync` support to the Rust reconciliation worker.
- Fixed TypeScript token revocation reconciliation to write directly to Redis blacklist state instead of calling a nonexistent endpoint.
- Made middleware enqueue session-sync reconciliation directly when the sync route call fails.
- Added startup validation requiring `rediss://` for non-local Redis URLs.

### Documentation

- Removed the exposed token from `rust-auth-gateway/README.md`.
- Corrected Redis key schema docs for nonce storage.
- Documented shared reconciliation queues.
- Clarified managed Redis TLS expectations in the root README.

## Validation Results After Code Changes

- Rust test suite: passed
- Next.js production build: passed
- ESLint: passed with warnings only
- Clerk JWKS endpoint: reachable over HTTPS and returns `200`

## Remaining External Blockers

1. Redis credentials in the local `.env` must be corrected and rotated if they were shared.
2. Managed Redis should be switched to `rediss://`.
3. Clerk publishable key configuration in the local `.env` must be replaced with a valid key for the configured instance.

## Recommended Monitoring

- Gateway startup success / failure
- Redis auth failures and connection latency
- Clerk JWKS fetch latency and refresh failures
- Authentication success rate
- Session sync enqueue rate, retry rate, and DLQ growth
- Logout reconciliation failures
- Protected-route 401/403/503 rates

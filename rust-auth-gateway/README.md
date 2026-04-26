# BrainMate Auth Gateway (Axum + Redis)

Hybrid authentication gateway for Clerk JWTs with Redis-enforced state controls.

## Architecture

- JWT verifies identity and signature.
- Redis enforces runtime auth state (session existence, revocation, replay protection, MFA state, distributed rate limits).
- Every protected request validates both JWT claims and Redis state.

## Redis Key Schema

- `session:{sid}`
- `blacklist:{jti}`
- `refresh:{token_id_hash}`
- `auth:{token_hash}`
- `jwks:cache`
- `rate_limit:{scope}:{id_hash}`
- `otp:{user_id}`
- `nonce:{region_id}:{request_id}`
- `reconciliation:pending`
- `reconciliation:dlq`

## Endpoints

### Public

- `GET /healthz/live`
- `GET /healthz/ready`
- `GET /v1/auth/session` (requires `Authorization: Bearer ...`)
- `POST /v1/auth/logout` (requires auth + `x-request-nonce`)

### Internal (requires `x-internal-api-token`)

- `POST /v1/auth/session`
- `DELETE /v1/auth/session/{sid}`
- `POST /v1/auth/refresh/issue`
- `POST /v1/auth/refresh/rotate`
- `POST /v1/auth/refresh/revoke`
- `POST /v1/auth/otp/issue`
- `POST /v1/auth/otp/verify`

## Required Environment Variables

- `CLERK_JWKS_URL`
- `CLERK_ISSUER`
- `CLERK_AUTHORIZED_PARTY`
- `OTP_PEPPER`
- `INTERNAL_API_TOKENS` (or `INTERNAL_API_TOKEN` / `INTERNAL_API_TOKENS_FILE`)

## Important Optional Variables

- `CLERK_AUDIENCE`
- `REDIS_URL`
- `REDIS_CONNECT_TIMEOUT_SECS`
- `AUTH_CACHE_TTL_SECS` (30-60)
- `JWKS_CACHE_TTL_SECS` (default 3600)
- `RATE_LIMIT_BURST`
- `RATE_LIMIT_PER_SEC`
- `REQUIRE_TLS`
- `TLS_CERT_PATH`
- `TLS_KEY_PATH`

## Security Notes

- Raw JWTs are never stored in Redis.
- Auth cache uses token SHA-256 hash keys.
- Refresh token keys are hashed token identifiers.
- OTP values are peppered + hashed.
- Mutating authenticated requests require nonce replay protection.
- Redis outages fail closed (`503` or deny).

## Run & Test

```bash
# Option A (from project root)
cd /Users/gurpreetsingh/Desktop/brainmate-ai

mkdir -p .secrets
chmod 700 .secrets

openssl rand -hex 32 > .secrets/internal_api_tokens.txt
chmod 600 .secrets/internal_api_tokens.txt

set -a; source .env; set +a 
cargo run --manifest-path rust-auth-gateway/Cargo.toml

# optional check (shows the token that internal services must send in x-internal-api-token)
cat .secrets/internal_api_tokens.txt

setopt allexport
source .env
unsetopt allexport

cargo run --manifest-path rust-auth-gateway/Cargo.toml

```

Never paste live tokens into documentation, shell history, or screenshots.

# KIVRONIX Go backend

This service is the migration target for server-side KIVRONIX functionality. During the migration, the existing Next.js API remains the production source of truth until each Go endpoint passes contract, shadow-traffic and rollback checks.

## Stage v1.0.4

- PostgreSQL connection pool for a Supabase direct or session-pooler URL;
- production database connections automatically require TLS;
- Supabase access tokens are verified locally against cached JWKS signing keys;
- only `RS256` and `ES256` asymmetric tokens are accepted; issuer, audience, expiry and not-before are validated;
- JWKS is cached for at most 10 minutes and unknown key IDs cannot force repeated refreshes;
- readiness checks the database without exposing connection details;
- a protected diagnostic endpoint verifies authentication without returning user identity;
- `GET /v1/profile/learning-preferences` reads only the JWT subject's profile through the Supabase Data API;
- the user's bearer token is forwarded to Supabase so the existing `auth.uid() = id` RLS policy is enforced;
- only `role`, `level`, `software`, and `goal` are returned; identity and unrelated onboarding fields are omitted;
- one structured error format and request audit events that exclude tokens, identities and query strings.

Next.js is still the production source of truth. Its profile route can compare the legacy response with Go after sending the legacy response to the user. Shadow reads are disabled by default, and no financial request is routed to Go.

## Run locally

```bash
export GO_BACKEND_SUPABASE_URL=https://PROJECT_REF.supabase.co
export GO_BACKEND_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
export GO_BACKEND_DATABASE_URL='postgresql://...'
go run ./cmd/api
```

Endpoints:

- `GET /healthz` — process liveness;
- `GET /readyz` — PostgreSQL and JWT-verifier readiness;
- `GET /v1/meta` — non-sensitive build metadata.
- `GET /v1/diagnostics/auth` — verifies `Authorization: Bearer <access-token>` and returns no claims or identity.
- `GET /v1/profile/learning-preferences` — returns the authenticated user's normalized learning preferences.

For a persistent IPv4-only Go service, use the Supabase session pooler URL (port `5432`). For a direct IPv6 connection, use the direct URL. The transaction pooler (port `6543`) is also supported; the driver automatically disables prepared statements for that mode. Keep the database password only in the deployment secret store.

Use a dedicated least-privilege database role for the Go service. It still needs only permission to connect and run the readiness probe; do not give it the `postgres` owner role or put a service-role key in the connection settings. The profile request uses a Supabase publishable key plus the user's access token, never a secret/service-role key, so RLS remains active.

To enable comparison after deploying the Go service, set `GO_BACKEND_URL` to its HTTPS origin and set `GO_BACKEND_SHADOW_READS_ENABLED=true` in Next.js. The optional `GO_BACKEND_SHADOW_TIMEOUT_MS` is bounded to 250–3000 ms. The legacy response remains authoritative even on mismatch, timeout, or Go failure.

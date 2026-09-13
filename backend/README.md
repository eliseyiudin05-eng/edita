# KIVRONIX Go backend

This service is the migration target for server-side KIVRONIX functionality. During the migration, the existing Next.js API remains the production source of truth until each Go endpoint passes contract, shadow-traffic and rollback checks.

## Stage v1.0.3

- PostgreSQL connection pool for a Supabase direct or session-pooler URL;
- production database connections automatically require TLS;
- Supabase access tokens are verified locally against cached JWKS signing keys;
- only `RS256` and `ES256` asymmetric tokens are accepted; issuer, audience, expiry and not-before are validated;
- JWKS is cached for at most 10 minutes and unknown key IDs cannot force repeated refreshes;
- readiness checks the database without exposing connection details;
- a protected diagnostic endpoint verifies authentication without returning user identity;
- one structured error format and request audit events that exclude tokens, identities and query strings.

This remains an isolated diagnostic service. Next.js is still the production source of truth and no customer or financial request is routed to Go.

## Run locally

```bash
export GO_BACKEND_SUPABASE_URL=https://PROJECT_REF.supabase.co
export GO_BACKEND_DATABASE_URL='postgresql://...'
go run ./cmd/api
```

Endpoints:

- `GET /healthz` — process liveness;
- `GET /readyz` — PostgreSQL and JWT-verifier readiness;
- `GET /v1/meta` — non-sensitive build metadata.
- `GET /v1/diagnostics/auth` — verifies `Authorization: Bearer <access-token>` and returns no claims or identity.

For a persistent IPv4-only Go service, use the Supabase session pooler URL (port `5432`). For a direct IPv6 connection, use the direct URL. The transaction pooler (port `6543`) is also supported; the driver automatically disables prepared statements for that mode. Keep the database password only in the deployment secret store.

Use a dedicated least-privilege database role for the Go service. At this stage it needs only permission to connect and run the readiness probe; do not give it the `postgres` owner role or put a service-role key in the connection settings. Supabase RLS remains mandatory for every exposed table when later read-only routes are introduced.

Production traffic is intentionally not routed here in this stage.

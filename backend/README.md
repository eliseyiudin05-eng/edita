# KIVRONIX Go backend

This service is the migration target for server-side KIVRONIX functionality. During the migration, the existing Next.js API remains the production source of truth until each Go endpoint passes contract, shadow-traffic and rollback checks.

## Stage v1.0.2

- isolated Go service with no production traffic;
- health, readiness and build metadata endpoints;
- strict HTTP timeouts, request-size limit, panic recovery and security headers;
- no secrets returned by diagnostics;
- Docker image runs as a non-root user;
- CI formatting, vet, race and unit-test checks.

## Run locally

```bash
go run ./cmd/api
```

Endpoints:

- `GET /healthz` — process liveness;
- `GET /readyz` — dependency readiness;
- `GET /v1/meta` — non-sensitive build metadata.

Production traffic is intentionally not routed here in this stage.

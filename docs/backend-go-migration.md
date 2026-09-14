# KIVRONIX backendGo migration

Target release: **2.0.0**. This branch keeps Next.js as a browser UI and moves all trusted logic to one Go API backed by regular PostgreSQL.

## Non-negotiable boundaries

- `main` remains unchanged until the new stack passes the full acceptance suite.
- Browser code never connects directly to PostgreSQL and never receives privileged credentials.
- Go owns authentication, authorization, validation, moderation, money/points, uploads and external provider calls.
- PostgreSQL stores transactional data and object metadata. File bytes use an S3-compatible service (MinIO locally); putting large videos into PostgreSQL is intentionally avoided.
- Every mutating request accepts an idempotency key. Money and point changes use short transactions and locked rows in stable ID order.
- No release tags are created for this migration. Every commit subject ends with its application version.

## Compatibility inventory

| Domain | Existing surface | Go target | State |
|---|---:|---|---|
| Auth and sessions | signup, login, recovery, confirmation, browser Supabase auth | `/v1/auth/*`, rotating DB sessions | foundation |
| Profile and onboarding | 2 API routes plus direct UI reads/writes | `/v1/profile/*` | existing Go adapter must be replaced |
| Academy and practice | lessons, progress, simulator, competitions | `/v1/academy/*` | existing Go adapter must be replaced |
| Social | ranking, friends, referrals, groups, group chat | `/v1/social/*` | partial shadow implementation |
| AI | coach, history, feedback, brief, simulator, video review, admin learning | `/v1/ai/*`, `/v1/admin/ai/*` | partial shadow implementation |
| Marketplace | challenges, jobs, campaigns, portfolio, creators | `/v1/marketplace/*` | TypeScript/Supabase only |
| Business | growth, ratings, verification, discussion | `/v1/business/*` | partial shadow implementation |
| Work chat | private chat, files, delivery, escrow | `/v1/work/*` | partial shadow implementation |
| Finance | Points, YooKassa webhook, payouts, rewards | `/v1/finance/*` | wallet and payout requests migrated; top-ups/rewards remain |
| Admin | six moderation/review surfaces | `/v1/admin/*` | TypeScript/Supabase only |
| Platform | health, readiness, email health, audit/outbox | `/healthz`, `/readyz`, `/v1/system/*` | partial |

The source application currently contains 42 `app/api/**/route.ts` files plus direct Supabase calls from browser components. Completion means those trusted operations no longer execute in TypeScript and `@supabase/*` is absent from runtime dependencies.

## Database migration runbook

1. Deploy an empty PostgreSQL 18+ database and run `go run ./cmd/migrate` from `backend`.
2. Take a source backup and rehearse restore in an isolated environment.
3. Put legacy writes into maintenance mode; keep reads available.
4. Run `SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... ./scripts/migrate-supabase-to-postgres.sh --execute`.
5. Copy Supabase Storage objects to the configured S3-compatible buckets and import their metadata into `public.objects`.
6. Compare row counts, foreign-key checks, sampled hashes and money/points totals.
7. Start Go against the target database, execute the acceptance suite, then switch frontend API origin.
8. Keep the source read-only until the rollback window expires.

The script copies password hashes instead of plaintext passwords. Existing bcrypt hashes remain valid during login and are upgraded to Argon2id after successful authentication.

## Definition of 100%

- all legacy API and direct browser data operations have Go equivalents;
- no Go package calls Supabase REST, Auth, Realtime or Storage;
- schema and data migration are repeatable and validated on a production-shaped snapshot;
- unit, race, integration, migration, browser E2E and security tests pass in CI;
- rollback and operations documentation is complete;
- the final commit message ends with `v2.0.0`, without a Git tag.

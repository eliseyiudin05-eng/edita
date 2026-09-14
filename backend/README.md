# KIVRONIX Go backend

This service is the migration target for server-side KIVRONIX functionality. During the migration, the existing Next.js API remains the production source of truth until each Go endpoint passes contract, shadow-traffic and rollback checks.

## Stage v1.0.25

- PostgreSQL connection pool for a Supabase direct or session-pooler URL;
- production database connections automatically require TLS;
- Supabase access tokens are verified locally against cached JWKS signing keys;
- only `RS256` and `ES256` asymmetric tokens are accepted; issuer, audience, expiry and not-before are validated;
- JWKS is cached for at most 10 minutes and unknown key IDs cannot force repeated refreshes;
- readiness checks the database without exposing connection details;
- a protected diagnostic endpoint verifies authentication without returning user identity;
- `GET /v1/profile/learning-preferences` reads only the JWT subject's profile through the Supabase Data API;
- `POST /v1/profile/learning-preferences` updates only the editor's own onboarding preferences under RLS;
- the user's bearer token is forwarded to Supabase so the existing `auth.uid() = id` RLS policy is enforced;
- only `role`, `level`, `software`, and `goal` are returned; identity and unrelated onboarding fields are omitted;
- `GET /v1/academy/progress` reads only the verified JWT subject's completed lessons under the existing ownership RLS policy;
- academy output contains only sorted lesson slugs and derived XP, omitting identity, notes, scores, timestamps, and database IDs;
- `GET /v1/social/ranking` reads at most 50 public ranking profiles under the existing `public_profiles` RLS policy;
- the social response omits profile UUIDs and all non-public profile fields;
- `GET /v1/social/friends` reads at most 200 relations visible to the verified JWT subject under participant-only RLS;
- `POST /v1/social/friends/cancel` idempotently deletes only the verified requester's pending relation;
- friend-list output omits both participant UUIDs and keeps only the relationship ID required by the existing mutation route;
- `GET /v1/social/groups` reads at most 20 groups and 500 members visible to the verified JWT subject under member-only RLS;
- group profile lookups are chunked, and group creation, joining, and messages remain outside Go;
- `GET /v1/business/verification` reads one owner-bound company and its latest verification request under user RLS;
- the business response omits internal IDs, tax/registration numbers, document paths, URLs and reported audience;
- `GET /v1/private-chats/thread` reads one participant-bound conversation and at most 200 messages under user RLS;
- every returned message is checked against the selected conversation and its two participants, with a 256 KiB response cap;
- `GET /v1/private-chats` reads at most 100 participant-bound conversations, editor cards and related work orders under user RLS;
- list output omits participant UUIDs and validates order ownership, Points totals, statuses and deliverable metadata;
- `GET /v1/ai/history` reads one owner-bound existing conversation and at most 80 messages under user RLS;
- AI-history output omits owner IDs, database roles and message metadata, with a 2 MiB upstream response cap;
- `DELETE /v1/ai/history` idempotently clears messages from one owner-bound conversation under user RLS without deleting the conversation;
- `POST /v1/ai/conversations` idempotently gets or creates one owner-bound conversation under user RLS;
- one structured error format and request audit events that exclude tokens, identities and query strings.

Next.js remains the gateway and primary write authority. Profile, academy progress, social ranking, friend-list, study-group, business-verification, private-chat and AI-history reads can independently compare legacy and Go responses in shadow mode. Mature read routes may route a bounded 1–10% read-only canary to Go. Separate disabled-by-default canaries may route up to 10% of idempotent AI-history clears and conversation creation to Go; message writes and all financial requests remain outside Go.

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
- `GET /v1/academy/progress` — returns the authenticated user's completed lesson slugs and derived XP.
- `GET /v1/social/ranking` — returns a bounded ranking of public profiles without database identifiers.
- `GET /v1/social/friends` — returns only the authenticated user's bounded friend list without participant UUIDs.
- `GET /v1/social/groups` — returns only bounded groups and member cards visible to the authenticated member.
- `GET /v1/business/verification` — returns the authenticated owner's minimized business-verification status.
- `GET /v1/private-chats/thread?conversationId=<uuid>` — returns one thread visible to the authenticated participant.
- `GET /v1/private-chats` — returns a bounded conversation list visible to the authenticated participant.
- `GET /v1/ai/history?scope=<scope>` — returns one existing conversation history visible to its authenticated owner.
- `DELETE /v1/ai/history?scope=<scope>` — idempotently clears messages from one conversation owned by the authenticated user.
- `POST /v1/ai/conversations` — idempotently gets or creates one conversation owned by the authenticated user.

For a persistent IPv4-only Go service, use the Supabase session pooler URL (port `5432`). For a direct IPv6 connection, use the direct URL. The transaction pooler (port `6543`) is also supported; the driver automatically disables prepared statements for that mode. Keep the database password only in the deployment secret store.

Use a dedicated least-privilege database role for the Go service. It still needs only permission to connect and run the readiness probe; do not give it the `postgres` owner role or put a service-role key in the connection settings. The profile request uses a Supabase publishable key plus the user's access token, never a secret/service-role key, so RLS remains active.

To enable comparison after deploying the Go service, set `GO_BACKEND_URL` to its HTTPS origin and set `GO_BACKEND_SHADOW_READS_ENABLED=true` in Next.js. The optional `GO_BACKEND_SHADOW_TIMEOUT_MS` is bounded to 250–3000 ms. The legacy response remains authoritative in shadow mode.

After shadow results are stable, disable shadow mode, set `GO_BACKEND_CANARY_READS_ENABLED=true`, and begin with `GO_BACKEND_CANARY_PERCENT=1`. An active canary suppresses shadow requests even if the shadow flag was accidentally left enabled. The percentage is hard-limited to 10. `GO_BACKEND_CANARY_TIMEOUT_MS` is bounded to 250–3000 ms and `GO_BACKEND_CANARY_MAX_LATENCY_MS` controls when a completed Go request still falls back. Failures and slow responses fall back within the same request. A per-instance circuit breaker pauses the canary for five minutes at a 20% unhealthy rate after at least 10 results, while any contract mismatch opens it immediately. Set the canary flag to `false` for global rollback.

For the academy stage, keep `GO_BACKEND_ACADEMY_SHADOW_READS_ENABLED=false` until the Go build is healthy, then enable it to compare `/v1/academy/progress` after legacy responses are sent. `GO_BACKEND_ACADEMY_SHADOW_TIMEOUT_MS` is bounded to 250–3000 ms. After stable comparisons, disable academy shadow mode, enable `GO_BACKEND_ACADEMY_CANARY_READS_ENABLED`, and begin at `GO_BACKEND_ACADEMY_CANARY_PERCENT=1`. The percentage is hard-limited to 10. Timeout, malformed/oversized response, excessive latency, or an open circuit falls back to the existing Supabase read. A 20% unhealthy rate in a 10–20 result window pauses academy canary locally for five minutes; a contract mismatch opens the circuit immediately. The environment flag is the global kill switch. Writes, XP persistence, and unlock decisions remain in Next.js/Supabase.

For the social ranking stage, keep `GO_BACKEND_SOCIAL_SHADOW_READS_ENABLED=false` until the Go build is healthy, then enable it to compare `/v1/social/ranking` after legacy responses are sent. `GO_BACKEND_SOCIAL_SHADOW_TIMEOUT_MS` is bounded to 250–3000 ms. After stable comparisons, disable social shadow mode, enable `GO_BACKEND_SOCIAL_CANARY_READS_ENABLED`, and begin at `GO_BACKEND_SOCIAL_CANARY_PERCENT=1`. The percentage is hard-limited to 10. Timeout, malformed/oversized response, excessive latency, or an open circuit falls back to the existing Supabase read. A 20% unhealthy rate in a 10–20 result window pauses social canary locally for five minutes; a contract mismatch opens the circuit immediately. The environment flag is the global kill switch.

For friend-list shadow reads, apply the participant-only friendships RLS migration, deploy Go, then set `GO_BACKEND_SOCIAL_FRIENDS_SHADOW_READS_ENABLED=true`. `GO_BACKEND_SOCIAL_FRIENDS_SHADOW_TIMEOUT_MS` is bounded to 250–3000 ms. The existing Next.js response remains authoritative, and comparison logs contain no relation, participant, profile, or token data. After stable comparisons, disable shadow mode, enable `GO_BACKEND_SOCIAL_FRIENDS_CANARY_READS_ENABLED`, and begin at `GO_BACKEND_SOCIAL_FRIENDS_CANARY_PERCENT=1`. The percentage is hard-limited to 10. Timeout, malformed/oversized response, excessive latency, or an open circuit falls back within the same request. A 20% unhealthy rate in a 10–20 result window pauses the canary locally for five minutes; a mismatch opens it immediately. The environment flag is the global kill switch. Friend search and all friendship writes remain in Next.js/Supabase in v1.0.11.

For study-group shadow reads, apply the member-only group RLS migration, deploy Go, then set `GO_BACKEND_SOCIAL_GROUPS_SHADOW_READS_ENABLED=true`. `GO_BACKEND_SOCIAL_GROUPS_SHADOW_TIMEOUT_MS` is bounded to 250–3000 ms. The legacy response remains authoritative. Logs contain no tokens, join codes, group/member identifiers, names, profile data, or membership state. After stable comparisons, disable shadow mode, enable `GO_BACKEND_SOCIAL_GROUPS_CANARY_READS_ENABLED`, and begin at `GO_BACKEND_SOCIAL_GROUPS_CANARY_PERCENT=1`. The percentage is hard-limited to 10. Timeout, malformed/oversized response, excessive latency, or an open circuit falls back within the same request. A 20% unhealthy rate in a 10–20 result window pauses the canary locally for five minutes; a mismatch opens it immediately. The environment flag is the global kill switch. Group creation, joining, and chat messages remain in Next.js/Supabase in v1.0.13.

For business-verification shadow reads, apply the owner-only request RLS migration, deploy Go, then set `GO_BACKEND_BUSINESS_VERIFICATION_SHADOW_READS_ENABLED=true`. `GO_BACKEND_BUSINESS_VERIFICATION_SHADOW_TIMEOUT_MS` is bounded to 250–3000 ms. The legacy response remains authoritative. Go accepts one owner-filtered business and at most one latest request, with a 32 KiB response cap. Logs contain no tokens, owner/business/request IDs, company details, verification values, or document metadata. After stable comparisons, disable shadow mode, enable `GO_BACKEND_BUSINESS_VERIFICATION_CANARY_READS_ENABLED`, and begin at `GO_BACKEND_BUSINESS_VERIFICATION_CANARY_PERCENT=1`. The percentage is hard-limited to 10. Timeout, malformed/oversized response, excessive latency, or an open circuit falls back within the same request. A 20% unhealthy rate in a 10–20 result window pauses the canary locally for five minutes; a mismatch opens it immediately. The environment flag is the global kill switch. Company creation, document upload, submission, and admin review remain in Next.js/Supabase in v1.0.15.

For private-chat thread shadow reads, deploy Go and keep `GO_BACKEND_PRIVATE_CHAT_SHADOW_READS_ENABLED=false` until the service is healthy. Enabling it compares one participant-visible thread with `/v1/private-chats/thread` after the legacy response is sent. `GO_BACKEND_PRIVATE_CHAT_SHADOW_TIMEOUT_MS` is bounded to 250–3000 ms. Go forwards the user's token with the publishable key, explicitly filters the selected conversation by the verified subject, and validates every message against both participants. The contract is capped at one conversation, 200 messages and 256 KiB. Logs omit tokens, query values, UUIDs, names, message bodies and file metadata. After stable comparisons, disable shadow mode, enable `GO_BACKEND_PRIVATE_CHAT_CANARY_READS_ENABLED`, and begin at `GO_BACKEND_PRIVATE_CHAT_CANARY_PERCENT=1`. The percentage is hard-limited to 10. Timeout, malformed/oversized response, excessive latency, or an open circuit falls back within the same request. A 20% unhealthy rate in a 10–20 result window pauses the canary locally for five minutes; a mismatch opens it immediately. The environment flag is the global kill switch. Message writes, moderation, Realtime, files, work delivery and Points remain in Next.js/Supabase in v1.0.17.

For private-chat list shadow reads, deploy Go and keep `GO_BACKEND_PRIVATE_CHAT_LIST_SHADOW_READS_ENABLED=false` until the service is healthy. Enabling it compares the participant-visible list with `/v1/private-chats` after the legacy response is sent. `GO_BACKEND_PRIVATE_CHAT_LIST_SHADOW_TIMEOUT_MS` is bounded to 250–3000 ms. Go forwards the user's token with the publishable key and explicitly filters conversations and work orders by the verified subject. The list is capped at 100 conversations; participant UUIDs are removed, and order totals, statuses and deliverable metadata are validated. Logs omit tokens, UUIDs, names, titles, statuses, Points and file metadata. After stable comparisons, disable shadow mode, enable `GO_BACKEND_PRIVATE_CHAT_LIST_CANARY_READS_ENABLED`, and begin at `GO_BACKEND_PRIVATE_CHAT_LIST_CANARY_PERCENT=1`. The percentage is hard-limited to 10. Timeout, malformed/oversized response, excessive latency, or an open circuit falls back within the same request. A 20% unhealthy rate in a 10–20 result window pauses the list canary locally for five minutes; a mismatch opens it immediately. The environment flag is the global kill switch. All writes, moderation, Realtime, files, work delivery and Points remain in Next.js/Supabase in v1.0.19.

For AI-history shadow reads, deploy Go and keep `GO_BACKEND_AI_HISTORY_SHADOW_READS_ENABLED=false` until the service is healthy. Enabling it compares the owner-visible result with `/v1/ai/history` only after Next.js has created a missing conversation if necessary and sent the legacy response. `GO_BACKEND_AI_HISTORY_SHADOW_TIMEOUT_MS` is bounded to 250–3000 ms. Go forwards the user's token with the publishable key and explicitly filters both tables by the verified subject. The contract is capped at one conversation, 80 messages and 2 MiB; owner IDs, database roles and metadata are removed. Logs omit tokens, UUIDs, scopes, titles and message content. After stable comparisons, disable shadow mode, enable `GO_BACKEND_AI_HISTORY_CANARY_READS_ENABLED`, and begin at `GO_BACKEND_AI_HISTORY_CANARY_PERCENT=1`. The percentage is hard-limited to 10. Timeout, malformed/oversized response, excessive latency, or an open circuit falls back within the same request. A 20% unhealthy rate in a 10–20 result window pauses the canary locally for five minutes; a mismatch opens it immediately. A missing conversation falls back to legacy creation without counting as a Go health failure. The environment flag is the global kill switch.

For AI-history deletion, keep `GO_BACKEND_AI_HISTORY_DELETE_CANARY_ENABLED=false` until the read canary is healthy. Then begin at `GO_BACKEND_AI_HISTORY_DELETE_CANARY_PERCENT=1`, with a hard maximum of 10. Go verifies the token, derives the owner from its subject, forwards that user token with the publishable key, and applies explicit owner and conversation filters. It deletes only messages and preserves the conversation, matching legacy behavior. The operation is idempotent: timeout, error, malformed response or excessive latency safely retries through legacy in the same request. A 20% failure rate in a 10–20 result window opens a five-minute circuit; the flag is the global kill switch. Logs omit tokens, identities, scopes and message content. Message creation, feedback, attachments and model calls remain in Next.js/Supabase in v1.0.22.

For AI-conversation creation, keep `GO_BACKEND_AI_CONVERSATION_CANARY_ENABLED=false` until AI-history writes are healthy, then begin at `GO_BACKEND_AI_CONVERSATION_CANARY_PERCENT=1`, capped at 10. The endpoint accepts only bounded scope, title and optional lesson slug fields. Identity comes solely from the verified token subject, and the user's token plus publishable key preserve owner-only RLS. Existing conversations are returned unchanged; a concurrent unique-key conflict is resolved by another owner-scoped read. Error, timeout, malformed response or excessive latency falls back to the idempotent legacy get-or-create operation in the same request. The five-minute circuit breaker opens at a 20% failure rate after at least 10 results. Logs omit all conversation data. Message writes, model calls, feedback, attachments and Points remain outside Go in v1.0.23.

For learning-preferences updates, keep `GO_BACKEND_PROFILE_UPDATE_CANARY_ENABLED=false` until profile reads are healthy, then begin at `GO_BACKEND_PROFILE_UPDATE_CANARY_PERCENT=1`, capped at 10. Go accepts only the three bounded preference fields, derives the owner from the verified token, preserves unrelated onboarding fields, and updates only an editor's own row with the user token and publishable key. Owner-only RLS and the existing onboarding column grant remain active. Failure, timeout, malformed output or excessive latency retries the idempotent update through legacy in the same request. A 20% failure rate in a 10–20 result window opens a five-minute circuit. Logs omit tokens, identity and preference values.

For outgoing friendship cancellation, apply `20260914021113_friendship_cancel_rls.sql`, deploy Go, and keep `GO_BACKEND_SOCIAL_FRIEND_CANCEL_CANARY_ENABLED=false` until friend reads are healthy. Then begin at `GO_BACKEND_SOCIAL_FRIEND_CANCEL_CANARY_PERCENT=1`, capped at 10. Go verifies the token, derives the requester from its subject, and deletes only a matching pending relation under the dedicated requester-only DELETE policy. Missing rows are successful idempotent retries. Failure, timeout, malformed output or excessive latency retries through legacy in the same request. A 20% failure rate in a 10–20 result window opens a five-minute circuit. Logs omit tokens, relation IDs and profile data. Sending, accepting and declining requests remain outside Go in v1.0.25.

# Architecture v0.1

## Roles

### Editor
Учится, получает XP, загружает работы, участвует в challenges, строит portfolio, подаётся на jobs.

### Business
Создаёт brand profile, challenges и jobs; получает shortlist; нанимает исполнителей; формирует постоянный talent pool.

### Admin
Модерация, disputes, payouts, rights/usage, verified businesses, safety.

## Core product loops

### Learning loop
Lesson → practice → AI feedback → retry → skill score → unlock.

### Marketplace loop
Business brief → challenge → submissions → AI triage → human/business decision → payment → portfolio → hire.

### Protected delivery loop
Заказчик резервирует Points → монтажёр загружает отдельное защищённое превью и оригинал → заказчик проверяет только превью → подтверждает оплату → Points атомарно переходят монтажёру → оригинал открывается заказчику. До подтверждения заказчик может отменить заказ: зарезервированные Points атомарно возвращаются на его баланс, а оригинал остаётся закрыт.

### Retention loop
Real work creates new skill data → AI recommends next gap → editor learns → becomes eligible for better work.

## AI layers

1. Tutor: explains software and editing principles.
2. Career coach: portfolio, client communication, pricing logic.
3. Brief interpreter: turns a business brief into an editor checklist.
4. Review engine: structured feedback for uploaded edits.
5. Brand Brain: stores approved examples, tone, visual rules and recurring feedback.
6. Matching: ranks editors for a job using verified platform signals.

## Trust rules

- AI score never decides a paid winner by itself.
- Commercial usage rights are explicit per challenge.
- Paid finalist model should be available for professional/spec work.
- Minor users need protected communication and age-aware payout/legal flows.
- Portfolio metrics distinguish AI score, business rating and community rating.
- Исходный файл платной работы хранится в закрытом Storage и недоступен заказчику до статуса `completed`.
- Выдача временной ссылки на превью или оригинал проверяет пользователя, его участие в заказе и текущий статус заказа на сервере; Storage RLS повторяет то же ограничение.
- `complete_work_order` допускает оплату только после зарегистрированной передачи обоих файлов. Завершение и возврат блокируют строку заказа, чтобы повторный запрос не мог перевести Points дважды.

## Go migration boundary (v1.0.34)

- Most production writes and all business decisions remain in Next.js/Supabase.
- Simple AI feedback may use a disabled-by-default 1–10% Go canary after owner and assistant-message verification; feedback that queues learning candidates always remains on the legacy server path.
- Editable profile settings pass through the authenticated Next.js gateway; disabled-by-default shadow and 1–10% canary modes use the bounded Go owner-only response and are mutually exclusive.
- Profile-settings canary failures, invalid output or excessive latency fall back to the existing Supabase read in the same request. Successful responses are compared after delivery, and a mismatch opens the five-minute circuit immediately.
- Profile-settings writes now pass through the authenticated Next.js gateway. A disabled 1–10% Go canary updates only five editable columns with the user's JWT, an explicit subject filter, column grants and owner-only `USING/WITH CHECK`; ambiguous failures retry idempotently through the same RLS-protected legacy path.
- Avatar file upload stays in the existing Storage flow, and the settings write stores only the resulting bounded HTTPS URL.
- The Go service exposes one read-only profile contract for learning preferences in addition to diagnostics.
- Shadow reads remain available. A separate, disabled-by-default canary may serve at most 10% of this one read-only route from Go.
- Every canary failure, timeout, oversized or malformed response, or response above the configured latency ceiling falls back to the existing Supabase read in the same request.
- A per-instance circuit breaker pauses Go traffic for five minutes after at least 20% unhealthy outcomes in a 10–20 sample window. A contract mismatch opens it immediately. The environment kill switch remains the global rollback control.
- Successful canary responses are compared with the legacy result after the response is sent; comparison logs contain no token, user ID, or profile values.
- The academy exposes `GET /v1/academy/progress` for shadow comparison and a separately controlled bounded canary. The Next.js gateway remains authoritative and academy writes stay in the existing handler.
- Academy progress is read with the user's bearer token and an explicit verified-subject filter, so `lesson_progress` ownership RLS remains active. Go validates every returned owner before removing identity from the response.
- The academy response exposes only sorted completed lesson slugs and derived XP; submission notes, timestamps, scores, lesson IDs, and user IDs are omitted.
- Browser components read academy progress through the authenticated Next.js gateway instead of querying `lesson_progress` directly.
- Academy progress may serve a separately controlled 1–10% read-only canary. Failure, excessive latency, or invalid output falls back to the existing Supabase read in the same request.
- Academy shadow and canary modes are mutually exclusive. A per-instance circuit breaker pauses degraded academy canary traffic for five minutes, while an environment kill switch provides global rollback.
- Social ranking adds `GET /v1/social/ranking` in shadow-only mode. Browser reads now pass through the authenticated Next.js gateway instead of querying `public_profiles` directly.
- Both legacy and Go social reads use the user's token with the publishable key. The external contract is limited to 50 ranked public profiles and removes database UUIDs before responding.
- Social shadow logs contain only route, outcome and duration; names, usernames, schools, avatars, scores and identifiers are excluded.
- Social ranking may serve a separately controlled 1–10% read-only canary. Failure, excessive latency or invalid output falls back to the existing Supabase read in the same request.
- Social shadow and canary modes are mutually exclusive. A dedicated circuit breaker pauses degraded social canary traffic for five minutes, while the environment flag provides global rollback.
- Friend-list reads add a separate disabled-by-default shadow contract. Go accepts only the verified JWT subject, reads at most 200 participant-visible relations under RLS, and removes requester/addressee UUIDs from its response.
- The relationship ID is retained because the authenticated participant needs it for accept, decline, or cancel actions. Friend search and every friendship mutation remain in the existing Next.js route.
- Friend-list reads may serve a separately controlled 1–10% canary. Failures, excessive latency, malformed output, or an open circuit fall back to the existing Next.js/Supabase read in the same request.
- Friend-list shadow and canary modes are mutually exclusive. A dedicated five-minute circuit breaker and an environment kill switch provide automatic and global rollback.
- Study-group reads add a separate disabled-by-default shadow contract. Go derives the allowed group set only from the verified JWT subject and participant-only RLS.
- Group output is capped at 20 groups, 500 members and 256 KiB; profile lookups are chunked. Group creation, joining and messages remain in the existing Next.js/Supabase routes.
- Study-group reads may serve a separately controlled 1–10% canary. Failures, excessive latency, malformed output, or an open circuit fall back to the existing Next.js/Supabase read in the same request.
- Study-group shadow and canary modes are mutually exclusive. A dedicated five-minute circuit breaker and an environment kill switch provide automatic and global rollback.
- Business-verification status adds a separate disabled-by-default shadow contract. Go derives the company solely from the verified JWT subject and accepts a request only when it belongs to that company.
- Business output is capped at one company, one latest request and 32 KiB. Internal IDs, tax/registration numbers, URLs, reported audience and document paths are excluded.
- Business-verification reads may serve a separately controlled 1–10% canary. Failure, excessive latency, malformed output, or an open circuit falls back to the existing Next.js/Supabase result in the same request.
- Business-verification shadow and canary modes are mutually exclusive. A dedicated five-minute circuit breaker and an environment kill switch provide automatic and global rollback.
- Private-chat thread reads add a separate disabled-by-default shadow contract. Go accepts exactly one conversation UUID, derives the viewer only from the verified JWT subject, and retains participant-only RLS by forwarding the user's token with the publishable key.
- Chat output is capped at one conversation, 200 messages and 256 KiB. Every message must belong to that conversation and be authored by one of its two participants; audit and comparison logs omit all chat content and identifiers.
- Private-chat thread reads may serve a separately controlled 1–10% canary. Failures, excessive latency, malformed output or an open circuit fall back to the existing Next.js/Supabase read in the same request.
- Private-chat shadow and canary modes are mutually exclusive. A dedicated five-minute circuit breaker and an environment kill switch provide automatic and global rollback.
- Chat writes, contact moderation, Realtime subscriptions, file access, protected delivery, refunds and Points remain in the existing Next.js/Supabase routes.
- Private-chat list reads add a separate disabled-by-default shadow contract. Go accepts no query-selected identity, derives the participant from the verified JWT subject, and uses the user's token plus publishable key so RLS remains active.
- List output is capped at 100 conversations, omits both participant UUIDs, and validates each related work order's participant, Points totals, status and deliverable metadata. The legacy response remains authoritative.
- Private-chat list comparison logs contain only route, outcome and duration. Chat identities, names, titles, statuses, Points and file metadata are excluded.
- Private-chat list reads may serve a separately controlled 1–10% canary. Failures, excessive latency, malformed output or an open circuit fall back to the legacy read in the same request.
- List shadow and canary modes are mutually exclusive. A dedicated five-minute circuit breaker and an environment kill switch provide automatic and global rollback.
- AI-history reads add a separate disabled-by-default shadow contract. Next.js remains responsible for creating a missing conversation before the background comparison.
- Go derives the owner from the verified JWT subject and forwards the user's token with the publishable key. Both conversation and message queries also include explicit owner filters, preserving owner-only RLS.
- AI-history output is capped at one conversation, 80 messages and 2 MiB, and omits owner IDs, database roles and metadata. Comparison logs exclude scopes, titles and message content.
- AI-history reads may serve a separately controlled 1–10% canary. Failures, excessive latency, malformed output or an open circuit fall back to legacy in the same request; an absent conversation is created by legacy without penalizing Go health.
- AI-history shadow and canary modes are mutually exclusive. A dedicated five-minute circuit breaker and an environment kill switch provide automatic and global rollback.
- AI-history clear is the first Go mutation and has a separate disabled-by-default 1–10% canary. It deletes only owner-scoped messages and preserves the conversation, matching legacy behavior.
- The clear uses the verified user's token, publishable key, explicit owner filters and existing delete RLS. Because it is idempotent, ambiguous failures safely retry through legacy; a dedicated circuit breaker and kill switch provide rollback.
- AI-conversation creation has a separate disabled-by-default 1–10% canary. Go accepts only bounded conversation fields and derives ownership solely from the verified JWT subject.
- Conversation get-or-create is idempotent under the existing `(user_id, scope_key)` unique constraint. Ambiguous failures and concurrent insert conflicts safely resolve through owner-scoped reads or the legacy path.
- Learning-preferences updates have a separate disabled-by-default 1–10% canary. Go derives the profile owner from the verified JWT and updates only that owner's `onboarding` under column grants and RLS.
- The update preserves unrelated onboarding fields and is idempotent, so an ambiguous failure safely retries through legacy; logs omit identity and preference values.
- Outgoing pending friendship cancellation has a separate disabled-by-default 1–10% canary. A dedicated DELETE policy, the verified user token, and explicit relation/requester/status filters prevent cancellation by any other participant.
- Cancellation is idempotent across Go and legacy, so an ambiguous failure can retry safely. Sending friendship requests remains outside Go.
- Incoming friendship acceptance and decline have a separate disabled-by-default 1–10% canary. UPDATE is limited to `status` and `responded_at`, while RLS `USING` and `WITH CHECK` bind both old and new rows to the verified addressee.
- Repeating the same response is idempotent; switching a completed decision is forbidden. Sending friendship requests remains outside Go.
- Practice-session saves have a separate disabled-by-default 1–10% canary. Go accepts only a bounded scenario, at most 50 messages and a bounded result, then derives `user_id` solely from the verified JWT subject.
- The practice upsert uses the user's token and publishable key under owner-only SELECT/INSERT/UPDATE RLS. Column grants prevent ownership changes and Data API deletion; ambiguous failures safely retry through the idempotent legacy path.
- Practice-session reads add a disabled-by-default shadow contract for exactly one verified-owner row. The response is capped at 50 messages and 256 KiB and omits the owner ID.
- Next.js remains authoritative for practice reads; background comparison logs only outcome and duration and cannot delay or alter the user response.
- Practice-session reads have a separate disabled-by-default 1–10% canary with latency limits, legacy fallback and a five-minute circuit breaker.
- Canary responses are compared with legacy after delivery; a mismatch immediately opens the circuit without exposing session content in logs.
- Future-plan interest has a separate disabled-by-default 1–10% write canary. Go accepts only the two supported audience/plan pairs and verifies the account role before an owner-scoped upsert.
- The plan-interest write uses the user's JWT and publishable key under existing RLS, omits identity from its response and logs, and does not enable payments or subscriptions.
- The Go profile endpoint derives identity only from a locally verified access token, forwards that token to the Supabase Data API and filters on the same subject; the existing profile RLS policy remains active.
- The profile response omits user identity and every unrelated profile/onboarding field.
- Go connects to PostgreSQL through a bounded pool and requires encrypted database transport in production.
- Supabase JWTs are verified with asymmetric JWKS keys; the service never receives or exposes the JWT signing secret.
- Request audit events contain request ID, method, route path, status, response size, authentication result and duration. Authorization headers, query strings and user identifiers are excluded.
- No AI-message creation, chat write, Points, payout, escrow or file-delivery route is served by Go at this stage.

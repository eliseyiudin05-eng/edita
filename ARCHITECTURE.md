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

## Go migration boundary (v1.0.6)

- Production writes and business decisions remain in Next.js/Supabase.
- The Go service exposes one read-only profile contract for learning preferences in addition to diagnostics.
- Shadow reads remain available. A separate, disabled-by-default canary may serve at most 10% of this one read-only route from Go.
- Every canary failure, timeout, oversized or malformed response, or response above the configured latency ceiling falls back to the existing Supabase read in the same request.
- A per-instance circuit breaker pauses Go traffic for five minutes after at least 20% unhealthy outcomes in a 10–20 sample window. A contract mismatch opens it immediately. The environment kill switch remains the global rollback control.
- Successful canary responses are compared with the legacy result after the response is sent; comparison logs contain no token, user ID, or profile values.
- The academy adds `GET /v1/academy/progress` in shadow-only mode. The Next.js gateway remains authoritative and academy writes stay in the existing handler.
- Academy progress is read with the user's bearer token and an explicit verified-subject filter, so `lesson_progress` ownership RLS remains active. Go validates every returned owner before removing identity from the response.
- The academy response exposes only sorted completed lesson slugs and derived XP; submission notes, timestamps, scores, lesson IDs, and user IDs are omitted.
- Browser components read academy progress through the authenticated Next.js gateway instead of querying `lesson_progress` directly.
- The Go profile endpoint derives identity only from a locally verified access token, forwards that token to the Supabase Data API and filters on the same subject; the existing profile RLS policy remains active.
- The profile response omits user identity and every unrelated profile/onboarding field.
- Go connects to PostgreSQL through a bounded pool and requires encrypted database transport in production.
- Supabase JWTs are verified with asymmetric JWKS keys; the service never receives or exposes the JWT signing secret.
- Request audit events contain request ID, method, route path, status, response size, authentication result and duration. Authorization headers, query strings and user identifiers are excluded.
- No chat, Points, payout, order, escrow, mutation or file-delivery route is served by Go at this stage.

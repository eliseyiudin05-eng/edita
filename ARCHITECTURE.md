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

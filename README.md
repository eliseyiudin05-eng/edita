# EDITA — Learn. Compete. Earn.

Первый MVP карьерной платформы для видеомонтажёров и бизнеса.

## Что уже есть

- Landing page с позиционированием продукта.
- Интерфейс монтажёра: Dashboard, Academy, AI Coach, Arena, Portfolio, Jobs.
- Интерфейс бизнеса: статистика, конкурсы, talent pool.
- Интерактивные уроки и XP в демо-режиме.
- Интерактивное участие в Challenge.
- AI Coach: серверный `/api/ai` через OpenAI Responses API; без ключа автоматически работает demo fallback.
- Первая PostgreSQL/Supabase схема для профилей, обучения, конкурсов, заявок, портфолио и бизнеса.
- Mobile layout.

## Запуск

Требуется Node.js 22+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Открыть: `http://localhost:3000`

## AI

В `.env.local`:

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4-mini
```

Ключ используется только в серверном route handler и не отправляется клиенту.

## Supabase

1. Создать проект Supabase.
2. Выполнить `supabase/schema.sql` в SQL editor.
3. Добавить в `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Следующий этап — подключить реальные Auth, Storage и таблицы вместо demo-data.

## Следующие milestone

1. Supabase Auth + onboarding по роли.
2. Загрузка видео/исходников в Storage.
3. Реальный lifecycle Challenge: brief → submit → shortlist → winner.
4. AI video review: извлечение кадров/аудио + структурированный scorecard.
5. Публичные portfolio URLs `/u/[username]`.
6. Business Brand Brain и сохранённый контекст бренда.
7. Платежи, призовые и platform fee.
8. Moderation/safety flow для несовершеннолетних.

## Техническая позиция

Это не «видеокурс». Архитектура разделяет обучение, talent graph, marketplace и B2B workflow, чтобы продукт мог расти в полноценную двустороннюю платформу.

# EDITA Launch Checklist

Last reviewed: 2026-09-11

## Current technical state

- [x] Next.js production build passes in GitHub Actions
- [x] Vercel production deployment exists
- [x] AI Coach endpoint and safe configuration check
- [x] AI Video Review with structured scorecard
- [x] Arena challenge lifecycle prototype
- [x] AI auto-score for Arena submissions
- [x] Editor / Business roles in UI
- [x] Supabase schema and RLS draft
- [ ] Production database selected and provisioned
- [ ] Production authentication tested end-to-end
- [ ] Production object/video storage tested end-to-end
- [ ] Custom SMTP configured and verified
- [ ] Production payment provider integrated
- [ ] Custom domain connected
- [ ] Error monitoring and production analytics configured
- [ ] Legal documents reviewed for launch jurisdiction
- [ ] Minor-user safeguards finalized

## Launch blocker for a Russia-first product

The current managed Supabase architecture is appropriate for development, but a Russia-first public launch that collects personal data requires legal/architecture review for Russian personal-data localization requirements.

Do not upgrade Supabase solely for production until the production data-location decision is made.

Possible architecture direction:
1. Keep Next.js frontend/deployment workflow.
2. Store Russian users' personal data in infrastructure located in Russia.
3. Keep AI calls pseudonymized/minimized and review cross-border transfer requirements.
4. Separate public/non-personal product data from personal/auth/payment data.

## Pay now

### 1. Vercel Pro
Commercial production hosting. Hobby is personal/non-commercial only.

### 2. Domain
Preferred current candidate: getedita.app.

### 3. OpenAI API credits
Start small and set a spending/recharge limit.

## Can stay free during pilot

### Resend
Free tier is sufficient for initial transactional auth email volume, but custom SMTP must be configured before public email/password signup.

### Supabase Cloud
Use for development/pilot only until the production localization architecture is decided.

## Payments

For a Russia-first launch, integrate a Russian payment provider such as YooKassa after merchant onboarding.
Subscriptions/one-time products must not go live until:
- merchant account is approved;
- webhook verification works;
- entitlement state is stored server-side;
- refunds/cancellations are handled;
- receipts/tax requirements are reviewed.

## Legal / safety before public launch

- Privacy Policy
- Personal Data Processing Policy / consent flow
- User Agreement
- Public Offer / paid-service terms
- Contest/Arena rules
- IP/license transfer rules for submissions and winning work
- Rules for commercial use of submissions
- Minor-user and guardian-consent flow
- Moderated business-to-minor communication
- Data-retention and deletion process
- Cross-border transfer review for AI processing
- Legal review for Russian personal-data localization and payment flows

## Recommended release stages

### Stage 1 — Closed technical beta
20-50 invited users, no paid subscriptions, no real prize payouts.

### Stage 2 — Closed commercial pilot
Approved merchant/payment setup, production database, custom SMTP, legal documents, first 3-5 businesses.

### Stage 3 — Public launch
Marketing, paid plans, larger Arena, automated payouts and moderation.

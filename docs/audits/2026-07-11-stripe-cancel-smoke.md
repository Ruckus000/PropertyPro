# Stripe cancel smoke (manual staging)

Automated coverage for cancel → grace → lock lives in:

- `apps/web/__tests__/lifecycle/cancel-grace-lock.integration.test.ts`
- `apps/web/__tests__/billing/payment-reminder-scheduler.test.ts`
- `packages/shared/src/__tests__/paid-grace.test.ts`

Use this procedure when you need **live Stripe test-mode** confirmation on a seeded community.

## Prerequisites

- Stripe CLI installed and authenticated (`stripe login`)
- `.env.local` contains test-mode `STRIPE_SECRET_KEY` and webhook secret
- Web app running locally with webhook forwarding:

```bash
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe
```

- Demo DB seeded (`pnpm seed:demo`)

## Steps

1. Pick a test community with an active Stripe subscription (demo portfolio communities are seeded with subscriptions when Stripe keys are present).
2. Cancel the subscription in Stripe Dashboard **or** trigger deletion:

```bash
stripe trigger customer.subscription.deleted
```

3. Confirm the webhook handler processed the event (200 in `stripe listen` output).
4. In the database, verify for that `community_id`:
   - `subscription_status` reflects canceled / grace state per product rules
   - `next_reminder_at` is scheduled for **day 5** after period end (payment reminder scheduler)
5. Optional: inspect outbound email logs for subject/body mentioning the **7-day grace period** (`packages/email` subscription templates).

## Signup → trialing E2E

**Automated (guarded):** `apps/web/e2e/signup-trialing.spec.ts` (+ `e2e/helpers/stripe-e2e.ts`).
It **skips** in CI and default shells (no Stripe/Supabase secrets) and runs the full
`signup → Stripe Embedded Checkout (test card 4242…) → trialing` flow when secrets are present.

When secrets are available, run once:

1. In `apps/web/.env.local`: `STRIPE_SECRET_KEY=sk_test_…`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…`,
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
2. `stripe listen --forward-to 127.0.0.1:3000/api/v1/webhooks/stripe` (so the webhook provisions the community).
3. `E2E_STRIPE=1 pnpm --filter @propertypro/web exec playwright test -c playwright.config.ts e2e/signup-trialing.spec.ts`
4. The spec asserts the community lands `trialing` (the "Free trial active" banner). **First run:** validate the two
   external seams noted in `helpers/stripe-e2e.ts` — the Stripe embedded-checkout iframe selectors, and the Supabase
   admin `email_confirm` call — and adjust if Stripe's markup or the SDK shape differs.

> **Prod safety:** the spec creates real auth users + communities, so it **fails fast** (`assertSafeStripeE2eTarget`)
> if `NEXT_PUBLIC_SUPABASE_URL` points at a known-production project (`KNOWN_PROD_SUPABASE_REFS`, extendable via
> `E2E_BLOCKED_SUPABASE_REFS`). Point Supabase/`DATABASE_URL` at a **dev/test** project — Stripe test mode alone does
> not make a prod database safe.

Manual fallback (no spec): visit `/signup` → complete details → email verify → Stripe Checkout (`4242…`) →
`/signup/checkout/return` → confirm `trialing` in DB + dashboard access.

Record screenshots or notes in the PR test plan when performed.

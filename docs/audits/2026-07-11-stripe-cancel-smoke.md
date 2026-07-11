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

**Deferred** unless Stripe test keys and checkout return URLs are configured in `.env.local`. CI and default local shells do not include Stripe secrets.

When secrets are available, run once manually:

1. Visit `/signup` → complete community details
2. Finish Stripe Checkout (test card `4242…`)
3. Land on `/signup/checkout/return?session_id=…`
4. Confirm community is `trialing` in DB and dashboard access works

Record screenshots or notes in the PR test plan when performed.

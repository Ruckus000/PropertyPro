# Public GA Support Runbook

Operational procedures for support and engineering when self-serve signup, billing, or provisioning fails.

**Audience:** Platform support, on-call engineering  
**Related:** [Post-PR764 handoff](../superpowers/handoffs/2026-07-11-post-pr764-wave3.md), [Stripe cancel smoke](../../audits/2026-07-11-stripe-cancel-smoke.md)

---

## 1. Stuck provisioning (signup paid, community not ready)

### Symptoms

- User completed Stripe Checkout; login works but dashboard empty or 403
- `provisioning_jobs` row stuck in `pending` / `running` / `failed`
- User reports “still setting up” after 10+ minutes

### Diagnosis

1. Find `pending_signups` by email or Stripe `checkout.session.id`
2. Check `provisioning_jobs` for `signup_request_id`
3. Review web app logs for `[stripe-webhook]` / `runProvisioning` errors
4. Confirm webhook delivery in Stripe Dashboard → Developers → Webhooks

### Recovery

1. **Replay webhook** (test mode): `stripe events resend evt_...`
2. **Manual provision** (engineering): use admin console or re-trigger `runProvisioning(jobId)` after fixing root cause
3. **Communicate**: email user that community is ready; include login URL and founding admin role confirmation

### Prevention

- Webhook handler is idempotent; safe to retry
- Never delete `provisioning_jobs` mid-flight without understanding fence state

---

## 2. Payment failed / past_due / soft lock

### Symptoms

- User sees “payment failed” or “access paused” banner
- Mutations return 403 `SUBSCRIPTION_REQUIRED`
- Stripe subscription `past_due`, `canceled`, or `unpaid`

### Diagnosis

1. Stripe Dashboard → Customer → Subscription status
2. DB: `communities.subscription_status`, `subscription_canceled_at`, `subscription_current_period_end_at`
3. Paid grace: `canceled_at + 7 days` (see `packages/shared/src/billing/paid-grace.ts`)

### Recovery

| Status | User action | Support action |
|--------|-------------|----------------|
| `past_due` | Update card via Billing portal (`/billing/portal?communityId=`) | Resend portal link; confirm webhook `invoice.payment_succeeded` |
| `canceled` in grace | Update payment or resubscribe before grace ends | Explain 7-day window; see cancel smoke doc |
| Soft lock (post-grace) | Reactivate via portal | Same; reads work, writes blocked except billing paths |
| `incomplete_expired` | Restart signup/checkout | Send `/signup` link; check `pending_signups` cleanup |

### Demo vs paid

- **Demo** communities use `demo-grace-guard` / `trial_ends_at` — never mix with paid grace messaging
- **Free access plans** override via `free_access_expires_at`

---

## 3. Email verification / checkout abandoned

### Symptoms

- User closed tab during Embedded Checkout
- `/signup/checkout/return` without `session_id` shows restart copy (expected)

### Recovery

1. User returns to `/signup` or marketing pricing CTA
2. If account exists but unpaid: login → billing/settings → complete checkout
3. Duplicate slug: user must pick alternate subdomain at signup

---

## 4. Multi-community / tenant host confusion

### Symptoms

- Wrong community name in shell on subdomain
- 404 on tenant host transparency

### Diagnosis

- Middleware `x-tenant-slug` / `x-community-id` headers
- User may belong to multiple communities — use `/select-community`

### Recovery

- Apex deep links: append `?communityId=` for tests/support repro
- Production: user selects community from switcher

---

## 5. Escalation checklist

Before escalating to engineering lead:

- [ ] Stripe event ID and community ID captured
- [ ] `subscription_status` + timestamps from DB noted
- [ ] Screenshot of in-app banner (if any)
- [ ] Confirmed not a demo community conflated with paid lifecycle
- [ ] Webhook secret / endpoint healthy for environment

---

## 6. GA gate references

Automated regression:

```bash
scripts/with-env-local.sh pnpm seed:demo
pnpm --filter @propertypro/web test:e2e:tenant
pnpm --filter @propertypro/web exec playwright test -c playwright.config.ts \
  e2e/activation-smoke.spec.ts e2e/marketing-smoke.spec.ts
```

Integration (requires DB):

```bash
scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts \
  apps/web/__tests__/lifecycle/cancel-grace-lock.integration.test.ts
```

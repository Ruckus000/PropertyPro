# Runbook: Stripe test → live cutover

Moving a deployment from test-mode Stripe keys to live ones.

**Production is on test-mode keys today** (`pk_test_…` is served in the prod
bundle), so production cannot take a real payment. Nothing in this repo records a
decision to stay that way; treat it as an unticked launch step, not a setting.

> **This is not a single env-var change.** Stripe mode lives in four independent
> places, and flipping one leaves the environment in a mixed state that fails
> every checkout. Work through the steps in order.

---

## Why it is four things, not one

| Surface | Where | Changing it needs |
|---|---|---|
| Secret key | `STRIPE_SECRET_KEY` | env update |
| Publishable key | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | env update **+ redeploy** — it is inlined into the client bundle at build time |
| Price ids | `stripe_prices` table (10 rows) | `seed-stripe-live-prices.ts` |
| Webhook secret | `STRIPE_WEBHOOK_SECRET` | a **new endpoint** in the Stripe dashboard; live and test endpoints are separate registrations with separate secrets |

Objects do not cross the boundary: every `cus_…`, `sub_…`, `price_…` and coupon
created in test mode is invisible to a live key, and vice versa.

## The two mistakes that are easiest to make

1. **Forgetting the publishable key needs a redeploy.** Updating it in Vercel
   without rebuilding leaves the old value baked into the served bundle. Checkout
   then initialises with a test-mode publishable key against a live-mode session
   and fails in the browser, where server logs will not show you why.
2. **"Helpfully" updating the CI repository secret.**
   `.github/workflows/stripe-e2e.yml` **refuses** a non-`sk_test_` key. That is
   correct: the E2E suite must keep running against test mode. After cutover the
   repo secret and the production env var are *supposed* to differ.

---

## Procedure

Every step is idempotent and safe to re-run. Stop at the first failure.

### 0. Baseline — confirm the current state is coherent

```bash
pnpm tsx scripts/verify-stripe-mode.ts
```

Run this **before** changing anything. If it already reports problems, fix those
first — you do not want to be untangling two failures at once.

### 1. Create the live catalog

With `STRIPE_SECRET_KEY` set to the **live** key and `DATABASE_URL` pointing at
the target database, dry-run first:

```bash
pnpm tsx scripts/seed-stripe-live-prices.ts
```

Read the table. It prints the database host it would write to — check it. Then:

```bash
pnpm tsx scripts/seed-stripe-live-prices.ts --apply --i-understand-this-creates-live-billing-objects
```

Prices are matched by `lookup_key`, so re-running reuses rather than duplicating.

> After this step the database holds **live** price ids while the deployment may
> still be serving **test** keys. Checkout is broken until step 3. Keep the window
> short, or do steps 1–3 in one sitting.

### 2. Volume-discount coupons

Coupon ids are fixed strings (`volume_10pct`, …) but the coupon **objects** are
per-mode and do not exist in the live account until created:

```bash
pnpm tsx scripts/seed-volume-coupons.ts
```

Skipping this makes every volume discount fail once a PM crosses a tier.

### 3. Rotate the keys and the webhook

1. In the Stripe dashboard, create a **live-mode** webhook endpoint pointing at
   the production URL (`https://www.getpropertypro.com/api/v1/webhooks/stripe`),
   subscribed to the same events as the test endpoint. Copy its `whsec_…`.
2. Update all three in Vercel production:
   - `STRIPE_SECRET_KEY` → `sk_live_…`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` → `pk_live_…`
   - `STRIPE_WEBHOOK_SECRET` → the new live endpoint's secret
   Use `--no-sensitive` — a sensitive var is written back by `vercel pull` as the
   literal `[SENSITIVE]` and then **inlined into the build**.
3. **Redeploy.** The publishable key does not take effect otherwise.

### 4. Clear the stale test-mode ids

Test-mode `cus_…` / `sub_…` values are now dangling pointers. Left in place they
fail *quietly*: subscription webhooks match nothing and no-op, `/billing/portal`
fails, and volume-discount sync throws `resource_missing`. Worst case is a
community still marked `subscription_status='active'` with no live subscription
behind it — an entitlement nothing will ever correct.

```bash
pnpm tsx scripts/remediate-stale-stripe-ids.ts
```

**Capture the dry-run output** — the `was status=…` column is the only record of
the prior values. Then:

```bash
pnpm tsx scripts/remediate-stale-stripe-ids.ts --apply --i-understand-this-clears-billing-state
```

Only ids Stripe explicitly reports as `resource_missing` are touched; any other
error aborts rather than being mistaken for staleness.

### 5. Verify

```bash
pnpm tsx scripts/verify-stripe-mode.ts
```

Every check must read `pass`. **`unknown` is not a pass** — it means a surface
could not be verified, and the script exits non-zero on it deliberately.

`STRIPE_WEBHOOK_SECRET` always reports `unknown`: `whsec_` carries no mode
marker, so it cannot be checked offline. Confirm by hand in the dashboard that
the endpoint is live-mode and its URL is this environment, then send a test event
from the dashboard and confirm a 200.

### 6. End-to-end, with a real card

Test-mode cards do not work against live keys. Do one real subscription purchase
and then refund it. This is the only way to prove the whole path — checkout,
webhook signature, provisioning, plan stamping — is live-correct.

---

## Rollback

Steps 1 and 2 create Stripe objects and are **not** reversible: Stripe Products,
Prices and Coupons can be deactivated but never deleted. They are harmless if
unused.

Steps 3–4 are reversible: restore the three env vars, redeploy, and re-run
`seed-stripe-test-prices.ts` against a local database. Step 4's data changes are
**not** automatically reversible — restore from the captured dry-run output.

## Related

- `scripts/verify-stripe-mode.ts` — the preflight; run it before and after
- `docs/signup-checkout-provisioning.md` — how the signup → checkout → provisioning path works
- *Webhook Failures* in `docs/DEPLOYMENT.md` — why local dev must not share this endpoint

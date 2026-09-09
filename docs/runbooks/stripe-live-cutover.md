# Runbook: Stripe test → live cutover

Moving a deployment from test-mode Stripe keys to live ones.

**Production serves test-mode keys today.** Measured 2026-09-08 by reading the
publishable key out of the deployed bundle:

```bash
chunk=$(curl -s https://www.getpropertypro.com/signup/checkout \
  | grep -oE '/_next/static/[^"]+signup/checkout/page-[a-f0-9]+\.js' | head -1)
curl -sg "https://www.getpropertypro.com$chunk" \
  | grep -oE 'pk_(test|live)_[A-Za-z0-9]{6}'
# -> pk_test_51Syt6      (re-run 2026-09-09)
```

Two steps, not one: the chunk hash changes every build, so the path must come out of the
HTML. A fixed `page-*.js` URL does **not** work — `curl -g` disables globbing, so the
literal `*` is sent and the server returns 404. An earlier revision of this runbook
printed exactly that, with output pasted from a different invocation.

(An earlier note said this "cannot be answered from outside". It can — but only
from the route chunk, not the page HTML: the key is read inside a `'use client'`
component that Stripe.js loads lazily, so a grep over the served HTML or the
shared chunks finds nothing. Get the chunk path out of the HTML first.)

So checkout **works** and **takes no money**. This is scheduled work, not an
outage.

> **This is not a single env-var change.** Stripe mode lives in several
> independent places, and flipping one leaves the environment in a mixed state
> that fails every checkout. Work through the steps in order.

---

## Why it is four things, not one

| Surface | Where | Changing it needs |
|---|---|---|
| Secret key | `STRIPE_SECRET_KEY` | env update on **two** Vercel projects — see below |
| Publishable key | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | env update **+ redeploy** — it is inlined into the client bundle at build time |
| Price ids | `stripe_prices` table (10 rows) | `seed-stripe-live-prices.ts` |
| Webhook secret | `STRIPE_WEBHOOK_SECRET` | a **new endpoint** in the Stripe dashboard; live and test endpoints are separate registrations with separate secrets |

Objects do not cross the boundary: every `cus_…`, `sub_…`, `price_…` and coupon
created in test mode is invisible to a live key, and vice versa.

**`STRIPE_SECRET_KEY` lives on two Vercel projects, not one.**
`apps/admin/src/lib/stripe.ts:13` reads it, for
`POST /api/admin/demos/[id]/convert` — the console's demo→paying-customer
conversion. Update `property-pro-admin` as well as `property-pro-web`, or that
one route keeps minting **test-mode** subscriptions against a live web app,
which is precisely the dangling-entitlement state step 4 exists to clean up.
(`DEPLOYMENT.md`'s env table marks this "Server only" and does not say "both
apps", unlike the other cross-app rows.)

## The two mistakes that are easiest to make

1. **Forgetting the publishable key needs a redeploy.** Updating it in Vercel
   without rebuilding leaves the old value baked into the served bundle. Checkout
   then initialises with a test-mode publishable key against a live-mode session
   and fails in the browser, where server logs will not show you why. (In this
   deploy model *no* env var reaches a running deployment — `deploy.yml:31-34`
   bakes them in at `vercel pull` + `vercel build`. The publishable key is
   singled out only because its failure is client-side and silent.)
2. **"Helpfully" updating the CI repository secret.**
   `.github/workflows/stripe-e2e.yml` **refuses** a non-`sk_test_` key. That is
   correct: the E2E suite must keep running against test mode. After cutover the
   repo secret and the production env var are *supposed* to differ.

---

## Prerequisites

Confirm all of these before step 0. None is checked by any script here.

- [ ] **The Stripe account is activated for live payments** — business details,
      bank account, identity verification. Until it is, `sk_live_…` exists but
      every charge is refused. Nothing in this repo records whether this is done.
- [ ] **You have the live secret and publishable keys** from the Stripe
      dashboard (Developers → API keys, with the test-mode toggle **off**).
- [ ] **The live Customer Portal is configured** (Settings → Billing → Customer
      portal, in live mode). It is a per-mode dashboard object with no API
      equivalent in this codebase — `stripe.billingPortal.sessions.create` throws
      until it exists, so `/billing/portal` 500s for every community. Nothing
      creates it and nothing verifies it.
- [ ] **Not concurrent with a migration or a data repair.** A lock wait can
      outrun a route's `maxDuration`.

**Run everything below from the primary checkout**
(`~/Documents/Coding/PropertyPro`), not a worktree — the scripts need
`.env.local`, and `scripts/setup.sh` only symlinks it there.

---

## How the environment reaches these scripts

**Read this before step 0. It is the trap that stops most attempts.**

The scripts load no env of their own. `scripts/with-env-local.sh` is the repo's
standard way to reach the production database — but it sources `.env.local`
under `set -a`, which **clobbers anything you exported on the command line**.
The wrapper says so itself, at the `NEXT_PUBLIC_APP_URL` override. So:

```bash
# WRONG — silently runs with .env.local's TEST key, no warning:
STRIPE_SECRET_KEY=sk_live_… scripts/with-env-local.sh pnpm tsx scripts/seed-stripe-live-prices.ts
```

Export the live key **after** sourcing, and keep it in one shell for the whole
cutover:

```bash
cd ~/Documents/Coding/PropertyPro
set -a; source .env.local; set +a          # prod DATABASE_URL
export STRIPE_SECRET_KEY='sk_live_…'       # AFTER the source — this is the whole trick
```

Do not put the live key in `.env.local`. It is what local dev, `seed:demo` and
the E2E suite read, and none of them is mode-guarded.

---

## Procedure

Every step is idempotent and safe to re-run. Stop at the first failure.

### 0. Baseline — confirm the current state is coherent

```bash
set -a; source .env.local; set +a
pnpm tsx scripts/verify-stripe-mode.ts
```

The env line is **required**. Without it the script does not run at all: it
imports `@propertypro/db`, which throws `Missing DATABASE_URL` at module load,
before any check executes — a drizzle stack trace that reads like a database
fault rather than a missing variable.

**This script always exits 1.** `webhookSecretCheck` returns `unknown` whenever
the secret is set, `isFailing` counts anything that is not `pass` as failing, and
the check is pushed unconditionally — so there is no configuration, before or
after cutover, in which it exits 0. Read the **table**, not the exit code. The
`STRIPE_WEBHOOK_SECRET` row is a permanent manual-confirmation item.

Note it reports on **your shell's** env, which is `.env.local` — not on what
Vercel Production serves. For the deployed publishable key, use the `curl` at the
top of this file.

### 0.5. Capture the current price ids

Step 1 upserts on `(plan_id, community_type, billing_interval)` and **overwrites
all ten rows in place**. Nothing else records the prior ids, and the rollback
below needs them.

```bash
psql "$DATABASE_URL" -c "\copy (select plan_id, community_type, billing_interval, stripe_price_id, unit_amount_cents from stripe_prices order by 1,2,3) to 'stripe_prices_before_cutover.csv' csv header"
```

### 1. Create the live catalog

Dry-run first. The dry run reaches Stripe (it looks up each `lookup_key`) but
writes nothing, to neither Stripe nor the database:

```bash
pnpm tsx scripts/seed-stripe-live-prices.ts
```

Read the table, and check the database host it prints. Then:

```bash
pnpm tsx scripts/seed-stripe-live-prices.ts --apply --i-understand-this-creates-live-billing-objects
```

Prices are matched by `lookup_key`, so re-running reuses rather than duplicating.
The script refuses to run with anything but an `sk_live_`/`rk_live_` key.

> **A changed price is not repriced.** `ensurePrice` reuses any active price
> matching the `lookup_key` and does not compare amounts, while the DB row is
> written from the catalog either way. If you ever change a plan's price, the
> two disagree silently. Not a concern for a first cutover — the catalog and
> `PLAN_MONTHLY_PRICES_USD` currently agree at $199 / $349 / $499.

> After this step the database holds **live** price ids while the deployment may
> still be serving **test** keys. Checkout is broken until step 3. Keep the window
> short, or do steps 1–3 in one sitting.

### 2. Volume-discount coupons

Coupon ids are fixed strings but the coupon **objects** are per-mode and do not
exist in the live account until created:

```bash
pnpm tsx scripts/seed-volume-coupons.ts
```

**This writes immediately** — there is no dry run and no `--apply`, unlike steps
1 and 4. It prints the key mode first; check that line says `live` before letting
it finish. Three coupons: `volume_10pct`, `volume_15pct`, `volume_20pct`.

Skipping this does more than lose a discount. `applyVolumeDiscount` removes the
existing discount before applying the new one, and the cancel path runs after the
subscription is already cancelled — so a missing coupon surfaces as a 500 on an
operation that has already half-completed.

### 3. Rotate the keys and the webhook

1. In the Stripe dashboard, create a **live-mode** webhook endpoint pointing at
   `https://www.getpropertypro.com/api/v1/webhooks/stripe`, subscribed to the
   nine events the route actually handles
   (`apps/web/src/app/api/v1/webhooks/stripe/route.ts:588-629`):

   | | |
   |---|---|
   | `checkout.session.completed` | `checkout.session.expired` |
   | `customer.subscription.created` | `customer.subscription.updated` |
   | `customer.subscription.deleted` | `invoice.payment_action_required` |
   | `invoice.payment_failed` | `invoice.payment_succeeded` |
   | `price.updated` | |

   Copy its `whsec_…`.
2. Update the env vars in Vercel production — `--no-sensitive`, because a
   sensitive var is written back by `vercel pull` as the literal `[SENSITIVE]`
   and then **inlined into the build**:
   - `property-pro-web`: `STRIPE_SECRET_KEY`,
     `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
   - `property-pro-admin`: `STRIPE_SECRET_KEY`
3. **Redeploy both.** Env changes never reach a running deployment.

   ```bash
   gh workflow run deploy.yml --ref main
   ```

   `deploy.yml` deploys web and admin from one run. A `workflow_dispatch`
   **skips the Integration Tests gate** (`deploy.yml:82` gates on
   `github.event_name == 'push'`), by design — so it ships whatever is currently
   on `main`. Confirm `main` is in a state you want deployed before running it.

### 4. Clear the stale test-mode ids

Test-mode `cus_…` / `sub_…` values are now dangling pointers. Left in place they
fail *quietly*: subscription webhooks match nothing and no-op, `/billing/portal`
fails, and volume-discount sync throws `resource_missing`.

```bash
pnpm tsx scripts/remediate-stale-stripe-ids.ts
```

**Capture the dry-run output.** The `detail` column's `was status=… plan=…` text
is the only record of the prior values, and the billing-group rows record only a
*count* of the communities they detach — if you need to reverse that, list them
first:

```sql
select bg.id, bg.name, c.id as community_id
  from billing_groups bg
  join communities c on c.billing_group_id = bg.id and c.deleted_at is null
 where bg.deleted_at is null;
```

Then:

```bash
pnpm tsx scripts/remediate-stale-stripe-ids.ts --apply --i-understand-this-clears-billing-state
```

Only ids Stripe explicitly reports as `resource_missing` are touched; any other
error aborts rather than being mistaken for staleness. The script now **refuses a
test key** — without that guard, running it through `with-env-local.sh` before
the cutover reports a cheerful "nothing to remediate" (every test id resolves)
and accomplishes nothing, and running it *after* the cutover with the test key
still in `.env.local` would null real billing state on every paying community.

Two consequences worth knowing before you run it:

- **Nulling `subscription_plan` widens entitlement, it does not remove it.**
  `getEffectiveFeatures` fail-opens on a null plan (`get-features.ts:50`,
  `// fail-open for demos`) and returns the full community-type feature set. For
  the three seeded demo communities that is harmless and `pnpm seed:demo`
  restores their plans; for a real paying community it would be a free upgrade.
- **A valid customer id is cleared when the subscription id is merely absent.**
  `subscriptionMissing` defaults to `true` for a null `stripe_subscription_id`,
  so a community with a resolvable customer and no subscription is swept up. No
  production row is in that state today (checked 2026-09-08).

### 5. Verify

```bash
pnpm tsx scripts/verify-stripe-mode.ts
```

As in step 0, **exit 1 is expected and unavoidable** — read the table. What you
want to see: `STRIPE_SECRET_KEY` and the publishable key both `pass` and naming
`live`; every price row resolving; zero stale ids; and the
`STRIPE_WEBHOOK_SECRET` row `unknown`.

`whsec_` carries no mode marker, so that last one cannot be checked offline.
Confirm by hand in the dashboard that the endpoint is live-mode and its URL is
this environment, then send a test event from the dashboard and confirm a 200.

Remember this reads your shell, not Vercel. The deployed publishable key is the
`curl` at the top of this file; the deployed secret key can only be confirmed in
the Vercel dashboard.

### 6. End-to-end, with a real card

Test-mode cards do not work against live keys, so this needs a real one.

**There is nothing to refund on the way in.** Signup creates the subscription
with `trial_period_days: 30` (`stripe-service.ts:151-152`), so the first invoice
is **$0** and no money moves for a month. What one real signup does prove:
the live publishable key initialises Stripe.js, the card is accepted, the
webhook signature verifies, the community is provisioned and the plan is stamped.

To prove an actual **charge** without waiting 30 days, end the trial on that one
subscription from the Stripe dashboard (Subscriptions → the subscription →
*End trial*). That bills immediately; refund the resulting invoice and cancel.

---

## Rollback

Steps 1 and 2 create Stripe objects and are **not** reversible: Stripe Products,
Prices and Coupons can be deactivated but never deleted. They are harmless if
unused.

Step 1's **database** write is reversible only from the CSV captured in step 0.5.
`seed-stripe-test-prices.ts` cannot do it — it calls `assertLoopbackDatabase` and
refuses any non-loopback host, production included. Restoring means writing the
ten ids back by hand.

Steps 3 is reversible: restore the env vars on both projects and redeploy.
Step 4's data changes are **not** automatically reversible — restore from the
captured dry-run output and the billing-group query above.

## Related

- `scripts/verify-stripe-mode.ts` — the preflight; run it before and after
- `docs/signup-checkout-provisioning.md` — how the signup → checkout → provisioning path works
- *Webhook Failures* in `docs/DEPLOYMENT.md` — why local dev must not share this endpoint

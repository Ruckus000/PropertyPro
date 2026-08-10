# Signup → Stripe Checkout → provisioning → trialing

What happens between "someone clicks a plan" and "a community exists", how to
run the flow end to end yourself, and what to do when a real customer's payment
goes wrong.

Verified end to end against Stripe test mode and a local Supabase stack on
2026-08-09, and through trial end via a Stripe test clock on 2026-08-10 — the
first time this path had ever been exercised whole, by CI or by a human. Four
defects were found doing it; all four are fixed and are described below, because
each one tells you something about how the flow fails.

---

## 1. The flow

```
POST /api/v1/auth/signup
      │  creates pending_signups (status=pending_verification)
      │  creates the Supabase auth user (admin generateLink)
      ▼
email confirmed  →  POST /api/v1/auth/confirm-verification
      │  status=email_verified
      ▼
/signup/checkout?signupRequestId=…
      │  server action createCheckoutSession()
      │  resolveStripePrice(plan, communityType, interval) reads stripe_prices
      │  status=checkout_started, payload.stripeCheckoutSessionId stored
      ▼
Stripe Embedded Checkout  (test card 4242 4242 4242 4242)
      ▼
webhook checkout.session.completed
      │  markPendingSignupPaymentCompleted()  → status=payment_completed
      │  insertProvisioningJobFence()         → provisioning_jobs (initiated)
      │  runProvisioning(jobId)               → awaited, so Stripe retries on 500
      ▼
runProvisioning state machine — each step idempotent, resumes from
lastSuccessfulStatus:
   community_created → user_linked → checklist_generated → categories_created
   → preferences_set → email_sent → completed
      ▼
/signup/checkout/return  → ProvisioningProgress polls
/api/v1/auth/provisioning-status, auto-logs-in, redirects
      ▼
community: subscription_status=trialing, subscription_plan=<purchased plan>
```

The founding user gets `root_manager` (creator-is-root, ADR-006 §3.5(a)). The
trial is `SIGNUP_TRIAL_DAYS` (30) and the first invoice is **$0**.

### The two recovery passes

`/api/v1/internal/provisioning-watchdog` (cron) runs two disjoint passes:

| Pass | Finds | Mechanism |
|---|---|---|
| `recoverStuckProvisioningJobs` | a job exists but is stale/failed | resumes `runProvisioning` |
| `reconcileLostCheckoutSignups` | **no** job row — the webhook was lost | asks Stripe whether the session is `complete`, then drives the same helpers the webhook does |

They are kept disjoint by a `NOT EXISTS` on `provisioning_jobs`, because the
first pass INNER JOINs jobs and so cannot see a lost-webhook signup at all.

---

## 2. Defects found and fixed (2026-08-09)

### 2.1 A provisioned community had no plan

**Symptom.** The watchdog recovered two stranded signups in production
(communities 2358/2359) and both landed with `subscription_plan = null` despite
`pending_signups.plan_key = 'professional'`. A community with a null plan gates
as unplanned — a paying customer locked out of what they bought.

**Cause.** `stepCommunityCreated` never wrote the plan. The plan was set
*only* by `customer.subscription.created/updated`, which resolves its community
through `stripe_subscription_id` — a link that does not exist until the community
row is inserted. Stripe does not order `checkout.session.completed` against
`customer.subscription.created`, so:

- **normal signup**: if the subscription event wins the race it finds no
  community and is dropped silently; nothing re-stamps until the next
  subscription update, which for a trialing subscription is the end of the trial;
- **watchdog recovery**: certain, not merely likely — recovery happens minutes to
  hours later, when every subscription event has long been dropped.

The same race was already known and closed on the *existing-community* upgrade
path (`persistSelfServeCommunityStripeIds` stamps the plan at
`checkout.session.completed`, with a comment saying exactly this). Only the
new-community path was missed.

**Fix.** `stepCommunityCreated` stamps `subscriptionPlan` from
`pending_signups.plan_key`, normalised through `resolvePlanId` so a legacy alias
maps and an unrecognised key is left unset rather than written verbatim. Because
the INSERT is `onConflictDoNothing`, the existing-row branch also backfills the
plan when it is null — that is what repairs a community created by a pre-fix run
on the next retry. Guarded on `IS NULL` so a later upgrade/downgrade is never
reverted.

**Proven live**, not just in unit tests: a checkout was completed with the
webhook forwarder stopped, so no Stripe event was ever delivered; the watchdog
then created the community with `subscription_plan = professional`. Before the
fix the plan could only have come from a subscription event — of which there
were none.

**Existing rows** (2358/2359 and anything like them) are NOT repaired by the
watchdog, because their jobs already reached `completed` and are never re-run.
Use the one-shot:

```bash
scripts/with-env-local.sh pnpm tsx scripts/repair-null-subscription-plan.ts
```

Dry-run by default; `--apply` to commit. It only touches communities with a live
billing status and a null plan, re-asserts `IS NULL` in the UPDATE, and reports
(without failing on) communities that have no `pending_signups` row — PM-created
and demo-converted communities legitimately have none and need a human to pick a
plan.

### 2.2 A brand-new trial was recorded as `active`

**Symptom.** Two identical signups landed `trialing` and `active` respectively.
The "Free trial active" banner vanished for the second, and its trial-end date
was wrong. It read as a flaky test.

**Cause.** A trialing subscription's first invoice is $0 and Stripe *still*
emits `invoice.payment_succeeded` for it. The handler wrote a hardcoded
`subscription_status = 'active'`, ending the trial in our database seconds after
it started. Whether it happened depended on webhook arrival order.

**Fix.** `handleInvoicePaymentSucceeded` retrieves the subscription and writes
its real status; `markCommunityPaymentSucceeded` now *requires* the status
rather than defaulting it, so the assumption cannot be reintroduced by omission.
"Payment succeeded" now means only what it says: not failed.

### 2.3 The renewal date froze at the trial end (found 2026-08-10)

**Symptom.** After a trial converted, `communities.subscription_current_period_end_at`
still held the trial-end date — a date in the past — and it never advanced,
because every later renewal recomputed the same value.

**Cause.** `resolveSubscriptionPeriodEndAt` preferred `trial_end` whenever it was
a number. Stripe does **not** clear `trial_end` when a trial converts; it stays
on the subscription as a historical fact. Measured on a test clock advanced past
trial end: subscription `active`, real period end **2026-10-09**, `trial_end`
still **2026-09-09** — and 2026-09-09 was what we stored.

**Fix.** Prefer `trial_end` only while `status === 'trialing'`, otherwise use the
item's `current_period_end`. Gating on Stripe's status rather than on "is
`trial_end` in the future" is deliberate: the status is the authority on whether
a trial is running, and a date comparison would also depend on clock skew.

This one is only visible in the database or on a renewal-date UI — a date is a
date, so nothing looks broken until a customer reads it.

### 2.4 The E2E could never have passed

`signup-trialing.spec.ts` existed but had never run. Three things in
`fillStripeEmbeddedCheckout` were wrong, and each failed in a way that pointed
somewhere else:

1. **The card form is not mounted on arrival.** Checkout renders a collapsed
   payment-method accordion and mounts an item's fields only when it is
   selected, so waiting for a card field waits forever. It must also be expanded
   *repeatedly* until it stays expanded — Checkout keeps initialising and a
   re-render discards an early click.
2. **The submit button must be found by test id.** A `/pay/i` name regex matches
   the invisible `aria-label="Pay with card"` accordion header first, producing
   30s of "element is not visible" against a button that was never the target.
   Use `data-testid="hosted-payment-submit-button"`.
3. **A required phone field silently blocks submission.** This account collects a
   phone number. Submitting an invalid form makes Stripe do *nothing* — no error,
   no navigation, no network call. The symptom was a timeout on the return URL
   with zero webhooks forwarded, which looks exactly like a dead webhook.

---

## 3. Running it yourself

Needs Stripe **test-mode** keys and a **local** Supabase stack. The spec refuses
to run against the known production Supabase ref, and refuses a non-`sk_test_`
key — do not defeat either; it creates real auth users and communities.

The trial-end spec additionally needs no setup beyond the above — it creates and
advances its own Stripe test clock.

```bash
# 1. Local Supabase (auto_expose_new_tables = true under [api] in config.toml)
supabase start
scripts/with-env-local-demo-db.sh pnpm --filter @propertypro/db db:migrate

# 2. Real test-mode Products/Prices, and point stripe_prices at them.
#    Idempotent; refuses a live key or a non-loopback DATABASE_URL.
scripts/with-env-local-demo-db.sh pnpm tsx scripts/seed-stripe-test-prices.ts --apply

# 3. Forward webhooks. --api-key avoids needing `stripe login`.
stripe listen --api-key sk_test_… --forward-to localhost:3000/api/v1/webhooks/stripe
#    Put the printed whsec_… in STRIPE_WEBHOOK_SECRET and RESTART the dev server:
#    it is read at boot, and a stale one makes every webhook 400.

# 4. Run
E2E_STRIPE=1 pnpm --filter @propertypro/web exec playwright test \
  -c playwright.config.ts e2e/signup-trialing.spec.ts e2e/signup-failure-paths.spec.ts \
  e2e/signup-trial-end.spec.ts
```

If another checkout already runs a Supabase stack, start your own on shifted
ports rather than sharing one: a stack torn down mid-run by another session
surfaces as `subdomain.check.db_failure` and a 400 from `/api/v1/auth/signup`,
which looks like a validation bug rather than a missing database.

If :3000 is taken by another worktree, set `PLAYWRIGHT_WEB_PORT` (and forward
webhooks to that port). `reuseExistingServer` is always on, so without this
Playwright silently attaches to the other checkout's server and tests another
branch's code.

Both specs skip — not fail — when the env is absent, so the default suite stays
green.

### In CI

`.github/workflows/stripe-e2e.yml` runs all five specs against real Stripe test
mode: it starts a full local Supabase stack (Auth included — the Postgres stub
`integration-tests.yml` uses cannot serve `auth.admin.generateLink`), migrates,
seeds test-mode prices, forwards webhooks with the Stripe CLI, and runs
Playwright.

It is **not a required check**, on purpose: it is the only suite that depends on
a third-party API, so making it gate merges would block unrelated PRs whenever
Stripe has a blip. It runs on PRs touching billing/signup code, nightly, and on
demand.

Two repository secrets enable it — `STRIPE_SECRET_KEY` (must be `sk_test_…`; a
live key is refused) and `STRIPE_PUBLISHABLE_KEY`. Without them the job reports
"not configured" in the run summary and exits 0, which is also what fork PRs do.

The job **fails if the specs skipped** while the secrets were present. That
guard is the point: these specs self-skip on missing env, which is right locally
and would be a lie in CI — a green run that exercised nothing is the exact
failure mode that let four defects live in this path through a fully green CI.

### What is covered

| Spec | Asserts |
|---|---|
| `signup-trialing` | full path to `trialing`; then that a **second signup with the paid email is refused** (400, "already exists") — otherwise a paying customer can buy a second community |
| `signup-failure-paths` | declined card (`4000 0000 0000 0002`) provisions nothing; abandoned checkout provisions nothing; a duplicate signup *before* payment may resubmit |
| `signup-trial-end` | day 30 via a Stripe **test clock**: trial expires, the first REAL invoice is charged, the community becomes `active`, and it keeps both its plan and a correctly-advanced renewal date |

---

## 4. When a real customer's payment goes wrong

**First, find where they stopped.** `pending_signups.status` is the state
machine's own answer:

| status | Meaning | Action |
|---|---|---|
| `pending_verification` | never confirmed their email | resend verification; nothing was charged |
| `email_verified` | reached pricing, never opened checkout | nothing was charged |
| `checkout_started` | **ambiguous — see below** | check Stripe before anything else |
| `payment_completed` / `provisioning` | paid; provisioning unfinished | the watchdog owns this; see below |
| `completed` | done | look at the community row instead |

**`checkout_started` means one of two very different things.** Either they
abandoned checkout, or they paid and the webhook was lost. Do not guess — the
reconciler doesn't either: it retrieves the session and gates on
`status === 'complete'` (a trial completes as `no_payment_required`, so gate on
the session status, not the payment status). A declined card also leaves this
state, and leaves a Stripe **customer** behind — *a customer existing in Stripe
is not evidence that anyone paid.*

**To recover a paid-but-unprovisioned signup**, run the watchdog rather than
doing anything by hand — it is idempotent and uses the same helpers as the
webhook:

```bash
curl -X POST https://<host>/api/v1/internal/provisioning-watchdog \
  -H "Authorization: Bearer $CRON_SECRET"
```

It returns counts for both passes. `reconcile.skippedNotComplete` counts
genuinely-abandoned checkouts and is expected to be non-zero. A recovered
community now arrives with its plan (§2.1).

**Things that will mislead you:**

- **A green webhook dashboard is not proof of provisioning.** The webhook can
  succeed and the community still be wrong — both plan defects above happened
  with 200s on every delivery.
- **`subscription_plan = null` on a live community is a bug, not a state.**
  Anything billing must have a plan; the repair script is in §2.1.
- **A "customer exists in Stripe" tells you nothing.** Declines create customers.
- **`stripe_prices` holds ids from ONE Stripe mode.** If the key and the stored
  ids disagree, checkout dies in `resolveStripePrice` with `STRIPE_MODE_MISMATCH`
  and the page says only "Unable to start checkout". A local seed leaves
  `price_placeholder_…` ids, which no account can resolve.
- **Never point a non-local database at test-mode price ids.** The seeding script
  refuses to, because a live key cannot resolve a test price — that would break
  checkout for every real customer at once.

**Escalation signals already wired to Sentry:** `provisioning_reconcile_failed`,
`provisioning_watchdog_failed_jobs`, `provisioning_watchdog_orphan_communities`
(live billing with no admin role — the watchdog cannot guess an owner, so these
always need a human).

# Pre-Launch Readiness Audit — 2026-08-07

> ## Remediation status (same day)
>
> Everything below was found by the audit; most of it is now **fixed**. See
> "Remediation log" at the end of this document for what changed, what it was
> verified against, and what is still yours to do.
>
> | Finding | Status |
> |---|---|
> | B1 crons 401ing | **Fixed** — all 15 verified 200 via GET on a local stack; root cause was 4 stacked faults, not 1 |
> | B2 GitHub cron workflows | **Fixed** — consolidated onto Vercel Cron; 5 workflows deleted |
> | B3 Supabase free plan / no backups | **OPEN — yours.** Upgrade to Pro + PITR before onboarding a real association |
> | B4 monitoring | **Partly fixed** — readiness now reports missing secrets; Sentry environment separated. Uptime monitor is yours |
> | B5 rate limiter | **Fixed** — pages no longer IP-throttled, auth tier on Redis, HTML 429 |
> | B6 prod test data | **Fixed** — 1,623 orphan users removed (backed up), 4 junk communities soft-deleted |
> | B7 DMARC | **OPEN — yours.** DNS record only you can publish |
> | H1 OTP secret | **Fixed** — fallback removed, real secret set in production |
> | H2/H3 TOKEN_ENCRYPTION_KEY, STRIPE_CONNECT_CLIENT_ID | TOKEN_ENCRYPTION_KEY **set**; Stripe Connect id is yours to supply |
> | H4 Stripe live-vs-test | **OPEN — yours.** Cannot be read from here |
> | H5 rotted E2E test | **Fixed** — suite now 28 passed / 0 failed |

**Question asked:** what must be fixed before PropertyPro goes live with real Florida associations?

**Short answer:** the *code* is in good shape. The *production environment* is not.
Every finding below that blocks launch is an operations/configuration gap, not a bug in
the application. The largest one — every scheduled background job has been failing
authentication in production — is invisible from inside the app and reports green in CI.

## How this was verified

Not a code read. A live environment was stood up and exercised:

- Full local Supabase stack (`supabase start`, ports shifted to 545xx to avoid an
  unrelated running project), all migrations applied, `pnpm seed:demo` + `seed:verify` green.
- Web + admin dev servers pointed at that stack via `scripts/with-env-local-demo-db.sh`
  semantics (loopback Postgres **and** loopback Supabase — never production).
- **427 authenticated page loads** — 61 routes × 7 roles (`cam`, `board_president`,
  `owner`, `tenant`, `founding_admin`, `site_manager`, `pm_admin`), throttled under the
  rate limiter, bodies scanned for error boundaries.
- All 14 `/mobile` routes.
- Signup → email-verification path driven end to end, including a deliberate
  duplicate-submit to test idempotency.
- Playwright E2E suite (31 tests) run locally — CI only ever runs 3 of them.
- `pnpm typecheck`, `pnpm test` (11,344 unit tests), all 22 architectural guards,
  production `pnpm build`.
- Production probed read-only: HTTP surfaces, security headers, Vercel runtime logs,
  Vercel cron registry, Supabase advisors + schema/row counts, Sentry, email DNS.

Nothing was written to production. Two probes (POSTing to prod cron endpoints, pulling
prod env values) were blocked by the sandbox; both are flagged below as things **you**
must confirm.

---

## BLOCKERS — do not onboard a real property until these are done

### B1. All 10 Vercel cron jobs have been failing with 401 on every single run

This is the biggest finding, and it is completely silent.

**Evidence.** Vercel production runtime logs, last 24 hours, 401s grouped by path:

| path | 401s in 24h |
|---|---|
| `/api/v1/internal/provisioning-watchdog` | 24 (hourly) |
| `/api/v1/internal/coupon-sync-retry` | 1 |
| `/api/v1/internal/revenue-snapshot` | 1 |
| `/api/v1/internal/payment-reminders` | 1 |
| `/api/v1/internal/expire-demos` | 1 |
| `/api/v1/internal/account-lifecycle` | 1 |
| `/api/v1/internal/late-fee-processor` | 1 |
| `/api/v1/internal/compliance-alerts` | 1 |
| `/api/v1/internal/assessment-overdue` | 1 |

That is every cron in `apps/web/vercel.json` that was due to fire. Corroborating:
`revenue_snapshots` in production has **0 rows** despite a daily 02:00 schedule.

**Root cause.** Vercel Cron authenticates by sending `Authorization: Bearer $CRON_SECRET`,
and only sends the header at all when `CRON_SECRET` is set. **`CRON_SECRET` is not set in
Vercel production.** So no header arrives, and `requireCronSecret`
([cron-auth.ts:27](apps/web/src/lib/api/cron-auth.ts:27)) correctly fails closed.

There is a second, independent mismatch underneath it: each route validates its *own*
secret name (`PAYMENT_REMINDERS_CRON_SECRET`, `ASSESSMENT_CRON_SECRET`, …), which Vercel
would never send even once `CRON_SECRET` exists. Three of those per-route secrets are also
simply absent from production: `ACCOUNT_LIFECYCLE_CRON_SECRET`,
`COUPON_SYNC_RETRY_CRON_SECRET`, `REVENUE_SNAPSHOT_CRON_SECRET`.

**What has therefore never run in production:** payment reminders, late-fee processing,
monthly assessment generation, overdue-assessment alerts, compliance alerts, demo expiry,
the account-deletion lifecycle, coupon-sync retry, the provisioning watchdog (which is
what retries a stuck signup), and revenue snapshots.

The account-deletion one deserves separate attention: deletion requests have a
`cooling_ends_at` / `scheduled_purge_at` lifecycle that nothing is advancing. If you
promise a deletion SLA, you are not currently meeting it.

**Fix.** Set `CRON_SECRET` in Vercel production, and make every `/api/v1/internal/*` route
accept it (simplest: `requireCronSecret(req, process.env.X_CRON_SECRET ?? process.env.CRON_SECRET)`,
the pattern `coupon-sync-retry` and `provisioning-watchdog` already use). Then verify by
watching for a 200 in the runtime logs at the next tick — do not assume.

### B2. Two GitHub-scheduled jobs skip silently; two have never run

- **`Visitor Auto Checkout`** (hourly) and **`Calendar Event Reminders`** (every 15 min)
  emit `::warning::Skipping … because required secrets are not configured` and `exit 0`.
  They show a green check having done nothing. Confirmed in the actual run logs.
- **`Notification Digest`** and **`Insurance Alerts`** have **no run history at all**.

Missing GitHub repo secrets: `VISITOR_AUTO_CHECKOUT_CRON_BASE_URL`/`_SECRET`,
`CALENDAR_EVENT_REMINDERS_CRON_BASE_URL`/`_SECRET`, `DIGEST_CRON_BASE_URL`,
`NOTIFICATION_DIGEST_CRON_SECRET`, `INSURANCE_ALERTS_CRON_SECRET`.

**Fix.** Add the secrets, and change the guard from `exit 0` to `exit 1`. A scheduled job
that cannot do its work should go red, not green.

### B3. Supabase production is on the FREE plan — there are no backups

Organization plan is `free`. That means no daily backups, no point-in-time recovery, no
SLA. Current usage is small (31 MB database, 17 MB storage, 71 auth users), so this is not
a capacity problem yet — it is a **recoverability** problem.

You are about to store statutory records for Florida condominium associations under
§718.111(12)(g). A bad migration, an accidental cascade delete, or a bad import is
currently unrecoverable.

**Fix.** Upgrade to Pro and enable PITR *before* the first real community is onboarded.
This also lifts the storage and egress ceilings you will hit quickly once associations
start uploading document PDFs.

### B4. There is no production monitoring

Three separate gaps that compound:

1. **Sentry has recorded zero production-environment events in 90 days.** All 20 open
   issues are `environment: development` from a local machine
   (`server_name: Js-MacBook-Pro-2.local`), including errors whose stack traces point at
   other worktrees on your laptop. The production Sentry project is being used as a dev
   scratchpad, so real production errors would be buried even if they arrived.
   *(The client SDK is correctly wired — it lazy-loads via dynamic import, so its absence
   from the initial bundle is expected, not a defect. But that reporting has never been
   proven end-to-end from production.)*
2. **No uptime monitoring exists.** `deploy.yml` smoke-tests once at deploy time and
   never again. `/api/health` has no consumer — no cron, no external check.
3. **`/api/health` is shallow.** It returns `{"status":"ok"}` from a static handler
   without touching Postgres, Supabase, or Stripe. It would report healthy during a total
   database outage.

**Fix.** Fire a deliberate test error from production and confirm it lands in Sentry;
stop dev machines reporting into the production project; add an external uptime monitor
on both `www` and `admin` `/api/health`; make the health check actually check dependencies.

### B5. The rate limiter is in-memory, and it mis-classifies page navigations

`apps/web/src/lib/middleware/rate-limiter.ts` is a per-isolate `Map`, and says so in its
own header comment: *"Vercel Edge functions are ephemeral, so counters reset on cold
starts. This is intentionally lenient — production hardening can add Redis later."*

Three consequences:

- **The `auth` tier does not really protect anything.** 10 login attempts/min/IP is the
  credential-stuffing defense, and it resets per isolate, so the real ceiling is much
  higher and unpredictable.
- **Every authenticated page navigation is throttled at 60/min *per IP*.** In
  `classifyRoute`, anything not under `/api/` falls through to `public`, and
  `buildRateLimitKey` keys `public` by IP rather than by user. A management company office
  — several staff behind one NAT — shares a single 60/min budget, and Next.js link
  prefetching spends it fast. This is not theoretical: the project's own E2E suite trips
  it, and so did this audit's route sweep.
- **A tripped limit on an HTML navigation returns JSON.** `rateLimitedResponse` always
  sets `Content-Type: application/json`, so a rate-limited user sees a raw
  `{"error":{"code":"rate_limited"…}}` blob instead of a page.

**Fix.** `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are *already provisioned in
production* and unused by the limiter — back it with Redis. Key authenticated page
requests by user id, raise the page tier substantially, and return a styled HTML 429 for
navigation requests.

### B6. Production contains test and demo data

- **7 communities**, four of which are junk: `Test Condo Demo`, `Fake Apartment`,
  `Breakaway Apartments`, `Sunset Towers` (ids 133/134/135/147, all `subscription_status`
  null).
- **1,660 `public.users` rows, of which 1,621 have no `auth.users` counterpart** — 1,604
  `@example.com`, 7 `.local`, and **10 that look like real addresses**. These are residue
  from imports and integration-test runs.
- The three seeded demo communities are marked `subscription_status = active` on real
  paid plans, which will corrupt any revenue reporting the moment B1 is fixed and
  `revenue-snapshot` starts running.

**Fix.** Decide which demo communities are intentional, purge the rest, clean the orphaned
user rows (check those 10 real-looking addresses individually before deleting), and make
sure real associations are not co-mingled with seed data.

### B7. No DMARC record — bulk resident email will land in spam

Email authentication DNS for `getpropertypro.com`:

| record | status |
|---|---|
| DKIM (`resend._domainkey`) | ✅ present |
| SPF on `send.getpropertypro.com` (Resend's MAIL FROM) | ✅ `v=spf1 include:amazonses.com ~all` |
| **DMARC (`_dmarc`)** | ❌ **absent** |

SPF and DKIM are set up correctly in Resend's standard split layout. DMARC is the gap.
Since February 2024 Gmail and Yahoo require a DMARC record from bulk senders. The core
function of this product is emailing every resident of an association — invitations,
meeting notices, statutory announcements. Without DMARC those will be junked or rejected
at volume, and the failure is silent from your side.

Related: **`RESEND_FROM` is not set in production**, so
[send.ts](packages/email/src/send.ts) falls back to
`PropertyPro <noreply@getpropertypro.com>`. That is fine only if the apex is verified in
Resend — set it explicitly rather than relying on the fallback.

**Fix.** Publish `_dmarc` starting at `p=none; rua=…`, watch the aggregate reports, then
move to `p=quarantine`. Set `RESEND_FROM`. Send test mail to Gmail, Outlook and Yahoo and
check actual inbox placement before launch.

---

## HIGH — fix at or immediately after launch

### H1. `OTP_HMAC_SECRET` is unset in production and falls back to the literal `'dev-secret'`

[access-request-service.ts:40](apps/web/src/lib/services/access-request-service.ts:40):

```ts
const secret = process.env.OTP_HMAC_SECRET ?? 'dev-secret';
```

Access-request OTPs are 6 digits — a 10⁶ space. The HMAC secret is the only thing
preventing an attacker with read access to the stored hashes from precomputing the entire
table instantly. It is currently a known constant, identical across every deployment.
Set a real secret and consider removing the fallback so it fails closed.

### H2. `TOKEN_ENCRYPTION_KEY` is unset in production

`getTokenEncryptionKeyFromEnv()` throws `'TOKEN_ENCRYPTION_KEY is required'` when absent.
It is used by `calendar-sync-service` and `accounting-connectors-service`, so **Google
Calendar sync and accounting connectors will 500 in production**. Fails closed, so this is
broken-feature rather than insecure — but if either is in your launch scope, it is a
blocker.

### H3. `STRIPE_CONNECT_CLIENT_ID` is unset in production

[finance-service.ts:1560](apps/web/src/lib/services/finance-service.ts:1560). Stripe
Connect onboarding cannot complete, so `/settings/payments` → connected-account flow is
dead. Blocker if you are launching resident payment collection; safely deferred if not.

### H4. Confirm Stripe is in LIVE mode — I could not verify this

What I could confirm: real price IDs and amounts are configured
($199/$349/$499 monthly, plus annual at $1,990/$3,490/$4,990), and webhooks are healthy —
226 events received, **100% processed**, most recent 3 days ago.

What I could **not** confirm: whether `STRIPE_SECRET_KEY` and
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are test-mode or live-mode keys. Reading production
secret values was blocked, correctly. **Check this yourself before taking real money** —
a test-mode key means every subscription silently isn't real.

### H5. A test has already rotted behind the CI gap

`support-access.spec.ts:72` looks for `getByRole('button', { name: 'Support' })`, but the
admin client-workspace tabs render as `role="tab"`
([ClientWorkspace.tsx:153](apps/admin/src/components/clients/ClientWorkspace.tsx:153)). An
explicit `role` overrides the implicit one, so that query can never match — the spec fails
100% of the time, warm or cold. The underlying feature is fine (the Support tab is present
in the server HTML; this was verified directly).

The point is not the selector. CI runs 3 of 31 E2E specs, so a spec guarding the support
impersonation flow has been dead and nobody knew. Fix the selector, and get more of the
suite into CI now that a working local stack recipe exists.

---

## Verified healthy — stated because it was checked, not assumed

**Code quality is genuinely strong.** This is not the risk area.

- `pnpm typecheck` clean across 15 packages.
- **11,310 unit tests pass** (963 files, 27 skipped, 0 failures).
- **All 22 architectural guards pass** — including tenant-scope, db-access, legacy-roles,
  design-tokens, breadcrumbs, page-padding.
- Production build compiles successfully.
- **`pnpm perf:check` passes** against a real production build. Every route is under the
  700 KiB hard budget (largest: site-editor 660.6 KiB; web aggregate 835.9 KiB against a
  1,300 KiB ceiling). All routes do sit 2–3× above the 200 KiB *soft* target — worth
  attention for property managers on poor mobile connections, but warnings only, not a
  launch blocker.
- CI green on `main`; both web **and admin** deployed to production successfully tonight.

**Runtime behaviour is solid.**

- **427 authenticated page loads across 7 roles: zero 500s, zero error boundaries.** The
  only non-200s were correct permission redirects (`/pm/dashboard/communities/new` → 307
  for non-PM roles).
- All 14 `/mobile` routes return 200.
- E2E: 27 of 31 pass locally — 2 are deliberate `test.fixme` skips, 1 is H5, 1 was a
  rate-limit artifact of this audit's own traffic. `phase1-roadmap-smoke` passes in
  isolation.
- Signup works end to end, and **retry after a failed verification email is correctly
  idempotent** — it reuses the same auth user and `pending_signups` row rather than
  creating duplicates. This was tested deliberately.
- Public transparency site is live in production and serving §718.111 categories.

**Security posture is good.**

- Production response headers: CSP (no `unsafe-eval`, tight `connect-src`), HSTS with
  `preload`, `X-Frame-Options: DENY`, `nosniff`, `strict-origin-when-cross-origin`,
  `Permissions-Policy` locking camera/mic/geolocation. All present and sensible.
- **All four `/dev/*` routes are correctly `NODE_ENV`-guarded and return 404/redirect in
  production** — verified live against `www.getpropertypro.com`, not just read in source.
  There is no demo-login backdoor in production.
- Supabase security advisors: **no ERROR-level lints**. The 17 `rls_enabled_no_policy`
  entries are INFO and deliberate.
- `requireCronSecret` fails closed (which is why B1 is an availability problem, not an
  exposure one).

**The 2026-08-05 admin portal audit is essentially remediated.** This contradicts the
current project notes, which still describe apps/admin as not production-ready. Verified
fixed in current code: P0-1 (a `Deploy Admin to Production` job exists and succeeded),
P0-2 (sign-out reimplemented client-side), P0-3 (`throw new Response` removed), P0-4
(`error.tsx`, `global-error.tsx`, `not-found.tsx` all present), P0-5
(`requireAdminPageSession` now on both `clients` pages), P1-1 (support JWT dev-secret
fallback gone; secret required, min 32 chars, and set in production), P1-3 (security
headers applied), P1-6, P1-7, P1-8, P1-9, P1-11, P1-12. The stale note should be updated.

---

## Suggested order of work

1. **B1 + B2** — the crons. Highest impact, config-only, roughly an afternoon.
2. **B3** — Supabase Pro + PITR. Do this before any real data lands.
3. **H4, H1, H2/H3** — confirm Stripe mode; set `OTP_HMAC_SECRET`; set the other secrets
   if their features are in scope.
4. **B4** — monitoring. You cannot operate a paid service blind.
5. **B6** — clean production data before onboarding.
6. **B7** — DMARC. Publish early; the `p=none` observation window takes time.
7. **B5** — rate limiter onto Redis.
8. **H5** — fix the selector and widen E2E coverage in CI.

## Verification note

Every blocker above is falsifiable and worth re-checking after the fix rather than
assuming. Specifically: B1 is confirmed by a 200 (not a green workflow) in the Vercel
runtime logs at the next cron tick; B2 by a non-zero row count in the affected tables;
B7 by actual inbox placement at Gmail/Yahoo, not by the DNS record existing.

---

# Remediation log — 2026-08-07

## What the audit got wrong, corrected during implementation

Recorded because each one would have produced a fix that looked done and wasn't.

1. **The cron outage had FOUR stacked causes, not one.** The audit named the
   missing `CRON_SECRET`. Also true: Vercel Cron issues `GET` while 9 of 10
   routes exported `POST` only; their middleware token-auth allowlist entries
   were `POST`-only too (which is why logs showed 401 rather than 405); and four
   routes were absent from that allowlist entirely. Setting `CRON_SECRET` alone
   would have fixed **1 of 10**.
2. **A `?? CRON_SECRET` fallback would still have left 8 broken.** `??` only
   reaches the fallback when the per-route secret is *unset* — and the routes
   that were configured (payment reminders, assessments, compliance, …) would
   have kept rejecting the platform token. `requireCronSecret` now accepts **any**
   of several secrets. An existing test asserted the broken semantics
   ("rejects the fallback token when the coupon-specific secret is set"); it has
   been inverted with the reason recorded inline.
3. **The audit was half-wrong about health checks.** A comprehensive deep check
   already existed at `/api/v1/internal/readiness` (DB, Stripe prices, schema,
   Supabase auth, `REAUTH_JWT_SECRET`) with its secret already in production. It
   had no monitor pointed at it. Building a second endpoint was dropped;
   the existing one was extended instead.
4. **New finding — the `esign-sign` rate-limit tier was dead code.**
   `classifyRoute` returned it but neither middleware call site consumed it, so
   the unauthenticated e-sign endpoint — described in its own tier comment as "a
   high-value abuse target" — was never throttled. Now wired in.
5. **New finding — local dev was writing rate-limit state to PRODUCTION Redis.**
   `.env.local` names the production Upstash instance, and the local-DB wrapper
   redirected Postgres and Supabase but not Upstash. Symptom: the E2E suite went
   from 41s to **52 minutes**. `scripts/with-env-local-demo-db.sh` now unsets the
   Upstash vars, matching its existing "local Postgres implies local everything"
   invariant.

## Changes

- **Crons.** `GET` + `POST` on every scheduled route (one shared handler);
  `requireCronSecret` accepts multiple secrets; the ~12 per-route middleware
  allowlist entries collapsed to one `/api/v1/internal/` prefix rule; the 5
  GitHub cron workflows deleted and their jobs moved into `apps/web/vercel.json`
  (15 crons, one scheduler, one secret).
- **New guard `guard:internal-cron-auth`** asserts every route under
  `api/v1/internal/` calls `requireCronSecret`. This is what makes the blanket
  allowlist rule permanently safe; without it, a future route added there would
  be fully public. 23 guards now.
- **Rate limiter.** New `page` category (exempt) split out of `public`, so
  authenticated navigations are no longer IP-throttled; `esign-sign` enforced;
  `auth` + `esign-sign` backed by Upstash with degradation to the in-memory
  limiter (never fail-open); 429 content-negotiated to HTML for navigations;
  both 429 paths now routed through `finaliseResponse`.
- **Observability.** Readiness reports on `CRON_SECRET`, `OTP_HMAC_SECRET`,
  `TOKEN_ENCRYPTION_KEY`. Sentry sets `environment` from `VERCEL_ENV` and no
  longer initializes in `development`, ending the production project's pollution
  by developer laptops.
- **Secrets.** `OTP_HMAC_SECRET`'s `?? 'dev-secret'` fallback removed (throws).
- **Production data.** 1,623 orphan `public.users` rows deleted — all synthetic
  (`@example.com`, `.local`, `.invalid`, `demo-delete-*`), each with 0 roles and
  0 documents. Backed up first to `_backup_orphan_users_20260807`; drop that
  table once PITR exists. The 4 junk communities were **soft-deleted, not
  dropped**: `compliance_audit_log` is append-only by trigger (statutory audit
  trail), so a cascade delete would have required disabling a compliance
  control. Soft-delete removes them from every app surface and is reversible.

## Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | 15/15 packages clean |
| Unit tests | **11,339 passed** (29 added), 0 failed |
| Guards | **23/23 pass** (incl. the new one) |
| Production build + `perf:check` | pass; all routes under the 700 KiB hard budget |
| **E2E** | **28 passed / 0 failed / 3 skipped in 1.7 min** (was 27 passing; was 52.9 min with the Upstash bug) |
| Cron auth, local stack | All 15 paths: 401 unauthenticated, 401 wrong token, **200 on GET *and* POST with `CRON_SECRET`** |
| Cron actually works | `revenue_snapshots` went 0 → rows written end-to-end |
| Page rate limiting | 120 rapid authenticated page loads → all 200 (previously 429 after 60) |
| Auth tier still enforced | 10 allowed, 11th–14th → 429 |
| 429 negotiation | Navigation → `text/html`; `Accept: */*` → unchanged JSON envelope |
| Guard revert-check | Removing `requireCronSecret` from a probe route fails the guard, including a comment-only mention |
| Fail-open revert-check | Making the Redis fallback allow-all fails the degradation test |
| Production after cleanup | www, api/health, tenant site, transparency, pm, admin all 200 |

## Still yours to do

1. **Supabase Pro + PITR** — the only remaining hard launch blocker. There is no
   recovery path today. Do this before the first real association.
2. **Redeploy** so the new env vars take effect, then confirm a **200** in the
   Vercel runtime logs at the next cron tick. Registration is not evidence —
   `vercel crons ls` listed all 10 as healthy the entire time they were 401ing.
3. **Publish `_dmarc.getpropertypro.com`** (`v=DMARC1; p=none; rua=mailto:…`).
4. **Confirm Stripe keys are LIVE**, not test.
5. **Supply `STRIPE_CONNECT_CLIENT_ID`** if resident payments are in scope.
6. **Point an uptime monitor** at `/api/v1/internal/readiness` with
   `Authorization: Bearer $READINESS_CHECK_SECRET` (200 healthy / 200 degraded /
   503 unhealthy), plus `/api/health` on both apps for liveness.
7. Optionally delete the 6 now-unused cron GitHub repo secrets, and
   `_backup_orphan_users_20260807` once PITR is on.

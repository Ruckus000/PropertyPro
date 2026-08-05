# E2E inventory and pass rate — 2026-08-03

**What this is:** the measurement `post-11b2-gap-closure.md` asked for in **G3/G4**
and nobody had taken. The suite is run once, end to end, against a real local
Supabase stack, and the number is written down.

**Method:** inventory only. No production code and no spec was modified. Where a
failure was caused by my own environment it was fixed and the spec re-run; where
it was caused by the app or the spec it was recorded and left alone.

**Commit:** `fe7727d0` (main). **Machine:** macOS, 14 cores.

---

## Headline

| | blocks | pass | fail | never ran |
|---|---:|---:|---:|---:|
| `pnpm test:e2e` | 29 | **8** | 13 | 8 |
| `pnpm test:e2e:tenant` | 6 | **3** | 1 | 2 |
| `test:e2e:prod -- e2e/pdfjs-runtime.spec.ts` | 4 | **4** | 0 | 0 |
| **Total** | **39** | **15** | **14** | **10** |

**15 of 39 blocks pass — 38%.** Another **10 never execute at all**, so the true
state of a quarter of the suite is unknown even after running it.

This is a stable number, not a bad day: the default suite was run **four times**
under materially different conditions (cold vs. warm server, 7 workers vs. 1,
`max_connections` 100 vs. 500) and landed on 6–8 passing every time.
**Twelve blocks failed in all four runs.** Only three varied.

---

## Correcting the premise

The received framing — *"36 of 40 e2e test blocks run nowhere"* — is wrong in two
ways and should stop being repeated.

- **The count is 39, not 40.** A naive grep counts
  `test.skip(!stripeE2eConfigured(), …)` at `signup-trialing.spec.ts:37`, which is
  a describe-level guard rather than a test.
- **No spec is orphaned.** Every one of the 13 specs is collected by exactly one
  of the three commands. PR #885 added the `testIgnore` that removed the three
  impossible specs from the default run, so **35 of 39 blocks have been locally
  reachable since then**.

What survives is the statement about **CI**, and it is worth keeping: CI runs
**4 of 39 blocks** (`pdfjs-runtime.spec.ts`, inside `perf-check`, gated on
`PDFJS_TEST_ENABLED`). 35 blocks are unexercised on a PR. No Playwright spec
outside pdfjs guards anything today.

---

## Per-spec results (`pnpm test:e2e`, best of four runs)

| Spec | pass | fail | never ran |
|---|---:|---:|---:|
| `activation-smoke.spec.ts` | 3 | 0 | 0 |
| `marketing-smoke.spec.ts` | 1 | 0 | 0 |
| `demo-flows.spec.ts` | 4 | 5 | 0 |
| `add-community.spec.ts` | 0 | 2 | 0 |
| `meeting-create-spacebar.spec.ts` | 0 | 1 | 0 |
| `support-access.spec.ts` | 0 | 1 | 0 |
| `signup-trialing.spec.ts` | 0 | 1 | 0 |
| `onboarding-first-run.spec.ts` | 0 | 1 | 1 |
| `esign-and-documents-flow.spec.ts` | 0 | 1 | 1 |
| `phase1-roadmap-smoke.spec.ts` | 0 | 1 | 6 |

**Everything that passes is a public page.** `activation-smoke` and
`marketing-smoke` — the two specs needing no authentication — are green. Of the
25 blocks behind `/dev/agent-login`, four pass.

### Why 10 blocks never run

Five specs call `test.describe.configure({ mode: 'serial' })`. When one test in a
serial describe fails, Playwright skips the rest. `phase1-roadmap-smoke` loses
**6 of its 7 blocks** to a single first failure.

This matters for interpreting the number: the suite's unknown region is larger
than its failure count. Fixing one test in `phase1-roadmap-smoke` would reveal six
more results, in either direction.

---

## Four environment hypotheses, tested and rejected

Recorded because each looked obviously right and each was wrong. Assuming any of
them would have produced a false pass rate.

| Hypothesis | Test | Result |
|---|---|---|
| Cold Next.js compile blows the 30 s timeout (`dev:e2e` does `rm -rf .next`) | pre-warm a persistent server, re-run | **rejected** — 8 pass vs 7 |
| `waitUntil: 'networkidle'` never settles under dev HMR | probe the exact failing URL | **rejected** — settles in 1.6 s |
| 7 parallel workers overwhelm one dev server | `--workers=1` | **rejected** — 7 pass, unchanged |
| Postgres connection exhaustion | raise `max_connections` 100 → 500 | **rejected as the cause** — 6 pass |

The connection exhaustion was **real** — `remaining connection slots are reserved
for roles with the SUPERUSER attribute` appeared in the server log and even
`psql` was locked out — but fixing it did not change the pass rate. It is a
genuine finding about the app's connection behaviour under load (see below), not
the reason these tests fail.

The decisive evidence is the cross-run comparison: **12 blocks failed in all four
runs**, and an isolated probe of one failing URL (`/communities/2/documents` as
`owner`, `networkidle`) **succeeded in 1.6 s**. The routes work. The tests do not.

---

## Failures, triaged

### APP — the app returns an error page

`demo-flows.spec.ts:30` (board compliance dashboard) fails with the app's own
error boundary rendered:

```
- heading "Something went wrong" [level=1]
- paragraph: We couldn't load this page. Please try again.
```

Server log for the same request:

```
⨯ Error: Failed query: select "id", "user_id", "community_id", "role", … from "user_roles" …
  [cause]: [Error [PostgresError]: remaining connection slots are reserved …]
```

Under e2e load the app exhausts a 100-connection Postgres. Production sits behind
Supabase's pooler, so this may never surface there — but it is a real property of
the app's connection handling and is the kind of thing an e2e suite exists to
find.

### APP — `/dev/site-preview` breaks the production build when the DB is reachable

`pnpm build` **succeeds** with an unreachable stub `DATABASE_URL` (what CI uses)
and **fails** against a live database:

```
Error occurred prerendering page "/dev/site-preview"
TypeError: Cannot read properties of null (reading 'useContext')
Error: <Html> should not be imported outside of pages/_document.
Export encountered an error on /_error: /404, exiting the build.
```

CI has never seen this because CI's database is deliberately unreachable. Anyone
building locally against a real database hits it. **Not fixed** — recorded.

### SPEC/APP — assertion failures needing individual diagnosis

- `wave-2-ga-staging.spec.ts:75` — readiness percentage parses to `NaN`
  (`expect(NaN).toBeGreaterThan(0)`); the element's text is not a percentage.
- `onboarding-first-run.spec.ts:120` — `toHaveAttribute` mismatch.
- `add-community.spec.ts:40` — `toHaveURL` mismatch on the legacy-redirect case.
- `support-access.spec.ts:97` — `page.waitForResponse: Test ended`, preceded by
  `Unhandled error: Error: Failed to create consent grant` in the server log.
- `esign-and-documents-flow.spec.ts:98`, `phase1-roadmap-smoke.spec.ts:36`,
  `demo-flows.spec.ts:87/108/126/159`, `meeting-create-spacebar.spec.ts:8` —
  `toBeVisible` / `page.goto` timeouts against routes that load fine in isolation.

### SKIP-that-did-not-skip

`signup-trialing.spec.ts:39` is designed to skip without Stripe configuration.
It **failed** instead (`locator.fill: Test timeout of 180000ms exceeded`), and the
server log shows it reached checkout:

```
checkout.session_creation_failed … Stripe price price_local_essentials_condo_718_month
is not visible to the configured key — the key and the stored price ids are in
different Stripe modes (test vs live).
```

The guard let it through. Partly my environment (placeholder `stripe_prices`
rows — see below), but a spec that is supposed to skip and instead burns **three
minutes** before failing is worth its own look.

### Flaky — 3 blocks

`add-community.spec.ts:15`, `demo-flows.spec.ts:53`, `demo-flows.spec.ts:146`
each passed in some runs and failed in others with no configuration change.

---

## The environment, and what it cost to build

Reproducing this is most of the work, so it is written down in full.

**Stack:** `npx supabase@latest` (CLI not installed locally), `supabase init` in a
worktree, ports shifted `543xx → 553xx` to coexist with an unrelated running
stack. API `55321`, DB `55322`, Studio `55323`, Mailpit `55324`.
**`[analytics] enabled = false`** — otherwise the stack rolls back on an unhealthy
vector container.

**Env routing — the dangerous part.** `.env.local`'s `DATABASE_URL` is
**production**, and this suite writes: `add-community` creates communities,
`onboarding-first-run` resets wizard state, `esign` uploads a file.

> **`scripts/with-env-local-demo-db.sh` is NOT safe for e2e, despite its own usage
> text recommending `pnpm test:e2e`.** It exports `DATABASE_URL` and `DIRECT_URL`
> only. `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` keep pointing
> at production — so `/dev/agent-login` would call `auth.admin.generateLink()`
> against **production GoTrue with the production service-role key** while
> Postgres pointed local. **That script's example should be corrected.**

A wrapper was used instead that sources `.env.local` for unrelated vars and then
overrides all five Supabase vars plus `DATABASE_URL`/`DIRECT_URL`, with a
preflight that aborts if any still contains the prod ref `vbqobyagjzvlfpfozvmx`
(the constant already in `e2e/helpers/stripe-e2e.ts`). The gate was verified to
fire — a deliberately poisoned copy exited 70 without running the command.

**Four setup blockers, all ENV, all fixed:**

1. **Seed aborts: `Bucket not found`.** The `documents` storage bucket is not
   created by migrations or by the seed. Inserted by hand into `storage.buckets`.
2. **Seed aborts: `Missing stripe_prices row`.** `stripe_prices` is reference data
   with no local provisioning path. Placeholder rows were inserted for
   `{essentials, professional, operations_plus} × {condo_718, hoa_720, apartment}
   × {month, year}`. These are fake ids — the cause of the `signup-trialing`
   noise above.
3. **`max_connections` 100 → 500.** Must go in
   `/etc/postgresql-custom/conf.d/` — editing `postgresql.conf` is overwritten on
   restart, and `ALTER SYSTEM` is refused.
4. **`playwright.prod.config.ts`'s `webServer.env` does not spread
   `process.env`**, so `next start` gets only `PDFJS_TEST_ENABLED` and middleware
   dies on `Missing NEXT_PUBLIC_SUPABASE_URL`. The server never becomes healthy
   and Playwright times out at 120 s. It works in CI only because CI's build
   inlines those vars and CI has no conflicting `.env.local`. Worked around by
   building with valid Supabase vars; **the config is fragile and should be
   fixed.**

**Timings:** default suite **3.8–4.3 min**; pdfjs **4.4 s** after a build;
tenant suite — tests themselves **~33 s**, but the command took **3.7 hours**
because its `webServer` (`reuseExistingServer: false`) thrashed on startup. That
is a serious usability defect in the tenant config and would be fatal in CI.

---

## Recommendation on G1 — should there be a CI e2e job?

**Not for the authenticated suite. Not yet.** The data says so plainly:

- At **38% passing** with **10 blocks that never execute**, a CI job would be red
  on day one and would stay red. A permanently-red required check is worse than
  no check — it trains everyone to ignore it, which is precisely how these specs
  rotted.
- The blocker was never Playwright. It is **Supabase Auth + a seed in a
  workflow**, and this run shows that is a bigger lift than assumed: a storage
  bucket, reference data, and a connection-limit change were all needed before
  anything ran.
- The tenant config's 3.7-hour wall clock would have to be fixed first
  regardless.

**What is worth doing now, cheaply:** `activation-smoke` and `marketing-smoke` —
**4 blocks, no Supabase at all, both fully green** — could join `pdfjs-runtime`
in `perf-check` today for a few seconds of pipeline. That takes CI from 4 of 39
blocks to 8, with no infrastructure work and no risk of a flaky required check.

**Then, in order:** fix `phase1-roadmap-smoke:36` to unblock its 6 serial-skipped
siblings and learn what they actually say; triage the 12 hard failures; and only
once the suite is meaningfully green, revisit a full CI job.

---

## Follow-ups this produced — recorded, not fixed

1. ~~`scripts/with-env-local-demo-db.sh` advertises `pnpm test:e2e` in its usage
   text but does not redirect Supabase Auth. **Actively dangerous.**~~
   **FIXED** — see the second addendum below. It was worse than the `test:e2e`
   line: `pnpm seed:demo`, the script's other documented example, reached
   production Auth and Storage on every run.
2. ~~`/dev/site-preview` breaks `next build` whenever the database is reachable.~~
   **CLOSED — did not reproduce; the route was hardened anyway.** See the
   fourth addendum.
3. ~~The app exhausts a 100-connection Postgres under e2e load.~~
   **RECORDED, NOT FIXED — measured peak is 1 connection.** See the fifth
   addendum.
4. ~~`playwright.prod.config.ts`'s non-spreading `webServer.env`.~~
   **CLOSED — the stated diagnosis was wrong.** See the third addendum.
5. ~~The tenant config's webServer takes hours to become healthy.~~
   **RECORDED, NOT FIXED — measured at 40 seconds.** See the fifth addendum.
6. ~~`signup-trialing` fails instead of skipping, after a 3-minute timeout.~~
   **FIXED** — see the third addendum.
7. ~~Local setup needs an undocumented `documents` bucket and `stripe_prices` rows;
   neither is in the seed. Both belong in `pnpm seed:demo` or the local recipe.~~
   **FIXED — `pnpm seed:demo` now provisions both.** See the third addendum.

---

## Addendum — the cheap recommendation landed the same day

The "worth doing now" item above was implemented immediately: `activation-smoke`
and `marketing-smoke` joined `pdfjs-runtime` in the single `test:e2e:prod`
invocation inside `perf-check`.

**CI now runs 3 specs / 8 of 39 blocks**, up from 1 spec / 4 blocks, in **5.4 s**
— about one second more than pdfjs alone, since all three share one server boot.

Verified under CI's exact conditions before the workflow was touched, because the
local pass in this audit did **not** prove it: this audit ran them against a
**dev server with a real database**, whereas `perf-check` runs a **production
build with an unreachable one**. Reproducing that env — stub `DATABASE_URL`,
`https://placeholder.supabase.co`, and no `SUPABASE_SERVICE_ROLE_KEY` — the build
succeeds and all 8 blocks pass. That two-axis difference is now written into
`ci.yml` and `CLAUDE.md` as the precondition for adding any further spec.

Everything else in this note stands: **31 blocks remain unexercised by CI**, and
the recommendation against a job covering the authenticated suite is unchanged.


---

## Second addendum — follow-up 1 fixed, and it was worse than recorded

The note filed the wrapper as a documentation hazard: it recommends
`pnpm test:e2e` while redirecting only `DATABASE_URL`. Reading `seed-demo.ts`
before fixing it showed the sharper version.

**`pnpm seed:demo` — the script's OTHER documented example — reached production
on every run.** It calls `createAdminClient()` then
`admin.auth.admin.listUsers()`, and uploads seeded PDFs through
`admin.storage.from('documents')`. With only Postgres redirected, that wrote to a
local database while creating users and objects in **production Supabase, with
the production service-role key**. `DEMO_SEED_SYNC_AUTH_USERS` defaults to ON, so
nothing stopped it — and `esign-and-documents-flow.spec.ts` documented
`DEMO_SEED_SYNC_AUTH_USERS=0` as a workaround, which patched the symptom in an
error message rather than the script.

**The fix** makes the invariant *local Postgres implies local Supabase*:
`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_URL` are redirected to a local default; the
anon and service-role keys are **unset** unless local ones are supplied, so
`createAdminClient()` throws by name instead of authenticating somewhere real;
and a loopback guard exits **78** if any resolved URL names a remote host.
Commands needing no Supabase (`db:migrate`) are unaffected.

**Measured against a fake `.env.local` holding production-shaped values:** the
shipped script leaks **3** of them to the child process, including
`SUPABASE_SERVICE_ROLE_KEY`. The fixed script leaks **0**.

**Residual, deliberately not addressed:** the wrapper still passes through other
production credentials from `.env.local` (`RESEND_API_KEY`, Stripe). It governs
the database/Supabase axis only, which is what its name claims. Anything needing
a fully isolated env should use a real local stack, not this wrapper.


---

## Third addendum — follow-ups 4, 6 and 7 (PR A)

Worked on a fresh local Supabase stack rebuilt from this note's own recipe
(ports 553xx, `[analytics] enabled = false`), at commit `3f2190d8`.

### 7 — FIXED: `pnpm seed:demo` is now self-sufficient

Both blockers are provisioned by the seed itself, idempotently, up front:

- **`documents` bucket** — `ensureDocumentsBucket()`
  (`packages/db/src/seed/seed-community.ts`), memoised, `listBuckets()` then
  create-if-absent. Created **private and unrestricted**: the seed writes PDFs
  and the app writes draft images to the same bucket, so a local bucket
  *tighter* than the real one is the failure mode worth avoiding.
- **`stripe_prices`** — `ensureSeedStripePrices()` (`scripts/seed-demo.ts`),
  `on conflict … do nothing`, and skipped entirely if the table already holds
  any non-placeholder id.

**Only the 10 legal combinations are inserted**, from `PLANS_BY_COMMUNITY_TYPE`
× `{month, year}` — not the 18-row cross product this note inserted by hand.
Nine of those 18 are combinations checkout rejects; see follow-up 6.

**Measured:** on a stack seeded with no manual SQL, `pnpm seed:demo` exits 0 and
writes 36 storage objects and 10 price rows; a second consecutive run also exits
0 and inserts nothing.

**Third undocumented prerequisite, found on the way:** the seed also refuses to
start without `PROPERTYPRO_SEED_ENV=development`. That one is self-describing —
it prints its own remediation — so it was left alone.

### 4 — CLOSED, not fixed: the recorded diagnosis is wrong

This note says `webServer.env` "does not spread `process.env`", so `next start`
receives only `PDFJS_TEST_ENABLED`. **Playwright already spreads it.** From
`playwright/lib/plugins/webServerPlugin.js` at the pinned 1.58.2:

```js
env: { ...DEFAULT_ENVIRONMENT_VARIABLES, ...process.env, ...this._options.env }
```

The proposed one-line fix would have been a no-op. Two experiments, both green,
also rule out the follow-on hypothesis that `NEXT_PUBLIC_*` inlining is
responsible:

| Build env | Server env | Result |
|---|---|---|
| valid Supabase vars | valid | 8/8 pass in 5.8 s, server healthy |
| **no** Supabase vars at all | valid | passes — middleware reads `process.env` at runtime |

The original failure did not reproduce. What *is* real in that config, and is
now fixed, is unrelated to env: `testDir: './e2e'` carried no
`testMatch`, so a bare `pnpm test:e2e:prod` collected **all 39 tests in 13
files** and pointed the 25 auth-dependent blocks at a production server where
`/dev/agent-login` is 404'd. CI escaped this only by passing three paths on the
command line. A `PROD_SAFE_SPECS` allowlist now pins it to the three DB-free
specs — bare run **39 → 8 tests**, CI's explicit-path form unchanged at 8. The
`env` block carries a comment recording the measurement above so the no-op fix
is not proposed again.

### 6 — FIXED: the 3-minute timeout is now a named, immediate failure

The guard was never keyed on `stripe_prices` rows — `stripeE2eConfigured()`
requires `E2E_STRIPE=1` and an `sk_test_` key. The three-minute burn came from
downstream: when session creation fails, `/signup/checkout` renders "Unable to
start checkout" and **no iframe**, so `fillStripeEmbeddedCheckout` waited out the
full 180 s test timeout and reported `locator.fill: Test timeout` — a symptom
naming nothing.

The trigger was this note's own hand-inserted rows: they used the id prefix
`price_local_…`, which `isPlaceholderStripePriceId` (matching
`price_placeholder_`) does not recognise, so the seed treated fake ids as real
and handed them to Stripe. Follow-up 7's rows use the recognised prefix.

`fillStripeEmbeddedCheckout` now races the checkout iframe against the app's
error copy and throws immediately, naming key/price mode mismatch and
placeholder ids as the causes. **No assertion was weakened** — the requirement
that checkout must mount is unchanged; it simply stopped being expressed as a
180 s wait for an element that cannot appear.

**Measured:** with Stripe unconfigured the spec now skips, and the run is 23 s
wall clock of which essentially all is `next dev` boot.

### Gates

tsc 0 · 21/21 guards · 11,042 unit passed · 310 app + 121 RLS integration — all
at the recorded baseline.

---

## Fourth addendum — follow-up 2 (PR B): did not reproduce

`pnpm build` was run against a **live, migrated, seeded** local Postgres at
commit `3f2190d8`, four times, across every environment axis that plausibly
differed from this note's run:

| # | Variant | Result |
|---|---|---|
| 1 | live DB, `NODE_ENV=development` in `.env.local` | **exit 0** |
| 2 | live DB, no `NODE_ENV` override | **exit 0** |
| 3 | live DB, `NODE_ENV=development` exported in the shell | **exit 0** |
| 4 | live DB, built **over Turbopack `next dev` artifacts** in `.next` | **exit 0** |

No `Error occurred prerendering page "/dev/site-preview"`, no `useContext` null,
no `<Html>` error, no `/_error` failure. No app code changed between `fe7727d0`
(this note's commit) and `3f2190d8` — the three intervening commits are docs,
CI config and a shell script — so the difference is environmental and was not
identified.

**What the builds did show, and what was fixed.** `/dev/site-preview` was
statically prerendered (`○` in the build output) and baked a 307 to `/` into
`.next/server/app/dev/site-preview.{html,meta,rsc}`. It is the only App Router
*page* under `/dev` — the other three dev surfaces are Route Handlers, which are
structurally exempt from prerendering — and it never bails out of the static
pass, because the `NODE_ENV` guard `redirect()`s before `await searchParams`.

`export const dynamic = 'force-dynamic'` removes it from the static export pass:
verified `○` → `ƒ`, and the baked `.html`/`.meta` no longer emitted.

**This is hardening, not a verified fix.** It removes the route from the pass
where the failure was reported, and prerendering a dev-only surface that
middleware already 404s in production buys nothing — but the original crash was
never reproduced, so no claim is made that this is its cause. Recorded here
rather than quietly dropped, because the next person to hit it should know the
build has been green on this axis since `3f2190d8`.

---

## Fifth addendum — follow-ups 3 and 5 (PR C): both recorded, not fixed

Both are closed as **recorded**, which the follow-up brief permits for these two
only. Neither is closed on "we could not be bothered": each has a measurement
that contradicts the recorded symptom, and both measurements are stated so the
next person starts from data rather than from this note's prose.

### ~~3 — connection exhaustion: the app is not the source~~ — **REFUTED 2026-08-05**

> **This finding is wrong. See the seventh addendum.** The app *is* the source:
> `next dev` re-evaluates `drizzle.ts` as it compiles routes, and each module
> instance opened its own postgres-js pool. Measured across a real suite run the
> app reached **78** connections and climbing, starving GoTrue out with
> `SQLSTATE 53300` — which is the long-unexplained `/dev/agent-login` 500. The
> probes below held at 1 because they exercised only two routes; the leak is per
> module-graph instantiation, not per request. Left in place unedited, per this
> note's append-don't-rewrite rule.

Measured on a `next dev` server against the local stack, counting
`pg_stat_activity` rows that are app client backends (excluding Supabase's own
realtime / PostgREST / pg_net / pg_cron connections, which account for a
constant 12):

| Load | Peak app connections |
|---|---:|
| idle, warm server | 1 |
| 120 concurrent authenticated requests across `/dashboard` and `/documents`, **120/120 returned 200** | **1** |
| 250 concurrent requests, two routes, five waves | **1** |
| 8 successive source edits forcing recompiles, each followed by two authenticated requests | **1** |

The structural reason: `packages/db/src/drizzle.ts` holds the **only**
`postgres()` call in the package — a module-scope singleton, postgres.js default
`max` of 10. The app does **not** open a connection per request, and dev-server
recompilation does not leak pools either, which was the leading hypothesis for
how a single process could reach 100.

So the exhaustion this note observed was real but did not originate in the app's
connection handling. The remaining candidates are the audit session's own
concurrent tooling — seed runs, `tsx` scripts, vitest workers and `psql` all
sharing one 100-connection Postgres — none of which exists in production, which
additionally sits behind Supabase's pooler.

**Not fixed, deliberately.** Adding an explicit `max` to the shared pool on the
strength of an unreproduced symptom would be tuning against a number nobody
measured. If this resurfaces, measure `pg_stat_activity` **grouped by
`application_name` and `backend_type`** first — the undifferentiated count is
what made "the app" look responsible.

**One genuine find along the way:** the middleware rate limiter returns 429 well
before the app is under any real load, and it is exempted only when
`PLAYWRIGHT_TENANT_E2E=1` (`rate-limit-config.ts`). `pnpm test:e2e` does **not**
set that, so the default suite runs rate-limited. Whether that contributes to
the 12 always-failing blocks is untested and worth a look before the next triage
pass.

### 5 — tenant webServer: 40 seconds, not 3.7 hours

`pnpm test:e2e:tenant`, unmodified config, clean stack:

```
start 23:20:20
end   23:21:00      →  40 s wall clock
3 passed, 1 failed, 2 did not run  (39.0s)
```

Same pass/fail shape this note recorded (3 passed / 1 failed / 2 never ran, the
failure being `wave-2-ga-staging.spec.ts:75` on `expect(NaN).toBeGreaterThan`),
at **1/330th** of the wall clock. The 3.7-hour figure did not reproduce at all.

Worth stating because it changes the recommendation this note makes: the config
sets `timeout: 180_000`, so Playwright could not have been *waiting* on
`webServer` for 3.7 hours — it would have aborted at three minutes. Whatever
consumed that time was outside the documented startup path, and on the evidence
here it is most plausibly the exhausted Postgres of follow-up 3 stalling the
same machine.

**Not fixed.** There is nothing to fix in the config on this evidence, and the
G1 recommendation's "the tenant config's 3.7-hour wall clock would have to be
fixed first" should be read as no longer blocking.


---

## Sixth addendum — the rate-limiter lead is REFUTED, and a trap that invalidates local runs

The fifth addendum ended by flagging an untested lead: the middleware rate
limiter 429s well before real load and is exempted only when
`PLAYWRIGHT_TENANT_E2E=1`, which `pnpm test:e2e` does not set — so the default
suite runs rate-limited, and that might have explained the hard failures in one
change rather than twelve investigations.

**It does not.** `checkRateLimit` in
`apps/web/src/lib/middleware/rate-limit-config.ts` is that flag's only runtime
consumer, so setting it isolates the variable exactly. Two runs, one variable,
port force-cleared between them:

| Arm | passed | failed | skipped | never ran |
|---|---:|---:|---:|---:|
| rate limiting ON | 6 | 14 | 1 | 8 |
| rate limiting BYPASSED | 6 | 14 | 1 | 8 |

**The failure sets are byte-identical** — the same 14 tests, in the same specs,
in both arms — and neither log contains a single `429` or `rate_limited`. The
lead is closed. The hard failures need individual triage; there is no shortcut.

### The trap that made the first attempt worthless

`playwright.config.ts` sets **`reuseExistingServer: true`** on both webServers.
A stale `next dev` left listening on :3000 from an earlier run is therefore
silently adopted instead of starting `dev:e2e` — the run measures a server with
stale compiled output and stale env, and reports nothing unusual. The first
attempt at the experiment above returned **0 passed** on that basis, which would
have read as "bypassing the rate limiter makes things much worse."

**The canary is `activation-smoke` and `marketing-smoke`.** They need no auth and
no database, and pass in CI in ~5.8 s against a production build with an
UNREACHABLE database. If either fails locally, the environment is broken and the
run means nothing — in the bogus run they failed with `#pricing` missing from the
landing page, alongside `agent-login failed: 404`.

**Kill the port and verify it is clear before counting or timing anything
locally** (`lsof -ti :3000 | xargs -r kill -9`). This applies retroactively: any
local pass rate in this note taken without that check — including the
re-measurement in the third addendum — should be treated as unverified. The
13-of-39 above was taken with the port verified clear, twice, with matching
results.

### Worker contention is real after all — the rejected hypothesis needs reopening

This note rejected *"7 parallel workers overwhelm one dev server"* on the
evidence `--workers=1` → 7 pass, unchanged. **That measurement could not have
detected the effect**, because at the time the affected specs failed on stale
logic first and fast — a contention effect has nothing left to change once a
spec has already failed in 300 ms.

Re-measured after repairing `phase1-roadmap-smoke` (PR #898 — it was landing on
an Essentials community where every surface it tests is plan-gated; 0/7 → 7/7),
port verified clear, same stack, same seed:

| Workers | passed | failed | skipped | never ran | wall clock |
|---:|---:|---:|---:|---:|---|
| 7 (default) | 7 | 13 | 1 | 8 | 3.2 min |
| **1** | **11** | **9** | 2 | 7 | 4.6 min |

**+4 blocks for one flag.** At 7 workers the failures are dominated by
`Test timeout of 30000ms exceeded` and `page.goto: net::ERR_ABORTED; maybe
frame was detached?`; at 1 worker the run contains **zero** timeouts and
**zero** aborts — the remaining nine are genuine assertion failures. That is a
qualitative change in failure *kind*, not just count, and it means any triage
done at 7 workers is triaging the wrong thing.

Do not read this as "set workers=1". Read it as: the dev server cannot serve 7
concurrent browsers doing first-compile navigations, so **measure at
`--workers=1` and triage the assertion failures that survive**.

### ~~Still open:~~ **RESOLVED 2026-08-05** — `/dev/agent-login` intermittently 500s mid-suite

> Cause found and fixed; see the seventh addendum. It was Postgres connection
> exhaustion starving GoTrue, caused by a pool leak in the app. Everything ruled
> out below was correctly ruled out — all three hypotheses concerned the
> endpoint, and the endpoint was never the problem. The instruction below
> ("capture that body") is exactly what solved it.

Four blocks at `--workers=1` failed with `agent-login failed for
role=board_president: 500` (`phase1-roadmap-smoke`, `support-access`, and two
others), through the helper's existing 3× retry-on-5xx.

Ruled out, each by direct test:
- **Not a broken endpoint** — 12 consecutive `?as=board_president` calls all
  returned 200.
- **Not GoTrue's email rate limit** — the local stack sets
  `[auth.rate_limit] email_sent = 2`, which looked damning, but the admin
  `generateLink` path does not count against it (see the 12/12 above).
- **Not `support-access` polluting state** — running that spec to completion
  and then calling agent-login three times returned 200 each time.

So it is sequence-dependent on something earlier in the run, and not yet
identified. The route returns its cause in the response body, but
`e2e/helpers/dev-login.ts` asserts on `response.ok()` and discards the body —
**capturing that body is the first thing the next pass should do**, rather than
re-deriving the above.

### One more command-line trap

`pnpm --filter … test:e2e -- --workers=1` passes `--workers=1` through as a
POSITIONAL test-file filter, so Playwright matches nothing, prints
`Error: No tests found`, and exits **1** — which reads as a failing suite
rather than a malformed command. Use
`pnpm exec playwright test -c playwright.config.ts --workers=1`.

---

## Seventh addendum — the agent-login 500 was CONNECTION EXHAUSTION, and the app *was* the source

Date: **2026-08-05**. Same method as the sixth addendum: local Supabase stack
(`max_connections = 100`), `pnpm seed:demo`, port force-cleared before every
measurement, `--workers=1`.

### The 500 is identified and FIXED

The sixth addendum's instruction — capture the response body before theorising
again — was the whole investigation. `e2e/helpers/dev-login.ts` now reads the
body and folds it into the assertion message. First run, first failure:

```
agent-login failed for role=board_president (?as=board_president): 500
{"error":"Failed to generate login link","details":"Database error finding user",
 "hint":"Ensure \"board.president@sunset.local\" exists in Supabase Auth ..."}
```

So the failing call was `generateLink`, not `verifyOtp`. GoTrue's own log gives
the rest:

```
error finding user: failed to connect to host=supabase_db_… user=supabase_auth_admin:
FATAL: remaining connection slots are reserved for roles with the
SUPERUSER attribute (SQLSTATE 53300)
```

**Postgres was out of connection slots, so GoTrue could not open one.** That is
why it "worked early in a run and broke later" — later is when the slots ran
out. Every ruled-out hypothesis in the sixth addendum was correctly ruled out;
all three were about the endpoint, and the endpoint was never the problem.

### STRIKING the fifth addendum's finding "3 — connection exhaustion: the app is not the source"

That heading is **wrong**, and so is its structural claim that

> `packages/db/src/drizzle.ts` holds the **only** `postgres()` call in the
> package — a module-scope singleton … dev-server recompilation does not leak
> pools either.

A module-scope `const` is one pool per **module instance**, not per process.
`next dev` re-evaluates the module graph as it compiles routes on demand, so a
long dev session accumulates several instances, each opening a fresh postgres-js
pool (default `max: 10`) and never closing the previous one.

Measured with `pg_stat_activity` grouped by `application_name` — the grouping
the fifth addendum itself asked for:

| | total conns | app (`postgres.js`) | GoTrue reachable |
|---|---:|---:|---|
| dev servers down (Supabase's own services only) | 26 | 0 | yes |
| mid-run, before fix | **104** | **78**, climbing monotonically | **no — 53300** |
| mid-run, after fix | 34 | **8**, flat | yes |

The fifth addendum's probes (120 and 250 concurrent requests over two routes,
8 forced recompiles) held app connections at 1 because they exercised **two
routes**. The leak is per distinct module-graph instantiation, so it only shows
up across a full suite touching dozens of routes over minutes — which is exactly
the shape of the run where the symptom appeared.

**The ORIGINAL note had this right.** Its "APP — the app returns an error page"
section quoted the server log verbatim —
`Failed query: select … from "user_roles" … [cause]: remaining connection slots
are reserved` — and concluded "it is a real property of the app's connection
handling and is the kind of thing an e2e suite exists to find." That was
correct. The fifth addendum overturned it on a probe too narrow to reproduce it.
The original observation stands; only its scale was underestimated.

Raising `max_connections` 100 → 500 (tried in the original four-run matrix and
recorded as "rejected as the cause") does not fix this either — an unbounded leak
just takes longer to exhaust a bigger ceiling. That is why that experiment moved
the pass rate so little.

**Fixed** in `packages/db/src/drizzle.ts`: the client is cached on `globalThis`
and `max` is set explicitly. `closeDb()` clears the cache so scripts that close
and re-import still get a usable pool. After the fix, a full `--workers=1` run
contains **zero** `agent-login failed` lines, down from four blocks.

This also retires the fifth addendum's "remaining candidates … the audit
session's own concurrent tooling". No seed, vitest or `tsx` was running during
the measurements above; `psql` is counted separately and never exceeded 1.

### A second, unrelated defect this surfaced: `127.0.0.1` vs `localhost`

`playwright.config.ts` used `baseURL: 'http://127.0.0.1:3000'`. But `next dev`
pins its own origin to `http://localhost:<port>` and builds middleware redirects
from it **regardless of the request's Host header** — measured with
`Host: 127.0.0.1:3000`, `Host: localhost:3000` and `Host: example.test:3000`,
all three answering `location: http://localhost:3000/auth/login`.

Browsers treat `localhost` and `127.0.0.1` as different hosts for cookies. So
the session cookie was set on `127.0.0.1`, and any test that followed a
middleware or server-side redirect crossed to `localhost`, arrived with no
cookies, and was bounced to `/auth/login` — **a logged-in test failing as though
it were logged out**. `add-community.spec.ts:40` (a redirect-only page) is the
case that exposed it; it passes with `baseURL` and `ADMIN_BASE_URL` moved to
`localhost`.

### The e2e suite was never type-checked

`apps/web/tsconfig.json` included `src/**` but not `e2e/**`, so no spec or helper
was ever seen by `pnpm typecheck`. Adding `e2e/**/*.ts` produced **4** errors
across the whole suite, all real:

- `onboarding-first-run.spec.ts` passed `skipPortalNav: true`, an option
  `LoginAsOptions` never declared — silently ignored at runtime, so the helper
  kept navigating to the portal the spec was trying to skip. (Now implemented.)
- `stripe-e2e.ts` compared a `let` against a value TS had narrowed away
  (TS2367). Runtime behaviour was correct; the checker could not see the write
  inside the poll callback.
- `pdfjs-runtime.spec.ts` imported a browser-side runtime URL.

`e2e/**/*.ts` is now in the typecheck gate, so this class cannot recur silently.

### Also corrected

`.claude/rules/agent-testing.md`'s role table claimed six roles land in Sunset
Condos. Measured against `pnpm seed:demo`, **four of them do not** — `owner`,
`board_president`, `cam` and `pm_admin` are all multi-community, and the bare
default is `communities[0]` ordered by `communities.name`, i.e. **Palm Shores
HOA** (Essentials, where most surfaces are plan-gated). The sixth addendum named
only `board_president`. The table now states the ordering rule and documents
pinning.

The shared helper now **throws** when `communitySlug` does not match one of the
user's communities, instead of silently falling back to that alphabetical
default — the failure mode PR #898 spent a PR diagnosing.

### Triage of the nine `--workers=1` failures

Every one has a named cause. Six are fixed; three are recorded as blocked, with
the blocker identified.

| Block | Cause | Status |
|---|---|---|
| `phase1-roadmap-smoke:32` | agent-login 500 (connection exhaustion). Also raced the compatibility redirect into `/payments?tab=assessments` on a 5s budget. | **fixed** — pool leak + settle on the redirect target |
| `add-community:40` | `baseURL` was `127.0.0.1`, the redirect target `localhost` → session cookie not sent → bounced to `/auth/login`. | **fixed** — baseURL/ADMIN_BASE_URL now `localhost` |
| `demo-flows:30`, `demo-flows:87` | Comma-joined selector mixing the `text=` engine into a CSS list. Playwright threw `Unexpected token "="`; these assertions had never executed. `:87` additionally expected a `<table>` for what is now a card list. | **fixed** — `.or()`, plus a locator the list actually renders |
| `demo-flows:126` | Navigated to `/pm/dashboard`, which has **no `page.tsx`** — the portfolio view moved to `/pm/dashboard/communities`. The 404 still satisfied the spec's `toContain('/pm/')`. | **fixed** — uses the portal agent-login returns |
| `meeting-create-spacebar:8` | Two causes: bare login landed on Palm Shores (Essentials), and `waitUntil: 'networkidle'` never settled. Then the real one: **"Meetings & Calendar" is a `<div>`, not a heading**, so `getByRole('heading')` could never match — and the route rendered **no `<h1>` at all**, violating the page-title rule in `.claude/rules/design.md`. `guard:breadcrumbs` misses it because its glob only covers `[param]`/`new`/`edit` pages. | **fixed in the APP** — the page title is now an `<h1>` (classes unchanged, visual identical) |
| `esign-and-documents-flow:212` | Two causes. All five navigations used `waitUntil: 'networkidle'` on pages that render PDF.js previews, which keep fetching indefinitely, so `page.goto` blew the 120s timeout before any assertion ran. Underneath that: the spec waited 60s for a category pill named **`Rules & Regulations`, which does not exist** — `document_categories` has `Rules` (0 docs) and `Governing Documents` (13), and the very next line opens "Sunset Condos Annual Budget", which is itself in `Governing Documents`. The assertion contradicted the line after it. | **fixed** — `domcontentloaded`, and the real category |
| `phase1-roadmap-smoke:60` | The Stripe connection card is a client component that had not mounted (not even its skeleton) inside the 5s default. Accepted states unchanged. | **fixed** — realistic wait |
| `signup-trialing:39` | **Environment, not a defect.** `seed:demo` inserts placeholder Stripe price ids (`price_placeholder_essentials_condo_718_month`); no Stripe key can resolve them. The app diagnoses this itself in the dev log. Needs real test-mode price ids. | **recorded** |
| `onboarding-first-run:120` (and `:144`) | **The spec targets a wizard that was never built.** It waits for `data-testid="condo-onboarding-wizard"` with `data-hydrated="true"`; `git log -S` shows that identifier has only ever appeared in `specs/phase-2-multi-tenancy/39-condo-onboarding-wizard.md` and in this spec — never in `apps/web/src`. The shipped `/onboarding/condo` is a different, 2-step wizard. **This spec has never been capable of passing.** | **recorded — bigger than a selector fix** |
| `support-access:97` | Two layers. (1) Local-stack artifact: the Supabase CLI now defaults `auto_expose_new_tables` OFF, so a migrations-only database grants the Data API roles nothing — **85 of 100 public tables** had no `service_role` SELECT, and the toggle's POST 500'd with `permission denied … (42501)`. Production is not like this (`local-supabase-post-migrate.sql` records the measured prod posture: service_role reads all). (2) After fixing that, the real blocker: **`platform_admin_users` is empty and nothing seeds it**, so the admin app answers `access_denied` and no admin-app spec can pass. | **(1) fixed in the local recipe; (2) recorded** |

**Two things worth pulling out of that table.**

`onboarding-first-run.spec.ts` is not stale — it is fiction. It was written from a
design document, and both of its blocks assert against markup that has never
existed. Rewriting it against the shipped 2-step wizard is a real piece of work
with product questions attached (what should first-run onboarding guarantee?),
not a selector swap, so it is recorded rather than guessed at.

Seeding a platform admin is a one-row change, but it grants `super_admin` in
shared demo data. That is a security-posture decision for whoever owns the demo
seed, not something to slip into an e2e-repair pass. Until it lands, **the entire
admin app is unreachable from e2e.**

### The local-stack recipe has a new required line

Add to `supabase/config.toml` under `[api]`:

```toml
auto_expose_new_tables = true
```

Without it the local stack is **stricter than production** and produces
`permission denied for table …` failures that do not exist in the real app. On an
already-created database, apply `scripts/sql/local-supabase-post-migrate.sql`
after a blanket grant — that file is the repo's source of truth for which tables
production deliberately keeps closed to `anon`/`authenticated`.

### One more trap: `.env.local` does not override the shell

`next dev` loads `.env.local`, whose `DATABASE_URL` is **production**. It is safe
to run the e2e suite only because Next's env loader does **not** overwrite
variables already present in `process.env` (verified directly against
`@next/env` 15.5.12). So the suite must be launched through
`scripts/with-env-local-demo-db.sh`, which exports loopback values first and
asserts they are loopback. Running `pnpm test:e2e` bare, with a `.env.local`
symlinked in, points the dev server at production.

### Worker count: measured, then capped at 1

The sixth addendum said "do not read this as *set workers=1*" and asked for a
measurement. Here it is — otherwise-idle machine, same stack and seed, port
force-cleared before each arm, `workers` the only variable:

| workers | passed | failed | never ran | wall clock | `Test timeout` | `ERR_ABORTED` |
|---:|---:|---:|---:|---|---:|---:|
| **1** | **15** | 8 | 6 | **6.6 min** | 4 | **0** |
| 2 | 10 | 11 | 8 | 6.2 min | 11 | 0 |
| 3 | 7 | 14 | 8 | 5.8 min | 15 | 3 |

**Parallelism buys 13% of wall clock and costs half the pass rate.** The extra
failures are not defects — they are timeouts and detached frames, i.e. one
`next dev` server failing to serve several browsers doing first-compile
navigations at once. `workers: 1` is now set in `playwright.config.ts` with this
table inline. 53 seconds is a cheap price for a result that means anything.

The four remaining `Test timeout` lines at `workers=1` are not contention: they
are the genuinely-failing blocks in the table above (`support-access`'s 120s cap,
`signup-trialing`'s Stripe wait, and the onboarding wizard that does not exist).

**Caveat on measuring on this machine:** an earlier attempt at this same matrix
produced `workers=1 → 7 passed, 19 timeouts, 20.6 min`. That arm was worthless —
a *different worktree* was running the 937-file unit suite across every core at
the time. Check `ps -eo comm | grep -c vitest` and prefer an idle machine before
recording any e2e timing, exactly as the port check is already required.

---

## Where the number stands after this pass

| default suite, one worker | passed | failed | never ran | notes |
|---|---:|---:|---:|---|
| before (sixth addendum) | 11 | 9 | 7 | |
| after the pool-leak fix alone | 12 | 10 | 7 | specs untouched |
| after the spec/app fixes | **19** | 8 | 2 | **0 timeouts, 0 aborts, 0 agent-login 500s** |

**19 passed / 8 failed / 2 never ran** is the number, taken on a quiet machine at
`workers: 1`. Counting the whole suite the way the Headline table does — default
+ tenant (3) + pdfjs (4) — that is **26 of 39 blocks**, up from 13.

The qualitative change matters more than the count: that run contained **zero**
`Test timeout`, **zero** `ERR_ABORTED` and **zero** `agent-login failed` lines.
Every remaining failure is a specific assertion with a named cause, which is the
state the sixth addendum was trying to reach.

### What is NOT in the 19, and what confirms each piece

Fixes landed after that measurement. Some were confirmed by later partial runs
before the environment failed; some were not. Stated individually so the next
person does not have to guess which:

| Fix | Status |
|---|---|
| `demo-flows` compliance + owner-documents first-render budgets | **confirmed passing** in a later run (10.2s / 17.0s) |
| `add-community` — `domcontentloaded`, per-test budget above the assertion budget | **confirmed passing** in a later run |
| `activation-smoke` per-test budget | **confirmed passing** (18.3s, having previously blown 30s) |
| `webServer.timeout` 120s → 300s | **confirmed** — a run that previously aborted with `Timed out waiting 120000ms from config.webServer` got past startup |
| `esign` → `Governing Documents` category | **NOT yet observed passing** |
| meetings-dialog and owner-payment-portal budgets | **NOT yet observed passing** |
| `demo-flows` FIRST_RENDER_TIMEOUT 30s → 60s | **NOT yet observed passing** |

The three unconfirmed entries are each justified by the exact failure they were
derived from — a category that provably does not exist in
`document_categories`, and two assertions that died at the 5s default on
client-rendered content — but **nobody has yet seen a full green run containing
them.** Run one before quoting a number higher than 19.

### The confirming run never happened: the environment died twice

Two attempts, two infrastructure failures, neither related to the app:

1. **Both canaries failed** at load average 358, with 13 `vitest` workers from
   another worktree. Discarded per the rule above.
2. **Docker exited**, taking the entire local Supabase stack with it. Every
   authenticated block then failed fast, and `/dev/agent-login` returned
   `"details":"fetch failed"` — GoTrue was simply gone. `psql` to :55322 gave
   `Connection refused` and `docker ps` gave `Cannot connect to the Docker
   daemon`.

The second one is worth its own note, because the symptom mimics an app
regression precisely: authenticated specs failing in 7–11 seconds while public
ones pass. **Before triaging a sudden cliff like that, check the stack is alive**
— `docker info`, then `psql -p 55322 -c 'select 1'`. It is one command and it
would have saved this pass an entire diagnostic detour.

### A measurement that had to be thrown away — and why you should throw yours away too

The confirming run after those three fixes returned 12 passed / 9 failed in
**24.9 minutes**, against 10.3 minutes for the same suite an hour earlier. It is
worthless, and the note's own rule says so: **`marketing-smoke` failed, and with
`activation-smoke` that is both canaries**. Two specs that need no auth, no
database and no seed do not regress; the environment does.

The cause was measurable and external — load average **358** and **13 `vitest`
workers belonging to a different worktree**, which started a 937-file unit run
partway through. An earlier arm of the worker matrix was lost the same way
(`workers=1 → 7 passed, 19 timeouts, 20.6 min`).

So, alongside the existing port check, add this to the local-run checklist:

```bash
ps -eo comm | grep -c vitest    # expect 0
```

A shared machine is a variable, and on this one it is the largest variable there
is. The two canaries are what tell you it moved.

---

## Eighth addendum — both recorded blockers closed by decision, and the number is now 22

Date: **2026-08-05**, same day as the seventh addendum and the same method: local
Supabase stack on the 553xx ports, migrations + `pnpm seed:demo`, suite launched
through `scripts/with-env-local-demo-db.sh` at `workers: 1`.

**Environment was verified clean before the run, and the canaries agree after it:**
`docker info` OK, `:3000`/`:3001` clear, `ps -eo comm | grep -c vitest` = 0. In the
measured run `activation-smoke` (all 3 blocks) and `marketing-smoke` both passed,
and the run contains **zero** `Test timeout`, **zero** `ERR_ABORTED`, **zero**
`agent-login failed` and **zero** `access_denied`. Per this note's own rule, the
number below is trustworthy.

### Where the number stands

| default suite, one worker | passed | failed | skipped | never ran | wall |
|---|---:|---:|---:|---:|---|
| seventh addendum | 19 | 8 | 0 | 2 | — |
| **this pass** | **22** | **4** | 2 | 1 | **6.0 min** |

The 2 skipped are the two `onboarding-first-run` blocks, now `test.fixme` (below).
The 1 "did not run" is the second `esign` block, skipped because that file is
`describe.configure({ mode: 'serial' })` and block 1 failed — the same mechanism
this note has recorded throughout.

### Blocker 1 — the onboarding wizard: RECORDED AS `test.fixme`, and it is WORSE than recorded

The seventh addendum recorded "an onboarding wizard the spec describes but that was
never built". That is right, but it **understated the gap by half**: the note and
its surrounding commentary framed this as a condo problem.

Measured: **both** wizards ship a 2-step flow, "Community Profile" → "Compliance
Preview" — `components/onboarding/condo-wizard.tsx:29` and
`components/onboarding/apartment-wizard.tsx:32`. The app contains exactly two step
components (`steps/profile-step.tsx`, `compliance-preview.tsx`), and both API
contracts cap at `MAX_STEP_INDEX = 1`. The spec drives statutory-documents,
branding, units, rules-upload and invite steps — **none of which exist for either
community type** — and waits on `data-testid="condo-onboarding-wizard"` /
`"apartment-onboarding-wizard"`, ids that `git log -S` finds only in the spec and
the design doc. `data-hydrated` appears app-wide on one unrelated component
(`components/help/article-feedback.tsx:92`).

So "rewrite it against the shipped wizard" is authoring a new spec, not editing
one. That is a product question — what should first-run onboarding guarantee? —
and it was answered here as: **mark both blocks `test.fixme` naming the gap**, so
the missing coverage stays visible in the suite rather than disappearing into a
deleted file. The file header now carries the full evidence.

**One recorded sub-question, answered: `/dev/reset-onboarding` is NOT stale.** It
writes `onboarding_wizard_state` keyed `(community_id, wizard_type)` with
`last_completed_step = NULL`, which is exactly what the shipped
`GET /api/v1/onboarding/{condo,apartment}` reads. It needs no change under any
option.

### Blocker 2 — `platform_admin_users`: FIXED, and deliberately NOT by seeding

The recorded blocker was "nothing seeds `platform_admin_users`". Seeding it was
rejected: it would place platform-wide `super_admin` into shared demo data used for
real demos.

The reframe that resolved it: **the admin app's `/dev/agent-login` was already the
privilege-granting surface, and it was half-broken.** It minted a session for
`pm.admin@sunset.local` that `apps/admin/src/middleware.ts:178` then immediately
rejected for want of a `platform_admin_users` row. It granted the session but not
the grant that makes a session useful. Read that way this is a latent bug in an
existing dev-only route, not a missing seed row.

`apps/admin/src/app/dev/agent-login/route.ts` now creates-or-reuses a **dedicated**
identity, `e2e.platform.admin@local`, and upserts its `platform_admin_users` row,
in `development` only (the route already 404s otherwise). Consequences, all
verified against the local stack:

- `pnpm seed:demo` is untouched. `select count(*) from platform_admin_users` is
  **0 rows** on a freshly seeded database — confirmed after seeding.
- The privileged identity is **not a demo persona**. `pm.admin@sunset.local` never
  receives platform privilege, so no demo can surface a super_admin.
- No extra script for a future e2e job to forget.

After the run, the table holds exactly one row: `e2e.platform.admin@local /
super_admin`. `loginAsPlatformAdmin` uses `?as=platform_admin`; `pm_admin` is kept
as an accepted alias.

### `support-access` then surfaced TWO further spec defects, both fixed

Unblocking the login did not make the spec pass — it made it *progress*, which
exposed two genuine spec bugs that had never been reachable before:

1. **Host mismatch — `localhost` vs `127.0.0.1`.** `loginAsPlatformAdmin`
   authenticated on `http://localhost:3001`; `ADMIN_CLIENT_URL` was
   `http://127.0.0.1:3001/clients/1`. Supabase auth cookies are **host-only**, and
   these are different hosts despite the same address, so every request arrived
   unauthenticated and the middleware bounced it to `/auth/login`. The visible
   symptom was a missing "Support" tab — three redirects removed from the cause,
   and easily misread as an admin-UI gap. Proven with one cookie jar: `/clients` on
   `127.0.0.1` → 200 authenticated; `/clients/1` on `localhost` with the *same* jar
   → `/auth/login`, zero occurrences of "Support".
   This is the seventh addendum's `localhost` ≠ `127.0.0.1` trap resurfacing in a
   second place. Fixed to `localhost`, which is the correct side: Next's dev server
   normalises `request.url` to `localhost` regardless of `--hostname`, so the admin
   app's own redirects land there (observed: a request to
   `127.0.0.1:3001/dev/agent-login` 307s to `http://localhost:3001/clients`).
2. **Stale greeting copy.** The spec asserted `Welcome back, Olivia`. The greeting
   was renamed to `Welcome, {firstName}` in `ec8fb6c9`
   (`components/dashboard/dashboard-welcome.tsx:10`); `Welcome back` exists nowhere
   in `apps/web/src`. Because this spec had never authenticated, the assertion had
   never once run. Updated to the shipped copy — still an `h1` naming the
   impersonated user.

With both fixed, `support-access` now clears admin login, the Support tab, session
creation and impersonation, and the read-only banner assertion passes.

### NEW app defect, unfixed: support impersonation forwards a MIXED identity

`support-access` still fails, on one assertion —
`getByRole('button', { name: /Olivia Owner/i })` — and **the spec is right; the app
is wrong.**

`apps/web/src/middleware.ts:1128` stamps only `USER_ID_HEADER` with the
impersonated user. `USER_EMAIL_HEADER` and `USER_FULL_NAME_HEADER`, set earlier at
lines 421/435, keep the **authenticating admin's** values. The page shell derives
its user entirely from those forwarded headers
(`lib/request/page-auth-context.ts:30-42`), so during a support session the chrome
shows the *admin's* name and email while the page body shows the *impersonated
user's* data. The dashboard greeting passes precisely because it comes from a
DB query keyed on user id, not from the header.

Why it matters beyond the test: an operator impersonating a resident cannot tell
from the account menu whose account they are in. Here the admin has no full name,
so `ProfileMenu` falls back to `aria-label="Account menu"` and the assertion finds
nothing; in production, with a named admin, it would confidently display the
**wrong** name.

Not fixed here: the repair belongs in a security-sensitive middleware path and the
obvious implementation (look the target user up per request) lands an extra query
in the hot path this repo has an active performance programme around. The
alternative — carrying name/email in the signed support JWT — changes the payload
shape and the admin-side session creation. That is a real trade-off and a
deliberate decision, not a drive-by.

### The three unconfirmed fixes from #902 — now measured

The seventh addendum's table left three entries "NOT yet observed passing" and
asked for a full run before quoting a higher number. That run happened:

| Fix | Seventh addendum | Measured this pass |
|---|---|---|
| `demo-flows` FIRST_RENDER_TIMEOUT 30s → 60s | NOT observed | **CONFIRMED** — all 9 `demo-flows` blocks pass |
| owner-payment-portal budget | NOT observed | **CONFIRMED** — `phase1-roadmap-smoke:169` passes (13.7s) |
| meetings-dialog budget | NOT observed | **INSUFFICIENT — the fix does not work.** `meeting-create-spacebar` still fails, now at the *raised* 30s timeout: `getByRole('dialog')` never appears at all. This was never a budget problem; the dialog does not open. |
| `esign` → `Governing Documents` category | NOT observed | **STILL UNREACHED, and not for the recorded reason.** The spec now fails *earlier*, at line 126: after clicking the template trigger, `getByPlaceholder('Search templates...')` never appears within 30s. The category fix is neither confirmed nor refuted — execution does not get that far. |

The last two share a shape worth naming: **an overlay that never opens after a
click** (a Radix dialog and a combobox popover), each failing a 30s wait rather
than a 5s one. Two independent specs failing the same way is a lead about the
overlay layer, not two unrelated budget misses — and the earlier reading of them as
timing/budget issues is now measurably wrong.

### Remaining 4 failures, with causes

| Spec | Cause | Kind |
|---|---|---|
| `esign-and-documents-flow:109` | template picker popover never opens (30s) | app / overlay — unresolved |
| `meeting-create-spacebar:12` | Create Meeting dialog never opens (30s) | app / overlay — unresolved |
| `signup-trialing:39` | `price_placeholder_…` ids no Stripe account can resolve | recorded blocker, unchanged |
| `support-access:107` | mixed impersonation identity (above) | app — newly identified |

`signup-trialing` remains the third recorded blocker from the seventh addendum and
is untouched here.

### Verification for this pass

`tsc --noEmit` clean on **both** `@propertypro/web` and `@propertypro/admin`;
`node scripts/run-lint-guards.mjs` **21/21**; unit **11,060 passed / 0 failed**
(939 files) against a stub `DATABASE_URL`; integration **310 app + 121 RLS**, all
passing, on the local runner.

**One trap for the next person, and it cost a full unit run here:** a *fresh
worktree* fails 269 unit test FILES at collection with `Failed to resolve entry for
package "@propertypro/api-contract"` — the workspace packages have no `dist` until
`pnpm --filter './packages/*' build` is run. `pnpm install` alone is not enough.
The signature is unmistakable once you know it: hundreds of failed *files* but only
a handful of failed *tests*, because the files never executed. Build the packages
before believing any local unit number from a new worktree.

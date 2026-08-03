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

1. `scripts/with-env-local-demo-db.sh` advertises `pnpm test:e2e` in its usage
   text but does not redirect Supabase Auth. **Actively dangerous.**
2. `/dev/site-preview` breaks `next build` whenever the database is reachable.
3. The app exhausts a 100-connection Postgres under e2e load.
4. `playwright.prod.config.ts`'s non-spreading `webServer.env`.
5. The tenant config's webServer takes hours to become healthy.
6. `signup-trialing` fails instead of skipping, after a 3-minute timeout.
7. Local setup needs an undocumented `documents` bucket and `stripe_prices` rows;
   neither is in the seed. Both belong in `pnpm seed:demo` or the local recipe.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

/**
 * Read, not `import`. Playwright loads this config through an ESM loader that
 * rejects a bare JSON import with `ERR_IMPORT_ASSERTION_TYPE_MISSING`, and the
 * `with { type: 'json' }` form is not portable across the Node versions this
 * repo supports. Parsing the file keeps ONE source of truth that both this
 * config and the workflow's assertion step read — which is the property that
 * matters: the spec list and the count CI enforces cannot drift apart.
 */
const ciSafeSpecs = JSON.parse(
  readFileSync(fileURLToPath(new URL('./e2e/ci-safe-specs.json', import.meta.url)), 'utf8'),
) as { specs: string[]; expectedTestCount: number };

/**
 * The config `.github/workflows/e2e.yml` runs: a curated allowlist against a
 * dev server backed by a real Supabase stack.
 *
 * ## Why a config with `testMatch`, and not spec paths on the command line
 *
 * A CLI path list OVERRIDES `testMatch` and silently diverges from whatever the
 * config says — the same trap `playwright.prod.config.ts` documents for
 * `test:e2e:prod`. Keeping the list in a file that the workflow's assertion step
 * also reads means the set of specs and the count CI enforces cannot drift apart
 * without someone editing one file.
 *
 * ## Why an allowlist at all
 *
 * The rest of the suite does not pass against this stack yet, and a job that
 * lands red gets muted or reverted — taking the coverage with it. `specs` is
 * measured (see the `$comment` in ci-safe-specs.json) and is meant to GROW.
 *
 * ## Differences from playwright.config.ts, each deliberate
 *
 * - **The admin server IS started**, unlike an earlier revision of this file.
 *   `support-access` drives `:3001`, and it is the only spec anywhere that
 *   covers support impersonation — an admin viewing a tenant user's data. It
 *   costs a second cold Next build, the largest fixed cost in this job, and
 *   that is worth paying for the one check on a high-privilege path (#958).
 * - **`retries: 2`** — raised from 1 on evidence. The failures that have made
 *   this job red are always the same heavy specs (`esign-and-documents-flow`,
 *   `phase1-roadmap-smoke`, `support-access`), each of which passes on a retry
 *   more often than not; one retry was not always enough. This matches
 *   `playwright.config.ts`, which already uses 2 under CI.
 *   The wall-clock worry that originally argued for 1 has been measured away:
 *   runs take 16-22 min against a 45 min budget.
 * - **`reuseExistingServer: false`.** On a fresh runner nothing should already
 *   own the port. If something does, that is a bug worth failing on rather than
 *   silently testing against another process — the default config allows reuse
 *   only because a developer's second checkout frequently owns 3000.
 *
 * Everything else — one worker, the `localhost` baseURL, the 300s server
 * budget — is inherited on purpose. See playwright.config.ts for the
 * measurements behind each.
 */
const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT ?? '3000';

export default defineConfig({
  testDir: './e2e',
  testMatch: ciSafeSpecs.specs,
  fullyParallel: true,
  // One worker. Measured: parallelism buys 13% of wall clock and costs half the
  // pass rate, because a single `next dev` cannot serve several browsers doing
  // first-compile navigations at once. See playwright.config.ts for the table.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 2,
  reporter: 'list',
  /**
   * Raised for `next dev` FIRST-COMPILE latency, not to paper over slowness.
   *
   * Playwright's default `expect` timeout is 5s, which assumes a warm server.
   * These specs run against a dev server that compiles each route on demand,
   * on a runner far slower than the machine the allowlist was measured on. The
   * first run on `main` failed exactly there:
   *
   *   phase1-roadmap-smoke ›Phase 1A finance dashboard tab shell
   *     expect(locator).toBeVisible() failed
   *     Timeout: 5000ms — element(s) not found
   *     page.goto: net::ERR_ABORTED; maybe frame was detached?
   *
   * That spec navigates `/communities/[id]/finance`, which is a COMPATIBILITY
   * REDIRECT into the payments surface — so it pays two cold compiles before
   * the first assertion. And because `phase1-roadmap-smoke` declares
   * `mode: 'serial'`, that single timeout skipped the four tests behind it:
   * the run reported `expected=21 flaky=1 unexpected=1 skipped=4`.
   *
   * These budgets are ceilings, not waits — a genuinely missing element still
   * fails, just later. The alternative (dropping the spec from the allowlist)
   * would trade real coverage for a dev-server artefact.
   */
  expect: { timeout: 15_000 },
  timeout: 90_000,
  use: {
    // MUST be `localhost`, not `127.0.0.1`. `next dev` pins its redirect origin
    // to `http://localhost:<port>` regardless of the request Host header, and
    // browsers treat the two as different cookie hosts — so a 127.0.0.1 baseURL
    // makes any test that follows a server-side redirect arrive with no session
    // and bounce to /auth/login, looking logged out while being logged in.
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      // `dev:e2e` starts with `rm -rf .next`, so this is always a cold webpack
      // build. The budget is only ever spent waiting for readiness.
      command: 'pnpm dev:e2e',
      env: {
        PORT: WEB_PORT,
        // Per-server rather than a step-level NODE_OPTIONS in e2e.yml, which
        // reached BOTH servers. That is tidiness, NOT a fix for anything.
        //
        // `next dev` logs "Server is approaching the used memory threshold,
        // restarting..." during this job. The conclusion to draw from that has
        // been revised once; both halves matter.
        //
        // STILL TRUE: tuning this ceiling does nothing. Measured — 6144 and
        // 10240 both produced two restarts in a run, and 8192 is simply a value
        // that has run green repeatedly. It is not load-bearing.
        //
        // And there is now a mechanism for why, rather than a correlation.
        // `next@15.5.12` `dist/server/lib/start-server.js` checks, in the
        // `finally` of the request listener — i.e. after EVERY request:
        //
        //     if (used_heap_size > 0.8 * heap_size_limit) { ... process.exit() }
        //
        // `used_heap_size` counts garbage V8 has not collected yet, and V8 sizes
        // old-space growth relative to the configured limit. Raising
        // --max-old-space-size raises BOTH SIDES of that comparison, which is
        // exactly why 6144 and 10240 measured the same. There is no env switch
        // to disable the watchdog; the `isDev` branch is unconditional.
        //
        // REVISED: this comment used to conclude "the restart is not the cause"
        // of the ERR_CONNECTION_RESET failures, from a table of three runs
        // showing 1 restart in two passes and in one failure. That inference
        // does not hold. The failure needs a CONJUNCTION — a restart AND a
        // request in flight at that instant. Restart count is near-constant
        // because it tracks compile volume, and the suite is the same every
        // run, so it cannot discriminate pass from fail; the discriminating
        // variable is coincidence, which that table never measured.
        //
        // `.github/workflows/e2e.yml` has the direct temporal evidence, from
        // the server's own log: the restart at 01:37:15.8, the
        // ERR_CONNECTION_RESET at 01:37:17.3. `process.exit()` does not drain,
        // so every open socket is severed — and it severs ANY in-flight
        // request, not only document navigations.
        //
        // What follows from that: a `page.goto` retry is the wrong fix (it
        // covers one of several exposed request types and deletes the only
        // signal that this happens). `retries: 2` below already recovers it.
        // The lever that would remove the failure mode is Turbopack, which
        // holds the module graph outside the V8 heap this watchdog measures —
        // `dev` already uses it, `dev:e2e` does not. That is a spike with its
        // own measurement, not a rider on a flake fix.
        NODE_OPTIONS: '--max-old-space-size=8192',
      },
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 300_000,
    },
    {
      // The admin app, for `support-access` — the only spec covering support
      // impersonation.
      //
      // It needs a real environment, and gets it from `process.env` in CI
      // (e2e.yml sets DATABASE_URL, the Supabase keys and
      // SUPPORT_SESSION_JWT_SECRET at job level). LOCALLY it needs
      // `apps/admin/.env.local` to exist — `scripts/setup.sh` creates that
      // symlink, but only if it is re-run after the admin app was added, and a
      // worktree created before then will not have it.
      //
      // With no env at all, `signSupportToken` throws on a missing
      // SUPPORT_SESSION_JWT_SECRET, the session route 500s, and
      // `StartSessionDialog` returns WITHOUT calling `window.open` — so the
      // spec waited 120s for a popup that could never arrive. That was the
      // whole of #958: an environment gap wearing a timeout as a disguise.
      command:
        'pnpm --filter @propertypro/admin exec next dev --port 3001 --hostname 127.0.0.1',
      env: {
        // 4GB. I first set this to 1536 reasoning that one spec touches this
        // app so it cannot need much — and killed it. A `next dev` process has
        // a substantial baseline regardless of how little you ask of it, and
        // the run failed with the admin server simply GONE:
        //
        //   net::ERR_CONNECTION_REFUSED at http://localhost:3001/clients/1
        //   Admin refused to start the support session:
        //     "Network error. Please try again."
        //
        // (That second line is the spec's own diagnostic from #958 — the dialog
        // reporting that `fetch` could not reach the server at all. Without it
        // this was a 120s wait on a popup event with no stated cause.)
        //
        // support-access passed reliably when admin inherited the step-level
        // 8192, so the ceiling was never the thing to economise on. These are
        // ceilings, not reservations: 8GB + 4GB on a 15Gi runner is fine.
        NODE_OPTIONS: '--max-old-space-size=4096',
      },
      url: 'http://127.0.0.1:3001',
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
  projects: [
    /**
     * Compiles the heavy routes before anything is asserted. See
     * e2e/warmup.setup.ts for why a bigger timeout was not the fix.
     *
     * A project dependency rather than `globalSetup`: the ordering of
     * `globalSetup` relative to `webServer` has changed across Playwright
     * versions, and a warmup that runs before the server exists is worse than
     * no warmup — it would silently do nothing.
     */
    {
      name: 'warmup',
      testMatch: /warmup\.setup\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['warmup'],
    },
  ],
});

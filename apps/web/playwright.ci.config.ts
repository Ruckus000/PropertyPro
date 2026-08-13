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
 * - **`retries: 1`, not 2.** The allowlist runs ~8.3 minutes locally at one
 *   worker (measured; the 11.1 min figure elsewhere is the full 35-block
 *   suite, not this 28-block subset).
 *   Two retries on a slow runner can triple a spec's contribution and
 *   push the job past its timeout — and a timed-out job reports as CANCELLED,
 *   which reads green-ish in `gh pr checks`. One retry absorbs genuine CI
 *   flakiness without hiding a spec that fails every time.
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
  retries: 1,
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
        // Per-server, and LARGE. `next dev` compiles routes on demand and
        // accumulates heap across a 28-spec run; its watchdog restarts as
        // heapUsed nears the ceiling, and a restart kills whatever navigation
        // is in flight (`ERR_CONNECTION_RESET`, then `ERR_CONNECTION_REFUSED`
        // while it comes back).
        //
        // MEASURED, after getting this wrong twice:
        //   step-level 8192 (reached BOTH servers)  -> restarted, 1 failure
        //   web 6144 + admin 2048                   -> restarted TWICE
        // The threshold is relative to the heap ceiling, so lowering it makes
        // the restart come SOONER. Direction matters more than tidiness here.
        //
        // The runner has 15Gi with ~12Gi free before the servers start (see the
        // "Report runner resources" step — that is a measurement of this job,
        // not GitHub's docs). 10GB + 1.5GB is a ceiling, not a reservation, and
        // leaves Chromium real room.
        //
        // If this recurs, stop tuning the number: the structural fix is to
        // split the run across two Playwright invocations so no single dev
        // server has to survive all 28 specs.
        NODE_OPTIONS: '--max-old-space-size=10240',
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
        // Small on purpose: exactly ONE spec touches this app and the warmup
        // compiles the two routes it uses, so it never grows a large heap.
        // Every GB ceded here is a GB the web server — which must survive all
        // 28 specs — can use instead.
        NODE_OPTIONS: '--max-old-space-size=1536',
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

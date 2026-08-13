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
 * - **No admin server.** None of the allowlisted specs touches `:3001`; the one
 *   that does, `support-access`, is not on the list. Skipping it saves a second
 *   cold Next build, which is the single largest fixed cost in this job. The
 *   default config warns this omission is SILENT, so it is justified by the
 *   measured run, not by reading the specs.
 * - **`retries: 1`, not 2.** The allowlist runs ~8.3 minutes locally at one
 *   worker (measured; the 11.1 min figure elsewhere is the full 35-block
 *   suite, not this 27-block subset).
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
  use: {
    // MUST be `localhost`, not `127.0.0.1`. `next dev` pins its redirect origin
    // to `http://localhost:<port>` regardless of the request Host header, and
    // browsers treat the two as different cookie hosts — so a 127.0.0.1 baseURL
    // makes any test that follows a server-side redirect arrive with no session
    // and bounce to /auth/login, looking logged out while being logged in.
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    // `dev:e2e` starts with `rm -rf .next`, so this is always a cold webpack
    // build. The budget is only ever spent waiting for readiness.
    command: 'pnpm dev:e2e',
    env: { PORT: WEB_PORT },
    url: `http://127.0.0.1:${WEB_PORT}`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

import { defineConfig, devices } from '@playwright/test';

/**
 * The three specs this config is allowed to run.
 *
 * They share the one property that makes them viable against a PRODUCTION
 * build: they need no database, no Supabase Auth and no seed. That is what
 * lets `perf-check` run them in a job whose `DATABASE_URL` points at a stub
 * that was never started.
 *
 * Without this allowlist, `testDir: './e2e'` collected the WHOLE suite — 39
 * tests in 13 files. A bare `pnpm test:e2e:prod` therefore pointed the 25
 * auth-dependent blocks at a production server, where `/dev/agent-login` (the
 * only way those specs authenticate) is a dev-only route that middleware 404s.
 * CI was saved from this only by passing three paths on the command line.
 *
 * THIS ARRAY IS NOW THE SINGLE LIST. `.github/workflows/ci.yml` used to repeat
 * the same three paths as CLI arguments, which override `testMatch` — so a spec
 * added here would silently not have run in CI until someone also edited the
 * workflow. Those arguments are gone; do not reintroduce them.
 *
 * Adding a spec here requires proving it passes against a production build
 * with an UNREACHABLE database — see the E2E section of CLAUDE.md.
 */
const PROD_SAFE_SPECS = [
  'pdfjs-runtime.spec.ts',
  'activation-smoke.spec.ts',
  'marketing-smoke.spec.ts',
];

/**
 * The port `next start` binds and the specs target.
 *
 * Overridable because `reuseExistingServer: false` makes a taken port a HARD
 * FAILURE, not a fallback — and once `perf-check` runs on a self-hosted runner
 * there can be two of them on one machine (different refs are not covered by
 * the workflow's `concurrency` group, which is keyed on ref).
 */
const PORT = process.env.PLAYWRIGHT_PROD_PORT ?? '3100';
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: PROD_SAFE_SPECS,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  /**
   * PINNED, not left to the default.
   *
   * Playwright's default is `cores / 2`, so this silently tracked whatever
   * hardware CI happened to run on: 2 workers on a 4-core `ubuntu-latest`
   * runner, 4 on the 8-vCPU self-hosted VM. Four Chromiums against a single
   * `next start` is a different test than the one these budgets and this
   * allowlist were validated against, and combined with `retries: 2` the
   * failure mode is not a clean red — it is intermittently-slow green, which
   * gets misattributed to "the new runner" for weeks.
   *
   * 2 preserves the behaviour CI has actually been exercising. The sibling
   * `playwright.config.ts` pins `workers: 1` on measured evidence that
   * parallelism against one server halves the pass rate; these three specs are
   * static and DB-free so they tolerate more, but the number should be a
   * decision, not a property of the host.
   */
  workers: 2,
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm exec next start --port ${PORT} --hostname 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    // `env` is MERGED OVER `process.env`, not a replacement for it — Playwright
    // spawns `{...process.env, ...env}` (measured at 1.58.2). Adding
    // `...process.env` here is a no-op; the 2026-08-03 audit proposed it on the
    // opposite assumption. The real precondition is the BUILD: `next start`
    // serves whatever `.next` holds.
    env: {
      PDFJS_TEST_ENABLED: '1',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

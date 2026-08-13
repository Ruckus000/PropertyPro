import { defineConfig, devices } from '@playwright/test';

/**
 * Default e2e config: the specs that run against a plain dev server on :3000.
 *
 * `testIgnore` is load-bearing, not tidiness. `testDir` alone globs in three
 * specs that CANNOT pass here, which made `pnpm test:e2e` — the command
 * CLAUDE.md tells you to run — red by construction. A documented command that
 * always fails trains everyone to ignore e2e results, and that is how most of
 * this suite came to run nowhere at all.
 *
 * That is no longer the state. Counts below are from `playwright test --list`
 * per config, NOT from grepping for `test(` — that regex both overcounts
 * (`.test(` calls) and undercounts, and is how an earlier version of this
 * comment arrived at 43.
 *
 *   default (this file)  35 in 12 files
 *   prod                 10 in  3 files  (pdfjs 4 + activation 3 + marketing 3)
 *   tenant                6 in  2 files
 *   ci                   28 in  8 files
 *
 * Distinct total: **45 blocks across 15 spec files** (35 + pdfjs's 4, which
 * this config ignores, + the 6 tenant blocks).
 *
 * **32 now run on a PR** — 10 in `perf-check` against a production build, and
 * 28 in the `E2E` workflow, which brings up Supabase and a seed so the
 * authenticated specs can run at all. The two overlap on activation-smoke and
 * marketing-smoke, hence 32 rather than 38.
 *
 * The 13 still unexercised on a PR: the 5 signup blocks (owned by
 * stripe-e2e.yml, and conditional on its secrets), the 6 tenant-host blocks
 * (community-tenant-host-precedence, wave-2-ga-staging — they need :3002), and
 * the 2 `onboarding-first-run` `test.fixme` blocks, which describe a wizard
 * that was never built.
 *
 * `support-access` was on that list until #958. It had looked like a broken
 * spec; the admin app was simply running with no environment, so
 * `signSupportToken` threw and the dialog never opened the popup being waited
 * on. The `E2E` workflow now starts the admin server for it.
 *
 * Each excluded spec is owned by another config; none of them is unowned:
 *   - pdfjs-runtime.spec.ts → playwright.prod.config.ts. Needs a production
 *     build on :3100 with PDFJS_TEST_ENABLED=1, a gate the dev server never
 *     sets.
 *   - community-tenant-host-precedence.spec.ts, wave-2-ga-staging.spec.ts →
 *     playwright.tenant.config.ts, which already names both in its own
 *     `testMatch`. They hardcode `http://…localtest.me:3002` origins and need
 *     the tenant cookie domain; there is no server on :3002 here.
 *
 * Adding a spec that needs a non-default host, port or build must either fit
 * one of those configs or get its own — do not widen this one.
 *
 * ## Port
 *
 * 3000 unless `PLAYWRIGHT_WEB_PORT` says otherwise. The override exists because
 * a second checkout (another worktree) frequently already owns 3000, and the
 * failure mode when it does is silent rather than loud: `reuseExistingServer`
 * is deliberately always-on, so Playwright attaches to THAT server and runs the
 * whole suite against another branch's code. Overriding the port is the only
 * way to run here without killing someone else's server.
 *
 * The default is unchanged, so every documented command behaves exactly as
 * before. Set it on BOTH the runner and any server you start yourself, or the
 * two disagree and every navigation 404s.
 */
const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT ?? '3000';

export default defineConfig({
  testDir: './e2e',
  testIgnore: [
    '**/pdfjs-runtime.spec.ts',
    '**/community-tenant-host-precedence.spec.ts',
    '**/wave-2-ga-staging.spec.ts',
  ],
  fullyParallel: true,
  // ONE worker. Measured 2026-08-05 on an otherwise-idle machine, same stack and
  // seed, port force-cleared before each arm:
  //
  //   workers | passed | failed | never ran | wall  | `Test timeout` | `ERR_ABORTED`
  //   --------|--------|--------|-----------|-------|----------------|--------------
  //         1 |   15   |    8   |     6     | 6.6m  |        4       |      0
  //         2 |   10   |   11   |     8     | 6.2m  |       11       |      0
  //         3 |    7   |   14   |     8     | 5.8m  |       15       |      3
  //
  // Parallelism buys 13% of wall clock and costs HALF the pass rate. The extra
  // failures are not real defects: they are `Test timeout of 30000ms exceeded`
  // and `net::ERR_ABORTED; maybe frame was detached?`, i.e. one `next dev`
  // server unable to serve several browsers doing first-compile navigations at
  // once. A suite that reports 7 passes at 3 workers and 15 at 1 is not telling
  // you about the app.
  //
  // 53 seconds is a cheap price for a result that means something. Revisit only
  // with a new measurement — not on the assumption that more workers are faster.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    // MUST be `localhost`, not `127.0.0.1`, even though the dev server binds
    // 127.0.0.1 and both reach it.
    //
    // `next dev` pins its own origin to `http://localhost:<port>` and builds
    // middleware redirects from it, regardless of the request's Host header
    // (measured 2026-08-05: `Host: 127.0.0.1:3000`, `Host: localhost:3000` and
    // `Host: example.test:3000` all produced
    // `location: http://localhost:3000/auth/login`).
    //
    // Browsers treat `localhost` and `127.0.0.1` as DIFFERENT hosts for cookie
    // purposes. So with a 127.0.0.1 baseURL, the session cookie was set on
    // 127.0.0.1 and any test that followed a middleware or server-side redirect
    // crossed to localhost, arrived with NO cookies, and was bounced to
    // /auth/login — a logged-in test failing as though it were logged out.
    // `add-community.spec.ts:40` is the case that exposed it.
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  // `dev:e2e` begins with `rm -rf .next`, so BOTH servers below do a cold
  // webpack build before they answer. 120s was not enough for that on a busy
  // machine — an entire run aborted with
  // `Error: Timed out waiting 120000ms from config.webServer`, which reads like
  // a broken app rather than a slow build. This budget is only ever spent
  // waiting for readiness; a server that starts in 40s still starts in 40s.
  webServer: [
    {
      command: 'pnpm dev:e2e',
      env: { PORT: WEB_PORT },
      url: `http://127.0.0.1:${WEB_PORT}`,
      // Always allow reuse: if nothing is listening, Playwright still starts dev:e2e.
      // When CI is set in a dev shell and 3000 is already taken, false would error.
      reuseExistingServer: true,
      timeout: 300_000,
    },
    // The admin app, unless `PLAYWRIGHT_SKIP_ADMIN_SERVER` says otherwise.
    //
    // Opt-OUT, so every existing invocation is unchanged and a spec that needs
    // admin keeps getting it by default. The escape hatch exists for runs that
    // provably never touch :3001 — the Stripe signup specs, which the
    // stripe-e2e workflow runs on their own. Starting admin there costs a
    // second cold Next build and a second env surface, and its `/` 500s if any
    // of that env is missing, which Playwright reports as a webServer timeout
    // rather than as the missing variable it is.
    //
    // Do NOT set this for the default suite: `reuseExistingServer` means the
    // omission is silent, and admin specs would fail looking like app bugs.
    ...(process.env.PLAYWRIGHT_SKIP_ADMIN_SERVER
      ? []
      : [
          {
            command:
              'pnpm --filter @propertypro/admin exec next dev --port 3001 --hostname 127.0.0.1',
            url: 'http://127.0.0.1:3001',
            reuseExistingServer: true,
            timeout: 300_000,
          },
        ]),
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

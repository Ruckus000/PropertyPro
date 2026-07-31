import { defineConfig, devices } from '@playwright/test';

/**
 * Default e2e config: the specs that run against a plain dev server on :3000.
 *
 * `testIgnore` is load-bearing, not tidiness. `testDir` alone globs in three
 * specs that CANNOT pass here, which made `pnpm test:e2e` — the command
 * CLAUDE.md tells you to run — red by construction. A documented command that
 * always fails trains everyone to ignore e2e results, and that is how 36 of
 * this suite's 40 test blocks came to run nowhere at all.
 *
 * Each excluded spec is owned by another config; none of them is unowned:
 *   - pdfjs-runtime.spec.ts → playwright.prod.config.ts. Needs a production
 *     build on :3100 with PDFJS_TEST_ENABLED=1, a gate the dev server never
 *     sets. This is the ONE spec CI runs (inside perf-check).
 *   - community-tenant-host-precedence.spec.ts, wave-2-ga-staging.spec.ts →
 *     playwright.tenant.config.ts, which already names both in its own
 *     `testMatch`. They hardcode `http://…localtest.me:3002` origins and need
 *     the tenant cookie domain; there is no server on :3002 here.
 *
 * Adding a spec that needs a non-default host, port or build must either fit
 * one of those configs or get its own — do not widen this one.
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: [
    '**/pdfjs-runtime.spec.ts',
    '**/community-tenant-host-precedence.spec.ts',
    '**/wave-2-ga-staging.spec.ts',
  ],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'pnpm dev:e2e',
      url: 'http://127.0.0.1:3000',
      // Always allow reuse: if nothing is listening, Playwright still starts dev:e2e.
      // When CI is set in a dev shell and 3000 is already taken, false would error.
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @propertypro/admin exec next dev --port 3001 --hostname 127.0.0.1',
      url: 'http://127.0.0.1:3001',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

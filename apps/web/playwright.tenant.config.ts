import { defineConfig, devices } from '@playwright/test';

/**
 * Subdomain + shared cookie domain for E2E that assert tenant host wins over
 * a conflicting `?communityId=` (see e2e/community-tenant-host-precedence.spec.ts).
 *
 * Uses `localtest.me` (resolves to 127.0.0.1) so apex has no fake tenant label;
 * `127.0.0.1.nip.io` is unsuitable because the first host label is `127`, which
 * matches the tenant slug pattern and breaks apex login.
 *
 * Port 3002 avoids `reuseExistingServer` attaching to an unrelated app on :3000.
 *
 * Run: pnpm test:e2e:tenant (from apps/web) or pnpm test:e2e:tenant from repo root.
 */
const TENANT_E2E_PORT = 3002;
const TENANT_E2E_HOST = `localtest.me:${TENANT_E2E_PORT}`;
const TENANT_E2E_ORIGIN = `http://${TENANT_E2E_HOST}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/community-tenant-host-precedence.spec.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: TENANT_E2E_ORIGIN,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm predev:e2e && pnpm exec next dev --port 3002 --hostname 127.0.0.1',
    url: TENANT_E2E_ORIGIN,
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PLAYWRIGHT_TENANT_E2E: '1',
      NEXT_PUBLIC_COOKIE_DOMAIN: '.localtest.me',
      NEXT_PUBLIC_ROOT_DOMAIN: TENANT_E2E_HOST,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

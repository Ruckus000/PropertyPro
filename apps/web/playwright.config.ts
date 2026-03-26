import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
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

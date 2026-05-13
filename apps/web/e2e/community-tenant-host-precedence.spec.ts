/**
 * Regression: on a real tenant subdomain, `?communityId=` for another community
 * must not override the host tenant (multi-community switch + nav links).
 *
 * Requires DNS for *.localtest.me (resolves to 127.0.0.1), Playwright
 * webServer env from playwright.tenant.config.ts, and a seeded DB (agent-login).
 */
import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/dev-login';

const SUNSET_SUBDOMAIN_ORIGIN = 'http://sunset-condos.localtest.me:3002';

test.describe('Tenant host vs communityId query', () => {
  test('shell shows host community when query pins a different community', async ({ page }) => {
    test.setTimeout(90_000);

    const { allCommunities } = await loginAs(page, 'board_president');
    const sunset = allCommunities.find((c) => c.slug === 'sunset-condos');
    const palm = allCommunities.find((c) => c.slug === 'palm-shores-hoa');
    expect(sunset, 'seed must include sunset-condos for board_president').toBeTruthy();
    expect(palm, 'seed must include palm-shores-hoa for board_president').toBeTruthy();

    await page.goto(
      `${SUNSET_SUBDOMAIN_ORIGIN}/dashboard?communityId=${palm!.id}`,
      { waitUntil: 'domcontentloaded' },
    );

    await expect(page.getByText('Sunset Condos', { exact: false }).first()).toBeVisible({
      timeout: 60_000,
    });
  });
});

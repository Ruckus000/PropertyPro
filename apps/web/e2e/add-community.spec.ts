/**
 * E2E Test: PM Add Community Flow (Task 15)
 *
 * Verifies who is offered Add Community and that the legacy wizard URL
 * redirects back to the dashboard.
 *
 * The form submission path (Stripe Embedded Checkout) is not exercised here
 * because it would require live Stripe test credentials and would create
 * real records in the database.
 */
import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/dev-login';
import { clickWhenHydrated } from './helpers/hydration';

test.describe('PM Add Community Flow', () => {
  // Above Playwright's 30s default: this describe compiles the FIRST
  // authenticated route of the run, and a 30s per-assertion budget is
  // unreachable while the test itself is also capped at 30s.
  test.setTimeout(120_000);

  // The seeded pm_admin pays for the demo portfolio but is root manager of none
  // of its communities, so the add rule refuses them: adding a community is the
  // billing owner's, while root in the portfolio. No seeded persona is both, so
  // opening the form is covered by the jsdom tests (add-community-modal,
  // profile-menu-add-community, pm-dashboard-client), not here.
  test('a portfolio billing owner who is not root is not offered Add Community', async ({ page }) => {
    await loginAs(page, 'pm_admin');

    // `domcontentloaded`, not `networkidle`. This is the FIRST authenticated
    // route the suite compiles, so it pays the largest cold-compile cost of any
    // block — and `networkidle` never settles on a dev-server page, so it blew
    // the 30s test timeout inside `page.goto` before any assertion ran.
    const pageAnswer = page.waitForResponse((r) => r.url().includes('/api/v1/pm/communities/add-access'), {
      timeout: 60_000,
    });
    await page.goto('/pm/dashboard/communities', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /communities/i })).toBeAttached({ timeout: 30_000 });
    // Absence means nothing until the answer is in: wait for it, and check it.
    const answer = await pageAnswer;
    expect((await answer.json()).data).toEqual({ allowed: false, billingGroupId: null });
    await expect(page.getByRole('button', { name: 'Add Community', exact: true })).toHaveCount(0);

    // The account menu asks the same question when it opens.
    const menu = page.getByRole('button', { name: /account menu/i });
    await clickWhenHydrated(menu);
    await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Add Community' })).toHaveCount(0);
  });

  test('legacy /communities/new URL redirects back to the dashboard', async ({ page }) => {
    await loginAs(page, 'pm_admin');

    await page.goto('/pm/dashboard/communities/new', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/pm\/dashboard\/communities(\?|$)/, { timeout: 30_000 });
  });
});

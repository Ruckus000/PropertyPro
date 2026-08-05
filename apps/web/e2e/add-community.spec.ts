/**
 * E2E Test: PM Add Community Flow (Task 15)
 *
 * Verifies that the PM can open the Add Community modal from the dashboard
 * and that the legacy wizard URL redirects back to the dashboard.
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

  test('PM can open the Add Community modal from the dashboard', async ({ page }) => {
    await loginAs(page, 'pm_admin');

    // `domcontentloaded`, not `networkidle`. This is the FIRST authenticated
    // route the suite compiles, so it pays the largest cold-compile cost of any
    // block — and `networkidle` never settles on a dev-server page, so it blew
    // the 30s test timeout inside `page.goto` before any assertion ran. The
    // assertions below auto-wait for what actually matters.
    await page.goto('/pm/dashboard/communities', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /communities/i })).toBeVisible({
      timeout: 30_000,
    });

    const addButton = page.getByRole('button', { name: /add community/i });
    await expect(addButton).toBeVisible();
    // This block PASSES today, but it had the same latent bug as the two specs
    // that did not: a click before hydration is SWALLOWED, not delayed, so the
    // 30s below could never rescue it. The old comment here ("the dialog can
    // open a beat late") had exactly the wrong model. It survives on luck — as
    // the first authenticated route compiled, its 30s heading wait absorbs a
    // large cold compile, so hydration usually wins the race. See
    // helpers/hydration.ts.
    await clickWhenHydrated(addButton);

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /add a community/i })).toBeVisible();

    // Core form fields are present
    await expect(page.getByLabel(/community name/i)).toBeVisible();
    await expect(page.getByLabel(/subdomain/i)).toBeVisible();
    await expect(page.getByLabel(/unit count/i)).toBeVisible();

    // Continue button is disabled until required fields are filled
    const continueBtn = page.getByRole('button', { name: /continue to payment/i });
    await expect(continueBtn).toBeDisabled();
  });

  test('legacy /communities/new URL redirects back to the dashboard', async ({ page }) => {
    await loginAs(page, 'pm_admin');

    await page.goto('/pm/dashboard/communities/new', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/pm\/dashboard\/communities(\?|$)/, { timeout: 30_000 });
  });
});

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

test.describe('PM Add Community Flow', () => {
  test('PM can open the Add Community modal from the dashboard', async ({ page }) => {
    await loginAs(page, 'pm_admin');

    await page.goto('/pm/dashboard/communities', { waitUntil: 'networkidle' });

    await expect(page.getByRole('heading', { name: /communities/i })).toBeVisible();

    const addButton = page.getByRole('button', { name: /add community/i });
    await expect(addButton).toBeVisible();
    await addButton.click();

    // Modal opens with title
    await expect(page.getByRole('dialog')).toBeVisible();
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

    await page.goto('/pm/dashboard/communities/new', { waitUntil: 'networkidle' });

    await expect(page).toHaveURL(/\/pm\/dashboard\/communities(\?|$)/);
  });
});

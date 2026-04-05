/**
 * E2E Test: PM Add Community Flow (Task 15)
 *
 * Tests the PM's ability to initiate the add-community flow.
 * Currently verifies the wizard page renders and can be navigated.
 *
 * TODO: Update this test once Stripe embedded checkout integration is complete.
 * Currently the flow creates a community via POST /api/v1/pm/communities,
 * but the task spec mentions a modal with Stripe checkout. Update when that's implemented.
 */
import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/dev-login';

test.describe('PM Add Community Flow', () => {
  test('PM can navigate to add community wizard', async ({ page }) => {
    await loginAs(page, 'pm_admin');

    // Navigate to PM dashboard
    await page.goto('/pm/dashboard/communities', { waitUntil: 'networkidle' });

    // Verify dashboard loads
    await expect(page.getByRole('heading', { name: /communities/i })).toBeVisible();

    // Click the "Add Community" button
    const addButton = page.getByRole('link', { name: /add community/i });
    await expect(addButton).toBeVisible();
    await addButton.click();

    // Should navigate to the add community wizard page
    await expect(page).toHaveURL(/\/pm\/dashboard\/communities\/new/);

    // Verify the wizard page loaded
    await expect(page.getByRole('heading', { name: /add community/i })).toBeVisible();
    await expect(page.getByText(/set up a new association/i)).toBeVisible();

    // Verify the step indicator is visible (showing we're on step 1)
    const stepIndicator = page.locator('[role="navigation"]');
    await expect(stepIndicator).toBeVisible();
  });

  test('PM can fill in and navigate the add community wizard', async ({ page }) => {
    await loginAs(page, 'pm_admin');

    // Navigate directly to the wizard page
    await page.goto('/pm/dashboard/communities/new', { waitUntil: 'networkidle' });

    // Verify we're on the Basics step
    await expect(page.getByRole('heading', { name: /add community/i })).toBeVisible();

    // Fill in the basics step
    await page.getByLabel(/community name/i).fill('Test Community E2E');
    await page.getByLabel(/^community type$/i).selectOption('condo_718');
    await page.getByLabel(/^address$/i).fill('123 Ocean Blvd');
    await page.getByLabel(/city/i).fill('Miami');
    await page.getByLabel(/^state$/i).fill('FL');
    await page.getByLabel(/zip code/i).fill('33101');
    await page.getByLabel(/subdomain/i).clear();
    await page.getByLabel(/subdomain/i).fill('test-community-e2e');

    // Click Next to go to Units step
    await page.getByRole('button', { name: /^next$/i }).click();

    // Verify we're on the Units step
    await expect(page.getByLabel(/number of units/i)).toBeVisible();

    // Fill in unit count
    await page.getByLabel(/number of units/i).fill('48');

    // Click Next to go to Review step
    await page.getByRole('button', { name: /^next$/i }).click();

    // Verify we're on the Review step
    await expect(page.getByText(/review/i)).toBeVisible();
    await expect(page.getByText('Test Community E2E')).toBeVisible();
    await expect(page.getByText(/condo_718/i)).toBeVisible();
    await expect(page.getByText(/test-community-e2e/i)).toBeVisible();

    // Note: We don't submit the form in this test because it would create a real
    // community in the database. In a future test, we could mock the API response
    // or use a test database transaction.
  });

  test('PM sees validation errors for incomplete wizard', async ({ page }) => {
    await loginAs(page, 'pm_admin');

    await page.goto('/pm/dashboard/communities/new', { waitUntil: 'networkidle' });

    // Try to click Next without filling in required fields
    await page.getByRole('button', { name: /^next$/i }).click();

    // Should show an error message
    await expect(page.locator('[role="alert"]')).toBeVisible();
    await expect(page.getByText(/required/i)).toBeVisible();

    // Should still be on step 1
    await expect(page.getByLabel(/community name/i)).toBeVisible();
  });
});

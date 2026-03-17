import { expect, test } from '@playwright/test';

test.describe('marketing smoke', () => {
  test('landing page loads and core public navigation works', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: /your association website is now required by florida law/i }),
    ).toBeVisible();

    await page.getByRole('navigation').getByRole('link', { name: 'Features' }).click();
    await expect(page).toHaveURL(/#features$/);
    await expect(page.locator('#features')).toBeInViewport();

    await page.getByRole('link', { name: 'Privacy Policy' }).click();
    await expect(page).toHaveURL(/\/legal\/privacy$/);
    await expect(page).toHaveTitle(/privacy policy \| propertypro florida/i);
    await expect(
      page.getByText(/draft document/i),
    ).toBeVisible();
  });
});

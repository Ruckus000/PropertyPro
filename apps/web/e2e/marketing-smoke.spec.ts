import { expect, test } from '@playwright/test';

test.describe('marketing smoke', () => {
  test('landing page loads and core public navigation works', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: /run your whole portfolio/i }),
    ).toBeVisible();

    await page.getByRole('navigation').getByRole('link', { name: 'Product' }).click();
    await expect(page).toHaveURL(/#features$/);
    await expect(page.locator('#features')).toBeInViewport();

    await page.getByRole('link', { name: 'Privacy Policy', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /privacy policy/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 2, name: /privacy policy/i })).toBeVisible();
  });
});

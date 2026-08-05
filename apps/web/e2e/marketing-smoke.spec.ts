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

  /**
   * Regression guard for the apex-host redirect.
   *
   * `parsePathBasedPublicRoute` reads any one-segment path on the apex host as a
   * community slug and 308s it to a subdomain — with no DB lookup, so it cannot
   * tell `/contact` from `/sunset-condos`. `/transparency` shipped that way and
   * was dead in production while still linked from the footer.
   *
   * These two pages are fs-only and hit no database, so they are safe to assert
   * in `perf-check`, which runs a production build against an unreachable DB.
   */
  test('apex marketing routes render instead of redirecting to a subdomain', async ({
    page,
  }) => {
    await page.goto('/resources');
    await expect(page).toHaveURL(/\/resources$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('a[href^="/resources/"]').first()).toBeVisible();

    await page.goto('/contact');
    await expect(page).toHaveURL(/\/contact$/);
    await expect(page.getByLabel('Work email')).toBeVisible();
  });

  test('a resource article renders with its legal disclaimer', async ({ page }) => {
    await page.goto('/resources');
    await page.locator('a[href^="/resources/"]').first().click();

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Template-injected, not authored in MDX — no article can ship without it.
    await expect(page.getByText(/does not provide legal advice/i).first()).toBeVisible();
  });
});

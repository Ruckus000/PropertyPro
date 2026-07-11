/**
 * Wave 1a activation smoke — marketing trial truth, /login redirect, checkout guard.
 */
import { expect, test } from '@playwright/test';

test.describe('Wave 1a activation smoke', () => {
  test('marketing pricing states 30-day trial and card required', async ({ page }) => {
    await page.goto('/#pricing');

    const pricing = page.locator('#pricing');
    await expect(pricing).toBeVisible();
    await expect(pricing.getByText(/30-day/i)).toBeVisible();
    await expect(pricing.getByText(/card required/i)).toBeVisible();
    await expect(page.getByText(/no card required/i)).toHaveCount(0);
  });

  test('/login permanently redirects to /auth/login preserving returnTo', async ({ page }) => {
    await page.goto('/login?returnTo=/dashboard');

    await expect(page).toHaveURL(/\/auth\/login\?returnTo=%2Fdashboard/);
  });

  test('checkout routes without session_id show restart copy', async ({ page }) => {
    await page.goto('/signup/checkout');
    await expect(page.getByRole('heading', { name: /restart checkout/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /back to sign up/i })).toBeVisible();

    await page.goto('/signup/checkout/return');
    await expect(page.getByRole('heading', { name: /restart checkout/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /back to sign up/i })).toBeVisible();
  });
});

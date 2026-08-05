/**
 * Wave 1a activation smoke — marketing trial truth, /login redirect, checkout guard.
 */
import { expect, test } from '@playwright/test';

test.describe('Wave 1a activation smoke', () => {
  // LOCAL ONLY — deliberately not applied in CI.
  //
  // Locally this is load-bearing: `pnpm test:e2e` runs a dev server that
  // compiles on demand, and the checkout block below navigates to TWO
  // not-yet-compiled routes inside a single 30s default, which it exceeded on a
  // cold `.next`. This spec is one of the suite's two canaries (no auth, no
  // database), so a false failure here reads as "the environment is broken" and
  // invalidates the whole run.
  //
  // In CI it would be actively harmful. `perf-check` runs this spec against a
  // PRODUCTION build where every route is prebuilt and each block takes
  // seconds, and that job is capped at `timeout-minutes: 15` while also owning
  // the only production build. With `retries: 2`, a 120s budget turns one
  // genuinely broken block into 6 minutes of retrying; two of them exhaust the
  // job. A job that exceeds `timeout-minutes` reports as CANCELLED, not failed,
  // so `gh pr checks` would read green on an unmergeable PR.
  if (!process.env.CI) {
    test.setTimeout(120_000);
  }

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

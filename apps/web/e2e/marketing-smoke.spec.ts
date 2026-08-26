import { expect, test } from '@playwright/test';
import { clickWhenHydrated } from './helpers/hydration';

test.describe('marketing smoke', () => {
  test('landing page loads and core public navigation works', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /on the record/i })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'The product' })
      .click();
    await expect(page).toHaveURL(/#product$/);
    await expect(page.locator('#product')).toBeInViewport();

    // The modal is a React onClick on a server-rendered <a>. Clicking before
    // hydration dispatches into markup with no listener and is swallowed — no
    // timeout can recover it. See helpers/hydration.ts.
    await clickWhenHydrated(page.getByRole('link', { name: 'Privacy Policy', exact: true }));
    const dialog = page.getByRole('dialog', { name: /privacy policy/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 2, name: /privacy policy/i })).toBeVisible();
  });

  /**
   * The landing page is the only place in the app that serves photography, and it
   * does so as plain <img> with a hand-built srcset — no `next/image`, so nothing
   * else would notice a renamed or dropped width. A broken src still lays out at
   * its width/height attributes, so `toBeVisible` would pass; only `naturalWidth`
   * distinguishes a decoded image from a broken one.
   *
   * Asserts `currentSrc` (what the browser actually chose out of the srcset), not
   * `src` (the fallback attribute) — otherwise a srcset full of 404s would pass on
   * the strength of the fallback alone.
   */
  test('every landing-page photograph actually decodes', async ({ page }) => {
    await page.goto('/');
    // Lazy images below the fold never load in a short-lived viewport.
    await page.evaluate(() => {
      for (const img of document.images) img.loading = 'eager';
    });
    await expect
      .poll(async () =>
        page.evaluate(() =>
          [...document.images].map((i) => ({
            chosen: i.currentSrc ? new URL(i.currentSrc).pathname : '',
            decoded: i.complete && i.naturalWidth > 0,
          })),
        ),
      )
      .toEqual(
        // Six photographs, every one decoded, every one from the versioned
        // directory that vercel.json marks immutable.
        Array.from({ length: 6 }, () => ({
          chosen: expect.stringMatching(/^\/marketing\/v1\/[a-z-]+-\d+\.webp$/),
          decoded: true,
        })),
      );
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

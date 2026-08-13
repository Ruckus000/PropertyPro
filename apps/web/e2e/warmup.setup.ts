import { test } from '@playwright/test';

import { loginAs } from './helpers/dev-login';

/**
 * Compile the heavy authenticated routes ONCE, before the real specs run.
 *
 * ## Why this exists
 *
 * `next dev` compiles each route on demand, on first request. Under
 * `playwright.ci.config.ts` that cost lands INSIDE the first assertion that
 * touches a route, and on a CI runner it repeatedly exceeded even a 30s budget:
 *
 *   phase1-roadmap-smoke:53  toHaveURL … Received "/communities/1/assessments"
 *     - waiting for "…/communities/1/payments?tab=assessments" navigation to finish
 *   esign-and-documents-flow:126  getByRole('heading', …) Received: undefined
 *     - waiting for "…/esign/submissions/new?communityId=1" navigation to finish
 *
 * Both report a navigation that never finished — not a missing element. Raising
 * the budget again would only move the number; `phase1-roadmap-smoke` already
 * carries 30s waits and comments from an earlier attempt at exactly that, and
 * still failed. The compile has to happen somewhere, so it should happen here,
 * once, where nothing is being asserted.
 *
 * ## What it deliberately does NOT do
 *
 * It asserts nothing. A warmup that can fail is a second place for the suite to
 * go red for reasons unrelated to the product, so every navigation swallows its
 * error: a route that 404s or throws still gets compiled, which is the entire
 * point. Genuine breakage is the real specs' job to report.
 *
 * Routes are listed by hand rather than derived from the specs — a derived list
 * would silently drift into "warm every route", which costs minutes and hides
 * which pages are actually slow.
 */

// Long enough for a cold webpack compile of every route below, back to back.
test.setTimeout(600_000);

/** Routes that need a session. `${id}` is replaced with the community id. */
const AUTHENTICATED_ROUTES = [
  // The three the CI failures actually named.
  '/communities/${id}/assessments', // → redirects into /payments?tab=assessments
  '/communities/${id}/finance', // → redirects into /payments?tab=overview
  '/settings/payments?communityId=${id}',
  '/esign/submissions/new?communityId=${id}',
  // The rest of the heavy authenticated surfaces the allowlist touches.
  '/communities/${id}/payments',
  '/communities/${id}/documents',
  '/communities/${id}/meetings',
  '/communities/${id}/compliance',
  '/emergency?communityId=${id}',
  '/emergency/new?communityId=${id}',
  '/violations?communityId=${id}',
  '/violations/report?communityId=${id}',
  '/maintenance?communityId=${id}',
  '/mobile/documents?communityId=${id}',
];

/** Public routes — no session, so they are warmed without logging in. */
const PUBLIC_ROUTES = ['/', '/contact', '/resources'];

test('warm up the dev server routes', async ({ page }) => {
  for (const route of PUBLIC_ROUTES) {
    await page
      .goto(route, { waitUntil: 'domcontentloaded', timeout: 120_000 })
      .catch(() => {});
  }

  const communityId = await loginAs(page, 'board_president');

  for (const route of AUTHENTICATED_ROUTES) {
    await page
      .goto(route.replace('${id}', String(communityId)), {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      })
      .catch(() => {});
  }
});

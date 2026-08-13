import { test } from '@playwright/test';

import { loginAs, loginAsPlatformAdmin } from './helpers/dev-login';

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

/**
 * Admin app routes, absolute because this project's baseURL is the web app.
 *
 * `localhost`, never `127.0.0.1` — Supabase auth cookies are host-only and
 * Next normalises `request.url` to `localhost` regardless of `--hostname`, so
 * mixing the two silently drops the session (CLAUDE.md, eighth addendum).
 *
 * Added after `support-access` went flaky on its FIRST attempt in a full run
 * (`Test timeout of 120000ms exceeded`) while passing in 48s on its own. It is
 * the only spec that touches `:3001` and it runs last, so it was paying the
 * admin app's entire cold compile inside its own budget — the same fault this
 * file already fixes for the web app, just on the server nobody had warmed.
 */
const ADMIN_ROUTES = ['http://localhost:3001/clients', 'http://localhost:3001/clients/1'];

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

  // Admin last: it needs its own identity, and `loginAsPlatformAdmin` replaces
  // the session established above.
  //
  // LOGGED, not silently swallowed. A bare `.catch(() => {})` here is worse
  // than a failure: `loginAsPlatformAdmin` contains assertions, so if the
  // platform-admin grant does not take, the loop below navigates the admin
  // routes UNAUTHENTICATED, middleware bounces both to /auth/login, and the two
  // routes this warmup exists to compile are never compiled. `support-access`
  // then pays the full cold compile inside its own budget and dies with
  // `Test timeout of 120000ms exceeded` — the exact flake this file was added
  // to fix, with nothing pointing back here. The warning is the breadcrumb.
  await loginAsPlatformAdmin(page).catch((err) => {
    console.warn(
      '[warmup] platform-admin login failed; the :3001 routes will NOT be warmed and ' +
        'support-access will pay their cold compile inside its own timeout:',
      err,
    );
  });

  for (const route of ADMIN_ROUTES) {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(() => {});
  }
});

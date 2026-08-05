/**
 * E2E Demo Flow Tests
 *
 * These 5 flows mirror the actual sales demo script. If these pass, the demo
 * works. If any break, you find out before a prospect does.
 *
 * ANTI-FLAKINESS STRATEGY:
 *   - No arbitrary timeouts or sleep() calls
 *   - All waits use Playwright's auto-retry assertions (toBeVisible, toHaveText)
 *   - Network-dependent waits use explicit waitForResponse or waitForLoadState
 *   - Navigation uses `domcontentloaded`, NEVER `networkidle`. A first-compile
 *     `next dev` page keeps chatting past the 30s test timeout, so `networkidle`
 *     failed inside `page.goto` before any assertion ran. The assertions below
 *     already auto-wait for the thing that actually matters.
 *   - Locators prefer accessible roles/labels over CSS classes (survive restyling)
 *   - Each test is self-contained (loginAs re-authenticates, no state leakage)
 *   - Assertions allow for valid alternative states (empty state OR data)
 *   - playwright.config.ts already has retries: 2 in CI, trace on first retry
 *
 * Flow 1: Board admin → compliance dashboard → score displays → items visible
 * Flow 2: Owner → sees only their docs → can access maintenance
 * Flow 3: PM → portfolio view → sees managed communities
 * Flow 4: Renter → can see documents → CANNOT see financials
 * Flow 5: Public site → marketing pages load → login accessible
 */
import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/dev-login';

/**
 * Budget for the FIRST assertion after a navigation.
 *
 * Playwright's 5s expect default is fine for an already-compiled page and far
 * too short for a route `next dev` is compiling for the first time. These specs
 * previously masked that with `waitUntil: 'networkidle'`, which waits for an
 * idle window that a dev-server page never reaches — so the wait was doing the
 * right thing for the wrong reason, and blew the whole test timeout when it
 * failed. Navigations now settle on `domcontentloaded` and the first assertion
 * carries this budget instead. Nothing is asserted less strictly; the deadline
 * just matches what a dev server actually does.
 *
 * 60s is measured, not padded. Against a cold `.next` (`dev:e2e` starts with
 * `rm -rf .next`) the same block has taken anywhere from 10s to 43s to first
 * paint depending on what else the server had already compiled. 30s sat inside
 * that spread and failed roughly half the time. This value is a DEV-SERVER
 * allowance only — it never delays a passing test, which resolves as soon as
 * the element appears.
 */
const FIRST_RENDER_TIMEOUT = 60_000;

/**
 * Raise the PER-TEST cap above the per-assertion budget above.
 *
 * Playwright's default test timeout is 30s — the same as FIRST_RENDER_TIMEOUT —
 * so without this the test dies before its assertion budget can elapse and the
 * budget is decorative. Measured: the owner documents page took 27.5s to first
 * paint on one cold run and blew 30s on the next, i.e. exactly the boundary
 * where this distinction decides pass or fail.
 */
test.describe.configure({ timeout: 120_000 });

// =============================================================================
// Flow 1: Board Admin Compliance Journey
// =============================================================================

test.describe('Flow 1: Board admin compliance dashboard', () => {
  test('board admin sees compliance dashboard with score and actionable items', async ({
    page,
  }) => {
    const { communityId } = await loginAs(page, 'board_president');

    await page.goto(`/communities/${communityId}/compliance`, {
      waitUntil: 'domcontentloaded',
    });

    // Wait for the heading — this is the primary signal the page rendered.
    // Using a role-based locator that survives CSS changes.
    //
    // FIRST_RENDER_TIMEOUT, not the 5s default: this is the first assertion
    // after a navigation, so it absorbs the route's first `next dev` compile.
    const heading = page.getByRole('heading', { name: /compliance/i });
    await expect(heading).toBeVisible({ timeout: FIRST_RENDER_TIMEOUT });

    // The dashboard must show EITHER:
    //   (a) A compliance score with checklist items, OR
    //   (b) An onboarding prompt to generate the checklist
    // Both are valid states. A blank page or spinner is not.
    //
    // Built with `.or()`, NOT a comma-joined selector string. Playwright's
    // `text=` is a separate selector ENGINE, not CSS — embedding it in a CSS
    // selector list threw `Unexpected token "=" while parsing css selector`
    // every time, so this assertion had never once run. Same intent, same
    // strictness, expressed in a form the engine accepts.
    const scoreOrOnboarding = page
      .locator('[data-testid="compliance-score"]')
      .or(page.getByText(/\d+%/))
      .or(page.getByText(/generate|get started|set up/i));
    // Also on the first-render budget: the score is fetched client-side after
    // the heading paints, so it lands later than the shell it hangs off.
    await expect(scoreOrOnboarding.first()).toBeVisible({
      timeout: FIRST_RENDER_TIMEOUT,
    });
  });

  test('board admin can interact with a compliance checklist item', async ({
    page,
  }) => {
    const { communityId } = await loginAs(page, 'board_president');

    await page.goto(`/communities/${communityId}/compliance`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.getByRole('heading', { name: /compliance/i }),
    ).toBeVisible({ timeout: FIRST_RENDER_TIMEOUT });

    // Only attempt interaction if there are checklist items (not onboarding state).
    //
    // `count()` does NOT auto-wait. Reading it immediately after load raced the
    // checklist render: it returned 0 on a page that was about to show items,
    // the else-branch was taken, and the test reported success having asserted
    // nothing. Settle on a real outcome first, then branch.
    const actionableItem = page.getByText(/unsatisfied|overdue|Upload|Link/i);
    const onboarding = page.getByText(/generate|get started|set up/i);

    await expect
      .poll(
        async () =>
          (await actionableItem.count()) > 0
            ? 'items'
            : (await onboarding.count()) > 0
              ? 'onboarding'
              : 'pending',
        {
          timeout: 15_000,
          message: 'compliance page rendered neither checklist items nor an onboarding prompt',
        },
      )
      .not.toBe('pending');

    if ((await actionableItem.count()) > 0) {
      await actionableItem.first().click();
      // After clicking, an action panel or modal should appear
      await expect(
        page.locator('text=/upload|link|document|cancel/i').first(),
      ).toBeVisible();
    }
    // If no actionable items, the test passes — all items are satisfied or N/A
  });
});

// =============================================================================
// Flow 2: Owner Document Access
// =============================================================================

test.describe('Flow 2: Owner document access and isolation', () => {
  test('owner sees documents page with their community data', async ({
    page,
  }) => {
    const { communityId } = await loginAs(page, 'owner');

    await page.goto(`/communities/${communityId}/documents`, {
      waitUntil: 'domcontentloaded',
    });

    // The documents heading is the primary render signal
    await expect(
      page.getByRole('heading', { name: /documents/i }),
    ).toBeVisible({ timeout: FIRST_RENDER_TIMEOUT });

    // Must show either document data or an empty state — not a spinner or blank.
    //
    // Three fixes. (1) `.or()` rather than a comma-joined string: the `text=`
    // engine is not CSS, and the old selector THREW instead of asserting, so
    // this had never once run (see Flow 1). (2) The list is a CARD list, not a
    // `<table>` — with seeded documents there is no table, no `[data-testid]`
    // and no empty-state copy either, so all three original alternatives were
    // stale; a per-document Download control is what it actually renders.
    // (3) Scoped to `#main-content` and without the loose `upload|get started`
    // alternatives: the help sidebar contains article blurbs about *uploading*
    // documents, and `.first()` over an unscoped `.or()` can resolve to that
    // off-screen text instead of the list — passing or failing for reasons
    // unrelated to the documents page.
    // (4) The empty-state alternative had to be the REAL copy. `document-list.tsx`
    // renders `<EmptyState preset="no_documents">`, whose title in
    // `lib/constants/empty-states.ts` is "Build your document library" — the
    // project writes encouraging empty states, never "No documents found". So
    // `/no documents/i` could not match it. This matters here specifically:
    // `owner.one@sunset.local` holds unit 1 in Sunset Condos but **NULL** in
    // Palm Shores, and a bare `loginAs(page, 'owner')` lands on Palm Shores, so
    // the empty library is a legitimate outcome for this test.
    const main = page.locator('#main-content');
    const content = main
      .getByRole('button', { name: /^Download$/i })
      .or(main.locator('table, [role="table"], [data-testid="document-list"]'))
      .or(main.getByText(/build your document library/i));
    await expect(content.first()).toBeVisible({ timeout: 30_000 });
  });

  test('owner can reach maintenance request page', async ({ page }) => {
    const { communityId } = await loginAs(page, 'owner');

    await page.goto(`/maintenance?communityId=${communityId}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.getByRole('heading', { name: /maintenance|work order/i }),
    ).toBeVisible({ timeout: FIRST_RENDER_TIMEOUT });
  });
});

// =============================================================================
// Flow 3: PM Portfolio View
// =============================================================================

test.describe('Flow 3: PM portfolio multi-community view', () => {
  test('PM admin sees portfolio dashboard', async ({ page }) => {
    const { portal } = await loginAs(page, 'pm_admin');

    // `/pm/dashboard` has NO page.tsx — the portfolio view was consolidated into
    // `/pm/dashboard/communities`, which is exactly what agent-login hands back
    // as the PM portal. The old path 404s, so the heading assertion below could
    // never pass, and the `toContain('/pm/')` check below passed anyway because
    // a 404 keeps the URL. Navigate to the portal the app actually resolves.
    expect(portal).toContain('/pm/dashboard/communities');
    await page.goto(portal, { waitUntil: 'domcontentloaded' });

    // PM dashboard heading
    await expect(
      page.getByRole('heading', { name: /portfolio|dashboard|communities/i }),
    ).toBeVisible({ timeout: FIRST_RENDER_TIMEOUT });

    // The page loaded into the PM portal (URL didn't redirect away)
    expect(page.url()).toContain('/pm/');
  });
});

// =============================================================================
// Flow 4: Renter Access Restrictions
// =============================================================================

test.describe('Flow 4: Renter sees limited content', () => {
  test('renter can see documents page', async ({ page }) => {
    const { communityId } = await loginAs(page, 'tenant');

    await page.goto(`/communities/${communityId}/documents`, {
      waitUntil: 'domcontentloaded',
    });

    // Renter should get the page without a hard error
    await expect(
      page.getByRole('heading', { name: /documents/i }),
    ).toBeVisible({ timeout: FIRST_RENDER_TIMEOUT });
  });

  test('renter is blocked from finance dashboard', async ({ page }) => {
    const { communityId } = await loginAs(page, 'tenant');

    // Navigate to finance — this should be restricted for tenants
    const response = page.waitForResponse(
      (resp) => resp.url().includes('/api/v1/') || resp.url().includes('/finance'),
      { timeout: 15000 },
    ).catch(() => null);

    await page.goto(`/communities/${communityId}/finance`, {
      waitUntil: 'domcontentloaded',
    });

    // Tenant should NOT see the full financial dashboard.
    // Valid outcomes: redirect away, 403/permission error, or restricted view.
    const url = page.url();

    // If still on finance URL, they should NOT see the full board-level view
    if (url.includes('/finance')) {
      // Either there's a permission message or the content is restricted
      const bodyText = await page.textContent('body') ?? '';
      const hasRestriction = /forbidden|not authorized|access denied|permission|no access/i.test(bodyText);
      const hasFullDashboard = /total collected/i.test(bodyText) && /ledger/i.test(bodyText);

      // Tenant seeing the full finance dashboard = security bug
      if (hasFullDashboard && !hasRestriction) {
        expect(hasFullDashboard).toBe(false);
      }
    }
    // If redirected away from /finance, that's correct behavior
  });
});

// =============================================================================
// Flow 5: Public Site & Marketing
// =============================================================================

test.describe('Flow 5: Public site loads without auth', () => {
  test('marketing landing page loads with navigation and CTA', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Navigation should be present
    const nav = page.locator('nav, header');
    await expect(nav.first()).toBeVisible({ timeout: FIRST_RENDER_TIMEOUT });

    // Should have some call to action (signup, login, get started)
    // `count()` does not auto-wait; asserting on the locator does. On a slow
    // first compile the bare count returned 0 and failed a page that was merely
    // still rendering.
    const cta = page.locator(
      'a[href*="signup"], a[href*="login"], a:has-text("Get Started"), button:has-text("Get Started")',
    );
    await expect(cta.first()).toBeVisible();
  });

  test('login page renders email and password fields', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    // Login form must have email, password, and submit
    await expect(
      page.locator('input[type="email"], input[name="email"]'),
    ).toBeVisible({ timeout: FIRST_RENDER_TIMEOUT });
    await expect(
      page.locator('input[type="password"], input[name="password"]'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /sign in|log in/i }),
    ).toBeVisible();
  });
});

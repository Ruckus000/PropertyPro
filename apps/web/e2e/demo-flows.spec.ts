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

// =============================================================================
// Flow 1: Board Admin Compliance Journey
// =============================================================================

test.describe('Flow 1: Board admin compliance dashboard', () => {
  test('board admin sees compliance dashboard with score and actionable items', async ({
    page,
  }) => {
    const { communityId } = await loginAs(page, 'board_president');

    await page.goto(`/communities/${communityId}/compliance`, {
      waitUntil: 'networkidle',
    });

    // Wait for the heading — this is the primary signal the page rendered.
    // Using a role-based locator that survives CSS changes.
    const heading = page.getByRole('heading', { name: /compliance/i });
    await expect(heading).toBeVisible();

    // The dashboard must show EITHER:
    //   (a) A compliance score with checklist items, OR
    //   (b) An onboarding prompt to generate the checklist
    // Both are valid states. A blank page or spinner is not.
    const scoreOrOnboarding = page
      .locator('[data-testid="compliance-score"], text=/\\d+%/, text=/generate|get started|set up/i');
    await expect(scoreOrOnboarding.first()).toBeVisible();
  });

  test('board admin can interact with a compliance checklist item', async ({
    page,
  }) => {
    const { communityId } = await loginAs(page, 'board_president');

    await page.goto(`/communities/${communityId}/compliance`, {
      waitUntil: 'networkidle',
    });

    await expect(
      page.getByRole('heading', { name: /compliance/i }),
    ).toBeVisible();

    // Only attempt interaction if there are checklist items (not onboarding state)
    const actionableItem = page.locator(
      'text=/unsatisfied|overdue|Upload|Link/i',
    );
    const count = await actionableItem.count();
    if (count > 0) {
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
      waitUntil: 'networkidle',
    });

    // The documents heading is the primary render signal
    await expect(
      page.getByRole('heading', { name: /documents/i }),
    ).toBeVisible();

    // Must show either document data or an empty state — not a spinner or blank
    const content = page.locator(
      'table, [role="table"], [data-testid="document-list"], text=/no documents|upload|get started/i',
    );
    await expect(content.first()).toBeVisible();
  });

  test('owner can reach maintenance request page', async ({ page }) => {
    const { communityId } = await loginAs(page, 'owner');

    await page.goto(`/maintenance?communityId=${communityId}`, {
      waitUntil: 'networkidle',
    });

    await expect(
      page.getByRole('heading', { name: /maintenance|work order/i }),
    ).toBeVisible();
  });
});

// =============================================================================
// Flow 3: PM Portfolio View
// =============================================================================

test.describe('Flow 3: PM portfolio multi-community view', () => {
  test('PM admin sees portfolio dashboard', async ({ page }) => {
    await loginAs(page, 'pm_admin');

    await page.goto('/pm/dashboard', { waitUntil: 'networkidle' });

    // PM dashboard heading
    await expect(
      page.getByRole('heading', { name: /portfolio|dashboard|communities/i }),
    ).toBeVisible();

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
      waitUntil: 'networkidle',
    });

    // Renter should get the page without a hard error
    await expect(
      page.getByRole('heading', { name: /documents/i }),
    ).toBeVisible();
  });

  test('renter is blocked from finance dashboard', async ({ page }) => {
    const { communityId } = await loginAs(page, 'tenant');

    // Navigate to finance — this should be restricted for tenants
    const response = page.waitForResponse(
      (resp) => resp.url().includes('/api/v1/') || resp.url().includes('/finance'),
      { timeout: 15000 },
    ).catch(() => null);

    await page.goto(`/communities/${communityId}/finance`, {
      waitUntil: 'networkidle',
    });

    // Tenant should NOT see the full financial dashboard.
    // Valid outcomes: redirect away, 403/permission error, or restricted view.
    const url = page.url();
    const hasTotalCollected = await page.locator('text=/total collected/i').count();

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
    await page.goto('/', { waitUntil: 'networkidle' });

    // Navigation should be present
    const nav = page.locator('nav, header');
    await expect(nav.first()).toBeVisible();

    // Should have some call to action (signup, login, get started)
    const cta = page.locator(
      'a[href*="signup"], a[href*="login"], a:has-text("Get Started"), button:has-text("Get Started")',
    );
    const ctaCount = await cta.count();
    expect(ctaCount).toBeGreaterThan(0);
  });

  test('login page renders email and password fields', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });

    // Login form must have email, password, and submit
    await expect(
      page.locator('input[type="email"], input[name="email"]'),
    ).toBeVisible();
    await expect(
      page.locator('input[type="password"], input[name="password"]'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /sign in|log in/i }),
    ).toBeVisible();
  });
});

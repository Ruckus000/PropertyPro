import { expect, test, type Page } from '@playwright/test';
import { loginAs as devLoginAs, type DevRole } from './helpers/dev-login';

/**
 * Every surface this spec exercises — assessments, payments, finance,
 * violations — is plan-gated above Essentials.
 *
 * `/dev/agent-login` resolves the session's community from `communities[0]`,
 * ordered by `communities.name` (see `findUserCommunitiesUnscoped`), so a bare
 * login as `board_president` lands on **Palm Shores HOA** — alphabetically
 * first, and seeded on **Essentials**, where all of the above render an
 * "Upgrade now" state instead. That is why this spec failed at its first
 * assertion and, being `mode: 'serial'`, skipped its six siblings.
 *
 * Pin to the seeded **professional** community instead. Note
 * `.claude/rules/agent-testing.md` still claims `board_president` maps to
 * Sunset Condos; it does not, and that doc is what the next person will trust.
 */
const PLAN_GATED_DEMO_COMMUNITY = 'sunset-condos';

async function loginAs(page: Page, role: DevRole): Promise<number> {
  const { communityId, portal } = await devLoginAs(page, role, {
    communitySlug: PLAN_GATED_DEMO_COMMUNITY,
  });
  await page.goto(portal, { waitUntil: 'domcontentloaded' });
  return communityId;
}

test.describe('phase 1 roadmap smoke', () => {
  // NOT `mode: 'serial'`, deliberately — it used to be.
  //
  // Every block here is self-contained: each calls `loginAs` itself and
  // navigates itself, and none reads state another one wrote. So serial bought
  // no isolation (`workers: 1` already runs them one at a time) while costing
  // two things that made CI far worse than the underlying fault:
  //
  //   1. One failure SKIPS every later block in the describe. A single flake in
  //      the violations inbox took four passing tests down with it, turning a
  //      1-test problem into a 5-test one — and tripped the workflow's
  //      "allowlisted specs must not skip" assertion for a second, unrelated
  //      reason.
  //   2. A retry re-runs the whole group rather than the failed block, so the
  //      slowest possible recovery from the smallest possible flake.
  //
  // Restore it only if a block ever genuinely depends on an earlier one — and
  // prefer making that block independent instead.

  // Playwright's 30s default is a first-compile budget here, not a correctness
  // one: these blocks each visit a different heavy authenticated route, so each
  // can pay a fresh `next dev` compile. (`playwright.ci.config.ts` warms these
  // routes up front, but `pnpm test:e2e` does not.) Blocks were dying inside
  // `page.goto` before a single assertion ran. No assertion is relaxed by this.
  test.setTimeout(90_000);

  test('Phase 1A assessment manager opens its creation flow for a board user', async ({ page }) => {
    const communityId = await loginAs(page, 'board_president');

    // `/communities/[id]/assessments` is a compatibility redirect into the
    // consolidated payments surface. Settle on the redirect TARGET before
    // asserting: the default 5s expect budget was expiring while the run was
    // still reported as "waiting for …/payments?tab=assessments navigation to
    // finish", i.e. the assertion was racing a first-compile page load rather
    // than observing a missing heading.
    await page.goto(`/communities/${communityId}/assessments`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL(/\/payments\?tab=assessments$/, { timeout: 30_000 });

    await expect(page.getByRole('heading', { name: 'Assessments' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'Create Assessment' })).toBeVisible();

    await page.getByRole('button', { name: 'Create Assessment' }).click();
    await expect(page.getByRole('heading', { name: 'Create Assessment' })).toBeVisible();
    await expect(page.getByText('Amount ($)')).toBeVisible();
    await expect(page.getByText('Late Fee ($)')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Create Assessment' })).toHaveCount(0);
  });

  test('Phase 1A payment settings render for a board user', async ({ page }) => {
    const communityId = await loginAs(page, 'board_president');

    await page.goto(`/settings/payments?communityId=${communityId}`);

    await expect(page.getByRole('heading', { name: 'Payment Settings' })).toBeVisible();
    await expect(page.getByText(/Florida Trust Fund Compliance/i)).toBeVisible();
    // The connection card is a client component that mounts after the server
    // shell; on a first-compile dev render it was not yet in the DOM (not even
    // its loading skeleton) when the 5s default budget expired. The set of
    // accepted states is unchanged — only the wait is realistic.
    await expect(
      page.getByText(
        /Connect with Stripe|Setup Incomplete|Stripe Connected|Failed to load payment connection status\./i,
      ),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('Phase 1A finance dashboard tab shell renders for a board user', async ({ page }) => {
    const communityId = await loginAs(page, 'board_president');

    // `/communities/[id]/finance` is now a compatibility redirect into the
    // consolidated payments surface (`?tab=overview`), where the sub-surfaces
    // are ROLE=TAB rather than the standalone buttons this spec was written
    // against. Same assertions, real locators: the summary tiles render, the
    // sub-tabs are reachable, and Ledger exposes its filter control.
    await page.goto(`/communities/${communityId}/finance`);

    await expect(page.getByText('Total Assessed')).toBeVisible();
    await expect(page.getByText('Collected This Month')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Ledger' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Delinquency' })).toBeVisible();

    await page.getByRole('tab', { name: 'Ledger' }).click();
    await expect(page.getByRole('combobox').first()).toBeVisible();
  });

  test('Phase 1B emergency alert composer steps are reachable for a board user', async ({ page }) => {
    const communityId = await loginAs(page, 'board_president');

    await page.goto(`/emergency?communityId=${communityId}`);

    await expect(page.getByRole('heading', { name: 'Emergency Alerts' })).toBeVisible();
    const composerLink = page.getByRole('link', { name: 'Send Emergency Alert' });
    await expect(composerLink).toBeVisible();
    await expect(composerLink).toHaveAttribute('href', `/emergency/new?communityId=${communityId}`);

    await page.goto(`/emergency/new?communityId=${communityId}`);
    await expect(page.getByRole('heading', { name: 'Send Emergency Alert' })).toBeVisible();

    await page.getByRole('button', { name: 'Start from scratch' }).click();
    await expect(page.getByRole('heading', { name: 'Compose Alert' })).toBeVisible();

    await page.getByLabel('Title').fill('Playwright Emergency Smoke Test');
    await page.getByLabel('Email body').fill('This is a browser-only smoke test for the emergency composer.');
    await page.getByLabel('SMS body').fill('Browser smoke test.');
    await page.getByRole('button', { name: 'Next: Recipients' }).click();

    await expect(page.getByRole('heading', { name: 'Select Recipients' })).toBeVisible();
    await expect(page.getByLabel('Audience')).toBeVisible();
    await expect(page.getByText('SMS')).toBeVisible();
    await expect(page.getByText('Email')).toBeVisible();
  });

  test('Phase 1C violations inbox renders filters and content shell for a board user', async ({ page }) => {
    const communityId = await loginAs(page, 'board_president');

    await page.goto(`/violations?communityId=${communityId}`);

    await expect(
      page.locator('#main-content').getByRole('heading', { name: 'Violations' }),
    ).toBeVisible();
    await expect(page.getByRole('combobox').nth(0)).toBeVisible();
    await expect(page.getByRole('combobox').nth(1)).toBeVisible();
    await expect(page.getByLabel('Filter violations from date')).toBeVisible();
    await expect(page.getByLabel('Filter violations until date')).toBeVisible();

    const rows = page.getByRole('button', { name: /Violation #/i });
    const emptyState = page.getByText(/No violations have been reported/i);

    // `count()` does NOT auto-wait, unlike `expect()`. Branching on it directly
    // races the list render: against a seeded community the rows are still
    // loading, count() returns 0, the empty branch is taken, and the test then
    // fails looking for an empty state that was never going to appear. Settle
    // on a real outcome first, then branch.
    await expect
      .poll(async () => ((await rows.count()) > 0 ? 'rows' : (await emptyState.count()) > 0 ? 'empty' : 'pending'), {
        timeout: 15_000,
        message: 'violations inbox rendered neither a violation row nor its empty state',
      })
      .not.toBe('pending');

    if ((await rows.count()) > 0) {
      await rows.first().click();
      await expect(page.getByText('Description')).toBeVisible();
    } else {
      await expect(emptyState).toBeVisible();
    }
  });

  test('Phase 1A owner payment portal renders summary and tabs for a resident owner', async ({ page }) => {
    // Was `test.fail(true, 'Seeded dev owner currently has no unit association
    // in demo data, so the payment statement API returns 403.')`. That was
    // never a demo-data gap: `owner.one@sunset.local` holds unit_id=1 in
    // Sunset Condos and NULL in Palm Shores, and the spec was silently landing
    // on the latter. With the community pinned, this passes — so the
    // expected-failure annotation is removed rather than left to mask a real
    // assertion.
    const communityId = await loginAs(page, 'owner');

    await page.goto(`/communities/${communityId}/payments`);

    // First assertion after the navigation, so it carries the route's first
    // `next dev` compile plus the client-side statement fetch.
    await expect(page.getByText('Current Balance')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Total Due')).toBeVisible();
    await expect(page.getByRole('button', { name: /Payment History/i })).toBeVisible();

    await page.getByRole('button', { name: /Payment History/i }).click();
    await expect(page.getByRole('button', { name: /Upcoming/i })).toBeVisible();
  });

  test('Phase 1C owner violation reporting surface loads for a resident', async ({ page }) => {
    const communityId = await loginAs(page, 'owner');

    await page.goto(`/violations/report?communityId=${communityId}`);

    await expect(page.getByRole('heading', { name: 'Report a Violation' })).toBeVisible();
    await expect(page.getByLabel('Category')).toBeVisible();
    await expect(page.getByLabel('Description')).toBeVisible();

    const submit = page.getByRole('button', { name: 'Submit Violation Report' });
    await expect(submit).toBeVisible();

    if (await submit.isDisabled()) {
      await expect(page.getByText(/not associated with a unit/i)).toBeVisible();
    } else {
      await submit.click();
      await expect(page.getByText('Category is required')).toBeVisible();
      await expect(page.getByText('Description is required')).toBeVisible();
    }
  });
});

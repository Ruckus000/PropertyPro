import { expect, test, type Page } from '@playwright/test';

type DevRole = 'board_president' | 'owner';

async function loginAs(page: Page, role: DevRole): Promise<number> {
  const response = await page.request.get(`/dev/agent-login?as=${role}`, {
    headers: {
      accept: 'application/json',
    },
  });
  expect(response.ok()).toBeTruthy();

  const payload = await response.json() as {
    ok: boolean;
    portal: string;
    community: { id: number } | null;
  };

  expect(payload.ok).toBe(true);

  const portalUrl = new URL(payload.portal, 'http://127.0.0.1:3000');
  const communityId = Number(portalUrl.searchParams.get('communityId') ?? payload.community?.id);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    throw new Error(`Expected dev login for ${role} to resolve a valid communityId. Portal: ${payload.portal}`);
  }

  await page.goto(payload.portal, { waitUntil: 'domcontentloaded' });

  return communityId;
}

test.describe('phase 1 roadmap smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test('Phase 1A assessment manager opens its creation flow for a board user', async ({ page }) => {
    const communityId = await loginAs(page, 'board_president');

    await page.goto(`/communities/${communityId}/assessments`);

    await expect(page.getByRole('heading', { name: 'Assessments' })).toBeVisible();
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
    await expect(
      page.getByText(
        /Connect with Stripe|Setup Incomplete|Stripe Connected|Failed to load payment connection status\./i,
      ),
    ).toBeVisible();
  });

  test('Phase 1A finance dashboard tab shell renders for a board user', async ({ page }) => {
    const communityId = await loginAs(page, 'board_president');

    await page.goto(`/communities/${communityId}/finance`);

    await expect(page.getByText('Total Collected')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ledger' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delinquent Units' })).toBeVisible();

    await page.getByRole('button', { name: 'Ledger' }).click();
    await expect(page.getByRole('combobox')).toBeVisible();
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

    await page.goto(`/violations/inbox?communityId=${communityId}`);

    await expect(
      page.locator('#main-content').getByRole('heading', { name: 'Violations Inbox' }),
    ).toBeVisible();
    await expect(page.getByRole('combobox').nth(0)).toBeVisible();
    await expect(page.getByRole('combobox').nth(1)).toBeVisible();
    await expect(page.getByLabel('Filter violations from date')).toBeVisible();
    await expect(page.getByLabel('Filter violations until date')).toBeVisible();

    const rows = page.getByRole('button', { name: /Violation #/i });
    if ((await rows.count()) > 0) {
      await rows.first().click();
      await expect(page.getByText('Description')).toBeVisible();
    } else {
      await expect(page.getByText(/No violations have been reported/i)).toBeVisible();
    }
  });

  test('Phase 1A owner payment portal renders summary and tabs for a resident owner', async ({ page }) => {
    test.fail(
      true,
      'Seeded dev owner currently has no unit association in demo data, so the payment statement API returns 403.',
    );

    const communityId = await loginAs(page, 'owner');

    await page.goto(`/communities/${communityId}/payments`);

    await expect(page.getByText('Current Balance')).toBeVisible();
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

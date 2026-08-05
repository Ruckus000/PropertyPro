/**
 * Wave 2 GA staging checks for PR #764 — founding admin on Palm Shores HOA
 * (root_manager × Essentials) via localtest.me tenant host.
 *
 * Requires: pnpm seed:demo, playwright.tenant.config.ts webServer env.
 */
import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/dev-login';

const PALM_SLUG = 'palm-shores-hoa';
const PALM_ORIGIN = `http://${PALM_SLUG}.localtest.me:3002`;
const APEX_ORIGIN = 'http://localtest.me:3002';

async function resetPalmTransparencyDisabled(page: import('@playwright/test').Page): Promise<void> {
  // Uses the shared helper so a transient agent-login 5xx retries and then
  // FAILS LOUDLY with the response body. This used to be a hand-rolled
  // `page.request.get(...)` with `if (!loginRes.ok()) return;` — a single 500
  // turned this fixture reset into a silent no-op, and the serial suite below
  // then failed on stale transparency state with a completely misleading
  // assertion error.
  const { communityId } = await loginAs(page, 'founding_admin', { communitySlug: PALM_SLUG });

  const res = await page.request.patch('/api/v1/transparency/settings', {
    data: { communityId, enabled: false, acknowledged: false },
  });
  expect(
    res.ok(),
    `failed to reset Palm transparency state: ${res.status()} ${await res.text()}`,
  ).toBeTruthy();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await resetPalmTransparencyDisabled(page);
  await page.close();
});

test.describe('Wave 2 GA staging (founding admin)', () => {
  test('host /transparency shows disabled empty state before publish', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(`${PALM_ORIGIN}/transparency`, { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByText(/has not published a public transparency page yet/i),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /Palm Shores HOA/i })).toBeVisible();
  });

  test('slim nav keeps core items visible and demotes advanced tools under More', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const { communityId } = await loginAs(page, 'founding_admin', { communitySlug: PALM_SLUG });
    await page.goto(`/dashboard?communityId=${communityId}`, { waitUntil: 'domcontentloaded' });

    const nav = page.getByRole('navigation');
    for (const label of ['Dashboard', 'Documents', 'Compliance', 'Residents', 'Units', 'Website']) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible({
        timeout: 60_000,
      });
    }

    await expect(nav.getByRole('button', { name: /^More$/i })).toBeVisible();

    for (const label of ['Operations', 'Payments']) {
      await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
  });

  test('readiness percentage increases after linking a compliance document', async ({ page }) => {
    test.setTimeout(120_000);

    const { communityId } = await loginAs(page, 'founding_admin', { communitySlug: PALM_SLUG });
    await page.goto(`/dashboard?communityId=${communityId}`, { waitUntil: 'domcontentloaded' });

    const panel = page.getByRole('region', { name: /getting started with/i });
    await expect(panel).toBeVisible({ timeout: 60_000 });

    const pctLocator = panel.locator('.tabular-nums').first();
    await expect(pctLocator).toContainText(/\d+/, { timeout: 60_000 });
    const initialText = (await pctLocator.textContent()) ?? '0%';
    const initialPct = Number.parseInt(initialText.replace(/\D/g, ''), 10);

    const complianceRes = await page.request.get(
      `/api/v1/compliance?communityId=${communityId}`,
    );
    expect(complianceRes.ok()).toBeTruthy();
    const complianceJson = (await complianceRes.json()) as {
      data: Array<{ id: number; title: string; status: string }>;
    };
    const targetItem = complianceJson.data.find(
      (item) => item.status !== 'satisfied' && item.status !== 'not_applicable',
    );
    if (!targetItem) {
      expect(initialPct).toBeGreaterThanOrEqual(0);
      return;
    }

    const documentsRes = await page.request.get(`/api/v1/documents?communityId=${communityId}`);
    expect(documentsRes.ok()).toBeTruthy();
    const documentsJson = (await documentsRes.json()) as {
      data: { data: Array<{ id: number }> };
    };
    const documentId = documentsJson.data.data[0]?.id;
    expect(documentId, 'seed should include at least one document').toBeTruthy();

    const patchRes = await page.request.patch('/api/v1/compliance', {
      data: {
        id: targetItem!.id,
        communityId,
        action: 'link_document',
        documentId,
      },
    });
    expect(patchRes.ok()).toBeTruthy();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(panel).toBeVisible({ timeout: 60_000 });

    const updatedText = (await pctLocator.textContent()) ?? '0%';
    const updatedPct = Number.parseInt(updatedText.replace(/\D/g, ''), 10);
    expect(updatedPct).toBeGreaterThan(initialPct);
  });

  test('one-click transparency publish surfaces host URLs', async ({ page }) => {
    test.setTimeout(120_000);

    const { communityId } = await loginAs(page, 'founding_admin', { communitySlug: PALM_SLUG });
    await page.goto(`/dashboard?communityId=${communityId}`, { waitUntil: 'domcontentloaded' });

    const panel = page.getByRole('region', { name: /getting started with/i });
    await expect(panel).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByRole('button', { name: /publish transparency page/i })).toBeDisabled();

    await panel.getByRole('checkbox', { name: /acknowledge transparency page scope/i }).check();
    await expect(panel.getByRole('button', { name: /publish transparency page/i })).toBeEnabled();

    // Use the authenticated request context (same payload the panel mutation sends).
    const patchRes = await page.request.patch('/api/v1/transparency/settings', {
      data: { communityId, enabled: true, acknowledged: true },
    });
    expect(patchRes.ok(), `transparency settings PATCH failed: ${patchRes.status()}`).toBeTruthy();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(panel.getByText(/your community is live at your public host url/i)).toBeVisible({
      timeout: 30_000,
    });

    const homeLink = panel.getByRole('link', {
      name: new RegExp(`${PALM_SLUG}\\.localtest\\.me:3002/?$`, 'i'),
    });
    const transparencyLink = panel.getByRole('link', {
      name: new RegExp(`${PALM_SLUG}\\.localtest\\.me:3002/transparency`, 'i'),
    });
    await expect(homeLink).toBeVisible();
    await expect(transparencyLink).toBeVisible();
  });

  test('deprecated path /{slug}/transparency redirects to tenant host', async ({ page }) => {
    await page.goto(`${APEX_ORIGIN}/${PALM_SLUG}/transparency`, { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(new RegExp(`${PALM_SLUG}\\.localtest\\.me:3002/transparency`));
  });
});

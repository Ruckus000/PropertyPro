/**
 * Support access E2E regression.
 *
 * Covers the full platform support flow:
 *   1. Board president enables community consent in Settings
 *   2. Platform admin starts a support session for a resident
 *   3. Tenant app opens in read-only support mode as the target resident
 *   4. Mutations are blocked with 403
 *   5. Ending the session in admin invalidates support mode on reload
 *
 * Run from repo root:
 *   pnpm test:e2e -- e2e/support-access.spec.ts
 */
import { expect, test, type Page } from '@playwright/test';
import { loginAs, loginAsPlatformAdmin } from './helpers/dev-login';

const SUNSET_CONDOS_SLUG = 'sunset-condos';
const ADMIN_CLIENT_URL = 'http://127.0.0.1:3001/clients/1';
const TARGET_USER_LABEL = 'owner.one@sunset.local (resident)';

test.describe.configure({ mode: 'serial' });

async function openSupportSettings(page: Page, communityId: number): Promise<void> {
  await page.goto(`/settings?communityId=${communityId}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('heading', { name: /^Support Access$/i })).toBeVisible();
}

async function setSupportAccessEnabled(
  page: Page,
  communityId: number,
  enabled: boolean,
): Promise<void> {
  await openSupportSettings(page, communityId);

  const toggle = page.getByRole('switch', {
    name: /toggle support access/i,
  });
  await expect(toggle).toBeVisible();

  const isEnabled = (await toggle.getAttribute('aria-checked')) === 'true';
  if (isEnabled === enabled) {
    return;
  }

  const updateResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/settings/support-access') &&
      response.request().method() === 'POST' &&
      response.ok(),
  );

  await toggle.click();
  await updateResponse;
  await expect(toggle).toHaveAttribute('aria-checked', enabled ? 'true' : 'false');
}

async function openAdminSupportTab(page: Page): Promise<void> {
  await page.goto(ADMIN_CLIENT_URL, { waitUntil: 'domcontentloaded' });
  const supportTab = page.getByRole('button', { name: 'Support' });
  await expect(supportTab).toBeVisible();
  await supportTab.click();

  const supportHeading = page.getByRole('heading', {
    name: /^Support Sessions$/i,
  });

  try {
    await expect(supportHeading).toBeVisible({ timeout: 3_000 });
  } catch {
    await supportTab.click();
    await expect(supportHeading).toBeVisible({ timeout: 30_000 });
  }
}

async function endAllActiveSupportSessions(page: Page): Promise<void> {
  const endButtons = page.getByRole('button', { name: 'End Session' });

  while ((await endButtons.count()) > 0) {
    const endResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        /\/api\/admin\/support\/sessions\/\d+$/.test(new URL(response.url()).pathname) &&
        response.ok(),
    );

    await endButtons.first().click();
    await endResponse;
    await page.waitForLoadState('networkidle');
  }
}

test.describe('support access flow', () => {
  test.setTimeout(120_000);

  test('board consent + admin session impersonates target resident in read-only mode and ends cleanly', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const boardPage = await context.newPage();
    const adminPage = await context.newPage();

    let communityId = 0;
    let consentInitiallyEnabled = true;

    try {
      const loginResult = await loginAs(boardPage, 'board_president', {
        communitySlug: SUNSET_CONDOS_SLUG,
      });
      communityId = loginResult.communityId;

      await openSupportSettings(boardPage, communityId);
      const consentToggle = boardPage.getByRole('switch', {
        name: /toggle support access/i,
      });
      consentInitiallyEnabled =
        (await consentToggle.getAttribute('aria-checked')) === 'true';
      await setSupportAccessEnabled(boardPage, communityId, true);

      await loginAsPlatformAdmin(adminPage);
      await openAdminSupportTab(adminPage);
      await endAllActiveSupportSessions(adminPage);

      await adminPage.getByRole('button', { name: 'Start Session' }).click();
      const dialog = adminPage.getByRole('dialog', {
        name: /start support session/i,
      });

      await dialog.getByLabel(/impersonate user/i).selectOption({
        label: TARGET_USER_LABEL,
      });

      const reason = `Playwright support access regression ${Date.now()}`;
      await dialog.getByLabel(/^Reason/i).fill(reason);
      await dialog.getByLabel(/ticket id/i).fill('PW-SUPPORT-ACCESS');

      const popupPromise = adminPage.waitForEvent('popup');
      await dialog
        .getByRole('button', { name: /^Start Session$/i })
        .click();

      const supportPage = await popupPromise;
      await supportPage.waitForLoadState('domcontentloaded');

      await expect(
        supportPage.getByRole('alert').getByText('Support Mode — Read-Only'),
      ).toBeVisible();
      await expect(
        supportPage.getByRole('heading', { name: /Welcome back, Olivia/i }),
      ).toBeVisible();
      await expect(
        supportPage.getByRole('button', { name: /Olivia Owner/i }),
      ).toBeVisible();

      const mutationResult = await supportPage.evaluate(async (currentCommunityId) => {
        const response = await fetch('/api/v1/settings/support-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ communityId: currentCommunityId, enabled: false }),
        });

        return {
          status: response.status,
          body: await response.json().catch(async () => ({
            error: await response.text(),
          })),
        };
      }, communityId);

      expect(mutationResult.status).toBe(403);
      expect(JSON.stringify(mutationResult.body)).toContain('read-only');

      await expect(adminPage.getByText(reason, { exact: true })).toBeVisible();

      const endResponse = adminPage.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          /\/api\/admin\/support\/sessions\/\d+$/.test(new URL(response.url()).pathname) &&
          response.ok(),
      );
      await adminPage.getByRole('button', { name: 'End Session' }).click();
      await endResponse;
      await expect(adminPage.getByText(reason, { exact: true })).toBeVisible();

      await supportPage.reload({ waitUntil: 'domcontentloaded' });
      await expect(
        supportPage.getByText('Support Mode — Read-Only'),
      ).toHaveCount(0);
      await expect(
        supportPage.getByRole('heading', { name: /Welcome back, Sam/i }),
      ).toBeVisible();
    } finally {
      try {
        await openAdminSupportTab(adminPage);
        await endAllActiveSupportSessions(adminPage);
      } catch (error) {
        console.warn('[support-access.e2e] Failed to clean up active sessions:', error);
      }

      if (communityId > 0 && !consentInitiallyEnabled) {
        try {
          await setSupportAccessEnabled(boardPage, communityId, false);
        } catch (error) {
          console.warn('[support-access.e2e] Failed to restore support consent:', error);
        }
      }

      await context.close();
    }
  });
});

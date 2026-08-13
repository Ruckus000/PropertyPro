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
import { clickWhenHydrated } from './helpers/hydration';

const SUNSET_CONDOS_SLUG = 'sunset-condos';
// MUST stay on the same host as `loginAsPlatformAdmin` (localhost:3001). Supabase
// auth cookies are host-only, and `localhost` and `127.0.0.1` are different hosts
// even though they resolve to the same address — a session established on one is
// simply not sent to the other. This constant previously said `127.0.0.1` while
// the login helper used `localhost`, so every request here arrived
// unauthenticated, the middleware redirected to /auth/login, and the assertion
// that failed was the missing "Support" tab — a symptom three redirects removed
// from the cause. `localhost` (not `127.0.0.1`) is the correct choice: Next's dev
// server normalises `request.url` to `localhost` regardless of `--hostname`, so
// the admin app's own redirects land there.
const ADMIN_CLIENT_URL = 'http://localhost:3001/clients/1';
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
  // role 'tab', NOT 'button'. ClientWorkspace renders `<button role="tab">`, and
  // an explicit role overrides the implicit one — so `getByRole('button')` could
  // never match and this spec failed 100% of the time, warm or cold. It went
  // unnoticed because CI runs 3 of the suite's 31 specs and this is not one of
  // them; the feature itself was fine the whole time.
  const supportTab = page.getByRole('tab', { name: 'Support' });
  await expect(supportTab).toBeVisible();
  // The click-again-on-failure below was an empirical workaround for a click
  // landing before hydration and being swallowed — the same root cause that kept
  // `esign` and `meeting-create-spacebar` red. Waiting for React to own the tab
  // addresses it at the cause instead of retrying past it.
  await clickWhenHydrated(supportTab);

  const supportHeading = page.getByRole('heading', {
    name: /^Support Sessions$/i,
  });

  // Retained as a safety net for a genuinely slow first render of the panel (not
  // for a lost click, which the line above now prevents). Harmless here because
  // the Support tab selects rather than toggles, so a second click is a no-op.
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

      // Race the popup against the dialog's own error, rather than waiting for
      // an event a failure guarantees will never arrive.
      //
      // `StartSessionDialog` only calls `window.open` when the POST succeeds;
      // on any failure it calls `setError(...)` and returns. So a 500 — the
      // likely one being a missing or too-short SUPPORT_SESSION_JWT_SECRET,
      // which `signSupportToken` throws on — used to surface as
      // `waitForEvent('popup')` timing out after 120s with the useless message
      // "waiting for event popup", burying the real cause. This spec then took
      // two more minutes to fail and said nothing about why.
      //
      // Now the error text wins the race and is reported verbatim.
      // Matched by ROLE, not by expected copy. An earlier version of this
      // listed message fragments — and would have caught almost nothing:
      // `StartSessionDialog` surfaces the route's error string verbatim
      // (`typeof data.error === 'string' ? data.error : 'Failed to start
      // session'`), and every string-bodied error the route returns is
      // different text — "This community has not granted support access…"
      // (403, the most likely real failure), "Cannot impersonate another
      // platform admin" (403), "Daily session limit of 10 reached." (429),
      // "Failed to create session" (500), "Invalid JSON body" (400). A copy
      // allowlist would have fallen through to the same 120s popup wait it
      // exists to prevent, just 30s later.
      //
      // The error div is the ONLY `role="alert"` in the dialog
      // (StartSessionDialog.tsx:228) — the "Read-only mode" banner is a plain
      // div — and it renders only when `error` is non-empty, which is reset at
      // the top of every submit. So this cannot fire on the success path.
      const popupPromise = adminPage.waitForEvent('popup');
      const dialogError = dialog.getByRole('alert').first();

      await dialog
        .getByRole('button', { name: /^Start Session$/i })
        .click();

      const outcome = await Promise.race([
        popupPromise.then(() => 'popup' as const),
        dialogError
          .waitFor({ state: 'visible', timeout: 30_000 })
          .then(() => 'error' as const)
          .catch(() => 'timeout' as const),
      ]);

      if (outcome === 'error') {
        throw new Error(
          `Admin refused to start the support session: "${await dialogError.innerText()}". ` +
            'Check SUPPORT_SESSION_JWT_SECRET is set on BOTH apps (admin signs, web verifies) ' +
            'and that the admin identity holds platform_admin_users.',
        );
      }

      const supportPage = await popupPromise;
      await supportPage.waitForLoadState('domcontentloaded');

      await expect(
        supportPage.getByRole('alert').getByText('Support Mode — Read-Only'),
      ).toBeVisible();
      await expect(
        // Copy is "Welcome, {firstName}" (components/dashboard/dashboard-welcome.tsx).
        // The spec said "Welcome back, Olivia" until this was fixed; the greeting
        // was renamed in ec8fb6c9 and this assertion had never run since.
        supportPage.getByRole('heading', { name: /Welcome, Olivia/i }),
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
        // Same "Welcome back" → "Welcome" rename as above (ec8fb6c9). After the
        // session ends this popup falls back to the board president's own
        // session — it shares a browser context with `boardPage` — so the
        // expected name is Sam President, not the impersonated resident.
        supportPage.getByRole('heading', { name: /Welcome, Sam/i }),
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

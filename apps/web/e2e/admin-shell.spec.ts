import { expect, test } from '@playwright/test';
import { loginAsPlatformAdmin } from './helpers/dev-login';
import { clickWhenHydrated, waitForHydrated } from './helpers/hydration';

const ADMIN = 'http://localhost:3001';

test.describe('admin shell', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPlatformAdmin(page);
  });

  test('rail navigates between sections and marks the current one', async ({ page }) => {
    await page.goto(`${ADMIN}/dashboard`, { waitUntil: 'domcontentloaded' });
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await clickWhenHydrated(nav.getByRole('link', { name: 'Inbox' }));
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(nav.getByRole('link', { name: 'Inbox' })).toHaveAttribute('aria-current', 'page');
  });

  test('⌘K finds a seeded community', async ({ page }) => {
    await page.goto(`${ADMIN}/dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // The heading above is server-rendered markup, visible before hydration
    // by definition — it is not a proxy for interactivity (see hydration.ts's
    // docblock). The ⌘K listener is attached in AdminShell's useEffect, so on
    // a cold CI compile the keypress can land in the pre-hydration window and
    // be silently swallowed. Wait for a real mounted element instead.
    await waitForHydrated(page.getByRole('button', { name: /Search clients, threads, tickets, users/ }));
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox').fill('Sunset Condos');
    await clickWhenHydrated(dialog.getByRole('option', { name: /Sunset Condos/ }));
    await expect(page).toHaveURL(/\/clients\/\d+$/);
  });

  test('notification tray opens with a labelled region', async ({ page }) => {
    await page.goto(`${ADMIN}/dashboard`, { waitUntil: 'domcontentloaded' });
    await clickWhenHydrated(page.getByRole('button', { name: /^Notifications, \d+ unread$/ }));
    await expect(page.getByRole('region', { name: 'Notifications' })).toBeVisible();
  });
});

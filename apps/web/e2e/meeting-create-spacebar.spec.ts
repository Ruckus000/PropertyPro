/**
 * Create Meeting modal — spacebar / focus regression (see audit: custom overlay without trap).
 */
import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/dev-login';

test.describe('Create Meeting spacebar and focus', () => {
  test('after opening Create Meeting, focus is not left on the trigger; Title accepts spaces', async ({
    page,
  }) => {
    const { communityId } = await loginAs(page, 'board_president');

    await page.goto(`/communities/${communityId}/meetings`, {
      waitUntil: 'networkidle',
    });

    await expect(page.getByRole('heading', { name: /Meetings & Calendar/i })).toBeVisible();

    const openCreate = page.getByRole('button', { name: 'Create Meeting' }).first();
    await openCreate.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Create Meeting' })).toBeVisible();

    const activeAfterOpen = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      return {
        tag: el.tagName,
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label'),
        text: (el as HTMLElement).innerText?.slice(0, 80) ?? '',
      };
    });

    // Regression guard: Radix dialog + onOpenAutoFocus should move focus into the dialog
    // (title field), not leave it on a calendar day <button> behind the overlay.
    expect(activeAfterOpen?.tag, JSON.stringify(activeAfterOpen)).toBe('INPUT');

    const titleInput = page.locator('form').locator('input[type="text"]').first();
    await titleInput.click();

    await expect(titleInput).toBeFocused();

    await page.keyboard.type('Hello World');
    await expect(titleInput).toHaveValue('Hello World');

    const locationInput = page.locator('form').locator('input[type="text"]').nth(1);
    await locationInput.click();
    await page.keyboard.type('Room A B');
    await expect(locationInput).toHaveValue('Room A B');
  });
});

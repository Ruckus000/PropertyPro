/**
 * Create Meeting modal — spacebar / focus regression (see audit: custom overlay without trap).
 */
import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/dev-login';
import { clickWhenHydrated } from './helpers/hydration';

test.describe('Create Meeting spacebar and focus', () => {
  // A first-compile dev-server render of the meetings calendar does not fit in
  // Playwright's 30s default.
  test.setTimeout(90_000);

  test('after opening Create Meeting, focus is not left on the trigger; Title accepts spaces', async ({
    page,
  }) => {
    // Pin the community. A bare `board_president` login resolves
    // `communities[0]` ordered by `communities.name` and lands on Palm Shores
    // HOA (Essentials) — this spec was loading `/communities/2/meetings`, not
    // Sunset Condos'. See `.claude/rules/agent-testing.md`.
    const { communityId } = await loginAs(page, 'board_president', {
      communitySlug: 'sunset-condos',
    });

    // `domcontentloaded`, not `networkidle`. A first-compile dev-server page
    // keeps chatting past the 30s test timeout, so `networkidle` failed here in
    // `page.goto` before a single assertion ran. The assertions below already
    // auto-wait for what actually matters.
    await page.goto(`/communities/${communityId}/meetings`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: /Meetings & Calendar/i })).toBeVisible({
      timeout: 30_000,
    });

    const openCreate = page.getByRole('button', { name: 'Create Meeting' }).first();
    // The earlier comment here had the diagnosis half right and the fix wrong.
    // The click DOES land before hydration — measured at ~510ms after the
    // heading appears — but the consequence is that the event is SWALLOWED, not
    // merely delayed. So raising this assertion's timeout to 30s could never
    // work: no second click is ever sent, and the dialog never opens. Waiting
    // for React to own the button first is the actual fix.
    await clickWhenHydrated(openCreate);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
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

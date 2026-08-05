/**
 * Wait for React to actually own an element before clicking it.
 *
 * ## The failure this exists to prevent
 *
 * Playwright's actionability checks are about the DOM: visible, stable, enabled,
 * receives events. **None of them mean React has attached a handler.** On a
 * server-rendered page the markup — including the button — exists and is fully
 * "actionable" before hydration runs. A `.click()` in that window dispatches a
 * real event into markup with no listener, and it is simply swallowed.
 *
 * The symptom is badly misleading: the overlay never opens, so it reads as a
 * broken dialog. Raising the assertion timeout does nothing, because the timeout
 * is on the wrong side of the lost event — the click already happened, and no
 * further click is ever sent. Two specs (`meeting-create-spacebar`,
 * `esign-and-documents-flow`) sat failing at a *30 second* wait for exactly this
 * reason, and were twice misdiagnosed as first-render budget problems and once as
 * a stale dev server serving an old bundle. Measured hydration lag on those pages
 * was only ~260–510ms after the heading became visible.
 *
 * Waiting for a heading is NOT a proxy for interactivity: the heading is in the
 * server HTML and appears before hydration by definition.
 *
 * ## Why not just retry the click
 *
 * Because a retry loop is unsafe for anything that TOGGLES. A Radix popover
 * trigger flips open/closed, so a retry that fires a second click just after the
 * first one finally opened the overlay closes it again — turning a deterministic
 * failure into a flaky one. Delivering exactly one click, to a live handler, has
 * no such race.
 *
 * ## How the probe works
 *
 * React attaches `__reactFiber$…` / `__reactProps$…` expando keys to the host DOM
 * node it controls. Their presence, plus an `onClick` in props, is the most direct
 * available evidence that this specific node is wired up.
 *
 * This is coupled to a React implementation detail, and that is a deliberate
 * trade: it is test-only, and if React ever renames those keys this helper stops
 * finding them and **times out loudly**. It cannot silently pass a click through
 * unhydrated — the failure mode is a clear error, not a false green.
 */
import { expect, type Locator } from '@playwright/test';

/** Resolves once React has attached an onClick handler to `locator`'s node. */
export async function waitForHydrated(locator: Locator, timeout = 30_000): Promise<void> {
  await expect
    .poll(
      async () =>
        locator.evaluate((el) => {
          const keys = Object.keys(el);
          const propsKey = keys.find((k) => k.startsWith('__reactProps$'));
          const props = propsKey
            ? (el as unknown as Record<string, { onClick?: unknown }>)[propsKey]
            : null;
          return typeof props?.onClick === 'function';
        }),
      {
        timeout,
        message:
          'React never attached an onClick handler to this element. The click would '
          + 'have been dispatched into unhydrated server markup and silently swallowed.',
      },
    )
    .toBe(true);
}

/**
 * Click `locator`, but only once React owns it.
 *
 * Use for any control that opens an overlay (dialog, popover, combobox) on a
 * server-rendered page. Delivers exactly one click, so it is safe for toggles.
 */
export async function clickWhenHydrated(locator: Locator, timeout = 30_000): Promise<void> {
  await waitForHydrated(locator, timeout);
  await locator.click();
}

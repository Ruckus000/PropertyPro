/**
 * Shared timer harness for the site-editor-v3 inspector form tests.
 *
 * Single-sourced because six test files had their own copy of `settleAutosave`
 * and they had already drifted — five advanced `DEBOUNCE_MS + 50` and flushed
 * one microtask, HeroForm advanced a bare `1000` and flushed nothing. A race
 * fixed in one copy would have stayed live in the other five.
 *
 * ## The race this exists to close
 *
 * `useAutosave` arms its debounce inside a `useEffect` keyed on the serialized
 * value (`useAutosave.ts` — `debounceRef.current = setTimeout(…)`). The timer
 * therefore does not exist until React has flushed that effect, which happens
 * *after* the DOM already shows the change. A test that waits for the rendered
 * row and then synchronously advances the clock can advance past a debounce
 * that was never armed: nothing fires, `runSave` never runs, and the mock is
 * never called.
 *
 * The old helper did exactly that. Its failure mode was ugly — the assertions
 * read `upsertMock.mock.calls.at(-1)![0]`, so a missed save surfaced as
 * `TypeError: Cannot read properties of undefined (reading '0')` rather than
 * anything naming autosave. It failed roughly one run in N under `--coverage`,
 * where the extra instrumentation widens the window (localci suite
 * 20260902T011011Z, GalleryForm "stores the base path from the upload").
 *
 * Reproduced deterministically by deleting the `waitFor` that lets the arming
 * effect flush, which yields that same TypeError at that same line.
 */
import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { DEFAULT_AUTOSAVE_DELAY_MS } from '@/components/pm/site-editor-v3/useAutosave';

/**
 * Taken from the production module rather than restated. Every copy of this
 * harness previously hardcoded the window — five as `800`, HeroForm as a
 * rounded `1000` — so raising the real debounce would have silently left the
 * tests advancing less than one window and failing for a reason that looks
 * nothing like the cause.
 */
export const DEBOUNCE_MS = DEFAULT_AUTOSAVE_DELAY_MS;

/**
 * Fake timers that still let real time pass, plus a `userEvent` bound to them.
 *
 * `shouldAdvanceTime` matters: `userEvent` awaits between synthetic events, and
 * a frozen clock would deadlock those waits.
 */
export function setupTimers() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

/**
 * Advance past the autosave debounce and let the resulting write settle.
 *
 * Two passes, and the *async* timer API, both load-bearing:
 *
 * - Pass one advances by zero, which yields to the microtask queue so React can
 *   flush the pending effect that ARMS the debounce. Without it there may be no
 *   timer to advance past, and the second pass fires nothing.
 * - Pass two advances through the debounce window itself.
 * - `advanceTimersByTimeAsync` (not `advanceTimersByTime`) drains the promise
 *   chain the save awaits as it goes. The previous single
 *   `await Promise.resolve()` flushed exactly one microtask, which is not
 *   enough once the save resolves through more than one `await`.
 *
 * This is deliberately not an arbitrary "wait longer" — a bigger number would
 * not help a debounce that was never armed, which is the actual failure.
 */
export async function settleAutosave() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 50);
  });
}

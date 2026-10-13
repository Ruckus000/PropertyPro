// @vitest-environment jsdom
/**
 * `HealthFreshness` re-runs the Health page — the console layout's seven signal
 * providers plus an UNCACHED six-probe `getHealthReport` — through
 * `router.refresh()`. It did that on every window focus and every 60 s, with no
 * guard, so an operator alt-tabbing past an open Health board paid the full set
 * of outbound probes each time, and a hidden tab kept polling all day.
 *
 * The intent the component documents still holds: a reading that has gone
 * stale is refreshed the moment the operator comes back. Each guard has a
 * control case showing the refresh still fires when it should.
 */
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { HealthFreshness } from '@/components/health/HealthFreshness';

const NOW = new Date('2026-10-13T12:00:00.000Z').getTime();

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  setHidden(false);
});

afterEach(() => {
  vi.useRealTimers();
  refresh.mockReset();
  setHidden(false);
});

describe('HealthFreshness on window focus', () => {
  it('does not re-run the probes when the reading is still fresh', () => {
    render(<HealthFreshness checkedAt={new Date(NOW - 5_000).toISOString()} />);

    fireEvent.focus(window);

    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes a reading older than 30 s (control)', () => {
    render(<HealthFreshness checkedAt={new Date(NOW - 31_000).toISOString()} />);

    fireEvent.focus(window);

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('HealthFreshness 60 s revalidation', () => {
  it('skips the tick while the tab is hidden', () => {
    render(<HealthFreshness checkedAt={new Date(NOW).toISOString()} />);
    setHidden(true);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes on the tick while the tab is visible (control)', () => {
    render(<HealthFreshness checkedAt={new Date(NOW).toISOString()} />);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

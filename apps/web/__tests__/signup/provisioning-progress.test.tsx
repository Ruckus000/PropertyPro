/**
 * Unit tests for ProvisioningProgress's failure tolerance.
 *
 * The poll used to answer every non-OK response with `if (!res.ok) return;`, so
 * a 429 or a 500 was indistinguishable from "still provisioning" and the user
 * watched a progress bar that could never advance. Its sibling — the signup
 * verification poll — carried the same line and produced exactly that on
 * 2026-09-11, which is how this one was found.
 *
 * This poll cannot simply be deleted the way that one was: it tracks an async
 * server process through staged progress and consumes a `loginToken` at the
 * end. There is no link for the user to click instead. So it tolerates two
 * consecutive failures and surfaces the existing `delayed` state on the third.
 *
 * The "keeps polling after 2" case is the control: it proves the counter is
 * discriminating rather than surfacing on the first blip.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';

// The router object MUST be referentially stable across renders. The real
// `useRouter` is; a mock returning a fresh object each call gives
// `handleComplete`/`handleConsumed` new identities every render, which cascades
// into `poll` -> `startPolling` -> the mount effect re-running, and each re-run
// fires an extra immediate poll. That is a property of the mock, not of the
// component, and it silently inflates every call count asserted below.
const { routerMock } = vi.hoisted(() => ({
  routerMock: { push: vi.fn(), refresh: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: () => ({
    auth: { verifyOtp: vi.fn().mockResolvedValue({ error: null }) },
  }),
}));

import { ProvisioningProgress } from '../../src/components/signup/provisioning-progress';

const fetchMock = vi.fn();

/** A non-OK response — the shape the poll used to swallow. */
function failure(status: number) {
  return { ok: false, status, json: async () => ({}) };
}

/** A normal in-progress response. */
function provisioning() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { status: 'provisioning', step: 'community_created' } }),
  };
}

/** Advance one poll interval and flush the async handler it starts. */
async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
}

const DELAYED_TEXT = /taking longer than usual/i;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup();
});

describe('ProvisioningProgress — failure tolerance', () => {
  it('keeps polling after 2 consecutive failures', async () => {
    fetchMock.mockResolvedValue(failure(500));

    await act(async () => {
      render(<ProvisioningProgress signupRequestId="sr-1" />);
    });
    // Mount fires the first poll immediately.
    await tick();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(DELAYED_TEXT)).toBeNull();
  });

  it('surfaces the delayed state after 3 consecutive failures', async () => {
    fetchMock.mockResolvedValue(failure(429));

    await act(async () => {
      render(<ProvisioningProgress signupRequestId="sr-1" />);
    });
    await tick();
    await tick();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByText(DELAYED_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
  });

  it('a successful poll between failures resets the counter', async () => {
    // Indexed rather than chained `mockResolvedValueOnce` so an unexpected extra
    // call cannot silently shift the sequence and change what is being tested.
    const sequence = [failure(500), failure(500), provisioning(), failure(500), failure(500)];
    fetchMock.mockImplementation(() => {
      const next = sequence[fetchMock.mock.calls.length - 1];
      return Promise.resolve(next ?? provisioning());
    });

    await act(async () => {
      render(<ProvisioningProgress signupRequestId="sr-1" />);
    });
    await tick();
    await tick();
    await tick();
    await tick();

    // Five polls, four of them failures — but never three in a row.
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(screen.queryByText(DELAYED_TEXT)).toBeNull();
  });
});

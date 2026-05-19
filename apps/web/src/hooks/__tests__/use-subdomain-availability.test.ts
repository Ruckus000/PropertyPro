/**
 * Unit tests for useSubdomainAvailability.
 *
 * Covers the debounce/abort/state-machine logic drained out of
 * SubdomainChecker (B5 batch #9). The hook uses `requestJson` directly (no
 * TanStack primitive) so renderHook needs no QueryClientProvider.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  useSubdomainAvailability,
  UNKNOWN_MESSAGE,
} from '../use-subdomain-availability';

function jsonResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
  } as unknown as Response;
}

async function flush(ms = 350): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useSubdomainAvailability', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns null for an empty value and never fetches', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSubdomainAvailability(''));
    await flush();

    expect(result.current).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the invalid synthetic state for <3 chars (no fetch)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSubdomainAvailability('ab'));
    await flush();

    expect(result.current).toEqual({
      normalizedSubdomain: 'ab',
      available: false,
      reason: 'invalid',
      message: 'Subdomain must be at least 3 characters.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows checking immediately, then maps the success envelope after 350ms', async () => {
    const serverState = {
      normalizedSubdomain: 'valid-slug',
      available: true,
      reason: 'available' as const,
      message: 'Subdomain is available.',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: serverState }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useSubdomainAvailability('valid-slug'),
    );

    // Synchronous synthetic checking state before the debounce fires.
    expect(result.current).toEqual({
      normalizedSubdomain: 'valid-slug',
      available: false,
      reason: 'checking',
      message: 'Checking availability...',
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/auth/signup?subdomain=valid-slug');
    expect(init.method).toBe('GET');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(result.current).toEqual(serverState);
  });

  it('appends signupRequestId to the query when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          normalizedSubdomain: 'valid-slug',
          available: true,
          reason: 'available',
          message: 'ok',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useSubdomainAvailability('valid-slug', 'req-42'));
    await flush();

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      '/api/v1/auth/signup?subdomain=valid-slug&signupRequestId=req-42',
    );
  });

  it('maps a non-ok response to the unknown synthetic state', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, false, 503));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useSubdomainAvailability('valid-slug'),
    );
    await flush();

    expect(result.current).toEqual({
      normalizedSubdomain: 'valid-slug',
      available: false,
      reason: 'unknown',
      message: UNKNOWN_MESSAGE,
    });
  });

  it('maps a network rejection to the unknown synthetic state', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useSubdomainAvailability('valid-slug'),
    );
    await flush();

    expect(result.current?.reason).toBe('unknown');
    expect(result.current?.message).toBe(UNKNOWN_MESSAGE);
  });

  it('ignores AbortError (no unknown flash) and aborts the in-flight request on value change', async () => {
    const capturedSignals: AbortSignal[] = [];
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          if (init.signal) capturedSignals.push(init.signal);
          init.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ v }: { v: string }) => useSubdomainAvailability(v),
      { initialProps: { v: 'first-slug' } },
    );

    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstSignal = capturedSignals[0]!;
    expect(firstSignal.aborted).toBe(false);

    // Value change → cleanup aborts the FIRST in-flight controller; no unknown
    // flash because AbortError is swallowed.
    rerender({ v: 'second-slug' });
    await flush();

    expect(firstSignal.aborted).toBe(true);
    expect(result.current?.reason).not.toBe('unknown');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('coalesces rapid value changes into a single fetch (debounce)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          normalizedSubdomain: 'final-slug',
          available: true,
          reason: 'available',
          message: 'ok',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = renderHook(
      ({ v }: { v: string }) => useSubdomainAvailability(v),
      { initialProps: { v: 'aaa' } },
    );

    // Rapid changes within the debounce window — none should fire a fetch yet.
    await flush(100);
    rerender({ v: 'bbb' });
    await flush(100);
    rerender({ v: 'final-slug' });
    expect(fetchMock).not.toHaveBeenCalled();

    await flush(350);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/auth/signup?subdomain=final-slug');
  });
});

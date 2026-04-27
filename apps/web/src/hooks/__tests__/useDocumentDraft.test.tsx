import * as React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { useAutosave } from '../useDocumentDraft';

function wrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function makeJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAutosave — flush race', () => {
  it('flush() awaits an in-flight save before resolving (so a publish click cannot race ahead of an autosave already in flight)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    // First PATCH resolves slowly so we can interleave a flush() while it
    // is still in flight. Second is unused in this test.
    let resolveFirst: (value: Response) => void = () => {};
    const firstPromise = new Promise<Response>((r) => {
      resolveFirst = r;
    });
    fetchMock.mockReturnValueOnce(firstPromise);

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useAutosave(42, 1, 50), { wrapper: wrapper(qc) });

    // Schedule a save and let the debounce timer fire it.
    act(() => {
      result.current.schedule({ title: 'first' });
    });
    await act(async () => {
      // advanceTimersByTimeAsync also drains microtasks, which is what
      // lets the mutationFn actually execute fetch().
      await vi.advanceTimersByTimeAsync(60);
    });
    // First fetch is now in flight (firstPromise still pending).
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Caller now invokes flush() — simulating a Publish click. With the
    // race fix, flush() must await the in-flight mutation before deciding
    // whether to start another. Without the fix, flush() would return
    // immediately (pending was drained when the timer fired) and Publish
    // could fire alongside the still-running PATCH.
    let flushResolved = false;
    const flushPromise = act(async () => {
      await result.current.flush();
      flushResolved = true;
    });

    // Microtasks run; flush should still be waiting on inflight.
    await Promise.resolve();
    await Promise.resolve();
    expect(flushResolved).toBe(false);

    // Resolve the in-flight save → flush returns (no pending input left).
    await act(async () => {
      resolveFirst(makeJsonResponse({ data: { id: 1 } }));
      await flushPromise;
    });
    expect(flushResolved).toBe(true);
    // No spurious second save.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

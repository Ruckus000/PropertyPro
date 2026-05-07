import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useHelpSearch } from '@/hooks/use-help';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  // eslint-disable-next-line react/display-name
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('useHelpSearch — debounce + abort behavior', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('debounces — three rapid changes inside 300ms produce one fetch for the latest value', async () => {
    const fetchSpy = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { articles: [], faqs: [] } }), {
          status: 200,
        }),
      ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    // Start with an empty query (matches widget mount state) so the
    // debounced value is initialised below the 2-char enabled threshold.
    const { rerender } = renderHook(
      ({ q }: { q: string }) => useHelpSearch(q, 1),
      { wrapper: makeWrapper(), initialProps: { q: '' } },
    );

    // Three rapid keystrokes within the debounce window.
    rerender({ q: 'do' });
    await sleep(80);
    rerender({ q: 'doc' });
    await sleep(80);
    rerender({ q: 'docs' });

    // Mid-debounce — no fetch yet.
    expect(fetchSpy).not.toHaveBeenCalled();

    // Wait past the 300ms debounce + a fudge for React Query scheduling.
    await sleep(400);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('q=docs');
  });

  it('surfaces error state on 5xx response (no silent stale-cache)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'boom' } }), {
        status: 500,
      }),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useHelpSearch('docum', 1), {
      wrapper: makeWrapper(),
    });

    await waitFor(
      () => {
        expect(result.current.error).toBeTruthy();
      },
      { timeout: 2000 },
    );
  });
});

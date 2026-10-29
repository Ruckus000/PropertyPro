import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useDraftSiteLook } from '@/hooks/use-draft-site-look';

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('useDraftSiteLook', () => {
  it('PATCHes /api/v1/pm/site/look with the community and the look', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { replaced: 4, kept: 1, added: 1, removed: 0 } }),
    });
    const { result } = renderHook(() => useDraftSiteLook(42), { wrapper: wrapperFor(makeClient()) });

    const counts = await result.current.mutateAsync('heritage');

    expect(counts).toEqual({ replaced: 4, kept: 1, added: 1, removed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/pm/site/look');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ communityId: 42, lookId: 'heritage' });
  });

  it('invalidates the whole pm/site subtree: a switch rewrites the draft sections and the design', async () => {
    // A look switch stages the home page's sections as drafts AND the look as the
    // draft design, so the canvas, the change count and the design query all go
    // stale together. Same prefix, same reason, as the discard and hero writes.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { replaced: 0, kept: 0, added: 0, removed: 0 } }),
    });
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDraftSiteLook(42), { wrapper: wrapperFor(client) });

    await result.current.mutateAsync('palm-grove');

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pm', 'site'] });
  });

  it("surfaces the server's message and invalidates nothing when the switch fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 'FORBIDDEN', message: 'Only property managers can change the site look' } }),
    });
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDraftSiteLook(42), { wrapper: wrapperFor(client) });

    result.current.mutate('bayfront');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('Only property managers can change the site look');
    expect(invalidate).not.toHaveBeenCalled();
  });
});

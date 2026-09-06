import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import {
  useMyRootless,
  useClaimRoot,
  useDisputeRootClaim,
  MY_ROOTLESS_QUERY_KEY,
} from '@/hooks/use-claim-root';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { Wrapper, client };
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('useMyRootless', () => {
  it('GETs /api/v1/communities/my-rootless and returns the communities array', async () => {
    const communities = [
      { id: 1, name: 'Sunset Condos', slug: 'sunset-condos' },
      { id: 2, name: 'Palm Shores HOA', slug: 'palm-shores-hoa' },
    ];
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { communities } }),
    });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMyRootless(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(communities);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/communities/my-rootless',
      expect.anything(),
    );
  });

  it('does NOT fetch when disabled (resident gate)', async () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useMyRootless(false), { wrapper: Wrapper });
    // give react-query a tick; the query must stay idle
    await new Promise((r) => setTimeout(r, 10));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('surfaces the server error message on failure', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Not signed in' } }),
    });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMyRootless(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain('Not signed in');
  });
});

describe('useClaimRoot', () => {
  it('POSTs a single-community claim and returns results', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { results: [{ communityId: 42, claimed: true }] } }),
    });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useClaimRoot(), { wrapper: Wrapper });
    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync({ communityId: 42 });
    });
    expect(returned).toEqual([{ communityId: 42, claimed: true }]);
    const [, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(JSON.parse(init.body)).toEqual({ communityId: 42 });
  });

  it('POSTs claimAll and invalidates the my-rootless query', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          results: [
            { communityId: 1, claimed: true },
            { communityId: 2, claimed: false, reason: 'already_claimed' },
          ],
        },
      }),
    });
    const { Wrapper, client } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useClaimRoot(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ claimAll: true });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: MY_ROOTLESS_QUERY_KEY });
  });
});

describe('useDisputeRootClaim', () => {
  it('POSTs the communityId and returns the dispute result', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { disputed: true, alreadyOpen: false } }),
    });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDisputeRootClaim(), { wrapper: Wrapper });
    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync({ communityId: 7 });
    });
    expect(returned).toEqual({ disputed: true, alreadyOpen: false });
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('/api/v1/communities/dispute-root-claim');
    expect(JSON.parse(init.body)).toEqual({ communityId: 7 });
  });
});

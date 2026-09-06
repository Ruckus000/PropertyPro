import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import {
  useContentBlocks,
  useDeleteContentBlock,
  useUpsertContentBlock,
  useReorderBlocks,
  useSitePublishToken,
  type SiteBlockSummary,
} from '@/hooks/use-content-blocks';
import { SelectedSitePageProvider } from '@/hooks/use-selected-site-page';

interface BlocksPayload {
  blocks: SiteBlockSummary[];
  latestPublishedAt: string | null;
}
const payload = (blocks: SiteBlockSummary[], latestPublishedAt: string | null = null): BlocksPayload => ({
  blocks,
  latestPublishedAt,
});

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/**
 * A wrapper that also puts the editor's selected page in scope, so the write
 * hooks resolve a `pageId` the way they do inside the real editor tree
 * (D-WRITE). Without a provider `useSelectedSitePage()` yields null — which is
 * the ConfirmPublish / onboarding-wizard case and the pre-11b-3 behaviour.
 */
function makePageWrapper(pageId: number | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <SelectedSitePageProvider pageId={pageId}>{children}</SelectedSitePageProvider>
      </QueryClientProvider>
    );
  };
}

/** The parsed request body of the Nth fetch call. */
function bodyOf(callIndex = 0): Record<string, unknown> {
  const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[callIndex]!;
  return JSON.parse(call[1].body as string) as Record<string, unknown>;
}

function okOnce() {
  (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: { ok: true, staged: true } }),
  });
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('useContentBlocks', () => {
  it('GETs /api/v1/pm/site/blocks?communityId=X and returns the blocks array', async () => {
    const blocks = [
      { id: 1, pageId: 10, blockType: 'text', blockOrder: 0, content: { text: 'Hello' } },
      { id: 2, pageId: 10, blockType: 'image', blockOrder: 1, content: { storagePath: '/img.webp' } },
    ];
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { blocks, latestPublishedAt: '2026-05-01T00:00:00.000Z' } }),
    });
    const { result } = renderHook(() => useContentBlocks(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // `select` exposes just the blocks array to this hook's consumers.
    expect(result.current.data).toEqual(blocks);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/pm/site/blocks?communityId=7'),
      expect.anything(),
    );
  });

  it('useSitePublishToken exposes latestPublishedAt from the same query (one fetch, shared cache)', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { blocks: [], latestPublishedAt: '2026-06-15T12:00:00.000Z' } }),
    });
    const wrapper = makeWrapper();
    const blocksHook = renderHook(() => useContentBlocks(7), { wrapper });
    const tokenHook = renderHook(() => useSitePublishToken(7), { wrapper });
    await waitFor(() => expect(tokenHook.result.current.isSuccess).toBe(true));
    expect(tokenHook.result.current.data).toBe('2026-06-15T12:00:00.000Z');
    expect(blocksHook.result.current.data).toEqual([]);
  });

  it('useSitePublishToken yields null before the first publish', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { blocks: [], latestPublishedAt: null } }),
    });
    const { result } = renderHook(() => useSitePublishToken(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('surfaces server error message on failure', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 'FORBIDDEN', message: 'Not a member' } }),
    });
    const { result } = renderHook(() => useContentBlocks(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain('Not a member');
  });

  it('falls back to HTTP status message when error body is unparseable', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new SyntaxError('bad json'); },
    });
    const { result } = renderHook(() => useContentBlocks(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain('500');
  });
});

describe('useUpsertContentBlock', () => {
  it('PATCHes /api/v1/pm/site/blocks with text block and communityId in body', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { ok: true } }),
    });
    const { result } = renderHook(() => useUpsertContentBlock(7), {
      wrapper: makeWrapper(),
    });
    await result.current.mutateAsync({
      blockType: 'text',
      blockOrder: 0,
      content: { text: 'Welcome' },
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/pm/site/blocks',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
      }),
    );
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(call[1].body as string);
    expect(body).toEqual({
      communityId: 7,
      blockType: 'text',
      blockOrder: 0,
      content: { text: 'Welcome' },
    });
  });

  it('PATCHes /api/v1/pm/site/blocks with image block and communityId in body', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { ok: true } }),
    });
    const { result } = renderHook(() => useUpsertContentBlock(7), {
      wrapper: makeWrapper(),
    });
    await result.current.mutateAsync({
      blockType: 'image',
      blockOrder: 1,
      content: { storagePath: '/path/to/img.webp', altText: 'Pool view' },
    });
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(call[1].body as string);
    expect(body.blockType).toBe('image');
    expect(body.communityId).toBe(7);
    expect(body.content).toEqual({ storagePath: '/path/to/img.webp', altText: 'Pool view' });
  });

  it('PATCHes /api/v1/pm/site/blocks with contact block and communityId in body', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { ok: true } }),
    });
    const { result } = renderHook(() => useUpsertContentBlock(7), {
      wrapper: makeWrapper(),
    });
    await result.current.mutateAsync({
      blockType: 'contact',
      blockOrder: 6,
      content: { showBoard: true, showManagement: false },
    });
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(call[1].body as string);
    expect(body).toEqual({
      communityId: 7,
      blockType: 'contact',
      blockOrder: 6,
      content: { showBoard: true, showManagement: false },
    });
  });

  it('surfaces server error on PATCH failure', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        error: { code: 'VALIDATION_ERROR', message: 'blockOrder must be non-negative' },
      }),
    });
    const { result } = renderHook(() => useUpsertContentBlock(7), {
      wrapper: makeWrapper(),
    });
    await expect(
      result.current.mutateAsync({ blockType: 'text', blockOrder: -1, content: {} }),
    ).rejects.toThrow(/blockOrder must be non-negative/);
  });

  it('invalidates the blocks query cache on success', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { ok: true } }),
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    // Pre-populate cache so we can check invalidation state afterward
    const queryKey = ['pm', 'site', 'blocks', 7];
    client.setQueryData(queryKey, [
      { id: 1, pageId: 10, blockType: 'text', blockOrder: 0, content: {} },
    ]);
    expect(client.getQueryState(queryKey)?.isInvalidated).toBe(false);

    const { result } = renderHook(() => useUpsertContentBlock(7), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ blockType: 'text', blockOrder: 0, content: {} });
    });

    // invalidateQueries marks the cached entry stale
    expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
  });
});

/**
 * Phase 11b-3 / D-WRITE. `resolvePageId` on the server defaults an absent
 * `pageId` to the community's HOME page, so a write issued while the PM is
 * editing page B and carrying no page id does not fail — it rewrites the live
 * home page. These cases pin the three ways a page is resolved.
 */
describe('page targeting', () => {
  it('omits pageId entirely when there is no selected-page provider', async () => {
    okOnce();
    const { result } = renderHook(() => useUpsertContentBlock(7), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ blockType: 'text', blockOrder: 2, content: {} });
    // Not `pageId: null` — the contract is `z.number().optional()` and the
    // reorder body is `.strict()`, so an explicit null is a 400.
    expect(bodyOf()).not.toHaveProperty('pageId');
  });

  it('sends the selected page on an upsert', async () => {
    okOnce();
    const { result } = renderHook(() => useUpsertContentBlock(7), {
      wrapper: makePageWrapper(42),
    });
    await result.current.mutateAsync({ blockType: 'text', blockOrder: 2, content: {} });
    expect(bodyOf().pageId).toBe(42);
  });

  it('sends the selected page on a delete', async () => {
    okOnce();
    const { result } = renderHook(() => useDeleteContentBlock(7), {
      wrapper: makePageWrapper(42),
    });
    await result.current.mutateAsync({ blockOrder: 3 });
    expect(bodyOf()).toEqual({ communityId: 7, blockOrder: 3, pageId: 42 });
  });

  it('sends the selected page on a reorder', async () => {
    okOnce();
    const { result } = renderHook(() => useReorderBlocks(7), { wrapper: makePageWrapper(42) });
    await result.current.mutateAsync({ blockId: 12, direction: 'down' });
    expect(bodyOf()).toEqual({
      communityId: 7,
      blockId: 12,
      pageId: 42,
      direction: 'down',
    });
  });

  it('lets an explicit override beat the selected page', async () => {
    okOnce();
    const { result } = renderHook(() => useUpsertContentBlock(7), {
      wrapper: makePageWrapper(42),
    });
    // The undo replay's case: restore onto the page the block was removed
    // from, not the one the PM happens to be looking at now.
    await result.current.mutateAsync({ blockType: 'text', blockOrder: 2, content: {}, pageId: 99 });
    expect(bodyOf().pageId).toBe(99);
  });

  it('falls back to the selected page when the override is null', async () => {
    okOnce();
    const { result } = renderHook(() => useDeleteContentBlock(7), {
      wrapper: makePageWrapper(42),
    });
    // null means "not specified" — an unadopted pre-11b block carries it.
    await result.current.mutateAsync({ blockOrder: 3, pageId: null });
    expect(bodyOf().pageId).toBe(42);
  });

  it('never leaks pageId into the query key — the list stays whole-site', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { blocks: [], publishedBlocks: [], latestPublishedAt: null } }),
    });
    const { result } = renderHook(() => useContentBlocks(7), { wrapper: makePageWrapper(42) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The publish diff needs every page's blocks (D-C2); scoping the fetch
    // would make it under-report.
    const url = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(url).toBe('/api/v1/pm/site/blocks?communityId=7');
  });
});

describe('useReorderBlocks', () => {
  const blocksKey = (id: number) => ['pm', 'site', 'blocks', id];

  function block(partial: Partial<SiteBlockSummary> & { id: number; blockOrder: number }): SiteBlockSummary {
    return {
      pageId: 10,
      blockType: 'text',
      content: {},
      isDraft: false,
      publishedAt: null,
      ...partial,
    };
  }

  it('POSTs /api/v1/pm/site/blocks/reorder with communityId, blockId, direction in the body', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { ok: true, movedBlockId: 12, fromOrder: 2, toOrder: 3 } }),
    });
    const { result } = renderHook(() => useReorderBlocks(7), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ blockId: 12, direction: 'down' });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/pm/site/blocks/reorder',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
      }),
    );
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(JSON.parse(call[1].body as string)).toEqual({ communityId: 7, blockId: 12, direction: 'down' });
  });

  it('optimistically swaps the moved block with its neighbor while the request is in flight', async () => {
    // fetch never resolves → the optimistic cache update stays visible.
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(() => {}));

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    client.setQueryData<BlocksPayload>(blocksKey(7), payload([
      block({ id: 1, blockType: 'hero', blockOrder: 1 }),
      block({ id: 12, blockOrder: 2 }),
      block({ id: 13, blockType: 'image', blockOrder: 3 }),
    ]));

    const { result } = renderHook(() => useReorderBlocks(7), { wrapper });
    act(() => {
      result.current.mutate({ blockId: 12, direction: 'down' });
    });

    await waitFor(() => {
      const cached = client.getQueryData<BlocksPayload>(blocksKey(7))!.blocks;
      // Block 12 now sits at order 3, block 13 at order 2 — order-sorted, the
      // hero (1) stays first.
      expect(cached.map((b) => b.id)).toEqual([1, 13, 12]);
      expect(cached.find((b) => b.id === 12)!.blockOrder).toBe(3);
      expect(cached.find((b) => b.id === 13)!.blockOrder).toBe(2);
    });
  });

  it('optimistic swap skips tombstones (staged deletions) as neighbors', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(() => {}));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    // text@2, tombstone@3 (hidden staged deletion), contact@4. Moving text
    // down must swap with contact (order 4), not the invisible tombstone.
    client.setQueryData<BlocksPayload>(blocksKey(7), payload([
      block({ id: 12, blockOrder: 2 }),
      block({ id: 90, blockType: 'tombstone', blockOrder: 3, isDraft: true }),
      block({ id: 14, blockType: 'contact', blockOrder: 4 }),
    ]));

    const { result } = renderHook(() => useReorderBlocks(7), { wrapper });
    act(() => {
      result.current.mutate({ blockId: 12, direction: 'down' });
    });

    await waitFor(() => {
      const cached = client.getQueryData<BlocksPayload>(blocksKey(7))!.blocks;
      expect(cached.find((b) => b.id === 12)!.blockOrder).toBe(4);
      expect(cached.find((b) => b.id === 14)!.blockOrder).toBe(2);
      // The tombstone is untouched at order 3.
      expect(cached.find((b) => b.id === 90)!.blockOrder).toBe(3);
    });
  });

  it('optimistic move ignores blocks on another page', async () => {
    // The server reorders strictly WITHIN a page. A neighbour picked from the
    // community-wide cache would show an order the server will never return.
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(() => {}));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <SelectedSitePageProvider pageId={10}>{children}</SelectedSitePageProvider>
      </QueryClientProvider>
    );
    // page 10 holds 2 and 5; page 20 sits between them at 3.
    client.setQueryData<BlocksPayload>(blocksKey(7), payload([
      block({ id: 12, blockOrder: 2 }),
      block({ id: 77, pageId: 20, blockType: 'image', blockOrder: 3 }),
      block({ id: 13, blockType: 'image', blockOrder: 5 }),
    ]));

    const { result } = renderHook(() => useReorderBlocks(7), { wrapper });
    act(() => {
      result.current.mutate({ blockId: 12, direction: 'down' });
    });

    await waitFor(() => {
      const cached = client.getQueryData<BlocksPayload>(blocksKey(7))!.blocks;
      // 12 swapped with its same-page neighbour 13, not with page 20's block.
      expect(cached.find((b) => b.id === 12)!.blockOrder).toBe(5);
      expect(cached.find((b) => b.id === 13)!.blockOrder).toBe(2);
      expect(cached.find((b) => b.id === 77)!.blockOrder).toBe(3);
    });
  });

  it('rolls back the optimistic swap when the request fails', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'already last' } }),
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const original = payload([
      block({ id: 12, blockOrder: 2 }),
      block({ id: 13, blockType: 'image', blockOrder: 3 }),
    ]);
    client.setQueryData<BlocksPayload>(blocksKey(7), original);

    const { result } = renderHook(() => useReorderBlocks(7), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ blockId: 12, direction: 'down' })).rejects.toThrow(/already last/);
    });

    const cached = client.getQueryData<BlocksPayload>(blocksKey(7))!.blocks;
    expect(cached.map((b) => b.id)).toEqual([12, 13]);
    expect(cached.find((b) => b.id === 12)!.blockOrder).toBe(2);
  });

  it('invalidates the blocks query cache on settle', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { ok: true, movedBlockId: 12, fromOrder: 2, toOrder: 3 } }),
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    client.setQueryData<BlocksPayload>(blocksKey(7), payload([
      block({ id: 12, blockOrder: 2 }),
      block({ id: 13, blockType: 'image', blockOrder: 3 }),
    ]));

    const { result } = renderHook(() => useReorderBlocks(7), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ blockId: 12, direction: 'down' });
    });
    expect(client.getQueryState(blocksKey(7))?.isInvalidated).toBe(true);
  });
});

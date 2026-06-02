import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import {
  useContentBlocks,
  useUpsertContentBlock,
} from '@/hooks/use-content-blocks';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('useContentBlocks', () => {
  it('GETs /api/v1/pm/site/blocks?communityId=X and returns the blocks array', async () => {
    const blocks = [
      { id: 1, blockType: 'text', blockOrder: 0, content: { text: 'Hello' } },
      { id: 2, blockType: 'image', blockOrder: 1, content: { storagePath: '/img.webp' } },
    ];
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { blocks } }),
    });
    const { result } = renderHook(() => useContentBlocks(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(blocks);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/pm/site/blocks?communityId=7'),
      expect.anything(),
    );
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
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
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
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
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
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
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
    client.setQueryData(queryKey, [{ id: 1, blockType: 'text', blockOrder: 0, content: {} }]);
    expect(client.getQueryState(queryKey)?.isInvalidated).toBe(false);

    const { result } = renderHook(() => useUpsertContentBlock(7), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ blockType: 'text', blockOrder: 0, content: {} });
    });

    // invalidateQueries marks the cached entry stale
    expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
  });
});

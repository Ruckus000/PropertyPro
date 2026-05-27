import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { useHeroBlock, useUpdateHeroBlock } from '@/hooks/use-hero-block';

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

describe('useHeroBlock', () => {
  it('GETs /api/v1/pm/site/hero?communityId=X and returns hero content', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { hero: { headline: 'H' } } }),
    });
    const { result } = renderHook(() => useHeroBlock(42), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ headline: 'H' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/pm/site/hero?communityId=42'),
      expect.anything(),
    );
  });

  it('returns null when no hero block exists', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { hero: null } }),
    });
    const { result } = renderHook(() => useHeroBlock(42), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('surfaces server error message on failure', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 'FORBIDDEN', message: 'Not a member' } }),
    });
    const { result } = renderHook(() => useHeroBlock(42), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain('Not a member');
  });
});

describe('useUpdateHeroBlock', () => {
  it('PATCHes /api/v1/pm/site/hero with content body including communityId', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { ok: true } }),
    });
    const { result } = renderHook(() => useUpdateHeroBlock(42), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ headline: 'NewHead' });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/pm/site/hero',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
      }),
    );
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body).toEqual({ communityId: 42, headline: 'NewHead' });
  });

  it('surfaces server validation errors', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Invalid hero block content' } }),
    });
    const { result } = renderHook(() => useUpdateHeroBlock(42), { wrapper: makeWrapper() });
    await expect(result.current.mutateAsync({ headline: '' })).rejects.toThrow(/Invalid hero block content/);
  });
});

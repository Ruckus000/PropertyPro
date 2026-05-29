import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { usePublishSite, PublishConflictError } from '@/hooks/use-publish-site';

function wrap(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('usePublishSite', () => {
  it('POSTs to /api/v1/pm/site/publish with the communityId + expectedPublishedAt', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { published: true, publishedAt: '2026-05-15T12:00:00.000Z', promotedCount: 2, retiredCount: 4 } }),
    });
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => usePublishSite(42), { wrapper: wrap(qc) });
    const promise = result.current.mutateAsync({ expectedPublishedAt: '2026-05-01T10:00:00.000Z' });
    const data = await promise;
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/v1/pm/site/publish');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      communityId: 42,
      expectedPublishedAt: '2026-05-01T10:00:00.000Z',
    });
    expect(data).toMatchObject({ published: true, promotedCount: 2, retiredCount: 4 });
  });

  it('forwards markOnboardingComplete=true in the body when set (wizard publish)', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { published: true, publishedAt: '2026-05-15T12:00:00.000Z', promotedCount: 1, retiredCount: 0 } }),
    });
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => usePublishSite(42), { wrapper: wrap(qc) });
    await result.current.mutateAsync({
      expectedPublishedAt: null,
      markOnboardingComplete: true,
    });
    const [, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      communityId: 42,
      expectedPublishedAt: null,
      markOnboardingComplete: true,
    });
  });

  it('passes through the nothing-to-publish result body', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { published: false, reason: 'nothing-to-publish' } }),
    });
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => usePublishSite(42), { wrapper: wrap(qc) });
    const data = await result.current.mutateAsync({ expectedPublishedAt: null });
    expect(data).toEqual({ published: false, reason: 'nothing-to-publish' });
  });

  it('throws PublishConflictError on 409 (optimistic-concurrency mismatch)', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: 'CONFLICT', message: 'Another editor published changes.' } }),
    });
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => usePublishSite(42), { wrapper: wrap(qc) });
    let caught: unknown;
    try {
      await result.current.mutateAsync({ expectedPublishedAt: '2026-05-01T10:00:00.000Z' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PublishConflictError);
    expect((caught as PublishConflictError).message).toMatch(/another editor published/i);
    expect((caught as PublishConflictError).conflict).toBe(true);
  });

  it('throws a plain Error on other non-OK responses', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
    });
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => usePublishSite(42), { wrapper: wrap(qc) });
    await expect(
      result.current.mutateAsync({ expectedPublishedAt: null }),
    ).rejects.toThrow(/boom/);
  });

  it('invalidates the content-blocks and hero queries on success', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { published: true, publishedAt: '2026-05-15T12:00:00.000Z', promotedCount: 1, retiredCount: 0 } }),
    });
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => usePublishSite(42), { wrapper: wrap(qc) });
    await result.current.mutateAsync({ expectedPublishedAt: null });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pm', 'site', 'blocks', 42] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pm', 'site', 'hero', 42] });
    });
  });
});

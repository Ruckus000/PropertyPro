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

  /**
   * D10′ — the invalidation is the WHOLE `['pm','site']` prefix, not a
   * hand-listed pair of keys.
   *
   * Asserted behaviourally (does the cached pages query actually go stale?)
   * rather than by spying on the call shape, because the call shape is not the
   * requirement: publishing applies staged page removals, so a publish sheet or
   * Pages panel left holding a page that no longer exists is the defect, and
   * the narrow two-key form produced exactly that.
   */
  it('invalidates the whole pm/site query prefix on success — blocks, hero AND pages', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { published: true, publishedAt: '2026-05-15T12:00:00.000Z', promotedCount: 1, retiredCount: 0 } }),
    });
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const keys = [
      ['pm', 'site', 'blocks', 42],
      ['pm', 'site', 'hero', 42],
      ['pm', 'site', 'pages', 42],
    ];
    for (const key of keys) qc.setQueryData(key, { seeded: true });

    const { result } = renderHook(() => usePublishSite(42), { wrapper: wrap(qc) });
    await result.current.mutateAsync({ expectedPublishedAt: null });

    await waitFor(() => {
      for (const key of keys) {
        expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
      }
    });
  });
});

describe('usePublishSite — caches touched by a notifying publish', () => {
  function publishResult(extra: Record<string, unknown> = {}) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          published: true,
          publishedAt: '2026-05-15T12:00:00.000Z',
          promotedCount: 1,
          retiredCount: 0,
          ...extra,
        },
      }),
    };
  }

  /** Every key `invalidateQueries` was called with, flattened for matching. */
  function invalidatedKeys(spy: ReturnType<typeof vi.fn>): string[] {
    return spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
  }

  it('also refreshes the notification feed when residents were notified', async () => {
    /*
     * A notifying publish writes an ANNOUNCEMENT and in-app notifications —
     * resources outside the `['pm','site']` prefix. Without this the unread
     * count and the feed keep serving state that predates the publish, and
     * `use-notification-realtime` only covers whoever happens to be
     * live-subscribed at that instant.
     */
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      publishResult({ residentNotification: { status: 'sent', announcementId: 7, recipientCount: 3 } }),
    );
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => usePublishSite(42), { wrapper: wrap(qc) });

    await result.current.mutateAsync({ expectedPublishedAt: null });
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const keys = invalidatedKeys(spy as unknown as ReturnType<typeof vi.fn>);
    expect(keys).toContain(JSON.stringify(['pm', 'site']));
    expect(keys).toContain(JSON.stringify(['notifications', 42]));
    expect(keys).toContain(JSON.stringify(['notifications', 'cross']));
  });

  it('refreshes them for a PARTIAL notification too — the feed row exists', async () => {
    // `partial` means the announcement landed and only the email failed, so the
    // in-app feed did change.
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      publishResult({ residentNotification: { status: 'partial', announcementId: 7, reason: 'smtp' } }),
    );
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => usePublishSite(42), { wrapper: wrap(qc) });

    await result.current.mutateAsync({ expectedPublishedAt: null });
    await waitFor(() => expect(spy).toHaveBeenCalled());

    expect(invalidatedKeys(spy as unknown as ReturnType<typeof vi.fn>)).toContain(
      JSON.stringify(['notifications', 42]),
    );
  });

  it('does NOT touch the notification caches on a quiet publish', async () => {
    /*
     * The control. Without it the two cases above would pass for a hook that
     * invalidated the notification keys unconditionally, which would make every
     * ordinary publish refetch two feeds for nothing.
     */
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(publishResult());
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => usePublishSite(42), { wrapper: wrap(qc) });

    await result.current.mutateAsync({ expectedPublishedAt: null });
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const keys = invalidatedKeys(spy as unknown as ReturnType<typeof vi.fn>);
    expect(keys).toContain(JSON.stringify(['pm', 'site']));
    expect(keys).not.toContain(JSON.stringify(['notifications', 42]));
    expect(keys).not.toContain(JSON.stringify(['notifications', 'cross']));
  });
});

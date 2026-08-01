import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import {
  applyPageOrder,
  sitePagesKey,
  useCreateSitePage,
  useDeleteSitePage,
  useReorderSitePages,
  useSitePages,
  useUnstageSitePageDelete,
  useUpdateSitePage,
  type SitePageSummary,
} from '@/hooks/use-site-pages';

const COMMUNITY_ID = 7;

function page(overrides: Partial<SitePageSummary> & { id: number }): SitePageSummary {
  return {
    name: `Page ${overrides.id}`,
    slug: `page-${overrides.id}`,
    inNav: true,
    sortOrder: overrides.id,
    isHome: false,
    isDraft: false,
    publishedAt: '2026-07-01T00:00:00.000Z',
    deleteStagedAt: null,
    ...overrides,
  };
}

const HOME = page({ id: 1, name: 'Home', slug: '', isHome: true, sortOrder: 0 });

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const fetchMock = () => global.fetch as unknown as ReturnType<typeof vi.fn>;

function mockOnce(body: unknown, { ok = true }: { ok?: boolean } = {}) {
  fetchMock().mockResolvedValueOnce({ ok, status: ok ? 200 : 400, json: async () => body });
}

function bodyOf(callIndex = 0): unknown {
  const [, init] = fetchMock().mock.calls[callIndex] as [string, RequestInit];
  return JSON.parse(init.body as string);
}

beforeEach(() => {
  global.fetch = vi.fn();
  focusManager.setFocused(true);
  vi.useRealTimers();
});

describe('useSitePages', () => {
  it('GETs /api/v1/pm/site/pages?communityId=X and unwraps the pages array', async () => {
    const pages = [HOME, page({ id: 2 })];
    mockOnce({ data: { pages } });
    const { result } = renderHook(() => useSitePages(COMMUNITY_ID), {
      wrapper: wrap(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(pages);
    expect(fetchMock().mock.calls[0]![0]).toBe(
      `/api/v1/pm/site/pages?communityId=${COMMUNITY_ID}`,
    );
  });

  it('keeps deleteStagedAt on the wire — the editor renders a staged removal from it', async () => {
    const staged = page({ id: 3, deleteStagedAt: '2026-07-30T09:00:00.000Z' });
    mockOnce({ data: { pages: [HOME, staged] } });
    const { result } = renderHook(() => useSitePages(COMMUNITY_ID), {
      wrapper: wrap(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[1]?.deleteStagedAt).toBe('2026-07-30T09:00:00.000Z');
  });

  it('refetches when the PM returns to the tab, despite the app-wide default', async () => {
    // Behavioural, not an assertion about the options object: the client below
    // mirrors `makeQueryClient` (staleTime 60s, refetchOnWindowFocus FALSE), so
    // this passes only because the hook overrides that default for itself.
    //
    // Why it matters: a co-manager can stage the page you have open, and writes
    // to a staged page still SUCCEED — the editor keeps saying "Saved" for work
    // the next publish deletes. Without a refetch the tab never finds out.
    //
    // Note the query must be STALE for focus to refetch, which is why the clock
    // moves past `staleTime` first. A manager returning within the minute keeps
    // the cached list; beyond it — which the leave-and-come-back case always is
    // — they get the truth.
    const appLikeClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 60_000, refetchOnWindowFocus: false },
        mutations: { retry: false },
      },
    });
    // `shouldAdvanceTime` so `waitFor` still makes progress under fake timers.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockOnce({ data: { pages: [HOME] } });
    const { result } = renderHook(() => useSitePages(COMMUNITY_ID), {
      wrapper: wrap(appLikeClient),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);

    // Past staleTime, and a co-manager has added a page in the meantime.
    // `mockResolvedValue`, not `…Once`: how MANY refetches focus triggers is
    // react-query's business, and pinning it here would make this a test of the
    // library. What matters is that the editor ends up holding the truth.
    await vi.advanceTimersByTimeAsync(61_000);
    fetchMock().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { pages: [HOME, page({ id: 9 })] } }),
    });

    focusManager.setFocused(false);
    focusManager.setFocused(true);

    await waitFor(() => expect(result.current.data).toHaveLength(2));
  });

  it('surfaces the server error message rather than a generic failure', async () => {
    mockOnce({ error: { code: 'FORBIDDEN', message: 'Only property managers can manage site pages' } }, { ok: false });
    const { result } = renderHook(() => useSitePages(COMMUNITY_ID), {
      wrapper: wrap(makeClient()),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/only property managers/i);
  });
});

describe('useCreateSitePage', () => {
  // Pins that the hook invents no nav default of its own: the request body must
  // carry no `inNav` key at all when the caller did not supply one, leaving the
  // server as the single place that decides it.
  it('POSTs name and slug only, with no inNav default invented client-side', async () => {
    const created = page({ id: 9, isDraft: true, publishedAt: null });
    mockOnce({ data: { ok: true, page: created } });
    const { result } = renderHook(() => useCreateSitePage(COMMUNITY_ID), {
      wrapper: wrap(makeClient()),
    });
    const returned = await result.current.mutateAsync({ name: 'Amenities', slug: 'amenities' });
    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/pm/site/pages');
    expect(init.method).toBe('POST');
    expect(bodyOf()).toEqual({ communityId: COMMUNITY_ID, name: 'Amenities', slug: 'amenities' });
    expect(returned).toEqual(created);
  });

  it('forwards inNav when supplied', async () => {
    mockOnce({ data: { ok: true, page: page({ id: 9, inNav: false }) } });
    const { result } = renderHook(() => useCreateSitePage(COMMUNITY_ID), {
      wrapper: wrap(makeClient()),
    });
    await result.current.mutateAsync({ name: 'Docs', slug: 'docs', inNav: false });
    expect(bodyOf()).toEqual({
      communityId: COMMUNITY_ID,
      name: 'Docs',
      slug: 'docs',
      inNav: false,
    });
  });

  it('invalidates the pages query so the new page appears in the list', async () => {
    mockOnce({ data: { ok: true, page: page({ id: 9 }) } });
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCreateSitePage(COMMUNITY_ID), {
      wrapper: wrap(client),
    });
    await result.current.mutateAsync({ name: 'Docs', slug: 'docs' });
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: sitePagesKey(COMMUNITY_ID) }),
    );
  });

  it('rejects with the slug message the service produced', async () => {
    mockOnce({ error: { code: 'VALIDATION_ERROR', message: 'That web address is reserved.' } }, { ok: false });
    const { result } = renderHook(() => useCreateSitePage(COMMUNITY_ID), {
      wrapper: wrap(makeClient()),
    });
    await expect(
      result.current.mutateAsync({ name: 'Documents', slug: 'documents' }),
    ).rejects.toThrow(/reserved/i);
  });
});

describe('useUpdateSitePage', () => {
  it('PATCHes only the fields supplied — a rename must not restate the address', async () => {
    mockOnce({ data: { ok: true, page: page({ id: 4, name: 'Renamed' }), redirectedFrom: null } });
    const { result } = renderHook(() => useUpdateSitePage(COMMUNITY_ID), {
      wrapper: wrap(makeClient()),
    });
    const returned = await result.current.mutateAsync({ pageId: 4, name: 'Renamed' });
    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/pm/site/pages');
    expect(init.method).toBe('PATCH');
    expect(bodyOf()).toEqual({ communityId: COMMUNITY_ID, pageId: 4, name: 'Renamed' });
    expect(returned.redirectedFrom).toBeNull();
  });

  it('sends inNav alone for a nav toggle', async () => {
    mockOnce({ data: { ok: true, page: page({ id: 4, inNav: false }), redirectedFrom: null } });
    const { result } = renderHook(() => useUpdateSitePage(COMMUNITY_ID), {
      wrapper: wrap(makeClient()),
    });
    await result.current.mutateAsync({ pageId: 4, inNav: false });
    expect(bodyOf()).toEqual({ communityId: COMMUNITY_ID, pageId: 4, inNav: false });
  });

  it('surfaces redirectedFrom so the caller can report the old address still resolves', async () => {
    mockOnce({
      data: {
        ok: true,
        page: page({ id: 4, slug: 'new-address' }),
        redirectedFrom: 'old-address',
      },
    });
    const { result } = renderHook(() => useUpdateSitePage(COMMUNITY_ID), {
      wrapper: wrap(makeClient()),
    });
    const returned = await result.current.mutateAsync({ pageId: 4, slug: 'new-address' });
    expect(bodyOf()).toEqual({ communityId: COMMUNITY_ID, pageId: 4, slug: 'new-address' });
    expect(returned.redirectedFrom).toBe('old-address');
  });
});

describe('applyPageOrder', () => {
  it('rearranges the non-home pages and re-stamps the existing slot sequence', () => {
    const pages = [
      HOME,
      page({ id: 2, sortOrder: 1 }),
      page({ id: 3, sortOrder: 2 }),
      page({ id: 4, sortOrder: 3 }),
    ];
    const next = applyPageOrder(pages, [4, 2, 3]);
    expect(next.map((p) => p.id)).toEqual([1, 4, 2, 3]);
    expect(next.map((p) => p.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it('leaves home pinned first and never in the submitted list', () => {
    const pages = [HOME, page({ id: 2, sortOrder: 1 }), page({ id: 3, sortOrder: 2 })];
    expect(applyPageOrder(pages, [3, 2])[0]).toBe(HOME);
  });

  it('returns the list unchanged for a stale set the server would reject', () => {
    const pages = [HOME, page({ id: 2, sortOrder: 1 }), page({ id: 3, sortOrder: 2 })];
    // Page 3 is missing — a partial list. Applying it optimistically would show
    // an order the server refuses.
    expect(applyPageOrder(pages, [2])).toBe(pages);
    // A duplicate id is the same class of stale request.
    expect(applyPageOrder(pages, [2, 2])).toBe(pages);
    // An id the cache has never seen.
    expect(applyPageOrder(pages, [2, 99])).toBe(pages);
  });
});

describe('useReorderSitePages', () => {
  it('POSTs the full non-home order to the reorder path', async () => {
    mockOnce({ data: { ok: true, pages: [HOME, page({ id: 3 }), page({ id: 2 })] } });
    const { result } = renderHook(() => useReorderSitePages(COMMUNITY_ID), {
      wrapper: wrap(makeClient()),
    });
    await result.current.mutateAsync({ orderedPageIds: [3, 2] });
    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/pm/site/pages/reorder');
    expect(init.method).toBe('POST');
    expect(bodyOf()).toEqual({ communityId: COMMUNITY_ID, orderedPageIds: [3, 2] });
  });

  it('optimistically reorders the cached list before the request resolves', async () => {
    const client = makeClient();
    const cached = [HOME, page({ id: 2, sortOrder: 1 }), page({ id: 3, sortOrder: 2 })];
    client.setQueryData(sitePagesKey(COMMUNITY_ID), cached);
    let resolveFetch: ((value: unknown) => void) | undefined;
    fetchMock().mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const { result } = renderHook(() => useReorderSitePages(COMMUNITY_ID), {
      wrapper: wrap(client),
    });
    const pending = result.current.mutateAsync({ orderedPageIds: [3, 2] });
    await waitFor(() =>
      expect(
        client
          .getQueryData<SitePageSummary[]>(sitePagesKey(COMMUNITY_ID))
          ?.map((p) => p.id),
      ).toEqual([1, 3, 2]),
    );
    resolveFetch!({
      ok: true,
      status: 200,
      json: async () => ({ data: { ok: true, pages: cached } }),
    });
    await pending;
  });

  it('rolls the cache back when the server rejects a stale order', async () => {
    const client = makeClient();
    const cached = [HOME, page({ id: 2, sortOrder: 1 }), page({ id: 3, sortOrder: 2 })];
    client.setQueryData(sitePagesKey(COMMUNITY_ID), cached);
    mockOnce(
      { error: { code: 'VALIDATION_ERROR', message: 'The page order is out of date. Reload the editor and try again.' } },
      { ok: false },
    );
    const { result } = renderHook(() => useReorderSitePages(COMMUNITY_ID), {
      wrapper: wrap(client),
    });
    await expect(
      result.current.mutateAsync({ orderedPageIds: [3, 2] }),
    ).rejects.toThrow(/out of date/i);
    expect(
      client.getQueryData<SitePageSummary[]>(sitePagesKey(COMMUNITY_ID))?.map((p) => p.id),
    ).toEqual([1, 2, 3]);
  });
});

describe('useDeleteSitePage', () => {
  it('DELETEs the page id and reports staged=true for a published page', async () => {
    mockOnce({ data: { ok: true, staged: true } });
    const { result } = renderHook(() => useDeleteSitePage(COMMUNITY_ID), {
      wrapper: wrap(makeClient()),
    });
    const returned = await result.current.mutateAsync({ pageId: 5 });
    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/pm/site/pages');
    expect(init.method).toBe('DELETE');
    expect(bodyOf()).toEqual({ communityId: COMMUNITY_ID, pageId: 5 });
    expect(returned).toEqual({ staged: true });
  });

  it('reports staged=false for a page that was never published (gone immediately)', async () => {
    mockOnce({ data: { ok: true, staged: false } });
    const { result } = renderHook(() => useDeleteSitePage(COMMUNITY_ID), {
      wrapper: wrap(makeClient()),
    });
    expect(await result.current.mutateAsync({ pageId: 5 })).toEqual({ staged: false });
  });

  it('invalidates the whole pm/site prefix — an unpublished delete takes its blocks too', async () => {
    mockOnce({ data: { ok: true, staged: false } });
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteSitePage(COMMUNITY_ID), {
      wrapper: wrap(client),
    });
    await result.current.mutateAsync({ pageId: 5 });
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pm', 'site'] }),
    );
  });

  it('rejects when the home page is targeted', async () => {
    mockOnce({ error: { code: 'VALIDATION_ERROR', message: 'The home page cannot be removed.' } }, { ok: false });
    const { result } = renderHook(() => useDeleteSitePage(COMMUNITY_ID), {
      wrapper: wrap(makeClient()),
    });
    await expect(result.current.mutateAsync({ pageId: 1 })).rejects.toThrow(
      /home page cannot be removed/i,
    );
  });
});

describe('useUnstageSitePageDelete', () => {
  it('DELETEs with unstage: true to cancel a staged removal', async () => {
    mockOnce({ data: { ok: true, staged: false } });
    const { result } = renderHook(() => useUnstageSitePageDelete(COMMUNITY_ID), {
      wrapper: wrap(makeClient()),
    });
    await result.current.mutateAsync({ pageId: 6 });
    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/pm/site/pages');
    expect(init.method).toBe('DELETE');
    expect(bodyOf()).toEqual({ communityId: COMMUNITY_ID, pageId: 6, unstage: true });
  });

  it('invalidates only the pages query — cancelling a removal moves no blocks', async () => {
    mockOnce({ data: { ok: true, staged: false } });
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUnstageSitePageDelete(COMMUNITY_ID), {
      wrapper: wrap(client),
    });
    await result.current.mutateAsync({ pageId: 6 });
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: sitePagesKey(COMMUNITY_ID) }),
    );
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['pm', 'site'] });
  });

  it('surfaces the not-staged error rather than silently succeeding', async () => {
    mockOnce({ error: { code: 'VALIDATION_ERROR', message: 'That page is not staged for removal.' } }, { ok: false });
    const { result } = renderHook(() => useUnstageSitePageDelete(COMMUNITY_ID), {
      wrapper: wrap(makeClient()),
    });
    await expect(result.current.mutateAsync({ pageId: 6 })).rejects.toThrow(
      /not staged for removal/i,
    );
  });
});

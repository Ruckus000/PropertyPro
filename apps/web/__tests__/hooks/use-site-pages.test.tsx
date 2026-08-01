import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
import { pagesListContract } from '@/app/api/v1/pm/site/pages/contract';

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

/**
 * Round-trips a page through the ROUTE CONTRACT's response schema.
 *
 * Nothing in `__tests__` is typechecked (`apps/web/tsconfig.json` includes
 * `src/**` only), so a fixture typed `SitePageSummary` is a promise this repo
 * never verifies — and `useSitePages` returns `payload.pages` verbatim, which
 * makes any assertion on a local literal an assertion about the literal.
 *
 * Parsing makes the CONTRACT the thing under test: zod strips unknown keys, so
 * a field deleted from `sitePageSchema` disappears here too and the assertion
 * that reads it fails. Use this for anything asserting a field survives the
 * wire; the plain `page()` helper is fine for the rest.
 */
function sitePageOnTheWire(row: SitePageSummary): SitePageSummary {
  return pagesListContract.response.parse({ pages: [row] }).pages[0] as SitePageSummary;
}

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

// `focusManager` is a module singleton and `setFocused` is a manual override,
// so leaving it set would leak into any file that runs after this one the day
// per-file isolation is relaxed.
afterEach(() => {
  focusManager.setFocused(undefined);
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
    /*
     * The fixture is built by PARSING through the route contract, not from the
     * local `page()` helper.
     *
     * With a local literal this test proved the fixture: `useSitePages` returns
     * `payload.pages` verbatim, so the only revertable thing was in this file.
     * Dropping `deleteStagedAt` from the contract would have broken production
     * — the staged-removal banner, the publish diff's page changes, the Pages
     * panel's "Removing" badge — and no test, because `__tests__` sits outside
     * `apps/web/tsconfig.json`'s `src/**` include and is never typechecked.
     *
     * Zod strips unknown keys, so a contract without the field yields an object
     * without it, and this assertion goes red.
     *
     * Revert check (production line): the `deleteStagedAt: z.string().nullable()`
     * declaration in `apps/web/src/app/api/v1/pm/site/pages/contract.ts`.
     */
    const staged = sitePageOnTheWire(page({ id: 3, deleteStagedAt: '2026-07-30T09:00:00.000Z' }));
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

  /*
   * D2 (round 5). The four cases titled after a server GUARD — this one plus
   * "rejects with the slug message", "rejects when the home page is targeted",
   * and "surfaces the not-staged error" — are all decided by this file's own
   * `fetch` stub. `useDeleteSitePage` has no home-page logic; `useCreateSitePage`
   * has no slug logic. Each reduces to "`requestJson` turns `!ok` into a thrown
   * Error carrying the server's message", which is pre-existing shared
   * behaviour, not a property of these hooks.
   *
   * Kept rather than deleted — they DO pin that the hook does not swallow or
   * rewrite the message, which is the difference between a PM reading "That web
   * address is reserved." and "Request failed" — but retitled so nobody reads
   * them as coverage of the guards themselves. The real guards are exercised
   * against the database in `__tests__/lib/services/site-pages-service.test.ts`
   * and `__tests__/integration/site-pages.integration.test.ts`.
   */
  it('does not swallow or rewrite the server message on a failed read', async () => {
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

  it('passes the create failure\'s message through, whatever the service said', async () => {
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

  it('invalidates the pages query, so a rename is not left only in the old cache', async () => {
    // Untested until round 5. Without it the panel keeps rendering the previous
    // name until something else happens to refetch, and the PM re-types the
    // rename believing the first one was lost.
    mockOnce({ data: { ok: true, page: page({ id: 2, name: 'Facilities' }) } });
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateSitePage(COMMUNITY_ID), {
      wrapper: wrap(client),
    });
    await result.current.mutateAsync({ pageId: 2, name: 'Facilities' });
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: sitePagesKey(COMMUNITY_ID) }),
    );
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

  it('reconciles with the server on SETTLE, not only on success', async () => {
    // `onSettled`, so the optimistic order is reconciled after a failure too —
    // the `onError` rollback restores a snapshot, and without this the cache
    // would sit on that snapshot until something else refetched. Untested
    // until round 5.
    mockOnce({ data: { ok: true } });
    const client = makeClient();
    client.setQueryData(sitePagesKey(COMMUNITY_ID), [HOME, page({ id: 2 }), page({ id: 3 })]);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useReorderSitePages(COMMUNITY_ID), {
      wrapper: wrap(client),
    });
    await result.current.mutateAsync({ orderedPageIds: [3, 2] });
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: sitePagesKey(COMMUNITY_ID) }),
    );
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

  it('passes a delete refusal through — the home-page rule itself is the service\'s', async () => {
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

  it('passes an unstage refusal through rather than resolving quietly', async () => {
    mockOnce({ error: { code: 'VALIDATION_ERROR', message: 'That page is not staged for removal.' } }, { ok: false });
    const { result } = renderHook(() => useUnstageSitePageDelete(COMMUNITY_ID), {
      wrapper: wrap(makeClient()),
    });
    await expect(result.current.mutateAsync({ pageId: 6 })).rejects.toThrow(
      /not staged for removal/i,
    );
  });
});

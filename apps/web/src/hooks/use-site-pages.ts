'use client';

/**
 * React Query hooks for the PM site editor's Pages manager (website editor v3,
 * Phase 11b-3), backed by the pages API that shipped in 11b-1.
 *
 * useSitePages              — GET    /api/v1/pm/site/pages?communityId=X
 * useCreateSitePage         — POST   /api/v1/pm/site/pages
 * useUpdateSitePage         — PATCH  /api/v1/pm/site/pages   (rename / address / nav)
 * useReorderSitePages       — POST   /api/v1/pm/site/pages/reorder
 * useDeleteSitePage         — DELETE /api/v1/pm/site/pages
 * useUnstageSitePageDelete  — DELETE /api/v1/pm/site/pages   with `unstage: true`
 *
 * Three semantics the call sites have to know, all owned by
 * `site-pages-service.ts` and merely surfaced here:
 *
 * 1. A slug change is LIVE-IMMEDIATE and normally mints a permanent redirect —
 *    `redirectedFrom` reports the address the redirect now covers, or `null`
 *    when the address did not change (or when the page reclaimed its own former
 *    address, which drops the redirect instead of minting one).
 * 2. Removing a PUBLISHED page is STAGED until the next publish (`staged: true`);
 *    removing one that has never been published is IMMEDIATE AND FINAL
 *    (`staged: false`) and takes that page's blocks with it.
 * 3. Reorder submits the FULL non-home order. The server rejects a stale or
 *    partial list outright rather than half-applying it, so the optimistic
 *    update below must roll back on error.
 *
 * There is deliberately no rename-only or nav-toggle-only hook: all three are
 * the one PATCH, and wrapping it three times would be three ways to describe one
 * request. There is no client-side page cap here either — that is a UX guard
 * rail owned by the panel, not a correctness rule of the transport.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
// Type-only, so neither the contract module nor api-contract enters this chunk
// — same reason as the sibling `use-content-blocks.ts`.
import type { Infer } from '@propertypro/api-contract';
import type {
  pagesCreateContract,
  pagesDeleteContract,
  pagesListContract,
  pagesReorderContract,
  pagesUpdateContract,
} from '@/app/api/v1/pm/site/pages/contract';

/**
 * Derived from the route contract rather than restated. A hand-written mirror of
 * `sitePageSchema` would be a second definition of one shape with nothing
 * keeping them in step; `deleteStagedAt` in particular is easy to forget and
 * silently drops the pending-removal state from the editor.
 */
export type SitePageSummary = Infer<typeof pagesListContract>['pages'][number];

type CreateResponse = Infer<typeof pagesCreateContract>;
type UpdateResponse = Infer<typeof pagesUpdateContract>;
type DeleteResponse = Infer<typeof pagesDeleteContract>;
type ReorderResponse = Infer<typeof pagesReorderContract>;

/**
 * Mirrors `blocksKey` in `use-content-blocks.ts`, and sits under the same
 * `['pm','site']` prefix so a publish (which can drop a staged page removal)
 * invalidates it with one prefix call.
 */
export const sitePagesKey = (communityId: number) =>
  ['pm', 'site', 'pages', communityId] as const;

const PAGES_URL = '/api/v1/pm/site/pages';
const PAGES_REORDER_URL = '/api/v1/pm/site/pages/reorder';

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * The community's pages in nav order, home first, INCLUDING pages that have
 * never been published — this is the editor's list, so a page the PM just
 * created has to appear in it.
 */
export function useSitePages(communityId: number) {
  return useQuery<SitePageSummary[], Error>({
    queryKey: sitePagesKey(communityId),
    queryFn: async ({ signal }) => {
      const payload = await requestJson<Infer<typeof pagesListContract>>(
        `${PAGES_URL}?communityId=${communityId}`,
        { signal },
      );
      return payload.pages;
    },
    /*
     * Overrides the app-wide `refetchOnWindowFocus: false` for this query
     * alone, because this is the one list a SECOND person can invalidate.
     *
     * A co-manager staging a page for removal, or publishing that removal,
     * changes what the page list means — and writes to a staged page still
     * SUCCEED (`resolvePageId` checks only `deletedAt`, which staging does not
     * set). So a manager who left the tab open kept editing, kept seeing
     * "Saved", and lost the work at the other manager's publish. The global
     * default leaves only a reconnect or a remount to trigger a refetch —
     * neither of which a manager sitting in another tab produces.
     *
     * Focus is the right trigger rather than an interval: it costs nothing
     * while they work, and returning to the tab is exactly when a stale editor
     * becomes dangerous. Affordable because `listSitePages` no longer locks the
     * community row on the common path.
     */
    refetchOnWindowFocus: true,
  });
}

export interface CreateSitePageInput {
  name: string;
  slug: string;
  /** Defaults to the server's choice when omitted. */
  inNav?: boolean;
}

export function useCreateSitePage(communityId: number) {
  const qc = useQueryClient();
  return useMutation<SitePageSummary, Error, CreateSitePageInput>({
    mutationFn: async ({ name, slug, inNav }) => {
      // `inNav` is spread in only when supplied so the SERVER picks the default.
      // (`JSON.stringify` would drop an explicit `undefined` anyway — the point
      // of the spread is that no default is invented here, in a second place.)
      const body = await requestJson<CreateResponse>(
        PAGES_URL,
        jsonInit('POST', {
          communityId,
          name,
          slug,
          ...(inNav === undefined ? {} : { inNav }),
        }),
      );
      return body.page;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: sitePagesKey(communityId) });
    },
  });
}

export interface UpdateSitePageInput {
  pageId: number;
  /** The display name shown in the nav and the pages list. */
  name?: string;
  /**
   * The public address. LIVE-IMMEDIATE — see the file header. The panel only
   * offers this on a page that has never been published (D32′).
   */
  slug?: string;
  inNav?: boolean;
}

export interface UpdateSitePageResult {
  page: SitePageSummary;
  /** The address a permanent redirect now covers, or null when unchanged. */
  redirectedFrom: string | null;
}

export function useUpdateSitePage(communityId: number) {
  const qc = useQueryClient();
  return useMutation<UpdateSitePageResult, Error, UpdateSitePageInput>({
    mutationFn: async ({ pageId, name, slug, inNav }) => {
      const body = await requestJson<UpdateResponse>(
        PAGES_URL,
        jsonInit('PATCH', {
          communityId,
          pageId,
          ...(name === undefined ? {} : { name }),
          ...(slug === undefined ? {} : { slug }),
          ...(inNav === undefined ? {} : { inNav }),
        }),
      );
      return { page: body.page, redirectedFrom: body.redirectedFrom };
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: sitePagesKey(communityId) });
    },
  });
}

export interface ReorderSitePagesInput {
  /**
   * EVERY non-home page id, in nav order. Home is pinned first and must not
   * appear. A partial list is rejected by the server, not half-applied.
   */
  orderedPageIds: number[];
}

/**
 * Pure optimistic-reorder helper: returns a new list with the non-home pages
 * arranged per `orderedPageIds` and the ORIGINAL sort-order slot sequence
 * re-stamped onto them, so the optimistic result matches what the server
 * returns (it renumbers contiguously from home + 1).
 *
 * Returns the input unchanged when the submitted set is not exactly the cached
 * non-home set — that request is one the server will reject, and pretending it
 * applied is precisely the wrong-but-looks-fine state this hook must not
 * produce.
 */
export function applyPageOrder(
  pages: SitePageSummary[],
  orderedPageIds: number[],
): SitePageSummary[] {
  const home = pages.filter((page) => page.isHome);
  const reorderable = pages.filter((page) => !page.isHome);

  const submitted = new Set(orderedPageIds);
  if (
    submitted.size !== orderedPageIds.length ||
    submitted.size !== reorderable.length ||
    reorderable.some((page) => !submitted.has(page.id))
  ) {
    return pages;
  }

  const byId = new Map(reorderable.map((page) => [page.id, page]));
  // Re-stamp the existing slot sequence onto the new occupants.
  const slots = reorderable.map((page) => page.sortOrder).sort((a, b) => a - b);
  const rearranged = orderedPageIds.map((id, index) => ({
    ...byId.get(id)!,
    sortOrder: slots[index]!,
  }));

  return [...home, ...rearranged];
}

/**
 * Rewrites nav order. Optimistically reorders the cached list so a keyboard or
 * drag move lands instantly, rolls back on error (a stale list is a 400, not a
 * partial apply), and invalidates on settle so the server's ordering wins.
 */
export function useReorderSitePages(communityId: number) {
  const qc = useQueryClient();
  return useMutation<
    SitePageSummary[],
    Error,
    ReorderSitePagesInput,
    { previous?: SitePageSummary[] }
  >({
    mutationFn: async ({ orderedPageIds }) => {
      const body = await requestJson<ReorderResponse>(
        PAGES_REORDER_URL,
        jsonInit('POST', { communityId, orderedPageIds }),
      );
      return body.pages;
    },
    onMutate: async ({ orderedPageIds }) => {
      await qc.cancelQueries({ queryKey: sitePagesKey(communityId) });
      const previous = qc.getQueryData<SitePageSummary[]>(sitePagesKey(communityId));
      if (previous) {
        qc.setQueryData<SitePageSummary[]>(
          sitePagesKey(communityId),
          applyPageOrder(previous, orderedPageIds),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(sitePagesKey(communityId), context.previous);
      }
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: sitePagesKey(communityId) });
    },
  });
}

export interface DeleteSitePageResult {
  /**
   * true  — the page is live, so the removal is STAGED and applies on the next
   *         publish; it can still be cancelled with `useUnstageSitePageDelete`.
   * false — the page had never been published; it and its sections are gone
   *         immediately and permanently.
   */
  staged: boolean;
}

export function useDeleteSitePage(communityId: number) {
  const qc = useQueryClient();
  return useMutation<DeleteSitePageResult, Error, { pageId: number }>({
    mutationFn: async ({ pageId }) => {
      const body = await requestJson<DeleteResponse>(
        PAGES_URL,
        jsonInit('DELETE', { communityId, pageId }),
      );
      return { staged: body.staged };
    },
    onSuccess: async () => {
      // Broad prefix on purpose: removing a page that was never published also
      // soft-deletes its blocks, so a pages-only invalidation would leave the
      // editor rendering sections of a page that no longer exists.
      await qc.invalidateQueries({ queryKey: ['pm', 'site'] });
    },
  });
}

/** Cancels a staged removal — the pages panel's and publish sheet's undo. */
export function useUnstageSitePageDelete(communityId: number) {
  const qc = useQueryClient();
  return useMutation<void, Error, { pageId: number }>({
    mutationFn: async ({ pageId }) => {
      await requestJson<DeleteResponse>(
        PAGES_URL,
        jsonInit('DELETE', { communityId, pageId, unstage: true }),
      );
    },
    onSuccess: async () => {
      // Narrow on purpose, unlike the delete above: cancelling a staged removal
      // restores nothing but the page's own pending state — no blocks moved.
      await qc.invalidateQueries({ queryKey: sitePagesKey(communityId) });
    },
  });
}

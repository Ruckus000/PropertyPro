'use client';

/**
 * The editor's change model — draft vs. last-published, in one place.
 *
 * ## Why this is a hook and not two copies
 *
 * The top bar's Publish button and the publish sheet's "N changes ready to
 * publish" are the same claim made twice. They were not: the sheet computed the
 * diff internally, and `EditorRoot` had no count at all — which is how the
 * Publish button shipped permanently disabled. Two independent computations of
 * "is there anything to publish" is exactly how that disagreement recurs, so
 * both surfaces call this.
 *
 * `siteIssues`/`contrastIssues` deliberately stay in the sheet. They gate the
 * sheet's own footer button, not the top bar's, and keeping them out of here
 * keeps `validate.ts`/`contrast.ts` out of the always-mounted root's bundle.
 *
 * ## Draft and published MUST resolve together
 *
 * `useContentBlocks` and `usePublishedBlocks` share one query key and differ
 * only by `select` (see use-content-blocks.ts), so they cost one request and
 * land in the same tick. That is load-bearing, not incidental: if the published
 * side were ever split into its own request, there would be a window where the
 * draft has loaded and `published` is still null — `firstPublish` would flip
 * true, every section would read as `added`, and the Publish button would
 * briefly light up with a bogus count on an already-published site.
 */

import { useCallback, useMemo } from 'react';
import { diffSite, type DiffResult, type SiteSnapshot } from '@propertypro/shared';
import { useContentBlocks, usePublishedBlocks } from '@/hooks/use-content-blocks';
import { toSnapshot } from '@/lib/site-editor/to-snapshot';

export interface SiteDiffState {
  diff: DiffResult;
  /** The draft snapshot — also what `siteIssues`/`issueTarget` run against. */
  next: SiteSnapshot;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  /** Refetches the shared blocks query. */
  refetch: () => void;
}

export function useSiteDiff(communityId: number): SiteDiffState {
  const draftQuery = useContentBlocks(communityId);
  const publishedQuery = usePublishedBlocks(communityId);

  const next: SiteSnapshot = useMemo(() => toSnapshot(draftQuery.data), [draftQuery.data]);

  const published: SiteSnapshot | null = useMemo(() => {
    const rows = publishedQuery.data;
    // `null`, never an empty snapshot. `diffSite` distinguishes "never
    // published" from "published, and now empty" only by this argument, and an
    // empty snapshot reports the wrong `firstPublish`.
    if (!rows || rows.length === 0) return null;
    return toSnapshot(rows);
  }, [publishedQuery.data]);

  const diff = useMemo(() => diffSite(published, next), [published, next]);

  const refetch = useCallback(() => {
    void draftQuery.refetch();
    void publishedQuery.refetch();
  }, [draftQuery, publishedQuery]);

  return {
    diff,
    next,
    isPending: draftQuery.isPending || publishedQuery.isPending,
    isError: draftQuery.isError || publishedQuery.isError,
    error: draftQuery.error ?? publishedQuery.error ?? null,
    refetch,
  };
}

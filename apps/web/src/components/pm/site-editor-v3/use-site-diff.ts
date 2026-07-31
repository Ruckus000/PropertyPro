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
 *
 * ## `useContentBlocks` here stays WHOLE-SITE (Phase 11b-3, D-C2)
 *
 * Every other editor surface — the canvas, the preview, the Add panel — narrows
 * the block list to the selected page. **This one must not.** A publish is
 * whole-site and atomic: the server promotes every draft row for the community
 * in one transaction, regardless of which page the PM happens to be looking at.
 * Page-filtering here would make the sheet under-report — the PM would review
 * three changes, publish, and ship eleven. Under-reporting what an irreversible
 * action is about to do is the worst failure mode this file has, and it is
 * silent: a page-scoped diff renders as a perfectly plausible publish sheet.
 *
 * ## Pages are part of the change model, and they are NOT diffed like sections
 *
 * Almost everything about a page is live-immediate (a rename, a nav toggle and
 * a reorder all reach the public site on save), so only two page-level facts
 * are ever pending: a page that has never been published, and a page staged for
 * removal. `diffPages` owns that rule; this hook only supplies the rows and
 * merges the resulting `Change[]` fragment into the section diff.
 *
 * ## Grouping is by page, and the slot map is a UNION of both sides
 *
 * `diffSite` stamps one `group` on every change it emits (`next.pageId ?? 'site'`),
 * because it diffs one snapshot pair and knows nothing about pages. The
 * per-page grouping the review sheet renders is therefore applied here, by
 * mapping each change's slot back to the page that slot lives on.
 *
 * That map is built from the union of the draft and published block lists, and
 * the union is the whole point: a `removed` change describes a section that
 * exists **only on the published side** — there is no draft row to read a
 * `pageId` off. A draft-only map would silently file every removal under the
 * site-wide group, i.e. the one change kind where "which page is losing this?"
 * is the question the PM is actually asking. A slot present in neither list
 * (and a block not yet adopted onto a page, `pageId === null`) falls back to
 * the site-wide group explicitly.
 *
 * This is sound only while `block_order` is community-unique — true until 11c
 * drops the three-column index. When per-page slots land, the slot alone stops
 * identifying a page and `diffSite` will have to be called per page instead.
 */

import { useCallback, useMemo } from 'react';
import {
  diffPages,
  diffSite,
  pageTitle,
  publishedPageBaseline,
  type Change,
  type ChangeKey,
  type DiffResult,
  type SitePageRow,
  type SiteSnapshot,
} from '@propertypro/shared';
import { useContentBlocks, usePublishedBlocks, type SiteBlockSummary } from '@/hooks/use-content-blocks';
import { useSitePages, type SitePageSummary } from '@/hooks/use-site-pages';
import { toSnapshot } from '@/lib/site-editor/to-snapshot';

/**
 * The group id for changes that do not belong to any one page.
 *
 * Exported so the publish sheet renders the same constant it is grouped by,
 * rather than a second string literal that could drift from this one.
 */
export const SITE_CHANGE_GROUP = 'site';

export interface SiteDiffState {
  diff: DiffResult;
  /** The draft snapshot — also what `siteIssues`/`issueTarget` run against. */
  next: SiteSnapshot;
  /** Group id → human label, for the page groups. Site-wide is the sheet's own copy. */
  pageLabels: ReadonlyMap<string, string>;
  /** Group id → nav position, so page groups render in the site's own order. */
  pageRank: ReadonlyMap<string, number>;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  /** Refetches the shared blocks query and the pages query. */
  refetch: () => void;
}

/**
 * `SitePageSummary` (the wire shape) → `SitePageRow` (the diff shape).
 *
 * `deleteStagedAt` is a timestamp on the wire and a boolean in the change
 * model, and that narrowing happens here rather than in `diffPages` so the
 * shared package keeps no opinion about how the API spells a pending removal.
 */
function toPageRow(page: SitePageSummary): SitePageRow {
  return {
    pageId: String(page.id),
    name: page.name,
    slug: page.slug,
    isHome: page.isHome,
    inNav: page.inNav,
    isDraft: page.isDraft,
    deleteStaged: page.deleteStagedAt !== null,
  };
}

/**
 * `block_order` → the group its section belongs to.
 *
 * Published rows are laid down first and draft rows second, so a draft wins a
 * disagreement — the same draft-wins rule the merged editor list uses. The two
 * can only disagree if a slot has moved between pages, which the pre-11c
 * community-wide slot index does not allow.
 */
function buildSlotGroups(
  draft: readonly SiteBlockSummary[] | undefined,
  published: readonly SiteBlockSummary[] | undefined,
): Map<number, string> {
  const slots = new Map<number, string>();
  for (const rows of [published, draft]) {
    for (const block of rows ?? []) {
      // `null` is a real server value (a pre-11b row no write path has adopted
      // onto a page yet) and `undefined` is a stale hand-built literal. Neither
      // names a page, so neither may claim a slot — both fall through to the
      // site-wide group below. This deliberately does NOT throw the way
      // `blocksForPage` does: that guards the canvas, where a missing row is
      // invisible, whereas throwing here would take out the publish sheet
      // entirely and leave the PM with no way to ship at all.
      if (block.pageId === null || block.pageId === undefined) continue;
      slots.set(block.blockOrder, String(block.pageId));
    }
  }
  return slots;
}

/**
 * Which group a section-level change belongs to.
 *
 * `toSlot ?? fromSlot` covers all four kinds: `added` carries only `toSlot`,
 * `removed` only `fromSlot`, `edited` both (preferring the draft's slot, which
 * is where the section will actually be after publishing). The `reordered`
 * change carries neither — section order is one community-wide sequence today,
 * so it stays site-wide rather than being attributed to a page it is not
 * exclusively about.
 */
function groupForChange(change: Change, slots: ReadonlyMap<number, string>): string {
  const slot = change.toSlot ?? change.fromSlot;
  if (slot === null) return SITE_CHANGE_GROUP;
  return slots.get(slot) ?? SITE_CHANGE_GROUP;
}

export function useSiteDiff(communityId: number): SiteDiffState {
  const draftQuery = useContentBlocks(communityId);
  const publishedQuery = usePublishedBlocks(communityId);
  const pagesQuery = useSitePages(communityId);

  const next: SiteSnapshot = useMemo(() => toSnapshot(draftQuery.data), [draftQuery.data]);

  const published: SiteSnapshot | null = useMemo(() => {
    const rows = publishedQuery.data;
    // `null`, never an empty snapshot. `diffSite` distinguishes "never
    // published" from "published, and now empty" only by this argument, and an
    // empty snapshot reports the wrong `firstPublish`.
    if (!rows || rows.length === 0) return null;
    return toSnapshot(rows);
  }, [publishedQuery.data]);

  const slotGroups = useMemo(
    () => buildSlotGroups(draftQuery.data, publishedQuery.data),
    [draftQuery.data, publishedQuery.data],
  );

  const pageRows = useMemo<SitePageRow[]>(
    () => (pagesQuery.data ?? []).map(toPageRow),
    [pagesQuery.data],
  );

  const pageLabels = useMemo(
    () => new Map(pageRows.map((page) => [page.pageId, pageTitle(page)])),
    [pageRows],
  );

  // The pages arrive home-first then in nav order, so the array index IS the
  // rank. Deriving it from `sortOrder` would re-sort by a number the server
  // already used to order the list.
  const pageRank = useMemo(
    () => new Map(pageRows.map((page, index) => [page.pageId, index])),
    [pageRows],
  );

  const diff = useMemo<DiffResult>(() => {
    const base = diffSite(published, next);
    const pageChanges = diffPages(publishedPageBaseline(pageRows), pageRows);
    const sectionChanges = base.changes.map((change) => {
      const group = groupForChange(change, slotGroups);
      return group === change.group ? change : { ...change, group };
    });
    // Page changes first so "Contact page — Added" heads its own group rather
    // than trailing the sections it brought with it.
    const changes = [...pageChanges, ...sectionChanges];
    return {
      ...base,
      changes,
      // Derived from the merged list, never concatenated from two key arrays —
      // that is the only form in which `keys` cannot disagree with `changes`.
      keys: changes.map((change) => change.key) as ChangeKey[],
    };
  }, [published, next, pageRows, slotGroups]);

  const refetch = useCallback(() => {
    void draftQuery.refetch();
    void publishedQuery.refetch();
    void pagesQuery.refetch();
  }, [draftQuery, publishedQuery, pagesQuery]);

  return {
    diff,
    next,
    pageLabels,
    pageRank,
    // The pages query joins the gate rather than degrading quietly. A publish
    // sheet rendered while the page list is missing would omit an entire class
    // of pending change — a staged page removal shows up nowhere else — and
    // "reviewed and published" is not a state a PM can take back.
    isPending: draftQuery.isPending || publishedQuery.isPending || pagesQuery.isPending,
    isError: draftQuery.isError || publishedQuery.isError || pagesQuery.isError,
    error: draftQuery.error ?? publishedQuery.error ?? pagesQuery.error ?? null,
    refetch,
  };
}

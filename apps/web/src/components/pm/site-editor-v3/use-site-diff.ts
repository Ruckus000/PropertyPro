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
 * The canvas, the preview, and the Sections panel + Inspector (via the provider,
 * which `EditorRoot` narrows) all scope the block list to the selected page.
 * The Add panel scopes only the page it WRITES to — its slot maths must keep
 * seeing every page, or it allocates a slot another page already holds (D-C3).
 * **This one must not scope at all.** A publish is
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
  isLazyDraftHome,
  pageIssues,
  pageTitle,
  publishedPageBaseline,
  TOMBSTONE_BLOCK_TYPE,
  type Change,
  type ChangeKey,
  type DiffResult,
  type Issue,
  type SitePageRow,
  type SiteSnapshot,
} from '@propertypro/shared';
import { useContentBlocks, usePublishedBlocks, type SiteBlockSummary } from '@/hooks/use-content-blocks';
import { useSitePages, type SitePageSummary } from '@/hooks/use-site-pages';
import { isReservedPublicSlug } from '@/lib/middleware/public-host-routes';
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
  /**
   * `block_order` → the page id that slot's section lives on.
   *
   * Exposed for "Fix this" in the publish sheet. Blocking issues are computed
   * from the WHOLE-SITE snapshot (D-C2 — the publish diff must see every page),
   * while the editor context is scoped to the selected page, so an issue's slot
   * routinely names a section the editor cannot currently reach. Without this
   * the fix affordance silently does nothing for exactly the multi-page case
   * this phase ships.
   */
  slotGroups: ReadonlyMap<number, string>;
  /**
   * Page-SET problems, in the same `Issue` vocabulary as `siteIssues`.
   *
   * The publish sheet used to compute its blocking set from `siteIssues` plus
   * contrast and never ran `pageIssues` at all — but the server runs it inside
   * the publish transaction and refuses on no home, two homes, a duplicate name
   * or slug, a reserved slug, or a retired-slug clash. So the PM met every one
   * of those as a bare "This site cannot be published yet." AFTER clicking a
   * button the client had told them was ready, with the reasons stripped.
   *
   * Two deliberate differences from the server's run:
   *
   *  - `retiredSlugs` is omitted. The redirect table is not on the client, so
   *    the retired-slug rule stays server-only. That makes this a strict
   *    SUBSET: it can miss a refusal, never invent one, which is the only safe
   *    direction for a gate that disables a button.
   *  - `reserveStagedSlugs` is left at its default (false), matching the
   *    publish gate rather than the editor forms. At publish the staged page is
   *    leaving, so its address is about to be free.
   */
  pageIssues: Issue[];
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
    /*
     * Mirror the server's draft-home exclusion, which is deliberate and which
     * this diff omitted.
     *
     * `ensureHomePageInTransaction` creates home lazily with
     * `isDraft: publishedStamp === null`, so a community that has never
     * published has a DRAFT home it never asked for.
     * `publishedPageBaseline` drops every draft page from the baseline, so
     * without this filter that row reads as `added` — an untouched empty site
     * claims one pending change, `canOpenPublish` goes true, and the publish
     * then throws `NothingToPublishRollback`. Newly reachable because the RSC
     * now calls `listSitePages` on every load, which is what creates the row.
     *
     * The server rule is `(isDraft && !isHome) || deleteStagedAt !== null` —
     * search `site-blocks-service.ts` for `pendingPages`; a line number here
     * had already drifted 22 lines by round 5. The `deleteStaged` arm needs no
     * counterpart here: `diffPages` independently treats a page that was never
     * published AND is already staged for removal as a net non-event, since
     * publishing it neither creates nor destroys anything a visitor could have
     * seen. Spelling that case out again would be a second rule saying the same
     * thing, and the two would drift.
     */
    const pendingPageRows = pageRows.filter((page) => !isLazyDraftHome(page));
    const pageChanges = diffPages(publishedPageBaseline(pageRows), pendingPageRows);
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

  /*
   * The page-set gate, stated BEFORE the button rather than after the click.
   *
   * `pageIssues` is the exact function the publish transaction runs
   * (`site-blocks-service.ts`, Step 3b-pages). Running it here as well is not
   * duplication for its own sake: without it the client's `blocking` set came
   * from `siteIssues` and contrast only, so a duplicate slug or a missing home
   * left Publish enabled, and the refusal arrived as an opaque server sentence
   * on a sheet whose only advice was to try again.
   *
   * `deleteStaged` pages are already handled inside `pageIssues` (they are not
   * validated, because a broken page must stay deletable), so no filtering is
   * needed here — this passes the same `pageRows` the server passes.
   */
  const pageSetIssues = useMemo<Issue[]>(
    () =>
      pageIssues({
        pages: pageRows,
        isReserved: isReservedPublicSlug,
      }),
    [pageRows],
  );

  /*
   * An empty page about to go live, as a WARNING.
   *
   * Warning, not error: an empty page is a legitimate thing to publish — a PM
   * may be shipping the nav entry first — and blocking it would be this client
   * inventing a rule the server does not have. But nothing said anything at
   * all, and the result is a nav link to a page that renders chrome with a gap
   * where the content should be, which reads to a resident as a broken site
   * rather than an unfinished one.
   *
   * Scoped to pages the publish will CREATE (`isDraft`, excluding the lazily
   * created home — same exclusion as `pendingPageRows` above). An existing
   * published page that the PM has emptied is a different, deliberate act, and
   * the section removals themselves already appear in the diff.
   */
  const emptyPageWarnings = useMemo<Issue[]>(() => {
    const populated = new Set<number>();
    for (const block of draftQuery.data ?? []) {
      if (block.pageId === null || block.pageId === undefined) continue;
      if (block.blockType === TOMBSTONE_BLOCK_TYPE) continue;
      populated.add(block.pageId);
    }
    return (pagesQuery.data ?? [])
      .filter((page) => page.isDraft && !isLazyDraftHome(page) && !populated.has(page.id))
      .map((page) => ({
        field: `page:${page.id}.sections`,
        message: `"${page.name}" has no sections yet, so visitors following its link will find an empty page.`,
        severity: 'warning' as const,
      }));
  }, [draftQuery.data, pagesQuery.data]);

  const allPageIssues = useMemo(
    () => [...pageSetIssues, ...emptyPageWarnings],
    [pageSetIssues, emptyPageWarnings],
  );

  // Depends on the three `refetch` FUNCTIONS, which TanStack keeps stable — not
  // on the query objects, which v5 rebuilds on every render, so those deps never
  // compared equal and this `useCallback` memoised nothing. Harmless while the
  // only consumer is an `onClick`, and an infinite loop the first time someone
  // puts this in an effect's dependency array.
  const refetch = useCallback(() => {
    void draftQuery.refetch();
    void publishedQuery.refetch();
    void pagesQuery.refetch();
  }, [draftQuery.refetch, publishedQuery.refetch, pagesQuery.refetch]);

  return {
    diff,
    next,
    pageLabels,
    pageRank,
    slotGroups,
    pageIssues: allPageIssues,
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

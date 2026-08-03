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
 * ## `diffSite` is called ONCE PER PAGE, and that is not a narrowing
 *
 * Whole-site SCOPE and per-page COMPUTATION are different things, and the
 * section above is about the first. Every page is diffed and the results are
 * concatenated, so the sheet still reports every change the publish will ship.
 * What per-page computation removes is the ability to correlate sections ACROSS
 * pages: `diffSite` matches draft rows to published rows by slot, so one
 * flattened call would pair page A's published section with page B's draft
 * section the moment two pages may hold the same slot — reporting an "edited"
 * or "reordered" that never happened. That becomes possible when 11c drops the
 * three-column index, and diffing each page against itself makes it
 * unrepresentable rather than merely unlikely.
 *
 * The page set is the UNION of both block lists, not the page rows. A `removed`
 * change describes a section that exists **only on the published side**, and a
 * page can outlive its row — so iterating page rows alone would silently drop
 * exactly the change kind where "which page is losing this?" is the question
 * the PM is asking. Blocks not yet adopted onto a page (`pageId === null`) get
 * the site-wide group.
 *
 * This replaced a slot→page map (`buildSlotGroups`) applied after a single
 * whole-site call. `diffSite` already stamps `group = next.pageId`, so grouping
 * is now what the diff SAYS rather than something recovered afterwards from a
 * lookup that only worked while `block_order` was community-unique.
 */

import { useCallback, useMemo } from 'react';
import {
  diffPages,
  diffSite,
  isLazyDraftHome,
  pageIssues,
  pageTitle,
  publishedPageBaseline,
  SITE_DIFF_SCHEMA_VERSION,
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
import { warnEmptyPage } from '@/lib/site-editor/describe-page-state';
import { isReservedPublicSlug } from '@/lib/middleware/public-host-routes';
import { blocksForPage } from '@/lib/site-editor/blocks-for-page';
import { toSnapshot } from '@/lib/site-editor/to-snapshot';

/**
 * The group id for changes that do not belong to any one page.
 *
 * Exported so the publish sheet renders the same constant it is grouped by,
 * rather than a second string literal that could drift from this one.
 */
export const SITE_CHANGE_GROUP = 'site';

/**
 * One page's slice of the draft, ready for `siteIssues`.
 *
 * `isHome` rides along because it decides `heroExpected`: only the home page is
 * supposed to have a hero, and running the default (`true`) over every page
 * would put "This site has no welcome section" on each of them. The server
 * passes exactly this — `siteIssues(snapshot, { heroExpected: page.isHome })`.
 */
export interface ValidatedPage {
  /** `site_pages.id` stringified, or `SITE_CHANGE_GROUP` for unadopted blocks. */
  pageId: string;
  isHome: boolean;
  snapshot: SiteSnapshot;
}

export interface SiteDiffState {
  diff: DiffResult;
  /** The draft snapshot — also what `siteIssues`/`issueTarget` run against. */
  next: SiteSnapshot;
  /**
   * The blocking gate's input: ONE SNAPSHOT PER PAGE, minus pages staged for
   * deletion — so the gate cannot invent a refusal the server would not make.
   *
   * Per page, not one flattened snapshot, because `siteIssues` raises
   * `Duplicate blockOrder N` as an ERROR. Slots are unique community-wide only
   * while the pre-11c 3-column index survives; the moment 11c drops it and two
   * pages may each hold slot 2, a flattened snapshot reports every page's
   * second section as a duplicate and disables Publish permanently, over a
   * slot number that appears on no UI surface. The server has always validated
   * per page — see `publishCommunitySite`, which builds one snapshot from
   * `winners.filter(r => r.pageId === page.id)` — so this is the client
   * catching up to it, not a new rule.
   */
  validated: readonly ValidatedPage[];
  /** Group id → human label, for the page groups. Site-wide is the sheet's own copy. */
  pageLabels: ReadonlyMap<string, string>;
  /** Group id → nav position, so page groups render in the site's own order. */
  pageRank: ReadonlyMap<string, number>;
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

export function useSiteDiff(communityId: number): SiteDiffState {
  const draftQuery = useContentBlocks(communityId);
  const publishedQuery = usePublishedBlocks(communityId);
  const pagesQuery = useSitePages(communityId);

  const next: SiteSnapshot = useMemo(() => toSnapshot(draftQuery.data), [draftQuery.data]);

  /**
   * The snapshot the BLOCKING GATE validates — `next` minus the sections of any
   * page this publish is about to delete.
   *
   * Mirrors `publishCommunitySite`, which skips those pages outright:
   *
   *     // A page being removed by this publish is about to stop existing;
   *     // holding the publish on its content would block the removal of a
   *     // broken page.
   *     if (page.deleteStagedAt !== null) continue;
   *
   * Without the mirror the client INVENTS a refusal the server would not make.
   * A page holding an invalid section — a legacy row, a tightened schema, a
   * block type dropped from the view registry — cannot be got rid of: the PM
   * stages it for removal (the only remedy the product offers for a broken
   * page), opens Publish, and the sheet disables the button over a section on
   * the page they have already told it to delete. "Fix this" then carries them
   * onto a page whose own banner says it is being deleted.
   *
   * `SiteDiffState.pageIssues` states the contract this restores: the client
   * gate "can miss a refusal, never invent one, which is the only safe
   * direction for a gate that disables a button." `pageIssues` honoured it;
   * `siteIssues` — which owns the disabled state — did not.
   *
   * SEPARATE from `next` rather than a narrowing of it, deliberately. `next`
   * feeds `diffSite`, and the publish diff is whole-site by design (D-C2): a
   * staged page's sections still ship in the same transaction and still belong
   * in the change list. This is a validation input, not a scoping change.
   *
   * ONE SNAPSHOT PER PAGE — see `SiteDiffState.validated` for why a flattened
   * one becomes a permanently disabled Publish button the moment 11c lands.
   */
  const validated = useMemo<readonly ValidatedPage[]>(() => {
    const pages = pagesQuery.data ?? [];
    const blocks = draftQuery.data ?? [];

    /*
     * No page rows yet — validate exactly as before, whole-site.
     *
     * The pages query can be pending, or fail, while the blocks query has
     * resolved. Guessing per-page groupings from `block.pageId` alone would
     * mean guessing `isHome` too, and guessing it wrong puts a spurious
     * "no welcome section" warning on the home page or hides a real hero
     * error. Falling back to today's behaviour is the direction that cannot
     * invent a refusal.
     */
    if (pages.length === 0) {
      return [{ pageId: SITE_CHANGE_GROUP, isHome: true, snapshot: toSnapshot(blocks) }];
    }

    const out: ValidatedPage[] = [];
    for (const page of pages) {
      // A page being removed by this publish is about to stop existing; holding
      // the publish on its content would block the removal of a broken page.
      // This is `publishCommunitySite`'s rule, quoted from its own comment.
      if (page.deleteStagedAt !== null) continue;
      out.push({
        pageId: String(page.id),
        isHome: page.isHome,
        snapshot: toSnapshot(blocksForPage(blocks, page.id), { pageId: String(page.id) }),
      });
    }

    /*
     * Unadopted blocks (`page_id IS NULL`) get their own bucket.
     *
     * They belong to no page, so no page loop reaches them — and silently
     * dropping them would hide a real refusal, which is the one direction this
     * gate must never move in. `heroExpected: false` because a bucket that is
     * not a page cannot be missing a hero; every other rule still runs.
     *
     * Transitional by construction: 11c's `page_id SET NOT NULL` makes this
     * bucket unreachable, and it should be deleted with the rest of the
     * NULL-handling then.
     */
    // `null` only: a MISSING `pageId` is a stale fixture, and `blocksForPage`
    // has already thrown on it in the loop above rather than letting it vanish.
    const unadopted = blocks.filter((b) => b.pageId === null);
    if (unadopted.length > 0) {
      out.push({
        pageId: SITE_CHANGE_GROUP,
        isHome: false,
        snapshot: toSnapshot(unadopted),
      });
    }

    return out;
  }, [draftQuery.data, pagesQuery.data]);

  const published: SiteSnapshot | null = useMemo(() => {
    const rows = publishedQuery.data;
    // `null`, never an empty snapshot. `diffSite` distinguishes "never
    // published" from "published, and now empty" only by this argument, and an
    // empty snapshot reports the wrong `firstPublish`.
    if (!rows || rows.length === 0) return null;
    return toSnapshot(rows);
  }, [publishedQuery.data]);

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
    const draftRows = draftQuery.data ?? [];
    const publishedRows = publishedQuery.data ?? [];

    /*
     * ONE `diffSite` CALL PER PAGE — still whole-site in SCOPE (D-C2).
     *
     * Per-page computation is not a narrowing: every page is diffed and the
     * results are concatenated, so the sheet still reports every change the
     * publish will ship. What it stops doing is correlating sections ACROSS
     * pages. `diffSite` matches draft rows to published rows by slot, and slots
     * are unique community-wide only until 11c drops the 3-column index — after
     * which one flattened call would pair page A's published section with page
     * B's draft section and report an "edited" or "reordered" that never
     * happened. Diffing each page against itself makes that unrepresentable.
     *
     * It also deletes `buildSlotGroups`/`groupForChange`: `diffSite` already
     * stamps `group = next.pageId`, so grouping by page is now what the diff
     * says rather than something recovered afterwards from a slot→page map that
     * only worked while slots were community-unique.
     *
     * The page set is the union of both block lists, NOT `pageRows`. A block
     * whose page row is missing — a page removed by a publish that its
     * published sections outlived — must still appear in the diff. Dropping it
     * would be exactly the silent under-report this file's header calls its
     * worst failure mode.
     */
    const pageIds: (number | null)[] = [];
    const seenPageIds = new Set<number | null>();
    const notePageId = (id: number | null) => {
      if (seenPageIds.has(id)) return;
      seenPageIds.add(id);
      pageIds.push(id);
    };
    // `pageRows` first so groups come out in the site's own nav order; then any
    // page id only the blocks know about, including `null` (unadopted).
    for (const row of pageRows) notePageId(Number(row.pageId));
    for (const block of [...publishedRows, ...draftRows]) notePageId(block.pageId);

    /*
     * NOT `blocksForPage` for the `null` case: that helper returns the list
     * UNCHANGED for a null page id, because null there means "no page selected
     * yet" on the canvas. Here null means the block genuinely belongs to no
     * page, so it needs the opposite of that behaviour.
     */
    const forPage = (rows: readonly SiteBlockSummary[], pageId: number | null) =>
      pageId === null ? rows.filter((b) => b.pageId === null) : blocksForPage(rows, pageId);

    const sectionChanges: Change[] = [];
    for (const pageId of pageIds) {
      const draftForPage = forPage(draftRows, pageId);
      const publishedForPage = forPage(publishedRows, pageId);
      if (draftForPage.length === 0 && publishedForPage.length === 0) continue;

      const group = pageId === null ? SITE_CHANGE_GROUP : String(pageId);
      /*
       * `null`, never an empty snapshot — the same rule the whole-site call
       * followed. A page with no published rows has no previous order to have
       * changed, so `diffSite` correctly suppresses its `order` change; an
       * empty-but-present snapshot would claim one.
       */
      const publishedSnapshot =
        publishedForPage.length === 0 ? null : toSnapshot(publishedForPage, { pageId: group });
      sectionChanges.push(
        ...diffSite(publishedSnapshot, toSnapshot(draftForPage, { pageId: group })).changes,
      );
    }

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
    // Page changes first so "Contact page — Added" heads its own group rather
    // than trailing the sections it brought with it.
    const changes = [...pageChanges, ...sectionChanges];
    return {
      schemaVersion: SITE_DIFF_SCHEMA_VERSION,
      changes,
      // Derived from the merged list, never concatenated from two key arrays —
      // that is the only form in which `keys` cannot disagree with `changes`.
      keys: changes.map((change) => change.key) as ChangeKey[],
      /*
       * SITE-level, not per page. `diffSite` reports `firstPublish` for the
       * snapshot pair it was given, so a brand-new page on a long-published
       * site would report it — and the sheet would announce "this will be your
       * site's first publish" over a site that has published many times. The
       * question is about the SITE, so it is answered from the site's published
       * rows, exactly as the single whole-site call used to answer it.
       */
      firstPublish: publishedRows.length === 0,
    };
  }, [draftQuery.data, publishedQuery.data, pageRows]);

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
        // The sentence branches on whether the page will be LINKED once this
        // publish lands — see `warnEmptyPage`. It lives in the describer module
        // rather than here so there stays one place to be wrong about what a
        // visitor can reach.
        message: warnEmptyPage(page),
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
    validated,
    pageLabels,
    pageRank,
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

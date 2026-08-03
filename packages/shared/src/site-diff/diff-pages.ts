/**
 * The draft-vs-published diff, at the level of whole PAGES.
 *
 * Companion to `diff.ts`, which diffs the sections *within* a page. The two are
 * separate functions rather than one because the identity problem that makes
 * `diffSite` hard does not exist here at all: `site_blocks` has no stable row
 * identity (every write soft-deletes and re-INSERTs, so sections have to be
 * matched by content), whereas `site_pages` is ONE ROW PER PAGE with an `id`
 * that survives every rename. Pages correlate by id. None of `diffSite`'s
 * fingerprint matching belongs here, and reusing it would invent an ambiguity
 * the data model does not have.
 *
 * **What is pending publication, and what is not.** Almost everything about a
 * page is live-immediate — `site_pages` has no draft/published column pair, so
 * a rename, a nav toggle and a reorder all reach the public site the moment
 * they are saved. Exactly two page-level facts wait for a publish:
 *
 *   - a page that has never been published (`is_draft`), which anonymous RLS
 *     hides until the publish transaction clears the flag; and
 *   - a page staged for removal (`delete_staged_at`), which stays live and
 *     anon-readable precisely so it does not vanish before the PM publishes.
 *
 * That is why there is no page-ordering change kind. Section order gets an
 * `'order'` change because section slots are staged; page sort order is not
 * staged, so a change to it is already live and reporting it as pending would
 * be a lie the PM cannot act on. Do not add one without first giving
 * `site_pages` the draft columns that would make it true.
 *
 * Pure and sync, like everything in this directory: no database, no React, no
 * `node:` built-ins. Callers pass the rows in.
 */
import {
  type Change,
  type SitePageRow,
  type SitePageSnapshot,
} from './types';

/**
 * Display label for a page: its name, falling back to something identifying
 * rather than empty.
 *
 * An empty name is a publish-blocking error (`pageIssues`), but the review
 * sheet still has to render the row that says so — a blank label there would
 * make the offending page the one row a PM cannot find.
 */
export function pageTitle(page: Pick<SitePageSnapshot, 'name' | 'slug' | 'isHome'>): string {
  const name = page.name.trim();
  if (name.length > 0) return name;
  if (page.isHome) return 'Home';
  return page.slug.length > 0 ? `/${page.slug}` : 'Untitled page';
}

/**
 * The lazily-created draft home page — an artefact, not a PM action.
 *
 * `ensureHomePage` inserts home with `is_draft = (publishedStamp === null)`, so
 * every community that has never published carries a DRAFT home page nobody
 * asked for. Four places independently need to exclude it and each had written
 * the condition out by hand:
 *
 *   - the publish transaction's `pendingPages` (is there anything to publish?);
 *   - its `addedPageCount` (what does the receipt say happened?);
 *   - its history-snapshot page list;
 *   - the client's `useSiteDiff` (does the Publish button light up?).
 *
 * They must agree. If the gate counts it and the diff does not, an untouched
 * empty site claims a pending change and the publish then throws
 * `NothingToPublishRollback` — "nothing left to publish" on the very click the
 * editor invited. If the receipt counts it and the gate does not, every
 * first-time PM is told they added a page they never made. Both have happened.
 *
 * One predicate rather than four copies, so the next phase that needs it
 * inherits the rule instead of re-deriving it.
 */
export function isLazyDraftHome(page: { isHome: boolean; isDraft: boolean }): boolean {
  return page.isHome && page.isDraft;
}

/**
 * The published side of a page diff, derived from the rows the pages API
 * returns.
 *
 * Exists so no caller has to invent the baseline. There is no stored snapshot
 * of "the pages as last published", and there does not need to be: because
 * every page field except the two staging flags is live-immediate, a published
 * page's current row IS its published state. So the published side is exactly
 * the non-draft rows, as they stand.
 *
 * Handing callers this function rather than a comment is deliberate. The
 * failure mode it removes is silent: a caller that passed `[]` here would have
 * every existing page report as `added`, and the PM would be told their live
 * home page is about to be created. That renders as a plausible publish sheet,
 * not as an error.
 *
 * `deleteStaged` is dropped on the way out — staging is a *pending* change, so
 * it belongs to the next side only. See `SitePageSnapshot.deleteStaged`.
 *
 * **This function stops being correct the moment `site_pages` gains draft
 * columns for name or slug.** Its whole premise is that a published page's
 * current row is its published state, and draft columns would make the current
 * row the *draft* state — at which point every rename would diff against itself
 * and report no change. That is a silent under-report, not a crash. Whichever
 * phase adds those columns must read the published values here instead, and the
 * `'edited'` branch of `diffPages` is already waiting for it.
 */
export function publishedPageBaseline(
  pages: readonly SitePageRow[],
): SitePageSnapshot[] {
  return pages
    .filter((page) => !page.isDraft)
    .map(({ pageId, name, slug, isHome, inNav }) => ({
      pageId,
      name,
      slug,
      isHome,
      inNav,
    }));
}

function changed(published: SitePageSnapshot, next: SitePageSnapshot): boolean {
  return (
    published.name !== next.name ||
    published.slug !== next.slug ||
    published.isHome !== next.isHome ||
    published.inNav !== next.inNav
  );
}

function pageChange(
  page: SitePageSnapshot,
  kind: 'added' | 'edited' | 'removed',
): Change {
  return {
    key: `page:${page.pageId}`,
    kind,
    // Grouped under its own id so the review sheet files a page's creation or
    // removal alongside that page's section changes, rather than in a separate
    // site-wide bucket where the two would read as unrelated.
    group: page.pageId,
    title: `${pageTitle(page)} page`,
    // Slots and block types are section concepts. A page has neither.
    blockType: null,
    fromSlot: null,
    toSlot: null,
    page,
  };
}

/**
 * Page-level changes a publish will apply.
 *
 * Returns a `Change[]` FRAGMENT rather than a `DiffResult`, so the caller
 * concatenates it with the per-page `diffSite` results into one list. A
 * `DiffResult` here would have to carry a `firstPublish` flag that means
 * nothing at the page level and a `schemaVersion` that would then exist twice
 * in one merged diff.
 *
 * When merging into a `DiffResult`, derive `keys` from the merged `changes`
 * (`changes.map((c) => c.key)`, exactly as `diffSite` does) rather than
 * concatenating two key arrays. Keys exist for revert-targeting and dedupe, so
 * a `page:` key missing from `keys` while its change is in `changes` is a
 * disagreement inside one object — and the derived form cannot produce one.
 *
 * Both sides are arrays and neither may be `null`. `diffSite` takes `null` to
 * mean "never published", but there is no equivalent state here: a site with no
 * published pages passes `[]`, which reads every page as `added` — the same
 * answer, without a second way to spell it.
 *
 * Derive `published` with `publishedPageBaseline`. `deleteStaged` is read from
 * `next` only.
 */
export function diffPages(
  published: readonly SitePageSnapshot[],
  next: readonly SitePageSnapshot[],
): Change[] {
  const publishedById = new Map(published.map((page) => [page.pageId, page]));
  const changes: Change[] = [];
  const seen = new Set<string>();

  for (const page of next) {
    seen.add(page.pageId);
    const before = publishedById.get(page.pageId);

    if (page.deleteStaged === true) {
      // A page that was never published and is already staged for removal is a
      // net non-event: publishing neither creates nor destroys anything a
      // visitor could have seen. Reporting it as a removal would name a page
      // that never existed publicly. (11b deletes an unpublished page outright
      // rather than staging it, so this is defensive, not a live path.)
      if (before !== undefined) changes.push(pageChange(page, 'removed'));
      continue;
    }

    if (before === undefined) {
      changes.push(pageChange(page, 'added'));
      continue;
    }

    // No producer today: every editable page field is live-immediate, so a
    // published page's baseline is its own current row and this can never
    // differ. The branch exists for the same reason the `style` change key
    // does — so that giving `site_pages` draft columns later is a change to one
    // caller, not a change to the change model.
    if (changed(before, page)) changes.push(pageChange(page, 'edited'));
  }

  // A published page absent from `next` entirely. 11b stages the removal of a
  // published page rather than dropping the row, so this too is defensive — but
  // silence here would mean a page vanishing from the live site with the
  // publish sheet reporting nothing at all, which is the worst of the available
  // wrong answers.
  for (const page of published) {
    if (!seen.has(page.pageId)) changes.push(pageChange(page, 'removed'));
  }

  return changes;
}

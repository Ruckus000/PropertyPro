/**
 * Narrows a community-wide block list to the blocks belonging to one site page
 * (Phase 11b-3).
 *
 * `GET /api/v1/pm/site/blocks` deliberately returns EVERY page's blocks in one
 * response: `blocks` and `publishedBlocks` have to resolve in the same tick for
 * the change model, so the client filters rather than refetching per page. This
 * is that filter, kept as a pure function so the publish path can keep using the
 * unfiltered list (D-C2) without accidentally inheriting a page scope.
 *
 * The slot allocator is the OTHER caller, and it wants the opposite: since
 * migration 0048 dropped the community-wide unique index, `block_order` is
 * unique only within a page, so `nextContentSlot` is given this filter's OUTPUT
 * rather than the raw list. An earlier version of this sentence said the
 * allocator had to keep seeing every page (D-C3); that was true only while the
 * 3-column index stood.
 *
 * Two behaviours are deliberate:
 *
 *  - **A `pageId` of `null` returns the list unchanged.** That is the
 *    "no page selected" case — the same case in which the write hooks omit
 *    `pageId` and let the server default to home. Filtering to nothing there
 *    would blank the canvas for a caller that simply has not loaded its pages
 *    yet.
 *
 *  - **A block whose `pageId` property is missing (`undefined`) THROWS.**
 *    `apps/web/tsconfig.json` includes only `src/**`, so `__tests__` is not part
 *    of the typecheck program: a fixture that was never updated to carry
 *    `pageId` type-checks fine and would otherwise just quietly vanish from the
 *    canvas, which is exactly the failure this whole slice exists to prevent.
 *    Failing loudly turns a silent empty canvas into a named error (D13′).
 *    Note this is `undefined`, not `null`: `null` is a real server value (a
 *    pre-11b row no write path has adopted yet) and is handled below.
 */

/** The minimum shape this filter needs. Widened so tests can use plain rows. */
export interface PageScopedBlock {
  id: number;
  /**
   * The page this block belongs to. `null` means an unadopted pre-11b row —
   * reading the pages API adopts these onto the home page, so the state is
   * transient.
   */
  pageId: number | null;
}

export function blocksForPage<T extends PageScopedBlock>(
  blocks: readonly T[] | undefined | null,
  pageId: number | null,
): T[] {
  if (!blocks) return [];

  // Validated before the `null` short-circuit on purpose: a stale fixture must
  // fail everywhere it is used, not only on the page-scoped paths.
  for (const block of blocks) {
    if (block.pageId === undefined) {
      throw new Error(
        `blocksForPage: block ${block.id} has an undefined pageId. Every SiteBlockSummary ` +
          'must carry a pageId (number | null) — a stale fixture or a hand-built block ' +
          'literal is missing it.',
      );
    }
  }

  if (pageId === null) return [...blocks];

  // An unadopted (`pageId === null`) row is NOT folded into the selected page.
  // Including it would render one row on every page and let an edit made on
  // page B rewrite it — the same cross-page write this slice exists to stop.
  // Excluding it is recoverable; a wrong write is not.
  //
  // The recovery is a BLOCK WRITE, not a page-list read — this said the latter,
  // which stopped being true when `listSitePages` went lock-free. Its fast path
  // returns before `ensureHomePageInTransaction`, so `adoptPagelessBlocks` now
  // runs only for a community that has no home page at all. See the paragraph
  // in `site-pages-service.ts` ending "do not delete this paragraph without
  // adding it" — §3b hand-off obligation 1 — and note that nothing currently
  // WRITES a null `page_id` (0046 backfilled every row, soft-deleted included,
  // and every write path resolves a page), so this is a guard against a future
  // producer rather than a state a PM can reach today.
  return blocks.filter((block) => block.pageId === pageId);
}

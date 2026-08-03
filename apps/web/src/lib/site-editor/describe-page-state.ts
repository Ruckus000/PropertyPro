/**
 * Every sentence the Pages panel says about what a VISITOR can see.
 *
 * ## Why this module exists
 *
 * The panel makes the same claim — "this change is (or is not) on your public
 * site" — from six independent places: a hint above the controls, four toasts,
 * and an explanatory paragraph. While that copy lived inline, each site derived
 * the truth condition for itself, and they drifted:
 *
 *  - the reorder toast learned that a Draft or Not-in-nav page is on no public
 *    surface, and the rename toast, both nav toasts and the shared hint went on
 *    asserting "This is live on your site now." for a page that 404s;
 *  - when the reorder toast was corrected it tested only the MOVED row, missing
 *    that the public nav is a filtered PROJECTION — so moving a public page past
 *    a hidden one still claimed a visitor-facing change that did not happen.
 *
 * Both were found by review, one round apart, and the second was introduced by
 * the fix for the first. The pattern is not carelessness: a fix arrives with one
 * file:line, gets written against that site, and gets a test that pins that
 * site. Nothing asks "where else is this claim made?".
 *
 * One module answers that question structurally — but the FIRST version of this
 * module answered it with two hand-maintained phrase lists (one in its test, one
 * in the guard), which is the same shape as the hand-enumerated surface lists
 * that produced the drift. A review round proved it: a describer returning
 * "Visitors can already reach this page on your public website." for a DRAFT
 * page passed the invariant, because that wording was in neither list.
 *
 * So every describer now returns a `PageSentence` that DECLARES whether it
 * claims public visibility. The invariant is then a logical check —
 * `claimsPublic` implies the page is published — with no vocabulary in it at
 * all, over describers enumerated by reflection rather than by a list. The
 * phrase heuristic survives only as a secondary belt that can add failures and
 * never mask them.
 *
 * ## The rules these functions encode
 *
 * Mirrors `public-community-reader.ts`:
 *
 *  - `getPageBySlug` filters `is_draft = false` — an unpublished page is
 *    reachable at no URL, so NOTHING about it is visible to a visitor;
 *  - `listNavPages` filters `is_draft = false AND in_nav = true` — the nav is a
 *    filtered projection of the page list, which is why nav-order questions ask
 *    "did the projection change?" and not "is this row public?".
 *
 * `deleteStagedAt` is deliberately not part of visibility: a staged page is
 * still live until the publish lands, so a change to it IS visible. Staging
 * changes what the sentence should SAY, not whether the page is public.
 */

/**
 * A sentence, plus the one fact about it a test cannot infer from its text.
 *
 * `claimsPublic` is declared beside the words it describes, so writing a new
 * sentence forces the author to answer "does this tell the PM a visitor can see
 * it right now?" — and the invariant checks that answer against the page state
 * mechanically. A phrase list can only recognise wordings someone already
 * thought of; this recognises the claim itself.
 */
export interface PageSentence {
  text: string;
  /** Does this assert the page is on the public site RIGHT NOW? */
  claimsPublic: boolean;
}

/** The page fields any of these sentences can depend on. */
export interface PageStateFacts {
  /** Identity. The reorder projection keys on this — never on `name`. */
  id: number;
  name: string;
  isDraft: boolean;
  inNav: boolean;
  isHome: boolean;
  deleteStagedAt: string | null;
}

/** Published at all — the weaker test, for anything not nav-specific. */
export function isPublished(page: Pick<PageStateFacts, 'isDraft'>): boolean {
  return !page.isDraft;
}

/** On the public NAV — published *and* kept in it. */
export function isPubliclyVisible(page: Pick<PageStateFacts, 'isDraft' | 'inNav'>): boolean {
  return !page.isDraft && page.inNav;
}

/** Staged for removal by a PM, pending the next publish. */
export function isStagedForRemoval(page: Pick<PageStateFacts, 'deleteStagedAt'>): boolean {
  return page.deleteStagedAt !== null;
}

/**
 * The hint above the page's controls, saying when those controls take effect.
 *
 * Three states because all three differ, and the staged one deliberately does
 * NOT mention the page's NAME: the rename control is absent on a staged page,
 * so promising that a name change goes live would describe a control that is
 * not on screen.
 *
 * BOTH the draft and the published arm split on `isHome` for exactly that
 * reason. Home's disclosure holds ONE control, Page name: the nav toggle and the
 * address field are both gated `!page.isHome` in `PagesPanel`, and home is
 * excluded from `reorderableIds`, so `canReorder` is false and both chevrons are
 * disabled. Naming "navigation" and "order" there points at two controls the PM
 * cannot find and sends them looking for them.
 *
 * The draft half of this was fixed first because the lazily created draft home
 * page is the first screen a PM ever sees on a new community. The PUBLISHED half
 * is the same defect on the state every established community sits in, so it is
 * the more common instance, not a rarer one.
 *
 * The STAGED arm is deliberately left unsplit: home has no removal control at
 * all (`PagesPanel` gates it `!page.isHome`) and the server refuses, so a staged
 * home page is unreachable. A branch for it would be a sentence no PM can read,
 * written to make a matrix look symmetrical.
 */
export function describeLiveImmediacy(
  page: Pick<PageStateFacts, 'isDraft' | 'deleteStagedAt' | 'isHome'>,
): PageSentence {
  if (!isPublished(page)) {
    return {
      text: page.isHome
        ? "This page isn't on your site yet. Its name will apply once you publish it."
        : "This page isn't on your site yet. Its name, navigation and order will apply once you publish it.",
      claimsPublic: false,
    };
  }
  if (isStagedForRemoval(page)) {
    return {
      text: "This page's navigation and order go live straight away — but it is set to be removed, so your next publish takes it off the site.",
      claimsPublic: true,
    };
  }
  return {
    text: page.isHome
      ? "A page's name goes live straight away — it is not held back for your next publish."
      : "A page's name, navigation visibility and order go live straight away — they are not held back for your next publish.",
    claimsPublic: true,
  };
}

/** Confirmation after a rename. */
export function describeRenamed(
  page: Pick<PageStateFacts, 'isDraft'>,
  newName: string,
): PageSentence {
  return isPublished(page)
    ? { text: `Page renamed to ${newName}. This is live on your site now.`, claimsPublic: true }
    : {
        text: `Page renamed to ${newName}. It isn't published yet, so nothing visitors see has changed.`,
        claimsPublic: false,
      };
}

/**
 * Confirmation after the nav toggle.
 *
 * `nextInNav` is the value being SAVED, not the current one — the caller has
 * already inverted it, and reading `page.inNav` here would describe the state
 * the PM just left.
 */
export function describeNavToggled(
  page: Pick<PageStateFacts, 'name' | 'isDraft'>,
  nextInNav: boolean,
): PageSentence {
  if (!isPublished(page)) {
    return {
      text: nextInNav
        ? `${page.name} will appear in your navigation once it's published.`
        : `${page.name} won't appear in your navigation. It isn't published yet, so nothing visitors see has changed.`,
      claimsPublic: false,
    };
  }
  return {
    text: nextInNav
      ? `${page.name} shows in your navigation now.`
      : `${page.name} is out of your navigation now. The page itself stays online.`,
    claimsPublic: true,
  };
}

/**
 * Confirmation after a reorder.
 *
 * Takes the two ORDERS, not the moved row, because the public nav is a filtered
 * projection: a move changes what visitors see only when the projection
 * changes. Asking "is the moved page public?" is wrong in both directions — it
 * misses that a hidden page's move is invisible, and that a public page hopping
 * a hidden one is invisible too.
 *
 * Callers pass the full non-home ordering before and after; this applies the
 * filter itself so no caller has to remember to.
 */
export function describeReordered(
  page: Pick<PageStateFacts, 'name'>,
  before: readonly PageStateFacts[],
  after: readonly PageStateFacts[],
): PageSentence {
  /*
   * Keyed on ID, not name.
   *
   * The pre-extraction code joined page IDs; the extraction switched to names
   * and called itself behaviour-preserving. Names carry no unique index —
   * `site-pages-service.ts` says so — and `assertNameAvailable` skips pages
   * staged for deletion, so "stage a page, rename another onto its name" frees
   * a duplicate in about three clicks. Two same-named public pages then project
   * identically under either order, and the toast reports no visitor-facing
   * change for a nav that visibly moved. Identity, not display text, is what
   * this comparison is about.
   */
  const projection = (rows: readonly PageStateFacts[]) =>
    rows
      .filter(isPubliclyVisible)
      .map((row) => row.id)
      .join(',');
  return projection(before) !== projection(after)
    ? { text: 'Your navigation order is live now.', claimsPublic: true }
    : {
        text: `Order saved. This didn't change what visitors see — ${page.name} isn't in your public navigation, or it moved past pages that aren't.`,
        claimsPublic: false,
      };
}

/**
 * Whether to explain that the nav toggle is not an "unpublish".
 *
 * Withheld on a STAGED page, where every clause is wrong — it is on its way off
 * the site, the only control below it is "Cancel removal", and "To take it off
 * your site, remove it" is advice for an action already taken with no control
 * to take it. Withheld on a DRAFT page too: there is no link to remove and
 * nothing for search engines to find. Home has no removal control at all.
 */
export function shouldExplainNavIsNotRemoval(page: PageStateFacts): boolean {
  return !page.isHome && !isStagedForRemoval(page) && isPublished(page);
}

/** The text that explanation carries. */
export const NAV_IS_NOT_REMOVAL =
  'This only removes the link from your navigation. The page stays online at its own address and search engines can still find it. To take it off your site, remove it.';

/**
 * The publish-sheet warning for a page the publish will create with no sections.
 *
 * ## Why this is not a `describe*`
 *
 * Every other sentence here answers "what can a visitor see RIGHT NOW?", which
 * is the question `claimsPublic` declares an answer to and the property test
 * checks against the page state. This one answers "what will a visitor find
 * AFTER the pending publish?" — and it is only ever called for pages the publish
 * will CREATE, so the page is a draft by construction and every arm is
 * future-tense. There is no present-tense claim for the invariant to check, and
 * declaring `claimsPublic: false` on both arms would enter it in the sweep as a
 * describer that can never satisfy the non-vacuity assertion. It lives in this
 * module because this is where visitor-facing vocabulary belongs, not because it
 * is a describer, and it is named so the reflection sweep does not collect it.
 *
 * ## Why it branches
 *
 * `inNav` decides it, and `isDraft` cannot: the publish is what clears
 * `isDraft`, so the visibility that matters is the one the page will have on the
 * far side of it. That is why the caller asks `isPubliclyVisible` about the
 * POST-publish shape rather than about `page`, for which it is false by
 * construction here.
 *
 * The unconditional version promised a link the PM had already switched off:
 * `listNavPages` filters `in_nav`, so a page badged "Not in nav" is linked from
 * nowhere and no visitor "follows its link" to anything. The badge and the
 * warning contradicted each other two panels apart. For that page the honest
 * risk is that nobody finds it at all — it is still in `sitemap.xml` (D16), so
 * "invisible" would be the opposite over-claim.
 */
export function warnEmptyPage(page: Pick<PageStateFacts, 'name' | 'inNav'>): string {
  return isPubliclyVisible({ isDraft: false, inNav: page.inNav })
    ? `"${page.name}" has no sections yet, so visitors following its link will find an empty page.`
    : `"${page.name}" has no sections yet, and it isn't in your navigation — nothing on your site links to it, so visitors are unlikely to find it at all.`;
}

/**
 * The page-state copy module — and, more usefully, an INVARIANT over it.
 *
 * The example cases below pin the individual sentences. The property test at the
 * bottom is the one that earns this file: it runs every describing function
 * across the whole state matrix and asserts that **no sentence claims public
 * visibility for a page that has none**.
 *
 * That is the exact bug this module was extracted to end, and it recurred twice
 * because each fix was written against one call site. A property over the matrix
 * cannot be satisfied by fixing one arm — and a seventh sentence added to the
 * module is covered ON ARRIVAL, with no registration step: the sweep finds
 * describers by REFLECTION over the module's exports, and each one DECLARES
 * `claimsPublic` beside its words, so the property is logic over that
 * declaration rather than a search for wordings someone anticipated.
 *
 * This paragraph used to say a new describer was covered "the moment it is added
 * to `DESCRIBERS`, which is a one-line edit in the same file". There is no
 * `DESCRIBERS`: it was a hand-maintained array, an unregistered describer was
 * invisible to the sweep, and it was replaced precisely because a hand list is
 * the same shape as the hand-enumerated surface lists that produced the drift.
 * The long comment above the invariant, at the bottom of this file, has the
 * whole account.
 */
import { describe, it, expect } from 'vitest';
import * as M from '@/lib/site-editor/describe-page-state';
import {
  NAV_IS_NOT_REMOVAL,
  describeLiveImmediacy,
  describeNavToggled,
  describeRenamed,
  describeReordered,
  isPublished,
  isPubliclyVisible,
  isStagedForRemoval,
  shouldExplainNavIsNotRemoval,
  warnEmptyPage,
  type PageStateFacts,
  type PageSentence,
} from '@/lib/site-editor/describe-page-state';

function page(overrides: Partial<PageStateFacts> = {}): PageStateFacts {
  return {
    id: 2,
    name: 'Amenities',
    isDraft: false,
    inNav: true,
    isHome: false,
    deleteStagedAt: null,
    ...overrides,
  };
}

const PUBLISHED = page();
const DRAFT = page({ isDraft: true, name: 'Pool Rules' });
const HIDDEN = page({ inNav: false, name: 'Board archive' });
const STAGED = page({ deleteStagedAt: '2026-07-30T00:00:00.000Z', name: 'Pool' });

describe('page-state predicates', () => {
  it('mirrors the public reader: draft is invisible, nav needs both flags', () => {
    // `getPageBySlug` filters `is_draft = false`; `listNavPages` filters
    // `is_draft = false AND in_nav = true`.
    expect(isPublished(PUBLISHED)).toBe(true);
    expect(isPublished(DRAFT)).toBe(false);
    expect(isPubliclyVisible(PUBLISHED)).toBe(true);
    expect(isPubliclyVisible(HIDDEN)).toBe(false);
    expect(isPubliclyVisible(DRAFT)).toBe(false);
  });

  it('does not fold staging into visibility', () => {
    // A staged page is still live until the publish lands, so a change to it IS
    // visible. Staging changes what the sentence says, not whether it is public.
    expect(isPublished(STAGED)).toBe(true);
    expect(isPubliclyVisible(STAGED)).toBe(true);
    expect(isStagedForRemoval(STAGED)).toBe(true);
    expect(isStagedForRemoval(PUBLISHED)).toBe(false);
  });
});

describe('describeLiveImmediacy', () => {
  it('has a distinct sentence for each of the three states', () => {
    expect(describeLiveImmediacy(PUBLISHED).text).toMatch(/go live straight away/);
    expect(describeLiveImmediacy(DRAFT).text).toMatch(/isn't on your site yet/);
    expect(describeLiveImmediacy(STAGED).text).toMatch(/set to be removed/);
  });

  it('does not promise a NAME change on a staged page, whose rename control is absent', () => {
    expect(describeLiveImmediacy(STAGED).text).not.toMatch(/name/i);
    // …while the ordinary published sentence does, because that control is there.
    expect(describeLiveImmediacy(PUBLISHED).text).toMatch(/name/i);
  });

  it('does not promise the draft HOME page a nav toggle or a reorder it does not have', () => {
    /*
     * The same rule as the staged case above, on the first screen a PM ever
     * sees: the lazily created draft home page's disclosure holds ONE control,
     * Page name. `PagesPanel` gates the nav toggle and the address field
     * `!page.isHome`, and home is pinned at position one, so "navigation and
     * order" names two controls the PM cannot find.
     */
    const draftHome = page({ isDraft: true, isHome: true, name: 'Home' });
    expect(describeLiveImmediacy(draftHome).text).toMatch(/isn't on your site yet/);
    expect(describeLiveImmediacy(draftHome).text).toMatch(/name/i);
    expect(describeLiveImmediacy(draftHome).text).not.toMatch(/navigation|order/i);
    // …and an ordinary draft page, which HAS both controls, still gets both.
    expect(describeLiveImmediacy(DRAFT).text).toMatch(/navigation and order/);
  });

  it('does not offer the PUBLISHED home page those two controls either', () => {
    /*
     * The same defect on the state every established community sits in, which
     * makes it the more common instance rather than a rarer one. Home is
     * excluded from `reorderableIds` so both chevrons are disabled, and the nav
     * toggle is gated `!page.isHome` — published or not, the only control in
     * home's disclosure is Page name.
     */
    const publishedHome = page({ isHome: true, name: 'Home' });
    expect(describeLiveImmediacy(publishedHome).text).toMatch(/goes live straight away/);
    expect(describeLiveImmediacy(publishedHome).text).toMatch(/name/i);
    expect(describeLiveImmediacy(publishedHome).text).not.toMatch(/navigation|order/i);
    // Still a claim about the live site — home IS published here.
    expect(describeLiveImmediacy(publishedHome).claimsPublic).toBe(true);
    // …and an ordinary published page, which HAS all three, still gets all three.
    expect(describeLiveImmediacy(PUBLISHED).text).toMatch(/navigation visibility and order/);
  });
});

describe('describeRenamed', () => {
  it('says the new name is live only on a page a visitor can reach', () => {
    expect(describeRenamed(PUBLISHED, 'Amenities & Pool').text).toBe(
      'Page renamed to Amenities & Pool. This is live on your site now.',
    );
  });

  it('promises nothing "now" on a page that is on no public surface', () => {
    // `getPageBySlug` filters `is_draft = false`, so the renamed page 404s.
    expect(describeRenamed(DRAFT, 'Pool Rules v2').text).toMatch(/isn't published yet/);
    expect(describeRenamed(DRAFT, 'Pool Rules v2').claimsPublic).toBe(false);
  });
});

describe('describeNavToggled', () => {
  it('reads the value being SAVED, not the one being left', () => {
    // The caller has already inverted it. Reading the current value would
    // describe the state the PM just moved away from.
    expect(describeNavToggled(PUBLISHED, true).text).toMatch(/shows in your navigation now/);
    expect(describeNavToggled(PUBLISHED, false).text).toMatch(/out of your navigation now/);
  });

  it('promises nothing "now" on a page with no public nav to be in', () => {
    expect(describeNavToggled(DRAFT, true).text).toMatch(/once it's published/);
    expect(describeNavToggled(DRAFT, false).text).toMatch(/isn't published yet/);
  });
});

describe('describeReordered', () => {
  const contact = page({ id: 10, name: 'Contact' });
  const pool = page({ id: 11, name: 'Pool' });
  const draftBoard = page({ id: 12, name: 'Board', isDraft: true });

  it('says the order is live when the public projection actually moved', () => {
    expect(describeReordered(contact, [contact, pool], [pool, contact]).text).toMatch(
      /live now/,
    );
  });

  it('says nothing changed when only a hidden page moved', () => {
    expect(
      describeReordered(draftBoard, [contact, draftBoard], [draftBoard, contact]).text,
    ).toMatch(/didn't change what visitors see/);
  });

  it('says nothing changed when a PUBLIC page merely hops a hidden one', () => {
    /*
     * The case that testing the moved row cannot see, and the one that shipped
     * wrong. `[Contact, Board(draft), Pool]` with Contact moved down is
     * `[Board, Contact, Pool]`; the projection is `[Contact, Pool]` either way.
     */
    expect(
      describeReordered(
        contact,
        [contact, draftBoard, pool],
        [draftBoard, contact, pool],
      ).text,
    ).toMatch(/didn't change what visitors see/);
  });
});

describe('warnEmptyPage', () => {
  /*
   * Both pages here are drafts, because that is the only kind the publish sheet
   * warns about — it warns about pages the publish will CREATE. So the split is
   * `inNav`, read as the visibility the page will have on the far side of the
   * publish that clears `isDraft`.
   */
  it('promises a link only to a page that will actually be linked', () => {
    expect(warnEmptyPage(page({ isDraft: true, inNav: true, name: 'Pool' }))).toMatch(
      /visitors following its link/,
    );
  });

  it('does not promise a link the PM has already switched off', () => {
    /*
     * `listNavPages` filters `in_nav`, so nothing on the site links to this
     * page and no visitor "follows its link" to anything — the warning and the
     * row's own "Not in nav" badge contradicted each other two panels apart.
     * The honest risk is that nobody finds it; it is still in `sitemap.xml`
     * (D16), so "invisible" would be the opposite over-claim.
     */
    const hiddenDraft = page({ isDraft: true, inNav: false, name: 'Board archive' });
    expect(warnEmptyPage(hiddenDraft)).not.toMatch(/following its link/);
    expect(warnEmptyPage(hiddenDraft)).toMatch(/isn't in your navigation/);
    expect(warnEmptyPage(hiddenDraft)).toMatch(/unlikely to find it/);
  });

  it('names the page in both arms', () => {
    expect(warnEmptyPage(page({ isDraft: true, inNav: true, name: 'Pool' }))).toContain('"Pool"');
    expect(warnEmptyPage(page({ isDraft: true, inNav: false, name: 'Pool' }))).toContain('"Pool"');
  });

  it('is not in the describer sweep, and that is deliberate', () => {
    /*
     * It answers "what will a visitor find AFTER the pending publish?", not
     * "what can a visitor see right now?" — so it has no `claimsPublic` for the
     * invariant to check, and entering it in the sweep would make it a describer
     * that can never satisfy the non-vacuity assertion below. Pinned here so the
     * naming is a decision rather than an accident somebody later "fixes".
     */
    expect('warnEmptyPage'.startsWith('describe')).toBe(false);
    expect(typeof warnEmptyPage(page())).toBe('string');
  });
});

describe('shouldExplainNavIsNotRemoval', () => {
  it('explains on an ordinary published page', () => {
    expect(shouldExplainNavIsNotRemoval(PUBLISHED)).toBe(true);
  });

  it('withholds where every clause of the explanation would be wrong', () => {
    // Staged: on its way off the site, and "to take it off your site, remove it"
    // is advice for an action already taken with no control to take it.
    expect(shouldExplainNavIsNotRemoval(STAGED)).toBe(false);
    // Draft: no link to remove, nothing for search engines to find.
    expect(shouldExplainNavIsNotRemoval(DRAFT)).toBe(false);
    // Home has no removal control at all.
    expect(shouldExplainNavIsNotRemoval(page({ isHome: true }))).toBe(false);
  });
});

/*
 * ── The invariant ─────────────────────────────────────────────────────────
 *
 * The FIRST version of this section was a phrase whitelist, and a review round
 * broke it in one probe: a describer returning "Visitors can already reach this
 * page on your public website." for a DRAFT page passed, because that wording
 * was in neither the test's list nor the guard's. It also relied on a
 * hand-maintained `DESCRIBERS` array — an unregistered describer was invisible
 * — which is the same shape as the hand-enumerated surface lists that produced
 * the drift this module exists to end.
 *
 * Rebuilt on two mechanisms that need no vocabulary and no list:
 *
 *   1. Each describer DECLARES `claimsPublic` beside its words. The invariant is
 *      then logic: a sentence may claim publicity only for a published page.
 *   2. Describers are found by REFLECTION over the module's exports, so a new
 *      one is covered on arrival rather than when someone remembers a list.
 *
 * The phrase heuristic survives as a secondary belt: it can only ADD failures
 * (text that reads like a claim while declaring it is not one), never mask them.
 */

/** Reads like a present-tense visibility claim. Belt, not braces — see above. */
const READS_AS_PUBLIC_CLAIM = [
  /live on your site now/i,
  /\blive now\b/i,
  /go live straight away/i,
  /shows in your navigation now/i,
  /stays online/i,
  /visitors can (already )?(see|reach)/i,
  /on your public (site|website)/i,
];

/** Every combination of the flags that decide what a visitor can see. */
const MATRIX: PageStateFacts[] = [true, false].flatMap((isDraft) =>
  [true, false].flatMap((inNav) =>
    [true, false].flatMap((isHome) =>
      [null, '2026-07-30T00:00:00.000Z'].map((deleteStagedAt) =>
        page({ isDraft, inNav, isHome, deleteStagedAt }),
      ),
    ),
  ),
);

/**
 * Every exported describer, found by reflection.
 *
 * A describer is an exported function returning a `PageSentence`. Calling each
 * with a plausible argument list is the one piece of per-function knowledge
 * left, and it is a mechanical arity switch rather than a judgement — omitting a
 * case makes the coverage assertion below fail loudly, not silently.
 */
function sentencesFor(state: PageStateFacts): Array<{ name: string; sentence: PageSentence }> {
  const other = page({ id: 999, name: 'Other' });
  const out: Array<{ name: string; sentence: PageSentence }> = [];

  for (const [name, value] of Object.entries(M)) {
    if (typeof value !== 'function' || !name.startsWith('describe')) continue;
    const fn = value as (...args: unknown[]) => unknown;
    const candidates: unknown[][] = [
      [state],
      [state, 'New name'],
      [state, true],
      [state, false],
      // Both a real move and a no-op move, so neither reorder arm escapes.
      [state, [state, other], [other, state]],
      [state, [state], [state]],
    ];
    for (const args of candidates) {
      let result: unknown;
      try {
        result = fn(...args);
      } catch {
        continue;
      }
      if (
        typeof result === 'object' &&
        result !== null &&
        'text' in result &&
        'claimsPublic' in result
      ) {
        out.push({ name, sentence: result as PageSentence });
      }
    }
  }
  return out;
}

describe('the invariant: nothing claims a visitor can see an unpublished page', () => {
  it('finds every exported describer by reflection, so none can be forgotten', () => {
    /*
     * The coverage assertion. `DESCRIBERS` used to be a hand list, and an
     * unregistered describer was simply invisible to the sweep. Reflection
     * removes the list; this pins that reflection actually reaches everything,
     * so a describer whose arguments the switch above cannot supply fails here
     * rather than being silently skipped.
     */
    const exported = Object.entries(M)
      .filter(([name, v]) => typeof v === 'function' && name.startsWith('describe'))
      .map(([name]) => name)
      .sort();
    const reached = [...new Set(sentencesFor(page()).map((s) => s.name))].sort();

    expect(exported.length).toBeGreaterThan(0);
    expect(reached).toEqual(exported);
  });

  it('holds for every describer, over the whole state matrix', () => {
    const violations: string[] = [];

    for (const state of MATRIX) {
      for (const { name, sentence } of sentencesFor(state)) {
        const where = `{draft:${state.isDraft}, inNav:${state.inNav}, home:${state.isHome}, staged:${state.deleteStagedAt !== null}}`;

        // 1. THE INVARIANT. Declaring a public claim on an unpublished page is
        //    the defect, whatever words it uses.
        if (sentence.claimsPublic && !isPublished(state)) {
          violations.push(`${name} on ${where} claimed public visibility: "${sentence.text}"`);
        }

        // 2. THE BELT. Text that reads like a claim while declaring otherwise is
        //    either a mis-declaration or a wording that will mislead a PM. It can
        //    only add failures — a wording the list misses is still caught by (1).
        if (!sentence.claimsPublic && READS_AS_PUBLIC_CLAIM.some((r) => r.test(sentence.text))) {
          violations.push(
            `${name} on ${where} declared claimsPublic:false but reads as a claim: "${sentence.text}"`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('is not vacuous — EVERY describer claims publicity somewhere on the published half', () => {
    /*
     * Per-describer, not aggregate. The old version asserted `claims.length > 0`
     * across all describers at once, which `describeLiveImmediacy` alone
     * satisfied forever — so a describer that stopped claiming anything (or was
     * reworded out of the heuristic) went unnoticed. This fails on that.
     */
    const claimed = new Set<string>();
    for (const state of MATRIX.filter(isPublished)) {
      for (const { name, sentence } of sentencesFor(state)) {
        if (sentence.claimsPublic) claimed.add(name);
      }
    }

    const exported = Object.entries(M)
      .filter(([name, v]) => typeof v === 'function' && name.startsWith('describe'))
      .map(([name]) => name)
      .sort();

    expect([...claimed].sort()).toEqual(exported);
  });
});

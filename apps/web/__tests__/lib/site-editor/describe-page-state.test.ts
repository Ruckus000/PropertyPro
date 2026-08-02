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
 * module is covered the moment it is added to `DESCRIBERS`, which is a one-line
 * edit in the same file, rather than a new test somebody has to think of.
 */
import { describe, it, expect } from 'vitest';
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
  type PageStateFacts,
} from '@/lib/site-editor/describe-page-state';

function page(overrides: Partial<PageStateFacts> = {}): PageStateFacts {
  return {
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
    expect(describeLiveImmediacy(PUBLISHED)).toMatch(/go live straight away/);
    expect(describeLiveImmediacy(DRAFT)).toMatch(/isn't on your site yet/);
    expect(describeLiveImmediacy(STAGED)).toMatch(/set to be removed/);
  });

  it('does not promise a NAME change on a staged page, whose rename control is absent', () => {
    expect(describeLiveImmediacy(STAGED)).not.toMatch(/name/i);
    // …while the ordinary published sentence does, because that control is there.
    expect(describeLiveImmediacy(PUBLISHED)).toMatch(/name/i);
  });
});

describe('describeNavToggled', () => {
  it('reads the value being SAVED, not the one being left', () => {
    // The caller has already inverted it. Reading the current value would
    // describe the state the PM just moved away from.
    expect(describeNavToggled(PUBLISHED, true)).toMatch(/shows in your navigation now/);
    expect(describeNavToggled(PUBLISHED, false)).toMatch(/out of your navigation now/);
  });

  it('promises nothing "now" on a page with no public nav to be in', () => {
    expect(describeNavToggled(DRAFT, true)).toMatch(/once it's published/);
    expect(describeNavToggled(DRAFT, false)).toMatch(/isn't published yet/);
  });
});

describe('describeReordered', () => {
  const contact = page({ name: 'Contact' });
  const pool = page({ name: 'Pool' });
  const draftBoard = page({ name: 'Board', isDraft: true });

  it('says the order is live when the public projection actually moved', () => {
    expect(describeReordered(contact, [contact, pool], [pool, contact])).toMatch(
      /live now/,
    );
  });

  it('says nothing changed when only a hidden page moved', () => {
    expect(
      describeReordered(draftBoard, [contact, draftBoard], [draftBoard, contact]),
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
      ),
    ).toMatch(/didn't change what visitors see/);
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
 * Every describing function, over the whole matrix, in one assertion.
 */

/** Phrases that assert a page is on the public site RIGHT NOW. */
const CLAIMS_PUBLIC_NOW = [
  /live on your site now/i,
  /\blive now\b/i,
  /go live straight away/i,
  /shows in your navigation now/i,
  /stays online/i,
  /search engines can still find it/i,
];

/**
 * Every sentence-producer, applied to one page.
 *
 * A new describing function is covered by adding one line here — which is in the
 * same file as the function, so the omission is visible at review time rather
 * than discoverable only by a later review round.
 */
const DESCRIBERS: Array<{ name: string; run: (p: PageStateFacts) => string[] }> = [
  { name: 'describeLiveImmediacy', run: (p) => [describeLiveImmediacy(p)] },
  { name: 'describeRenamed', run: (p) => [describeRenamed(p, 'New name')] },
  {
    name: 'describeNavToggled',
    run: (p) => [describeNavToggled(p, true), describeNavToggled(p, false)],
  },
  {
    name: 'describeReordered',
    // Both a real move and a no-op move, so neither arm escapes the sweep.
    run: (p) => [
      describeReordered(p, [p, page({ name: 'Other' })], [page({ name: 'Other' }), p]),
      describeReordered(p, [p], [p]),
    ],
  },
  {
    name: 'NAV_IS_NOT_REMOVAL',
    // Conditional copy: it only counts as "said" when the panel would show it.
    run: (p) => (shouldExplainNavIsNotRemoval(p) ? [NAV_IS_NOT_REMOVAL] : []),
  },
];

/** Every combination of the four flags that decide what a visitor can see. */
const MATRIX: PageStateFacts[] = [true, false].flatMap((isDraft) =>
  [true, false].flatMap((inNav) =>
    [true, false].flatMap((isHome) =>
      [null, '2026-07-30T00:00:00.000Z'].map((deleteStagedAt) =>
        page({ isDraft, inNav, isHome, deleteStagedAt }),
      ),
    ),
  ),
);

describe('the invariant: nothing claims a visitor can see an unpublished page', () => {
  it('holds for every describer, over the whole state matrix', () => {
    const violations: string[] = [];

    for (const state of MATRIX) {
      if (isPublished(state)) continue; // the claim is legitimate here
      for (const describer of DESCRIBERS) {
        for (const sentence of describer.run(state)) {
          for (const claim of CLAIMS_PUBLIC_NOW) {
            if (claim.test(sentence)) {
              violations.push(
                `${describer.name} on {draft:${state.isDraft}, inNav:${state.inNav}, home:${state.isHome}, staged:${state.deleteStagedAt !== null}} said: "${sentence}"`,
              );
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('is not vacuous — the same sweep DOES find claims on published pages', () => {
    /*
     * Anti-vacuity, because a property test that never matches anything passes
     * for a module that says nothing at all. The published half of the matrix
     * must produce claims, or `CLAIMS_PUBLIC_NOW` has stopped matching the copy
     * and the assertion above is asleep.
     */
    const claims = MATRIX.filter(isPublished).flatMap((state) =>
      DESCRIBERS.flatMap((d) =>
        d.run(state).filter((s) => CLAIMS_PUBLIC_NOW.some((c) => c.test(s))),
      ),
    );

    expect(claims.length).toBeGreaterThan(0);
  });
});

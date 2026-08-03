/**
 * The section-removal copy, and the invariant that keeps it honest.
 *
 * Same discipline as `describe-page-state.test.ts`, on a different subject: the
 * fact governing these sentences is whether the SECTION has a published row at
 * its slot, not whether its page is published.
 */
import { describe, it, expect } from 'vitest';
import { describeSectionRemoval } from '@/lib/site-editor/describe-section-state';

describe('describeSectionRemoval', () => {
  it('says the live site changes at the next publish, when the section IS published', () => {
    const sentence = describeSectionRemoval(true);
    expect(sentence.text).toMatch(/live site/i);
    expect(sentence.text).toMatch(/next time you publish/i);
    expect(sentence.claimsPublic).toBe(true);
  });

  it('does not promise a live-site change for a section that was never published', () => {
    /*
     * The defect. The dialog said "…and from the live site the next time you
     * publish" for every section, including one the PM had just created on a
     * page they had just created. Publishing would remove it from nothing.
     *
     * Worse than merely untrue: it invites an action on a false premise. A PM
     * who believes the removal is half-done publishes to finish it, and
     * publishing is all-or-nothing — so everything else in the draft ships too.
     */
    const sentence = describeSectionRemoval(false);
    expect(sentence.text).toMatch(/never been published/i);
    expect(sentence.text).not.toMatch(/next time you publish/i);
    expect(sentence.claimsPublic).toBe(false);
  });

  it('keeps the undo promise in both branches', () => {
    // The removal is undoable either way, and that is the one clause the PM
    // most needs; a branch that dropped it would be a regression the two cases
    // above could not see.
    expect(describeSectionRemoval(true).text).toMatch(/undo/i);
    expect(describeSectionRemoval(false).text).toMatch(/undo/i);
  });

  it('never claims publicity for an unpublished section', () => {
    /*
     * The invariant, stated over the whole (two-state) space rather than as two
     * examples — the same property `describe-page-state` asserts over its
     * matrix. Trivially small today, and it is the assertion that has to grow
     * if a third removal shape ever appears.
     */
    for (const hasPublished of [true, false]) {
      const sentence = describeSectionRemoval(hasPublished);
      if (sentence.claimsPublic) {
        expect(hasPublished).toBe(true);
      }
    }
  });
});

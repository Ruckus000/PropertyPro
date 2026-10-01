/**
 * What removing a SECTION does — the sentence, and whether it claims the
 * section is on the public site.
 *
 * ## Why this is a module and not a string in the dialog
 *
 * The removal confirm said one thing unconditionally:
 *
 *   "It disappears from your site straight away, and from the live site the
 *    next time you publish."
 *
 * …while the toast it fires seconds later branches on exactly the fact the
 * dialog ignored (`use-undoable-remove.ts` — `staged ? '… will be removed when
 * you publish.' : '… section removed.'`), and the toast is the one that is
 * right. So a PM removing a section they had never published was told the
 * removal was half-done and would complete at the next publish. Publishing is
 * all-or-nothing, so "publish to finish the removal" ships everything else in
 * the draft too — an action taken on a false premise.
 *
 * Before 11b-3 an unpublished section meant a brand-new community. Now it means
 * every section on every page a PM adds, which is why this stopped being an
 * edge case.
 *
 * A sibling of `describe-page-state.ts` rather than a part of it: that module's
 * invariant is `claimsPublic ⇒ the PAGE is published`, and the fact governing
 * this sentence is whether the SECTION has a published row at its slot. Same
 * shape, same discipline, different subject — folding them together would make
 * one invariant that is true of neither.
 */

import type { PageSentence } from './describe-page-state';

/**
 * The removal confirmation.
 *
 * `hasPublishedCounterpart` is the client's read of the server's own
 * discriminator: `site-blocks-service.ts` computes
 * `rows.some((r) => !r.isDraft)` at the slot and stages the removal when it is
 * true, deleting outright when it is false. Passing the same fact in keeps the
 * dialog and the outcome from disagreeing — which is the defect this module
 * exists to end, and which the toast was already getting right on its own.
 *
 * `claimsPublic` is true only in the staged branch, where the section really is
 * on the live site and stays there until the publish.
 */
export function describeSectionRemoval(hasPublishedCounterpart: boolean): PageSentence {
  return hasPublishedCounterpart
    ? {
        text: "It disappears from the editor straight away, and from your live site the next time you publish. You'll have a moment to undo it.",
        claimsPublic: true,
      }
    : {
        text: "It disappears straight away. This section has never been published, so nothing visitors see changes. You'll have a moment to undo it.",
        claimsPublic: false,
      };
}

/**
 * What the canvas placeholder says about a section the PM has HIDDEN.
 *
 * Hiding is content (`hiddenSchema`): it drafts and publishes like any other
 * edit. So the draft being hidden says nothing about what visitors see — the
 * published row does. "Hidden from visitors" on a section still showing on the
 * live site is the draft-state-as-live-state claim the page describer exists to
 * stop, and it was the v4 design's own copy.
 *
 * `published` is the section's PUBLISHED row at the same `(page, slot)`:
 *
 *  - `'hidden'` — the live site already hides it; the claim is true now.
 *  - `'shown'`  — the live site still shows it until the next publish.
 *  - `'none'`   — never published, so no visitor has ever seen it.
 */
export function describeHiddenSection(published: 'hidden' | 'shown' | 'none'): PageSentence {
  switch (published) {
    case 'hidden':
      return { text: 'is hidden from visitors.', claimsPublic: false };
    case 'shown':
      return {
        text: 'is hidden in your draft. It stays on your live site until you publish.',
        claimsPublic: true,
      };
    case 'none':
      return {
        text: "is hidden. It hasn't been published, so visitors have never seen it.",
        claimsPublic: false,
      };
  }
}

/**
 * The confirmation before hiding the site's last visible Florida-required
 * section (v4 Phase 2) — the half after the statute sentence.
 *
 * Conditional on the publish ("Once you publish…"), never a claim about what
 * the live site shows NOW: hiding is a draft edit, and a section the live site
 * already hides, or never published, reads just as truly. `claimsPublic` is
 * false because nothing here asserts the section is on the public site.
 */
export function describeRequiredSectionHide(): PageSentence {
  return {
    text: 'Once you publish, visitors will not see it while it is hidden. If you only want it lower on the page, move it down instead.',
    claimsPublic: false,
  };
}

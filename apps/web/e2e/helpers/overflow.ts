/**
 * Does anything on the page stick out of the box it lives in?
 *
 * Extracted from `responsive-overflow.spec.ts` so the rule can be exercised on
 * its own. A detector nobody can test is a detector nobody can trust, and this
 * one has already been wrong once in a way that took a browser to prove.
 */
import type { Page } from '@playwright/test';

export type Overflow = { selector: string; box: number; right: number; over: number };

/**
 * Does anything stick out of the box it lives in?
 *
 * This asks the question with `getBoundingClientRect()`, NOT `scrollWidth`,
 * and the difference is the whole point. `scrollWidth` on an element includes
 * layout overflow contributed by content inside a DESCENDANT scroll container,
 * so every ancestor of a legitimate horizontal scroller reports overflow it
 * does not have. Measured on `/communities/[id]/compliance` at 375px, where
 * #1129's keyboard-accessible table scroller is working exactly as designed:
 *
 *   PageContainer                    client 375   scrollWidth 784
 *   the table's scroller             client 325   scrollWidth 771   tabIndex 0
 *   PageContainer, scroller hidden   client 375   scrollWidth 375
 *   elements actually sticking out   0
 *
 * The old rule called that a 409px bleed, deterministically, across three runs
 * at four widths. It is not a bleed; the content scrolls and is reachable.
 *
 * Comparing edges instead removes three conditions the old rule needed only to
 * paper over `scrollWidth`: the `clientWidth <= 1` guard (a 1px `sr-only` box
 * cannot stick out), the `overflow:hidden + ellipsis` exemption (a truncated
 * element is sized to its parent), and the is-this-element-a-scroller skip
 * (subsumed by asking whether an ancestor scrolls it).
 *
 * What it still catches, because `getBoundingClientRect()` reports the layout
 * box regardless of clipping and `overflow:hidden` is NOT treated as a
 * scroller: the case this spec was built for, where an inner box overflows and
 * an ancestor's `overflow:hidden` clips the excess so text simply disappears
 * with no scrollbar to reveal it.
 *
 * `<main>` is deliberately not a scroller here: it carries `overflow-y-auto`,
 * and per CSS spec a single `auto` axis makes computed `overflow-x` `auto` too,
 * so honouring it would mark every page-level violation acceptable. The first
 * draft of this probe did exactly that and reported "no violations" against
 * three screens that were provably broken.
 */
export async function findOverflows(page: Page): Promise<Overflow[]> {
  return page.evaluate(() => {
    const describe = (el: Element): string => {
      const parts: string[] = [];
      for (let n: Element | null = el; n && parts.length < 4; n = n.parentElement) {
        const cls = (n.getAttribute('class') ?? '').trim().split(/\s+/).slice(0, 3).join('.');
        parts.unshift(n.tagName.toLowerCase() + (cls ? `.${cls}` : ''));
        if (n.tagName === 'MAIN') break;
      }
      return parts.join(' > ');
    };

    /** True when some ancestor below `<main>` scrolls this element horizontally. */
    const ownedByScroller = (el: Element): boolean => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        if (n.tagName === 'MAIN') return false;
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
      return false;
    };

    // `PageHeader` renders an `h1.sr-only` on every authenticated page. It is
    // 1px wide and clipped, so it never sticks out — but keep the check, since
    // a visually-hidden element positioned off to the side would.
    const visuallyHidden = (cs: CSSStyleDeclaration): boolean =>
      cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clipPath === 'inset(50%)';

    /** The inner edge of an element's content box, padding and border removed. */
    const contentRight = (el: Element): number => {
      const cs = getComputedStyle(el);
      return (
        el.getBoundingClientRect().right -
        parseFloat(cs.borderRightWidth || '0') -
        parseFloat(cs.paddingRight || '0')
      );
    };

    /**
     * The nearest ancestor that actually generates a box.
     *
     * `display: contents` generates none — the element's children are laid out
     * as if they were children of ITS parent — but `getBoundingClientRect()`
     * still answers, with zeros. Comparing against that gives a content edge of
     * roughly 0, so every child "overflows" it by its whole right edge. The
     * repo has one of these today (`site-editor-v3/canvas/FloatControls.tsx`,
     * a `className="contents"` wrapper that exists only to stop clicks
     * bubbling), and since layout treats its children as the grandparent's,
     * so does this.
     *
     * Same shape as the `display:none` guard below, one level up: that one
     * checks the ELEMENT generates a box, this one checks its comparison
     * target does.
     */
    const boxParent = (el: Element): Element | null => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        if (n.getClientRects().length > 0) return n;
      }
      return null;
    };

    const found: Overflow[] = [];
    const root = document.querySelector('main') ?? document.body;
    for (const el of root.querySelectorAll('*')) {
      const parent = boxParent(el);
      if (!parent) continue;
      // Generates no boxes — `display:none` on this element OR on any ancestor.
      // Checking `cs.display` alone is not enough: a child of a `display:none`
      // parent still reports its own `display` as, say, `flex`, while every rect
      // in the subtree is all-zero. `contentRight()` then subtracts the parent's
      // padding from zero and returns a NEGATIVE edge, so the child's right edge
      // of 0 "overflows" it. Measured on `/communities/[id]/documents` at 375px,
      // where the preview pane is `hidden` until `xl`: three phantom findings at
      // +24px and +33px, parent box ending at -24 and -33.
      if (el.getClientRects().length === 0) continue;
      const cs = getComputedStyle(el);
      if (visuallyHidden(cs)) continue;
      // Positioned against the viewport, not against its parent — a dialog or a
      // toast is not "outside its box" in any sense this spec cares about.
      if (cs.position === 'fixed') continue;
      if (ownedByScroller(el)) continue;
      const limit = contentRight(parent);
      // Compare the MARGIN box, not the border box — but only where the margin
      // is negative. A negative margin is the author saying "paint me wider
      // than my parent": `-mx-1 w-full overflow-x-auto` is the standard way to
      // stop a horizontal scroller clipping the focus ring on its first and
      // last child, and the 4px it gains on each side lands in the page gutter
      // (`PageContainer` is `px-6 sm:px-8 lg:px-10`), clipping nothing.
      // Measured on `/esign` at 768px: `parentPaddingRight` is 0 there, so a
      // padding-box comparison would report the same +4 — the element's own
      // `margin-right: -4px` is the whole story.
      //
      // Clamped to negative because the two directions are not symmetric. A
      // POSITIVE right margin that does not fit overflows only transparent
      // space; nothing is painted there and nothing is clipped, so counting it
      // would invent findings. And this cancels the bleed only up to the
      // margin: an element pushed 50px past its parent still reports +50,
      // which is what the anti-vacuity probe checks.
      const right =
        el.getBoundingClientRect().right +
        Math.min(parseFloat(cs.marginRight || '0') || 0, 0);
      const over = Math.round(right - limit);

      // A TEXT node overflowing its own box is invisible to the comparison
      // above, which only ever looks at element edges. That is a real gap the
      // `scrollWidth` rule used to cover: `.mk-srow small` on the marketing
      // home page is a `display:block` box holding one unbreakable monospace
      // statute citation, and it spilled out of a 73px grid column at 375px —
      // seven boxes on that page, fixed in this branch with `overflow-wrap`.
      // Under edge comparison alone it would have regressed silently.
      //
      // Restricted to elements with NO element children, which is what makes it
      // safe to reach for `scrollWidth` again. The false positive that forced
      // the rewrite was an ANCESTOR's `scrollWidth` counting the content of a
      // descendant scroller; an element with no children has no descendants at
      // all, so that case cannot arise here. It also cannot double-report a
      // child element's bleed, for the same reason.
      //
      // Ellipsised text is exempt, and that exemption is the whole reason this
      // check is not simply "scrollWidth > clientWidth". `truncate` is
      // `overflow:hidden` + `text-overflow:ellipsis` + `white-space:nowrap`, so
      // a truncating element ALWAYS has more content than box — that is what it
      // is for. Measured on a plain 80px truncating span: +236, and the app is
      // full of them, so without this the rule would report most of the app.
      // What stays reportable is text that disappears with no signal: clipped
      // with no ellipsis, or spilling out of a box that does not clip at all
      // (`.mk-srow small` was the second kind).
      //
      // `clientWidth` is 0 on an inline non-replaced box, so inline text is
      // outside this check rather than wrongly inside it: 0 - 0 is 0.
      //
      // Trailing letter-spacing is subtracted because CSS adds it after EVERY
      // character including the last, where nothing is painted. `scrollWidth`
      // counts that empty space, so letter-spaced text reports an overflow it
      // does not have. This is not hypothetical: the meetings weekday header
      // (`tracking-[0.16em]`, so 2.16px) reported +2 and +3 on "Wed" and "Mon"
      // in CI, on centred text that clips nothing. One letter-space is the
      // exact correction — `scrollWidth` is the widest LINE, and every line has
      // exactly one trailing space.
      const trailing = Math.max(parseFloat(cs.letterSpacing) || 0, 0);
      const ownText =
        el.children.length === 0 && cs.textOverflow !== 'ellipsis'
          ? el.scrollWidth - el.clientWidth - trailing
          : 0;

      const worst = Math.max(over, ownText);
      if (worst <= 1) continue;
      found.push({
        selector: describe(el),
        box: Math.round(limit),
        right: Math.round(right),
        over: worst,
      });
    }
    return found.slice(0, 10);
  });
}

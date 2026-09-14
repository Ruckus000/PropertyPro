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

    const found: Overflow[] = [];
    const root = document.querySelector('main') ?? document.body;
    for (const el of root.querySelectorAll('*')) {
      const parent = el.parentElement;
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
      const right = el.getBoundingClientRect().right;
      const over = Math.round(right - limit);
      if (over <= 1) continue;
      found.push({ selector: describe(el), box: Math.round(limit), right: Math.round(right), over });
    }
    return found.slice(0, 10);
  });
}

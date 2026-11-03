/**
 * Which controls in `<main>` fail WCAG 2.5.8 (Target Size, Minimum, AA)?
 *
 * A target passes if its box is at least `min` (24) CSS px in both directions,
 * or if it is undersized but SPACED: a `min`-diameter circle centred on it
 * intersects no other target, and no other undersized target's circle. That is
 * the criterion's spacing exception, and without it every lone icon button in a
 * roomy toolbar would report.
 *
 * Not checked, by design: inline links (`<a>` whose computed display is
 * `inline`), which 2.5.8 exempts when they sit in a sentence. This floor is AA;
 * the project's own rule is 44px below `md` (`.claude/rules/design.md`), which
 * class tests on the shared primitives pin instead.
 *
 * Tested on its own against synthetic fixtures in `target-size-detector.spec.ts`.
 */
import type { Page } from '@playwright/test';

export type SmallTarget = { selector: string; width: number; height: number };

const TARGETS =
  'button, a[href], [role="button"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], ' +
  'input:not([type="hidden"]), select, textarea';

export async function findSmallTargets(page: Page, min = 24): Promise<SmallTarget[]> {
  return page.evaluate(
    ({ min, selector }) => {
      const main = document.querySelector('main');
      if (!main) return [];

      const els = [...main.querySelectorAll<HTMLElement>(selector)].filter((el) => {
        if (el.closest('[aria-hidden="true"]')) return false;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
        if (el.tagName === 'A' && style.display === 'inline') return false;
        const r = el.getBoundingClientRect();
        // A zero box is `display:none`; a 1px box is the `sr-only` pattern.
        return r.width > 1 && r.height > 1;
      });
      const rects = els.map((el) => el.getBoundingClientRect());
      const small = rects.map((r) => r.width < min || r.height < min);
      const centre = (r: DOMRect) => [r.left + r.width / 2, r.top + r.height / 2] as const;

      const describe = (el: HTMLElement) => {
        const name =
          el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${name}"`;
      };

      const found: { selector: string; width: number; height: number }[] = [];
      rects.forEach((r, i) => {
        if (!small[i]) return;
        const [cx, cy] = centre(r);
        const crowded = rects.some((o, j) => {
          // A target nested in another (a button inside a role=tab) is one target.
          if (j === i || els[j]!.contains(els[i]!) || els[i]!.contains(els[j]!)) return false;
          if (small[j]) {
            const [ox, oy] = centre(o);
            return Math.hypot(cx - ox, cy - oy) < min;
          }
          const nx = Math.max(o.left, Math.min(cx, o.right));
          const ny = Math.max(o.top, Math.min(cy, o.bottom));
          return Math.hypot(cx - nx, cy - ny) < min / 2;
        });
        if (crowded) {
          found.push({ selector: describe(els[i]!), width: Math.round(r.width), height: Math.round(r.height) });
        }
      });
      return found;
    },
    { min, selector: TARGETS },
  );
}

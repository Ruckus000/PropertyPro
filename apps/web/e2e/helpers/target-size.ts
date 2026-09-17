/**
 * Touch-target size, measured by the rule that already exists.
 *
 * ## Why this delegates instead of measuring heights itself
 *
 * The obvious implementation — walk every `a, button, input, select` and flag
 * anything under N pixels tall — is the one this repo has already written once,
 * in the uncommitted harness behind the 2026-09-14 audit's touch-target table.
 * Reading it back showed seven counting defects, and every one of them is a
 * thing WCAG 2.2 SC 2.5.8 has an explicit clause about:
 *
 *   - no **spacing exception**, so a 32px control with room around it — which
 *     *passes* AA — was reported as a failure;
 *   - **height only**, so a 40x12px chip remover scored better than a 36px
 *     full-width button, when the criterion is a 24x24 box;
 *   - `<input type=checkbox>` measured rather than the `<label>` that is the
 *     actual target;
 *   - only `[role="button"]`, so `tab` / `menuitem` / `switch` / `option` were
 *     invisible to it;
 *   - native `<select>` counted, despite the **user-agent control** exception;
 *   - the inline-link exemption written as `closest('p,li')`, so an inline link
 *     in a `<td>` or a `<div>` counted;
 *   - a dedupe key of `(tag, label, height)`, which is neither per-page distinct
 *     nor globally distinct.
 *
 * `axe-core` is already a dependency (`apps/web/package.json`) and its
 * `target-size` rule — tagged `wcag22aa` / `wcag258` — implements all of those
 * clauses. Writing a second rule by hand means re-deriving them and getting a
 * subset right; `apps/web/e2e/helpers/overflow.ts` took six attempts to get one
 * geometry rule correct. So: inject the bundle that is already on disk.
 *
 * `@axe-core/playwright` is deliberately NOT a dependency. It is a convenience
 * wrapper over `addScriptTag` + `axe.run`, which is the whole of this file.
 *
 * ## The bar this measures
 *
 * SC 2.5.8 **Target Size (Minimum)**, Level **AA**: 24x24 CSS px, with spacing,
 * inline, user-agent-control, equivalent and essential exceptions. That is the
 * conformance bar. It is NOT the repo's own 44px rule, which
 * is SC 2.5.5 **Target Size (Enhanced)**, Level **AAA** — a deliberate internal
 * aspiration, and a separate question. Do not conflate them here.
 *
 * ## Why this cannot live with the other axe assertions
 *
 * `apps/web/__tests__/accessibility/*` run under jsdom, which performs no
 * layout: every rect is zero, so `target-size` resolves inapplicable and the
 * assertion passes without measuring anything. That is exactly the vacuous pass
 * the audit calls out. This needs a real engine, so it is an e2e helper.
 */
import { createRequire } from 'node:module';

import type { Page } from '@playwright/test';

/**
 * Resolved, not hard-coded. The audit's notes referenced a literal
 * `node_modules/.pnpm/axe-core@4.11.1/...` path; pnpm's store layout moves that
 * on every version bump, and a missing file would make `addScriptTag` throw
 * somewhere far from the cause.
 */
const AXE_BUNDLE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

export type TargetFinding = {
  /** axe's CSS selector for the node. */
  selector: string;
  width: number;
  height: number;
  /**
   * `violation` — axe is sure. `incomplete` — axe could not decide, usually
   * because the spacing exception needs information it cannot get (an
   * overlapping target it cannot hit-test). Both are reported: dropping
   * `incomplete` is how a probe goes quietly optimistic.
   */
  certainty: 'violation' | 'incomplete';
  summary: string;
};

export type TargetSizeResult = {
  /**
   * How many nodes the rule actually examined, passes included.
   *
   * `.claude/rules/verification.md`: "A scan that examined nothing must not
   * pass." A run that reports zero findings because the rule never applied is
   * indistinguishable from a clean one unless the denominator is printed, and
   * an all-zero-rect engine is precisely how the jsdom assertions pass today.
   */
  checked: number;
  findings: TargetFinding[];
};

/** Idempotent: re-injecting on the same page would redefine `window.axe`. */
export async function injectAxe(page: Page): Promise<void> {
  const present = await page.evaluate(() => typeof (window as unknown as { axe?: unknown }).axe);
  if (present === 'object') return;
  await page.addScriptTag({ path: AXE_BUNDLE });
}

/**
 * Run `target-size` alone against the current page state.
 *
 * Scoped to one rule on purpose. A full axe run on these pages surfaces colour
 * and landmark findings that are a different programme, and mixing them here
 * would make this helper's failures unreadable.
 */
export async function findUndersizedTargets(page: Page): Promise<TargetSizeResult> {
  await injectAxe(page);

  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof import('axe-core') }).axe;

    // `resultTypes` is deliberately NOT set. It looks like a free optimisation
    // — keep full node data for violations and incomplete, drop the rest — but
    // it truncates the OTHER arrays to a single node, `passes` included, and
    // `passes` is most of the denominator. Setting it made `checked` report 1
    // on a ten-control page, which the caller's own "the rule examined
    // nothing" assertion caught. A count that collapses to 1 is worse than a
    // slightly larger payload: it makes a vacuous scan look like a clean one.
    const results = await axe.run(document, {
      runOnly: { type: 'rule', values: ['target-size'] },
    });

    const shape = (
      nodes: { target: unknown[]; failureSummary?: string }[],
      certainty: 'violation' | 'incomplete',
    ) =>
      nodes.map((node) => {
        // `target` is an array of selectors; nested arrays mean an iframe
        // path, which these fixtures and routes do not produce. Flatten
        // rather than assume, so a surprise reads as a long selector instead
        // of `[object Object]`.
        const selector = node.target.flat(Infinity).join(' ');
        let width = 0;
        let height = 0;
        try {
          const el = document.querySelector(selector);
          if (el) {
            const rect = el.getBoundingClientRect();
            width = Math.round(rect.width * 10) / 10;
            height = Math.round(rect.height * 10) / 10;
          }
        } catch {
          // A selector axe can build is not always one `querySelector` accepts.
          // Zeroes here are visibly wrong, which is the point.
        }
        return { selector, width, height, certainty, summary: node.failureSummary ?? '' };
      });

    const count = (list: { nodes: unknown[] }[]) =>
      list.reduce((total, result) => total + result.nodes.length, 0);

    return {
      checked:
        count(results.passes) + count(results.violations) + count(results.incomplete),
      findings: [
        ...shape(results.violations.flatMap((v) => v.nodes) as never, 'violation'),
        ...shape(results.incomplete.flatMap((v) => v.nodes) as never, 'incomplete'),
      ],
    };
  });
}

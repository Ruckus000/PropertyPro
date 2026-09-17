/**
 * The overflow detector, tested on its own.
 *
 * `helpers/overflow.ts` was extracted from `responsive-overflow.spec.ts` so the
 * rule could be exercised independently of the app — and then nothing did,
 * which left a gate rule with no test of its own. This is that test.
 *
 * It has been wrong four times, each time in a way no amount of re-running the
 * real app would have revealed, because the app kept answering consistently:
 *
 *   1. `scrollWidth` counted a descendant scroller's content, so every ancestor
 *      of a working horizontal scroller was reported (case "designed scroller").
 *   2. Elements inside a `display:none` subtree report a zero rect, so the
 *      parent's content edge went negative and a child's 0 "overflowed" it
 *      (case "display:none subtree").
 *   3. A deliberate negative margin read as a bleed (case "negative margin").
 *   4. A `display:contents` parent has a zero rect for the same reason as (2),
 *      one level up (case "display:contents parent").
 *
 * And one gap the rewrite opened: edge comparison only ever looks at ELEMENT
 * edges, so a text node overflowing its own box became invisible (case "text
 * overflowing its own box").
 *
 * Closing that gap immediately opened a fifth problem, and this file is what
 * found it: reaching for `scrollWidth` again means every `truncate` in the app
 * reports, because ellipsised text has more content than box by definition (a
 * plain 80px truncating span measured +236). Hence the ellipsis exemption, and
 * case "ellipsised truncation" that pins it.
 *
 * Every one of those has a case below, each paired with its opposite, so a rule
 * that is merely broken in a new direction fails here rather than going quiet.
 *
 * Synthetic fixtures via `setContent`, so this needs no server, no database and
 * no seed — it is checking the rule, not the app.
 */
import { expect, test } from '@playwright/test';

import { findOverflows } from './helpers/overflow';

/** Fixtures are rooted in `<main>` because that is where the detector starts. */
const page1 = (body: string) => `
  <!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>* { margin: 0; padding: 0; box-sizing: border-box; font: 14px/1.4 system-ui; }</style>
  <main style="width: 400px">${body}</main>
`;

test.describe('findOverflows', () => {
  test('is quiet on a page where nothing sticks out', async ({ page }) => {
    await page.setContent(page1(`
      <div style="width: 300px; background: #eee">
        <p>short enough</p>
      </div>
    `));
    expect(await findOverflows(page)).toEqual([]);
  });

  test('catches a child wider than its parent', async ({ page }) => {
    await page.setContent(page1(`
      <div id="box" style="width: 200px">
        <div id="wide" style="width: 260px">too wide</div>
      </div>
    `));
    const found = await findOverflows(page);
    expect(found.length, JSON.stringify(found)).toBeGreaterThan(0);
    expect(found[0]!.over).toBe(60);
  });

  test('catches a child clipped by an ancestor `overflow:hidden`', async ({ page }) => {
    // The case the gate exists for: the excess is not merely off to one side,
    // it is invisible, and there is no scrollbar to reveal it.
    await page.setContent(page1(`
      <div style="width: 200px; overflow: hidden">
        <div style="width: 260px">clipped away</div>
      </div>
    `));
    const found = await findOverflows(page);
    expect(found.length, JSON.stringify(found)).toBeGreaterThan(0);
  });

  test('stays quiet for a designed horizontal scroller', async ({ page }) => {
    // Regression 1. The content is wider than the box on purpose and reachable
    // by scrolling, so neither the scroller nor its ancestors are bleeding.
    await page.setContent(page1(`
      <div style="width: 200px">
        <div style="width: 100%; overflow-x: auto" tabindex="0">
          <table style="width: 700px"><tr><td>wide but scrollable</td></tr></table>
        </div>
      </div>
    `));
    expect(await findOverflows(page)).toEqual([]);
  });

  test('stays quiet inside a `display:none` subtree', async ({ page }) => {
    // Regression 2. Every rect in here is all-zero; without the guard the
    // parent's content edge goes negative and a child's 0 overflows it.
    await page.setContent(page1(`
      <div style="display: none; padding-right: 24px">
        <div style="width: 900px">hidden until xl</div>
      </div>
    `));
    expect(await findOverflows(page)).toEqual([]);
  });

  test('stays quiet under a `display:contents` parent', async ({ page }) => {
    // Regression 4. The wrapper generates no box, so its rect is all-zero; the
    // child must be compared against the grandparent, which is where layout
    // actually puts it.
    await page.setContent(page1(`
      <div style="width: 300px">
        <div style="display: contents">
          <div style="width: 280px">fits the grandparent</div>
        </div>
      </div>
    `));
    expect(await findOverflows(page)).toEqual([]);
  });

  test('still catches a real bleed under a `display:contents` parent', async ({ page }) => {
    // The other half of regression 4: skipping the zero-rect wrapper must not
    // mean skipping its children.
    await page.setContent(page1(`
      <div style="width: 300px">
        <div style="display: contents">
          <div style="width: 360px">does not fit the grandparent</div>
        </div>
      </div>
    `));
    const found = await findOverflows(page);
    expect(found.length, JSON.stringify(found)).toBeGreaterThan(0);
    expect(found[0]!.over).toBe(60);
  });

  test('catches text overflowing its own box', async ({ page }) => {
    // The gap the edge-comparison rewrite opened. One unbreakable token in a
    // narrow clipped box: no child element exists, so nothing is compared, and
    // the old `scrollWidth` rule was the only thing that saw it. This is the
    // shape of `.mk-srow small` on the marketing home page.
    await page.setContent(page1(`
      <div style="width: 400px">
        <small style="display: block; width: 73px; overflow: hidden; font-family: monospace">
          718.111(12)(g)(2)(a)
        </small>
      </div>
    `));
    const found = await findOverflows(page);
    expect(found.length, JSON.stringify(found)).toBeGreaterThan(0);
  });

  test('stays quiet when that same text is allowed to wrap', async ({ page }) => {
    // The control for the case above, and the fix that shipped: with a break
    // opportunity the text fits its box and there is nothing to report.
    await page.setContent(page1(`
      <div style="width: 400px">
        <small style="display: block; width: 73px; overflow: hidden; font-family: monospace; overflow-wrap: anywhere">
          718.111(12)(g)(2)(a)
        </small>
      </div>
    `));
    expect(await findOverflows(page)).toEqual([]);
  });

  test('stays quiet for an ellipsised truncation', async ({ page }) => {
    // `truncate` is overflow:hidden + text-overflow:ellipsis + nowrap, so a
    // truncating element always has more content than box — that is the point
    // of it, and the ellipsis tells the reader. Measured before the exemption
    // existed: this exact fixture reported +236, and the app is full of them.
    await page.setContent(page1(`
      <div style="width: 300px">
        <span style="display: block; width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
          a very long title that is deliberately ellipsised
        </span>
      </div>
    `));
    expect(await findOverflows(page)).toEqual([]);
  });

  test('stays quiet for a deliberate negative margin', async ({ page }) => {
    // Regression 3. `-mx-1 w-full overflow-x-auto` is how a scroller is stopped
    // from clipping the focus ring on its first and last child; the 4px it
    // gains on each side lands in the page gutter.
    await page.setContent(page1(`
      <div style="width: 300px">
        <div style="width: 100%; margin-left: -4px; margin-right: -4px">by design</div>
      </div>
    `));
    expect(await findOverflows(page)).toEqual([]);
  });

  test('still reports a bleed past a negative margin, less the margin', async ({ page }) => {
    // The clamp cancels the bleed only up to the margin, so it cannot be used
    // as a blanket exemption: 50px over, 4px of it accounted for, 46 reported.
    await page.setContent(page1(`
      <div style="width: 300px">
        <div style="width: 350px; margin-right: -4px">50 over, 4 excused</div>
      </div>
    `));
    const found = await findOverflows(page);
    expect(found.length, JSON.stringify(found)).toBeGreaterThan(0);
    expect(found[0]!.over).toBe(46);
  });

  test('stays quiet for a viewport-positioned overlay', async ({ page }) => {
    // A dialog or toast is positioned against the viewport, not its parent, so
    // it is not "outside its box" in any sense this rule cares about.
    await page.setContent(page1(`
      <div style="width: 100px">
        <div style="position: fixed; left: 0; width: 390px">a toast</div>
      </div>
    `));
    expect(await findOverflows(page)).toEqual([]);
  });
});

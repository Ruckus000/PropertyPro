/**
 * The target-size detector, tested on its own (as `overflow-detector.spec.ts`
 * tests `helpers/overflow.ts`).
 *
 * Synthetic fixtures via `setContent`, so this needs no server, database or
 * seed. Each case is paired with its opposite, so a rule that breaks in a new
 * direction fails here instead of going quiet against the app.
 */
import { expect, test } from '@playwright/test';

import { findSmallTargets } from './helpers/target-size';

const page1 = (body: string) => `
  <!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: system-ui; }
    button { display: inline-block; border: 0; }
    .row { display: flex; gap: 0; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  </style>
  <main style="width: 400px; padding: 40px">${body}</main>
`;

test.describe('findSmallTargets', () => {
  test('is quiet on targets of 24px and over', async ({ page }) => {
    await page.setContent(page1(`
      <div class="row">
        <button style="width: 24px; height: 24px">a</button>
        <button style="width: 44px; height: 44px">b</button>
      </div>
    `));
    expect(await findSmallTargets(page)).toEqual([]);
  });

  test('catches an undersized target crowded against another', async ({ page }) => {
    await page.setContent(page1(`
      <div class="row">
        <button aria-label="tiny" style="width: 20px; height: 20px"></button>
        <button style="width: 44px; height: 44px">b</button>
      </div>
    `));
    const found = await findSmallTargets(page);
    expect(found, JSON.stringify(found)).toHaveLength(1);
    expect(found[0]!.selector).toContain('tiny');
    expect(found[0]!.height).toBe(20);
  });

  test('passes an undersized target under the spacing exception', async ({ page }) => {
    await page.setContent(page1(`
      <div class="row" style="gap: 20px">
        <button aria-label="tiny" style="width: 16px; height: 16px"></button>
        <button style="width: 44px; height: 44px">b</button>
      </div>
    `));
    expect(await findSmallTargets(page)).toEqual([]);
  });

  test('catches two undersized targets whose circles overlap', async ({ page }) => {
    await page.setContent(page1(`
      <div class="row" style="gap: 4px">
        <button aria-label="one" style="width: 16px; height: 16px"></button>
        <button aria-label="two" style="width: 16px; height: 16px"></button>
      </div>
    `));
    expect(await findSmallTargets(page)).toHaveLength(2);
  });

  test('catches an undersized target whose circle touches a wide undersized neighbour', async ({ page }) => {
    // Centres are ~61px apart, but the 24px circle overlaps the text button's box.
    await page.setContent(page1(`
      <div class="row" style="gap: 1px; align-items: center">
        <button aria-label="icon" style="width: 20px; height: 20px"></button>
        <button aria-label="wide" style="width: 100px; height: 16px"></button>
      </div>
    `));
    const found = await findSmallTargets(page);
    expect(found.map((f) => f.selector), JSON.stringify(found)).toContain('button "icon"');
  });

  test('treats a target nested in another as one target', async ({ page }) => {
    await page.setContent(page1(`
      <div role="tab" aria-label="outer" style="display: inline-block; width: 44px; height: 44px">
        <button aria-label="inner" style="width: 16px; height: 16px"></button>
      </div>
    `));
    expect(await findSmallTargets(page)).toEqual([]);
  });

  test('ignores hidden, sr-only and aria-hidden controls', async ({ page }) => {
    await page.setContent(page1(`
      <div class="row">
        <button style="width: 44px; height: 44px">b</button>
        <button class="sr-only">skip</button>
        <button style="display: none">gone</button>
        <button style="visibility: hidden; width: 10px; height: 10px"></button>
        <span aria-hidden="true"><button style="width: 10px; height: 10px"></button></span>
        <input type="checkbox" style="position: absolute; opacity: 0; pointer-events: none">
      </div>
    `));
    expect(await findSmallTargets(page)).toEqual([]);
  });

  test('ignores inline links in a sentence but checks standalone ones', async ({ page }) => {
    await page.setContent(page1(`
      <p style="font-size: 12px">Read <a href="#">the policy</a> <a href="#">here</a>.</p>
      <div class="row">
        <a href="#" aria-label="block" style="display: inline-block; width: 20px; height: 20px"></a>
        <button style="width: 44px; height: 44px">b</button>
      </div>
    `));
    const found = await findSmallTargets(page);
    expect(found.map((f) => f.selector), JSON.stringify(found)).toEqual(['a "block"']);
  });
});

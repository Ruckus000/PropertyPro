import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

import { loginAs, type DevRole } from './dev-login';
import { findOverflows } from './overflow';

// Mirrors DESIGN_PREVIEW_COOKIE in `src/lib/design-preview.ts`. Not imported:
// that module pulls in `next/headers`, which has no business in a Playwright
// worker. The no-cookie block and the preview-off probe both fail if the two
// names ever drift apart.
export const DESIGN_PREVIEW_COOKIE = 'pp_design_preview';

export const WIDTHS = [1280, 1440] as const;
export type Width = (typeof WIDTHS)[number];

/** Set to a directory to also write each screenshot there as a PNG (owner review). */
const SHOTS_DIR = process.env.PILOT_SHOTS_DIR;

export async function startPilot(
  page: Page,
  context: BrowserContext,
  baseURL: string | undefined,
  role: DevRole,
) {
  const login = await loginAs(page, role, { communitySlug: 'sunset-condos', skipPortalNav: true });
  expect(baseURL, 'playwright baseURL').toBeTruthy();
  await context.addCookies([{ name: DESIGN_PREVIEW_COOKIE, value: '1', url: baseURL! }]);
  return login.communityId;
}

/** Navigate, then wait until the client tree has painted what the page loads. */
export async function open(page: Page, width: number, url: string) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('main').waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  // Data-backed sections render after a client query; let it land.
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

/** The page title is painted: not `sr-only`, and it has a real box. */
export async function expectPaintedTitle(page: Page, where: string) {
  const h1 = page.locator('main h1').first();
  await expect(h1, `${where}: no h1`).toBeVisible();
  const state = await h1.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return {
      srOnly: el.classList.contains('sr-only'),
      width: Math.round(box.width),
      height: Math.round(box.height),
    };
  });
  expect(state.srOnly, `${where}: the h1 is sr-only, so this is the current page, not the pilot`).toBe(false);
  expect(
    state.width > 24 && state.height > 16,
    `${where}: the h1 has no painted box (${state.width}x${state.height})`,
  ).toBe(true);
}

/** No page-level scroll, no clipped box, and no table or scroller that scrolls sideways. */
export async function expectNoBleed(page: Page, where: string) {
  const pageScroll = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(
    pageScroll.scroll,
    `${where}: the page itself scrolls horizontally (${pageScroll.scroll} > ${pageScroll.client})`,
  ).toBeLessThanOrEqual(pageScroll.client + 1);

  const overflows = await findOverflows(page);
  expect(
    overflows,
    `${where}: content overflows its box with no scroller to reveal it —\n` +
      overflows
        .map((o) => `  ${o.selector}  parent box ends at ${o.box}, element ends at ${o.right} (+${o.over}px)`)
        .join('\n'),
  ).toEqual([]);

  // A table that fits only by scrolling sideways is the failure the side panel
  // is most likely to cause: the main column is narrower than the old page's.
  const sideways = await page.evaluate(() => {
    const found: string[] = [];
    for (const el of document.querySelectorAll('main *')) {
      if (el.getClientRects().length === 0) continue;
      const ox = getComputedStyle(el).overflowX;
      if (ox !== 'auto' && ox !== 'scroll') continue;
      if (el.scrollWidth > el.clientWidth + 1) {
        const cls = (el.getAttribute('class') ?? '').trim().split(/\s+/).slice(0, 3).join('.');
        found.push(`${el.tagName.toLowerCase()}.${cls} client ${el.clientWidth}, content ${el.scrollWidth}`);
      }
    }
    return found;
  });
  expect(
    sideways,
    `${where}: a table or region scrolls sideways —\n${sideways.map((s) => `  ${s}`).join('\n')}`,
  ).toEqual([]);
}

/**
 * Where the "Summary" region sits relative to the main column, from bounding
 * boxes. Either beside it (starts at or past the column's right edge) or wholly
 * above it; anything else is an overlap and fails. Recorded per route and width.
 */
export async function recordSummaryPlacement(page: Page, testInfo: TestInfo, label: string, width: number) {
  const summary = page.getByRole('complementary', { name: 'Summary' });
  const type = `summary-placement ${label} @ ${width}`;
  if ((await summary.count()) === 0) {
    testInfo.annotations.push({ type, description: 'no Summary region on this page' });
    return;
  }
  const boxes = await page.evaluate(() => {
    const aside = Array.from(document.querySelectorAll('aside')).find(
      (a) => a.getAttribute('aria-label') === 'Summary',
    );
    const column = document.querySelector('[data-page-grid] > .min-w-0');
    if (!aside || !column) return null;
    const a = aside.getBoundingClientRect();
    const c = column.getBoundingClientRect();
    return {
      aside: { left: a.left, right: a.right, top: a.top, bottom: a.bottom },
      column: { left: c.left, right: c.right, top: c.top, bottom: c.bottom },
    };
  });
  expect(boxes, `${label} @ ${width}: Summary or the main column has no box`).not.toBeNull();
  const { aside, column } = boxes!;
  const beside = aside.left >= column.right - 1;
  const above = aside.bottom <= column.top + 1;
  expect(
    beside || above,
    `${label} @ ${width}: Summary overlaps the main column ` +
      `(summary x ${Math.round(aside.left)}-${Math.round(aside.right)} y ${Math.round(aside.top)}-${Math.round(aside.bottom)}, ` +
      `column x ${Math.round(column.left)}-${Math.round(column.right)} y ${Math.round(column.top)}-${Math.round(column.bottom)})`,
  ).toBe(true);
  testInfo.annotations.push({
    type,
    description: beside
      ? `beside (summary x ${Math.round(aside.left)}, column ends ${Math.round(column.right)})`
      : `above (summary ends y ${Math.round(aside.bottom)}, column starts ${Math.round(column.top)})`,
  });
}

/** Full-page still into the report and, when PILOT_SHOTS_DIR is set, onto disk. */
export async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const png = await page.screenshot({ fullPage: true });
  await testInfo.attach(name, { body: png, contentType: 'image/png' });
  if (SHOTS_DIR) {
    mkdirSync(SHOTS_DIR, { recursive: true });
    writeFileSync(path.join(SHOTS_DIR, `${name}.png`), png);
  }
}

/** One page, both widths, every assertion. */
export async function checkPage(
  page: Page,
  testInfo: TestInfo,
  opts: { label: string; shot: string; role: string; url: string; widths?: readonly Width[] },
) {
  for (const width of opts.widths ?? WIDTHS) {
    const where = `${opts.label} @ ${width}px`;
    await open(page, width, opts.url);
    await expectPaintedTitle(page, where);
    await expectNoBleed(page, where);
    await recordSummaryPlacement(page, testInfo, opts.label, width);
    await shoot(page, testInfo, `${opts.shot}-${opts.role}-${width}`);
  }
}


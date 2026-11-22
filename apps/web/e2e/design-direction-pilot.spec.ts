import { expect, test, type Page } from '@playwright/test';

import { loginAs } from './helpers/dev-login';
import { clickWhenHydrated } from './helpers/hydration';
import {
  checkPage,
  DESIGN_PREVIEW_COOKIE,
  expectNoBleed,
  expectPaintedTitle,
  open,
  rowOrEmpty,
  shoot,
  startPilot,
  WIDTHS,
} from './helpers/design-pilot';

/**
 * The redesigned pilot pages (Packages, Emergency Alerts list / detail / new,
 * Visitors) at the app's real text size.
 *
 * Large text is the default and the signed-in app scales its root with the
 * screen (`:root:has([data-app-shell])`, 18px at 1440), so these widths are the
 * ones where a table beside a side panel is tightest. Nothing here turns the
 * text size down; a page that only fits in standard mode must fail.
 *
 * Every block switches the pilot on with the preview cookie, then proves the
 * painted `h1` is visible BEFORE it measures anything. The current pages carry
 * an `sr-only` h1, so without that assertion every overflow check below would
 * pass against the old page and prove nothing about the new one.
 */

/** The packages list is loaded: a body row, or the first-run heading when none are logged. */
const packagesReady = (p: Page) =>
  rowOrEmpty(p, 'No packages logged yet');
/** The seeded demo alert is in the list (scripts/seed: "Hurricane Preparation Advisory"). */
const seededAlert = (p: Page) =>
  p.locator('main a[href^="/emergency/"]').filter({ hasText: 'Hurricane Preparation Advisory' });

test.describe('design direction pilot', () => {
  // A dev server compiles each route on demand, and a block visits two widths.
  test.setTimeout(180_000);

  test('packages (staff) holds at 1280 and 1440', async ({ page, context, baseURL }, testInfo) => {
    const communityId = await startPilot(page, context, baseURL, 'cam');
    await checkPage(page, testInfo, {
      label: 'packages',
      shot: 'packages',
      role: 'cam',
      url: `/dashboard/packages?communityId=${communityId}`,
      // A fresh seed can have no packages: a row, or the first-run heading.
      ready: packagesReady,
    });
  });

  test('emergency alerts list (manager) holds at 1280 and 1440', async ({ page, context, baseURL }, testInfo) => {
    const communityId = await startPilot(page, context, baseURL, 'cam');
    await checkPage(page, testInfo, {
      label: 'emergency list',
      shot: 'emergency-list',
      role: 'cam',
      url: `/emergency?communityId=${communityId}`,
      ready: seededAlert,
    });
  });

  test('emergency alert detail (manager) holds at 1280 and 1440', async ({ page, context, baseURL }, testInfo) => {
    const communityId = await startPilot(page, context, baseURL, 'cam');
    await open(page, 1440, `/emergency?communityId=${communityId}`, seededAlert);
    // An existing alert only: sending one from a test would message real recipients.
    const href = await page
      .locator('main a[href^="/emergency/"]')
      .evaluateAll((links) =>
        links
          .map((a) => a.getAttribute('href') ?? '')
          .find((h) => /^\/emergency\/\d+/.test(h)) ?? null,
      );
    if (!href) {
      testInfo.annotations.push({
        type: 'emergency-detail',
        description: 'skipped: the seed has no alert to open (a test must not send one)',
      });
      test.skip(true, 'no emergency alert in the seed');
      return;
    }
    await checkPage(page, testInfo, {
      label: 'emergency detail',
      shot: 'emergency-detail',
      role: 'cam',
      url: href,
      ready: (p) => p.getByText('Delivery', { exact: true }),
    });
  });

  test('emergency new alert (manager) holds at 1280 and 1440', async ({ page, context, baseURL }, testInfo) => {
    const communityId = await startPilot(page, context, baseURL, 'cam');
    // Opened and measured only; nothing on this page is submitted.
    await checkPage(page, testInfo, {
      label: 'emergency new',
      shot: 'emergency-new',
      role: 'cam',
      url: `/emergency/new?communityId=${communityId}`,
      ready: (p) => p.getByText('Choose a Template'),
    });
  });

  test('visitors (staff) holds at 1440', async ({ page, context, baseURL }, testInfo) => {
    const communityId = await startPilot(page, context, baseURL, 'cam');
    await checkPage(page, testInfo, {
      label: 'visitors',
      shot: 'visitors',
      role: 'cam',
      url: `/dashboard/visitors?communityId=${communityId}`,
      ready: (p) => rowOrEmpty(p, 'No visitors found.'),
      widths: [1440],
    });
  });

  test('visitors denied list (staff) holds at 1280 and 1440', async ({ page, context, baseURL }, testInfo) => {
    const communityId = await startPilot(page, context, baseURL, 'cam');
    await checkPage(page, testInfo, {
      label: 'visitors denied tab',
      shot: 'visitors-denied',
      role: 'cam',
      url: `/dashboard/visitors?communityId=${communityId}&tab=denied`,
      ready: (p) => rowOrEmpty(p, 'No denied-entry records yet.'),
    });
  });

  // WRITES DATA: this block logs a real package through the app. It must only
  // ever run against the agent sandbox or CI's disposable Supabase stack, never a
  // shared or production database. Do not launch the default Playwright config
  // without the demo-db wrapper (scripts/with-env-local-demo-db.sh).
  test('a 90-character recipient name stays visible and does not break the packages page', async ({ page, context, baseURL }, testInfo) => {
    const communityId = await startPilot(page, context, baseURL, 'cam');
    const url = `/dashboard/packages?communityId=${communityId}`;
    await open(page, 1440, url, packagesReady);
    await expectPaintedTitle(page, 'packages before logging');

    // A unit that exists in this community: the log form takes a unit number.
    const unit = await page.evaluate(async (id) => {
      const res = await fetch(`/api/v1/units?communityId=${id}`);
      const body = (await res.json()) as { data?: Array<{ unitNumber?: string }> };
      return body.data?.[0]?.unitNumber ?? null;
    }, communityId);
    expect(unit, 'the seed has at least one unit to log a package against').toBeTruthy();

    // The Recipient column renders this string (the API allows 240 characters).
    // A run-unique stamp leads the name, so a row left by an earlier run on a
    // persistent database cannot satisfy the visibility assertion below.
    const stamp = Date.now().toString(36);
    const longName =
      `${stamp} Alexandria Montgomery-Featherstonehaugh de la Cruz y Villanueva Santiago Rodriguez III`.slice(0, 90);
    expect(longName).toHaveLength(90);

    await clickWhenHydrated(page.getByRole('button', { name: 'Log a package' }).first());
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Unit', { exact: true }).fill(unit!);
    await dialog.getByLabel('Recipient Name').fill(longName);
    await dialog.getByRole('button', { name: 'UPS' }).click();
    await dialog.getByRole('button', { name: 'Log Package' }).click();
    await expect(dialog).toBeHidden();

    for (const width of WIDTHS) {
      const where = `packages with a 90-character recipient name @ ${width}px`;
      await open(page, width, url, (p) => p.locator('main tbody tr').first());
      await expectPaintedTitle(page, where);
      // The full string is in the page, inside main (truncation may only be visual).
      await expect(page.locator('main').getByText(longName, { exact: true }).first()).toBeVisible();
      await expectNoBleed(page, where);
      await shoot(page, testInfo, `packages-longname-cam-${width}`);
    }
  });

  test('a resident sees the owner views with no manager figures', async ({ page, context, baseURL }, testInfo) => {
    const communityId = await startPilot(page, context, baseURL, 'owner');

    await open(page, 1440, `/dashboard/packages?communityId=${communityId}`, (p) =>
      rowOrEmpty(p, 'No packages waiting for you'),
    );
    await expectPaintedTitle(page, 'packages (resident)');
    await expectNoBleed(page, 'packages (resident) @ 1440px');
    await shoot(page, testInfo, 'packages-owner-1440');

    await open(page, 1440, `/emergency?communityId=${communityId}`, (p) =>
      p.getByText(/No alerts yet|Hurricane Preparation Advisory/).first(),
    );
    await expectPaintedTitle(page, 'emergency (recipient)');
    await expect(page.locator('main').getByText(/recipients/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /send alert/i })).toHaveCount(0);
    await expectNoBleed(page, 'emergency (recipient) @ 1440px');
    await shoot(page, testInfo, 'emergency-list-owner-1440');
  });

  test('without the preview cookie, packages is still the current page', async ({ page, baseURL }) => {
    expect(baseURL).toBeTruthy();
    const { communityId } = await loginAs(page, 'cam', { communitySlug: 'sunset-condos', skipPortalNav: true });
    // loginAs does not set the cookie; assert that rather than assume it.
    const cookies = await page.context().cookies(baseURL!);
    expect(cookies.map((c) => c.name)).not.toContain(DESIGN_PREVIEW_COOKIE);

    await open(page, 1440, `/dashboard/packages?communityId=${communityId}`);
    const h1 = page.locator('main h1').first();
    await expect(h1).toHaveClass(/sr-only/);
  });
});

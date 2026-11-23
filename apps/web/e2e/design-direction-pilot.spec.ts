import { expect, test, type Page } from '@playwright/test';

import { clickWhenHydrated } from './helpers/hydration';
import {
  checkPage,
  expectNoBleed,
  expectPaintedTitle,
  open,
  recordSummaryPlacement,
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
 * Every block proves the painted `h1` is visible BEFORE it measures anything.
 * A page that is not on `PageLayout` carries an `sr-only` h1, so without that
 * assertion every overflow check below would pass against a page that lost the
 * redesigned layout and prove nothing about it.
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

  test('packages (staff) holds at 1280 and 1440', async ({ page }, testInfo) => {
    const communityId = await startPilot(page, 'cam');
    await checkPage(page, testInfo, {
      label: 'packages',
      shot: 'packages',
      role: 'cam',
      url: `/dashboard/packages?communityId=${communityId}`,
      // A fresh seed can have no packages: a row, or the first-run heading.
      ready: packagesReady,
    });
  });

  test('emergency alerts list (manager) holds at 1280 and 1440', async ({ page }, testInfo) => {
    const communityId = await startPilot(page, 'cam');
    await checkPage(page, testInfo, {
      label: 'emergency list',
      shot: 'emergency-list',
      role: 'cam',
      url: `/emergency?communityId=${communityId}`,
      ready: seededAlert,
    });
  });

  test('emergency alert detail (manager) holds at 1280 and 1440', async ({ page }, testInfo) => {
    const communityId = await startPilot(page, 'cam');
    await open(page, 1440, `/emergency?communityId=${communityId}`, seededAlert);
    // An existing alert only: sending one from a test would message real recipients.
    // The SEEDED alert's own link, not the first row: a scheduled or canceled
    // alert sorts above it and has no delivery report to wait for.
    const href = await seededAlert(page).first().getAttribute('href');
    // The seed always has this alert (`open` just waited for it); a seed without it must fail.
    expect(href, 'the seeded emergency alert has a detail link').toBeTruthy();
    await checkPage(page, testInfo, {
      label: 'emergency detail',
      shot: 'emergency-detail',
      role: 'cam',
      url: href!,
      ready: (p) => p.getByText('Delivery', { exact: true }),
    });
  });

  test('emergency new alert (manager) holds at 1280 and 1440', async ({ page }, testInfo) => {
    const communityId = await startPilot(page, 'cam');
    // Opened and measured only; nothing on this page is submitted.
    await checkPage(page, testInfo, {
      label: 'emergency new',
      shot: 'emergency-new',
      role: 'cam',
      url: `/emergency/new?communityId=${communityId}`,
      ready: (p) => p.getByText('Choose a Template'),
    });
  });

  // The staff visitors table is measured in the block further down, which
  // registers its own visitor: on a seed whose Today list is empty the table
  // fits whatever its columns are, so an empty-list check proves nothing.

  test('visitors denied list (staff) holds at 1280 and 1440', async ({ page }, testInfo) => {
    const communityId = await startPilot(page, 'cam');
    await checkPage(page, testInfo, {
      label: 'visitors denied tab',
      shot: 'visitors-denied',
      role: 'cam',
      url: `/dashboard/visitors?communityId=${communityId}&tab=denied`,
      ready: (p) => rowOrEmpty(p, 'No denied-entry records yet.'),
    });
  });

  // WRITES DATA: this block registers a real visitor through the API, under the
  // same rule as the package block below (agent sandbox or CI's stack only).
  //
  // The table has five columns (visitor, host, status, passcode, actions), down
  // from twelve, so with a real row it fits its box at 1280 and 1440 and the
  // passcode is on screen. Below about 750px of box the table still scrolls, and
  // there the pinned action column must keep Check In on screen: the last part
  // runs at 640 and REQUIRES the overflow, so it cannot pass on a table that
  // simply fits and proves nothing about the pin.
  test('visitors (staff): a registered visitor fits at 1280 and 1440, and its actions stay on screen where the table scrolls', async ({ page }, testInfo) => {
    // The root manager, not `cam`: every other staff block here signs in as cam,
    // and reads are limited to 100 a minute per user. Three more page loads as
    // cam pushed the next spec (e-sign, also cam) into a 429 on CI, where it
    // skipped itself and failed the executed-test floor.
    const communityId = await startPilot(page, 'root_sunset');
    const url = `/dashboard/visitors?communityId=${communityId}`;

    const stamp = Date.now().toString(36);
    const name = `${stamp} Pinned Actions`;
    // Through the context's request client (same cookies), so registering costs
    // no page load.
    const units = await page.request.get(`/api/v1/units?communityId=${communityId}`);
    const unitBody = (await units.json()) as { data?: Array<{ unitNumber?: string }> };
    const hostUnitLabel = unitBody.data?.[0]?.unitNumber ?? null;
    const created = {
      unit: hostUnitLabel,
      status: hostUnitLabel
        ? (
            await page.request.post('/api/v1/visitors', {
              data: {
                communityId,
                visitorName: name,
                // The widest row the table has to hold: a long purpose, a
                // stay, and a vehicle with colour, make, model and plate.
                purpose: 'Contractor walk-through of the roof and the pool deck',
                hostUnitLabel,
                expectedArrival: new Date().toISOString(),
                expectedDurationMinutes: 90,
                vehicleColor: 'Silver',
                vehicleMake: 'Toyota',
                vehicleModel: 'Camry',
                vehiclePlate: 'FL7KDR42',
              },
            })
          ).status()
        : 0,
    };
    expect(created.unit, 'the seed has at least one unit to host a visitor').toBeTruthy();
    expect(created.status, 'registering the visitor').toBeLessThan(300);

    const row = page.locator('main tbody tr').filter({ hasText: name });
    for (const width of WIDTHS) {
      const where = `visitors with a registered visitor @ ${width}px`;
      await open(page, width, url, () => row);
      await expectPaintedTitle(page, where);
      // No sideways scroll anywhere, the table's own scroller included.
      await expectNoBleed(page, where);
      await expect(row.getByRole('button', { name: 'Check In', exact: true })).toBeVisible();
      // The passcode is readable on the row: its cell ends before the pinned
      // action column starts, not underneath it.
      const pass = await row.evaluate((tr) => {
        const pinned = tr.querySelector('td.sticky')!;
        const cell = pinned.previousElementSibling!;
        return {
          text: cell.textContent?.trim() ?? '',
          cellRight: Math.round(cell.getBoundingClientRect().right),
          pinnedLeft: Math.round(pinned.getBoundingClientRect().left),
        };
      });
      expect(pass.text, `${where}: the cell before the actions holds a passcode`).toMatch(/\w{4,}/);
      expect(
        pass.cellRight,
        `${where}: the passcode cell ends at ${pass.cellRight}, under the pinned column that starts at ${pass.pinnedLeft}`,
      ).toBeLessThanOrEqual(pass.pinnedLeft + 1);
      await shoot(page, testInfo, `visitors-registered-root-${width}`);
    }

    // A narrow screen, where the five columns are wider than the box.
    {
      const width = 640;
      const where = `visitors with a registered visitor @ ${width}px`;
      await open(page, width, url, () => row);
      await expectPaintedTitle(page, where);
      await expect(row.getByRole('button', { name: 'Check In', exact: true })).toBeVisible();

      const box = await row.evaluate((tr) => {
        const scroller = tr.closest('table')!.parentElement!;
        const button = [...tr.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Check In')!;
        const s = scroller.getBoundingClientRect();
        const b = button.getBoundingClientRect();
        return {
          scrollLeft: scroller.scrollLeft,
          tableWidth: scroller.scrollWidth,
          boxWidth: scroller.clientWidth,
          buttonLeft: Math.round(b.left),
          buttonRight: Math.round(b.right),
          boxLeft: Math.round(s.left),
          boxRight: Math.round(s.right),
        };
      });
      expect(box.scrollLeft, `${where}: the table has not been scrolled`).toBe(0);
      expect(
        box.tableWidth,
        `${where}: the table no longer overflows (${box.tableWidth} in ${box.boxWidth}); this part proves nothing until it does`,
      ).toBeGreaterThan(box.boxWidth + 1);
      expect(
        box.buttonLeft >= box.boxLeft && box.buttonRight <= box.boxRight + 1,
        `${where}: Check In sits at ${box.buttonLeft}..${box.buttonRight}, outside the table's box ${box.boxLeft}..${box.boxRight}`,
      ).toBe(true);
      await shoot(page, testInfo, `visitors-pinned-actions-root-${width}`);
    }

    // Keyboard (WCAG 2.4.11): a control focused in a scrolling column must come
    // to rest clear of the pinned column, not underneath it. Still at 640, where
    // the row's QR button starts under the pin; focusing it must scroll it out
    // (the table's scroll padding does that).
    const qr = row.getByRole('button', { name: 'Open QR code' });
    const edges = () =>
      row.evaluate((tr) => {
        const button = [...tr.querySelectorAll('button')].find((b) =>
          b.textContent?.includes('Open QR code'),
        )!;
        return {
          qrRight: Math.round(button.getBoundingClientRect().right),
          pinnedLeft: Math.round(tr.querySelector('td.sticky')!.getBoundingClientRect().left),
        };
      });
    const before = await edges();
    expect(
      before.qrRight,
      `the QR button ends at ${before.qrRight}, already clear of the pinned column at ${before.pinnedLeft}; this part proves nothing until it starts under it`,
    ).toBeGreaterThan(before.pinnedLeft + 1);
    await qr.focus();
    await expect(qr).toBeFocused();
    const focused = await edges();
    expect(
      focused.qrRight,
      `the focused QR button ends at ${focused.qrRight} (was ${before.qrRight}), under the pinned column that starts at ${focused.pinnedLeft}`,
    ).toBeLessThanOrEqual(focused.pinnedLeft + 1);
    await shoot(page, testInfo, 'visitors-pinned-actions-focus-root-640');
  });

  // WRITES DATA: this block logs a real package through the app. It must only
  // ever run against the agent sandbox or CI's disposable Supabase stack, never a
  // shared or production database. Do not launch the default Playwright config
  // without the demo-db wrapper (scripts/with-env-local-demo-db.sh).
  test('a 90-character recipient name stays visible and does not break the packages page', async ({ page }, testInfo) => {
    const communityId = await startPilot(page, 'cam');
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
      await recordSummaryPlacement(page, testInfo, 'packages with rows', width);
      await shoot(page, testInfo, `packages-longname-cam-${width}`);
    }
  });

  // The owner may or may not hold a package here (the long-name block logs one
  // against the first unit, which the seed gives to the owner), so every
  // assertion holds in both states.
  test('a resident sees the owner views with no manager figures', async ({ page }, testInfo) => {
    const communityId = await startPilot(page, 'owner');

    await open(page, 1440, `/dashboard/packages?communityId=${communityId}`, (p) =>
      // A resident row (RecordList, not a table) or the first-run heading.
      p
        .locator('main ul li')
        .filter({ hasText: 'Ready to collect' })
        .or(p.getByRole('heading', { name: 'No packages waiting for you' }))
        .first(),
    );
    await expectPaintedTitle(page, 'packages (resident)');
    await expect(page.locator('main aside')).toHaveCount(0);
    await expect(page.locator('main').getByText(/awaiting pickup|picked up|at a glance/i)).toHaveCount(0);
    await expectNoBleed(page, 'packages (resident) @ 1440px');
    await shoot(page, testInfo, 'packages-owner-1440');

    await open(page, 1440, `/emergency?communityId=${communityId}`, (p) =>
      p.getByText(/No alerts yet|Hurricane Preparation Advisory/).first(),
    );
    await expectPaintedTitle(page, 'emergency (recipient)');
    await expect(page.locator('main aside')).toHaveCount(0);
    await expect(page.locator('main').getByText(/recipients/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /send alert/i })).toHaveCount(0);
    await expectNoBleed(page, 'emergency (recipient) @ 1440px');
    await shoot(page, testInfo, 'emergency-list-owner-1440');
  });
});

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
 * Visitors, Violations report / review / mine) at the app's real text size.
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

  // "visitors (staff) holds at 1440" used to be here. It passed only while the
  // Today list was empty or narrow: with one real row the table is 1292px in a
  // 1092px box at 1440 (measured 2026-11-23, sandbox; 1227 in 1092 on production).
  // It now lives with the 1280 finding in design-direction-pilot-known-issues.spec.ts.
  // What this spec asserts for the staff table instead is the block further down:
  // the row's actions stay on screen while the table scrolls.

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
  // At 1280 the visitors table is wider than its box (the finding kept in
  // design-direction-pilot-known-issues.spec.ts), so the columns scroll. The
  // action column is pinned: a row's Check In and Revoke must be on screen
  // without a sideways scroll. The block REQUIRES the overflow, so it cannot
  // pass on a table that simply fits and proves nothing about the pin.
  test('visitors (staff): a row\'s actions stay on screen when the table scrolls sideways', async ({ page }, testInfo) => {
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
                purpose: 'Contractor walk-through',
                hostUnitLabel,
                expectedArrival: new Date().toISOString(),
                expectedDurationMinutes: 60,
              },
            })
          ).status()
        : 0,
    };
    expect(created.unit, 'the seed has at least one unit to host a visitor').toBeTruthy();
    expect(created.status, 'registering the visitor').toBeLessThan(300);

    const row = page.locator('main tbody tr').filter({ hasText: name });
    // Both widths: 1440 is where the defect was found on production. The last
    // pass is 1280, which the keyboard check below relies on.
    for (const width of [1440, 1280] as const) {
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
        `${where}: the table no longer overflows (${box.tableWidth} in ${box.boxWidth}); this block proves nothing until it does`,
      ).toBeGreaterThan(box.boxWidth + 1);
      expect(
        box.buttonLeft >= box.boxLeft && box.buttonRight <= box.boxRight + 1,
        `${where}: Check In sits at ${box.buttonLeft}..${box.buttonRight}, outside the table's box ${box.boxLeft}..${box.boxRight}`,
      ).toBe(true);
      await shoot(page, testInfo, `visitors-pinned-actions-cam-${width}`);
    }

    // Keyboard (WCAG 2.4.11): a control focused in a scrolling column must come
    // to rest clear of the pinned column, not underneath it. Visitors has no
    // control in a middle column today (the QR button is in the last scrolling
    // column, which is always clear once the table is scrolled to its end), so
    // the cell that starts under the pin is made focusable here to exercise the
    // table's scroll padding itself.
    const focused = await row.evaluate((tr) => {
      const scroller = tr.closest('table')!.parentElement!;
      const pinned = tr.querySelector('td.sticky')!;
      const pinnedLeft = pinned.getBoundingClientRect().left;
      const under = [...tr.querySelectorAll('td')].find(
        (td) => td !== pinned && td.getBoundingClientRect().right > pinnedLeft + 1,
      );
      if (!under) return null;
      const before = Math.round(under.getBoundingClientRect().right);
      under.tabIndex = -1;
      under.focus();
      return {
        before,
        scrollLeft: Math.round(scroller.scrollLeft),
        cellRight: Math.round(under.getBoundingClientRect().right),
        pinnedLeft: Math.round(pinned.getBoundingClientRect().left),
      };
    });
    expect(focused, 'a cell starts under the pinned column at scrollLeft 0').not.toBeNull();
    expect(
      focused!.cellRight,
      `the focused cell ends at ${focused!.cellRight} (was ${focused!.before}), under the pinned column that starts at ${focused!.pinnedLeft}`,
    ).toBeLessThanOrEqual(focused!.pinnedLeft + 1);
    await shoot(page, testInfo, 'visitors-pinned-actions-focus-cam-1280');
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

  // Violations. None of these sign in as `cam`: reads are limited to 100 a
  // minute per user, and the blocks above already spend cam's budget.

  test('report form (manager) holds at 1280 and 1440', async ({ page }, testInfo) => {
    const communityId = await startPilot(page, 'root_sunset');
    // Opened and measured only; nothing is filed.
    await checkPage(page, testInfo, {
      label: 'violation report (staff)',
      shot: 'violation-report-form',
      role: 'root_sunset',
      url: `/violations/report?communityId=${communityId}`,
      // Enabled, not just visible: the button stays disabled until the unit
      // picker has loaded, so a visible one can still be over "Loading units…".
      ready: (p) => p.getByRole('button', { name: 'File report', exact: true, disabled: false }),
    });
    await expect(page.locator('main h1').first()).toHaveText('Report a violation');
    await expect(page.getByRole('button', { name: 'Submit report', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'See your reports' })).toHaveCount(0);
  });

  test('report form (resident) holds and links to Mine', async ({ page }, testInfo) => {
    const communityId = await startPilot(page, 'tenant');
    await checkPage(page, testInfo, {
      label: 'violation report (resident)',
      shot: 'violation-report-form',
      role: 'tenant',
      url: `/violations/report?communityId=${communityId}`,
      // Enabled, not just visible: the button stays disabled until the unit
      // picker has loaded, so a visible one can still be over "Loading units…".
      ready: (p) => p.getByRole('button', { name: 'Submit report', exact: true, disabled: false }),
    });
    await expect(page.locator('main h1').first()).toHaveText('Report a violation');
    await expect(page.getByRole('button', { name: 'File report', exact: true })).toHaveCount(0);

    const link = page.getByRole('link', { name: 'See your reports' });
    await expect(link).toHaveAttribute('href', `/violations?tab=mine&communityId=${communityId}`);
    await clickWhenHydrated(link);
    await page.waitForURL(/\/violations\?tab=mine/);
    // A plain resident has Mine only: no tab row, and Mine's content renders.
    await expect(
      page
        .getByRole('heading', { name: /^(On your unit|Your reports|Nothing here yet)$/ })
        .first(),
    ).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expectPaintedTitle(page, 'violations mine (resident) @ 1440px');
    await expectNoBleed(page, 'violations mine (resident) @ 1440px');
    await shoot(page, testInfo, 'violations-mine-tenant-1440');
  });

  test('violations review (manager) holds at 1280 and 1440', async ({ page }, testInfo) => {
    const communityId = await startPilot(page, 'root_sunset');
    const url = `/violations?communityId=${communityId}`;
    // A case row links to its detail page; the header's "New violation" goes to
    // /violations/report and is not inside a list item.
    const caseLink = (p: Page) => p.locator('main li a[href^="/violations/"]');
    for (const width of WIDTHS) {
      const where = `violations review @ ${width}px`;
      // Both are drawn only once the client query settles, so either proves the data arrived.
      await open(page, width, url, (p) =>
        caseLink(p).first().or(p.getByText('No violation cases yet')).first(),
      );
      await expectPaintedTitle(page, where);
      // The demo seed gives Sunset Condos violations (scripts/seed-demo.ts), so an
      // empty list here is a failure, not a pass.
      await expect(caseLink(page).first(), `${where}: no case row`).toBeVisible();
      // A manager sees Review only: no tab row.
      await expect(page.getByRole('tab')).toHaveCount(0);
      if (width === 1440) {
        await expect(
          page.getByRole('complementary', { name: 'Summary' }).getByText('open cases', { exact: true }),
        ).toBeVisible();
      }
      await expectNoBleed(page, where);
      await recordSummaryPlacement(page, testInfo, 'violations review', width);
      await shoot(page, testInfo, `violations-review-root_sunset-${width}`);
    }
  });

  test('violations (board member) shows Review and Mine tabs', async ({ page }, testInfo) => {
    const communityId = await startPilot(page, 'board_member');
    const url = `/violations?communityId=${communityId}`;
    for (const width of WIDTHS) {
      const where = `violations (board member) @ ${width}px`;
      await open(page, width, url, (p) =>
        p
          .locator('main li a[href^="/violations/"]')
          .first()
          .or(p.getByText('No violation cases yet'))
          .first(),
      );
      await expectPaintedTitle(page, where);
      const reviewTab = page.getByRole('tab', { name: 'Review', exact: true });
      const mineTab = page.getByRole('tab', { name: 'Mine', exact: true });
      await expect(reviewTab).toBeVisible();
      await expect(mineTab).toBeVisible();
      await expect(reviewTab).toHaveAttribute('aria-selected', 'true');
      await expectNoBleed(page, `${where} (Review)`);
      await shoot(page, testInfo, `violations-review-board_member-${width}`);

      // The ready locator above is drawn by the client query, so the tabs are
      // hydrated by now. (Radix tabs select on mousedown, so clickWhenHydrated's
      // onClick probe does not apply.)
      await mineTab.click();
      await expect(mineTab).toHaveAttribute('aria-selected', 'true');
      await expect(page).toHaveURL(/[?&]tab=mine/);
      await expect(
        page
          .getByRole('tabpanel')
          .getByRole('heading', { name: /^(On your unit|Your reports|Nothing here yet)$/ })
          .first(),
      ).toBeVisible();
      await expectNoBleed(page, `${where} (Mine)`);
      await shoot(page, testInfo, `violations-mine-board_member-${width}`);
    }
  });
});

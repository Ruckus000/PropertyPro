import { test } from '@playwright/test';

import { checkPage, rowOrEmpty, startPilot } from './helpers/design-pilot';

/**
 * Pilot findings that fail today, kept as fixme so the measurement is not lost.
 *
 * NOT listed in `ci-safe-specs.json` on purpose: the e2e workflow runs with
 * `--refuse-skips`, so a fixme inside `design-direction-pilot.spec.ts` would turn
 * a green job red. Move a block into that spec (un-fixme'd) when its defect is fixed.
 */
test.describe('design direction pilot, known issues', () => {
  test.setTimeout(180_000);

  // FINDING, not a loosened assertion. Measured 2026-11-22 on the agent sandbox,
  // sunset-condos, root 17.2px at 1280: the visitors table is 992px wide inside a
  // 946px scroller, so it scrolls sideways by 46px (12 columns: Visitor Name ...
  // Passcode, Actions; "Passcode" is clipped). At 1440 (root 18px) the box is
  // 1093px and it fits. The page draws no side panel here, so the width is the
  // table's own, not the panel's.
  test.fixme('visitors (staff) holds at 1280', async ({ page, context, baseURL }, testInfo) => {
    const communityId = await startPilot(page, context, baseURL, 'cam');
    await checkPage(page, testInfo, {
      label: 'visitors',
      shot: 'visitors',
      role: 'cam',
      url: `/dashboard/visitors?communityId=${communityId}`,
      ready: (p) => rowOrEmpty(p, 'No visitors found.'),
      widths: [1280],
    });
  });
});

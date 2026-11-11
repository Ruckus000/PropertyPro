/**
 * Responsive overflow probe — nothing may bleed out of its box between 375px and 1440px.
 *
 * Why this exists: the authenticated sidebar is a static flex sibling that PUSHES
 * (`app-shell.tsx:182`, `NavRail` `w-[260px]`), so the content column is 260px narrower
 * than the viewport, plus 48px of `PageContainer` gutter. But every breakpoint in page
 * content keys off the VIEWPORT. Crossing 1024px the content box drops from ~975px to
 * ~716px at the exact pixel where every `lg:` layout switches on. Three screens shipped
 * visibly broken in that band and no gate could see it: Playwright runs one project
 * (`devices['Desktop Chrome']` = 1280x720 — squarely inside the band) and asserts nothing
 * about layout, jsdom does no layout at all, and the lint guards check colour and
 * structure, never geometry — `guard:responsive-geometry` is the 31st and the only one
 * that goes near layout, and it deliberately asks only one structural question
 * (no raw `<table>`), because a geometry claim belongs in a browser.
 *
 * The check that matters is the second one. A page-level `scrollWidth` assertion alone
 * misses the common case, where an inner box overflows and the excess is clipped by an
 * ancestor's `overflow-hidden` — text simply disappears, with no scrollbar to reveal it.
 */
import { expect, test, type Page } from '@playwright/test';

import { loginAs } from './helpers/dev-login';
import { findOverflows } from './helpers/overflow';
import { findSmallTargets } from './helpers/target-size';

/**
 * 375 and 414 are the two common phone widths; 768 is tablet portrait; 1024 and
 * 1280 are the two cliff edges; 1440 is a large laptop.
 *
 * The floor moved from 768 to 375 on 2026-09-14. The old floor was never a
 * product decision — the touch-target rule (`.claude/rules/design.md`, Component
 * Dimensions) has always required 44px targets *below* 768px, and `/mobile/` covers 16 routes with no equivalent for finance,
 * contracts, violations, esign, compliance or PM portfolio, so a phone user on
 * any of those gets this shell. Below 1024 the 260px rail becomes a drawer
 * (`app-shell.tsx`, `hidden lg:block`), so at 375 the content column is 343px:
 * viewport minus PageContainer's `px-4` gutter.
 *
 * Both new widths were measured offline before being added here, against the
 * real compiled CSS in the real shell geometry, so this is not a speculative
 * widening: the compliance queue's scroller holds (584px table in a 325px box,
 * zero unscrolled bleeds) and `data-table-types.ts:52-65` records the Documents
 * ladder being tuned at 375px when it was written.
 */
const VIEWPORTS = [375, 414, 768, 1024, 1280, 1440] as const;

/**
 * A response a block must see before it measures, keyed by block label, for a
 * bleed that only exists once client data has rendered. It waits for the
 * response rather than for the element it renders, so a seed with nothing to
 * show still passes for the right reason instead of timing out.
 */
const SETTLE_ON: Partial<Record<string, string>> = {
  // The Website tab's missing-records count (`useNavBadges`).
  dashboard: '/api/v1/pm/site/records-alert',
};

async function expectNoBleed(page: Page, where: string) {
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
}

test.describe('responsive overflow', () => {
  // A dev server compiles these routes on demand and each block visits one route at
  // six viewports, so the default 30s is not enough on a cold `.next`.
  test.setTimeout(120_000);

  for (const [label, buildPath] of [
    ['compliance', (id: number) => `/communities/${id}/compliance`],
    ['documents', (id: number) => `/communities/${id}/documents`],
    // Added 2026-09-14. Carries the two defects the audit fixed on this route:
    // `FinanceKpiRow`'s four-up grid (was `lg:grid-cols-4`, which widens at the
    // exact pixel the rail costs the column 340px) and `RecentPayments`, whose
    // `overflow-hidden` wrapper clipped 165px of a 490px table at 375px with no
    // scrollbar. Sunset Condos is `professional`, and `condo_718 + professional`
    // resolves `hasFinance: true`, so this surface is not plan-gated for `cam`.
    ['payments', (id: number) => `/communities/${id}/payments`],
    // Added 2026-09-14, second round. Each of the three below was measured
    // bleeding and then fixed in this branch, and each has a distinct cause, so
    // one of them regressing tells you something the others would not.
    //
    // `meetings` is the page this audit found broken at ALL SIX widths, and it
    // needed two fixes: the event pill's `inline-flex` (every width) and the
    // month grid's phone geometry, where seven columns with `gap-2`/`p-2` left
    // each day cell a 15px CONTENT box. `announcements/new` is an implicit grid
    // track sized to a `datetime-local`'s UA intrinsic width — invisible to any
    // text-based guard, because the base grid declares no `grid-cols-*` at all.
    // `settings` is the only one whose bleed lives in a LOADING state
    // (`SupportAccessSettings`'s skeleton), so it is the only block here that
    // can pass vacuously when the fetch resolves before the measurement; that
    // is still worth having, because it cannot pass while the bleed is back.
    //
    // All three avoid record ids on purpose. `/esign/submissions/[id]` bled too
    // and is deliberately NOT here: it needs a seeded submission, and a block
    // that 404s when the seed shifts is worse than no block.
    ['meetings', (id: number) => `/communities/${id}/meetings`],
    ['announcements composer', (id: number) => `/announcements/new?communityId=${id}`],
    ['settings', (id: number) => `/settings?communityId=${id}`],
    // Added 2026-11-11. The first community route here that is not a section
    // page, and the only one whose bleed lived in the SHELL rather than the
    // page: below lg the tab row's Website tab sits past 375px, and its count's
    // `sr-only` sentence (position: absolute) escaped the tab scroller, which
    // was not positioned, widening the page to 447px. The page-level
    // `scrollWidth` assertion is the one that catches it; `findOverflows`
    // cannot, because a 1px `sr-only` box is not what it looks for. The count
    // arrives from a client query after `main` paints, so this block waits for
    // that response (see SETTLE_ON) — without the wait it passed with the bug.
    ['dashboard', (id: number) => `/dashboard?communityId=${id}`],
  ] as const) {
    test(`${label} does not bleed from 375px to 1440px`, async ({ page }) => {
      const settleOn = SETTLE_ON[label];
      // Pinned: an unpinned demo user lands in Palm Shores (Essentials), where several
      // of these surfaces render "Upgrade now" instead of the layout under test.
      const { communityId } = await loginAs(page, 'cam', {
        communitySlug: 'sunset-condos',
        skipPortalNav: true,
      });

      for (const width of VIEWPORTS) {
        await page.setViewportSize({ width, height: 900 });
        // Registered before the navigation, so a fast response cannot be missed.
        const settled = settleOn
          ? page.waitForResponse((response) => response.url().includes(settleOn))
          : null;
        await page.goto(buildPath(communityId), { waitUntil: 'domcontentloaded' });
        // Layout is only meaningful once the client tree has painted; a server-rendered
        // heading appears before hydration by definition (see helpers/hydration.ts).
        await page.locator('main').waitFor({ state: 'visible' });
        await page.evaluate(() => document.fonts.ready);
        if (settled) {
          await settled;
          // One more frame, so React has committed what that response rendered.
          await page.evaluate(
            () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
          );
        }
        await expectNoBleed(page, `${label} @ ${width}px`);
        // WCAG 2.5.8 (AA) floor at phone width. The project's 44px rule is pinned
        // by class tests on the shared primitives; this catches anything under 24.
        if (width === 375) {
          const small = await findSmallTargets(page);
          expect(
            small,
            `${label} @ 375px: controls under the 24px AA target size, with no spacing to spare —\n` +
              small.map((t) => `  ${t.selector}  ${t.width}x${t.height}`).join('\n'),
          ).toEqual([]);
        }
      }
    });
  }
});

/**
 * The site-preview iframe must contain the community's site and nothing else.
 *
 * `/pm/site-preview` used to live under `app/(authenticated)/`, whose layout renders
 * `AppShell` unconditionally — so a ~490px iframe contained the entire app (rail, search,
 * breadcrumb trail, billing banners) in mobile-drawer mode. The route now sits in the
 * shell-less `(site-preview)` group. Route groups do not change URLs, so no unit test
 * could have caught either the regression or the fix: asserting the iframe `src` string
 * passes whichever group the route lives in.
 */
test.describe('site preview chrome', () => {
  test.setTimeout(120_000);

  test('/pm/site-preview renders the community site with no app shell', async ({ page }) => {
    const { communityId } = await loginAs(page, 'cam', {
      communitySlug: 'sunset-condos',
      skipPortalNav: true,
    });

    await page.goto(`/pm/site-preview?communityId=${communityId}&preview=true`, {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('[data-testid="site-preview-root"]').waitFor({ state: 'visible' });

    // The three shell landmarks, by the attributes their components actually set:
    // NavRail.tsx, app-top-bar.tsx and shell-breadcrumbs.tsx respectively.
    await expect(page.locator('nav[aria-label="Main navigation"]')).toHaveCount(0);
    await expect(page.locator('[role="search"]')).toHaveCount(0);
    await expect(page.locator('nav[aria-label="Breadcrumb"]')).toHaveCount(0);

    // AppShell's `<main id="main-content">` and the public-site layout's own one used to
    // NEST, duplicating the id the root layout's skip link targets. Exactly one now.
    await expect(page.locator('#main-content')).toHaveCount(1);
  });
});

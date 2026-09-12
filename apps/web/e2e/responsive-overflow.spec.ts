/**
 * Responsive overflow probe — nothing may bleed out of its box between 768px and 1440px.
 *
 * Why this exists: the authenticated sidebar is a static flex sibling that PUSHES
 * (`app-shell.tsx:182`, `NavRail` `w-[260px]`), so the content column is 260px narrower
 * than the viewport, plus 80px of `PageContainer` gutter. But every breakpoint in page
 * content keys off the VIEWPORT. Crossing 1024px the content box drops from ~959px to
 * ~684px at the exact pixel where every `lg:` layout switches on. Three screens shipped
 * visibly broken in that band and no gate could see it: Playwright runs one project
 * (`devices['Desktop Chrome']` = 1280x720 — squarely inside the band) and asserts nothing
 * about layout, jsdom does no layout at all, and the 30 lint guards check colour and
 * structure, never geometry.
 *
 * The check that matters is the second one. A page-level `scrollWidth` assertion alone
 * misses the common case, where an inner box overflows and the excess is clipped by an
 * ancestor's `overflow-hidden` — text simply disappears, with no scrollbar to reveal it.
 */
import { expect, test, type Page } from '@playwright/test';

import { loginAs } from './helpers/dev-login';

/** 768 is the supported floor; 1024 and 1280 are the two cliff edges; 1440 is a large laptop. */
const VIEWPORTS = [768, 1024, 1280, 1440] as const;

type Overflow = { selector: string; client: number; scroll: number; over: number };

/**
 * Elements are allowed to overflow *if a real scroller owns them*. `<main>` does not
 * count: it carries `overflow-y-auto`, and per CSS spec a single `auto` axis makes the
 * computed `overflow-x` `auto` as well — so treating it as a scroller marks every
 * page-level violation acceptable. The first draft of this probe did exactly that and
 * reported "no violations" against three screens that were provably broken. A page that
 * scrolls sideways is the defect, not the remedy.
 */
async function findOverflows(page: Page): Promise<Overflow[]> {
  return page.evaluate(() => {
    const describe = (el: Element): string => {
      const parts: string[] = [];
      for (let n: Element | null = el; n && parts.length < 4; n = n.parentElement) {
        const cls = (n.getAttribute('class') ?? '').trim().split(/\s+/).slice(0, 3).join('.');
        parts.unshift(n.tagName.toLowerCase() + (cls ? `.${cls}` : ''));
        if (n.tagName === 'MAIN') break;
      }
      return parts.join(' > ');
    };

    const ownedByScroller = (el: Element): boolean => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        if (n.tagName === 'MAIN') return false;
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
      return false;
    };

    // Visually-hidden text is not a bleed. Tailwind's `sr-only` is
    // `width:1px; overflow:hidden; clip:rect(0,0,0,0)`, so clientWidth is 1 and
    // scrollWidth is the full string — which looks exactly like clipped-without-
    // ellipsis to the rule below. `PageHeader` renders an `h1.sr-only` on every
    // authenticated page, so without this the probe reports every page in the app.
    // Caught by CI on the run that first registered this spec: 3 failures, all
    // sr-only h1s and legends.
    const visuallyHidden = (cs: CSSStyleDeclaration): boolean =>
      cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clipPath === 'inset(50%)';

    const found: Overflow[] = [];
    const root = document.querySelector('main') ?? document.body;
    for (const el of root.querySelectorAll('*')) {
      if (el.clientWidth <= 1) continue;
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      const cs = getComputedStyle(el);
      if (visuallyHidden(cs)) continue;
      const ox = cs.overflowX;
      // The element scrolls its own content — that is a designed affordance, not a bleed.
      if (ox === 'auto' || ox === 'scroll') continue;
      // `truncate` (overflow:hidden + ellipsis) legitimately reports scrollWidth >
      // clientWidth. It is the intended behaviour, and it is visibly ellipsised.
      if (ox === 'hidden' && cs.textOverflow === 'ellipsis') continue;
      if (ownedByScroller(el)) continue;
      found.push({
        selector: describe(el),
        client: el.clientWidth,
        scroll: el.scrollWidth,
        over: el.scrollWidth - el.clientWidth,
      });
    }
    return found.slice(0, 10);
  });
}

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
        .map((o) => `  ${o.selector}  client=${o.client} scroll=${o.scroll} (+${o.over}px)`)
        .join('\n'),
  ).toEqual([]);
}

test.describe('responsive overflow', () => {
  // A dev server compiles these routes on demand and each block visits one route at
  // four viewports, so the default 30s is not enough on a cold `.next`.
  test.setTimeout(120_000);

  for (const [label, buildPath] of [
    ['compliance', (id: number) => `/communities/${id}/compliance`],
    ['documents', (id: number) => `/communities/${id}/documents`],
    ['website onboarding wizard', (id: number) => `/pm/onboarding/website?communityId=${id}`],
  ] as const) {
    test(`${label} does not bleed from 768px to 1440px`, async ({ page }) => {
      // Pinned: an unpinned demo user lands in Palm Shores (Essentials), where several
      // of these surfaces render "Upgrade now" instead of the layout under test.
      const { communityId } = await loginAs(page, 'cam', {
        communitySlug: 'sunset-condos',
        skipPortalNav: true,
      });

      for (const width of VIEWPORTS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(buildPath(communityId), { waitUntil: 'domcontentloaded' });
        // Layout is only meaningful once the client tree has painted; a server-rendered
        // heading appears before hydration by definition (see helpers/hydration.ts).
        await page.locator('main').waitFor({ state: 'visible' });
        await page.evaluate(() => document.fonts.ready);
        await expectNoBleed(page, `${label} @ ${width}px`);
      }
    });
  }
});

/**
 * The wizard's live-preview iframe must contain the community's site and nothing else.
 *
 * `/pm/site-preview` used to live under `app/(authenticated)/`, whose layout renders
 * `AppShell` unconditionally — so a ~490px iframe contained the entire app (rail, search,
 * breadcrumb trail, billing banners) in mobile-drawer mode. The route now sits in the
 * shell-less `(site-preview)` group. Route groups do not change URLs, so no existing test
 * could have caught either the regression or the fix: `wizard-live-preview.test.tsx`
 * asserts the iframe `src` string, which was correct throughout.
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

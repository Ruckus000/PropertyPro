/**
 * Touch targets, measured against the criterion that is actually normative.
 *
 * ## What this corrects
 *
 * `docs/audits/2026-09-14-responsive-audit.md` leads with "53 of the 65 pages
 * measured at 375px carry a control under the 44px minimum". That is not an
 * accessibility result. 44px is WCAG 2.1 **SC 2.5.5 Target Size (Enhanced)**,
 * Level **AAA** — a legitimate internal aspiration, and the Apple HIG figure,
 * but not a conformance bar. The AA criterion is WCAG 2.2 **SC 2.5.8 Target
 * Size (Minimum)**: **24x24 CSS px**, with spacing, inline,
 * user-agent-control, equivalent and essential exceptions.
 *
 * So this file answers two questions and keeps them apart:
 *
 *   1. **Does a primitive clear 24x24?** Asserted. A failure there is a defect,
 *      not a preference.
 *   2. **Does it reach the house 44px?** Reported, never asserted. Four
 *      documents assert that rule, no primitive satisfies it, and `DESIGN.md`
 *      contradicts itself about it (line 118 against 207/228). Resolving that is
 *      a product decision, and a gate must not pre-empt it by turning the whole
 *      component library red.
 *
 * ## Where the markup comes from
 *
 * `e2e/fixtures/render-primitives.mts`, rendered in a `tsx` subprocess — see
 * that file for why it cannot happen inside a spec. The short version: the
 * fixture IS the components, so it cannot drift from them.
 *
 * ## Why the CSS is compiled rather than built
 *
 * `scripts/verify-web-class-resolution.ts` already establishes that Tailwind
 * compiles through postcss against the app's own config in under a second with
 * no `next build`. The cascade below mirrors `apps/web/src/app/globals.css:1-9`
 * exactly — tokens, then base/components/utilities, then the 18px root —
 * because all three change the answer:
 *
 *   - `tailwind.config.ts:27-43` overrides the spacing scale with literal px, so
 *     `h-8`/`h-9`/`h-10`/`h-11` are exactly 32/36/40/44 and do NOT move with the
 *     root font size;
 *   - heights that emerge from padding and a line box DO move — `--font-size-sm`
 *     is `0.875rem`, which renders 15.75px at an 18px root, not the 14px its own
 *     comment claims;
 *   - which is why `TabsTrigger` lands on 31.6px rather than a round number.
 *     That figure is this fixture's self-check: if it stops reproducing, the
 *     environment has drifted from the app and nothing below is worth reading.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import type { RenderedPrimitive } from './fixtures/render-primitives.mjs';
import { loginAs } from './helpers/dev-login';
import { findUndersizedTargets } from './helpers/target-size';

const require_ = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..');

/** WCAG 2.2 SC 2.5.8, Level AA. The bar that is asserted. */
const AA_MINIMUM = 24;
/** DESIGN.md:207 and :228. The bar that is reported. */
const HOUSE_MOBILE = 44;

// ---------------------------------------------------------------------------
// Fixture assembly
// ---------------------------------------------------------------------------

/**
 * `--tsconfig` is not optional: `src/components/ui/checkbox.tsx` imports
 * `e2e/fixtures/tsconfig.json`. The web config alone gets the JSX runtime
 * wrong for packages/ui, and no config alone gets `@/lib` right.
 */
function renderPrimitives(): RenderedPrimitive[] {
  const tsxCli = require_.resolve('tsx/cli');
  const stdout = execFileSync(
    process.execPath,
    [
      tsxCli,
      '--tsconfig',
      resolve(webRoot, 'tsconfig.json'),
      resolve(here, 'fixtures/render-primitives.mts'),
    ],
    { cwd: webRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout) as RenderedPrimitive[];
  if (parsed.length === 0) throw new Error('the primitive catalogue rendered empty');
  return parsed;
}

const TOKENS_CSS = readFileSync(
  resolve(webRoot, '../../packages/ui/src/styles/tokens.css'),
  'utf8',
);

async function compileTailwind(markup: string): Promise<string> {
  const postcss = (await import(require_.resolve('postcss'))).default;
  const tailwind = (await import(require_.resolve('tailwindcss'))).default;
  const { default: userConfig } = await import('../tailwind.config');

  const { css } = await postcss([
    tailwind({ ...userConfig, content: [{ raw: markup, extension: 'html' }] }),
  ]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined });

  return css as string;
}

type Measurement = { name: string; width: number; height: number; note?: string };

async function mountAndMeasure(page: Page): Promise<Measurement[]> {
  const primitives = renderPrimitives();

  // Each in its own generously padded row, so no primitive is crowded by a
  // neighbour and the 24px spacing exception never has to be argued about here.
  const body = primitives
    .map((p) => `<section data-probe="${p.name}" style="padding:24px">${p.html}</section>`)
    .join('\n');

  const utilities = await compileTailwind(body);
  expect(
    utilities.length,
    'Tailwind produced an empty stylesheet — the compile failed, so nothing below is measured',
  ).toBeGreaterThan(1000);

  await page.setContent(`<!doctype html>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${TOKENS_CSS}</style>
    <style>${utilities}</style>
    <style>:root { font-size: 18px } body { font-family: Inter, system-ui, sans-serif }</style>
    <main>${body}</main>`);

  const raw = await page.evaluate(
    (probes: { name: string; selector: string }[]) =>
      probes.map(({ name, selector }) => {
        const host = document.querySelector(`[data-probe="${CSS.escape(name)}"]`);
        const el = host?.querySelector(selector);
        if (!el) return { name, width: -1, height: -1 };
        const r = el.getBoundingClientRect();
        return {
          name,
          width: Math.round(r.width * 10) / 10,
          height: Math.round(r.height * 10) / 10,
        };
      }),
    primitives.map((p) => ({ name: p.name, selector: p.selector })),
  );

  return raw.map((m) => ({ ...m, note: primitives.find((p) => p.name === m.name)?.note }));
}

// ---------------------------------------------------------------------------

test.describe('touch targets — the primitives', () => {
  test('the fixture reproduces the app, or nothing below is worth reading', async ({ page }) => {
    const measured = await mountAndMeasure(page);

    // `.claude/rules/verification.md`: a scan that examined nothing must not
    // pass. -1 means a selector matched nothing, which would silently shrink
    // the population the assertions below run over.
    expect(
      measured.filter((m) => m.height < 0).map((m) => m.name),
      'a probe selector matched nothing',
    ).toEqual([]);
    expect(measured.length, 'the catalogue emptied itself').toBeGreaterThan(8);

    const by = (name: string) => {
      const found = measured.find((m) => m.name === name);
      if (!found) throw new Error(`no measurement named ${name}`);
      return found;
    };

    // Pinned to the literal px of the spacing override. Under Tailwind's stock
    // rem scale these would be 40.5 / 36 / 45 at an 18px root, so this catches
    // a config that failed to load as readily as a size change.
    expect(by('Button size=default').height, 'h-9').toBe(36);
    expect(by('Button size=sm').height, 'h-8').toBe(32);
    expect(by('Button size=lg').height, 'h-10').toBe(40);
    expect(by('Input').height, 'h-9').toBe(36);
    expect(by('Checkbox (bare)').height, 'h-4').toBe(16);

    // The padding-derived one, and the only figure here that depends on the
    // whole cascade being present: at a 16px root the same markup is ~29px.
    expect(by('TabsTrigger').height, 'padding-derived, 18px root').toBeCloseTo(31.6, 0);
  });

  test('only the four known controls fall under 24x24, and they are named', async ({ page }) => {
    const measured = await mountAndMeasure(page);
    const under = measured
      .filter((m) => m.width < AA_MINIMUM || m.height < AA_MINIMUM)
      .map((m) => `${m.name} (${m.width}x${m.height})`)
      .sort();

    // Set equality, not "is empty". Being under 24x24 is not itself a failure:
    // SC 2.5.8's SPACING exception excuses an undersized target that no other
    // target crowds, and a 16px checkbox in a roomy form row is conformant. So
    // what this pins is the population — these four carry a dependency on
    // their surroundings, and a FIFTH control acquiring that dependency should
    // be a decision someone makes, not a thing that happens.
    //
    // The esign remove button is deliberately NOT in this list. It used to be:
    // at `size-4` it was the one control the spacing exception could not
    // rescue, because it overlaps a field box that is itself a target. It is
    // `size-6` now, which is why it sits above the threshold unconditionally.
    //
    // Note the second row. The audit asserts, without having measured it, that
    // "a checkbox's real target is its `<label>`". The shipped shape puts the
    // label in a SIBLING element, and the control's own box is 16x16 either
    // way — clicking the label activates the control, but it does not enlarge
    // it, and the next test shows what the rule makes of that.
    expect(under, 'the set of spacing-dependent controls changed').toEqual([
      'Checkbox (+ sibling label, as shipped) (16x16)',
      'Checkbox (bare) (16x16)',
      'HelpTooltip trigger (in situ) (20x20)',
      'Switch (36x20)',
    ]);
  });

  test('axe excuses exactly those four when nothing crowds them', async ({ page }) => {
    await mountAndMeasure(page);
    const { checked, findings } = await findUndersizedTargets(page);

    expect(checked, 'the rule examined nothing — see helpers/target-size.ts').toBeGreaterThan(8);

    // The point of running the real rule rather than comparing heights myself:
    // in this fixture every primitive sits alone in a 24px-padded row, so the
    // spacing exception applies and the four undersized controls above are
    // CONFORMANT here. That is not a loophole, it is the criterion — and it is
    // the single thing the previous harness got most wrong, since it had no
    // spacing exception at all and so reported every 32px control in the app as
    // an accessibility failure.
    //
    // It is also not a rubber stamp, which the esign remove button proved: at
    // `size-4` this exact assertion reported it, because its own fixture puts
    // a second target (the field box) directly under it. Clearance around the
    // ROW does not help when the crowding is inside it.
    //
    // Which also bounds what this layer can claim: it measures the primitives,
    // not the app. Whether a real screen leaves them that room is a page-level
    // question, and page-level is where it has to be answered.
    expect(
      findings.map((f) => `${f.selector} ${f.width}x${f.height}`),
      'a primitive failed target-size even with 24px of clearance on every side',
    ).toEqual([]);
  });

  test('reports conformance with the house 44px rule without asserting it', async ({ page }) => {
    const measured = await mountAndMeasure(page);
    const reaching = measured.filter((m) => m.height >= HOUSE_MOBILE);

    // Printed, not asserted — see the header. `DESIGN.md:207` is unresolved
    // against `DESIGN.md:118`, and a red suite is not where that gets settled.
    console.log(
      `\ntouch targets vs DESIGN.md:207 (${HOUSE_MOBILE}px mobile)\n` +
        measured
          .map(
            (m) =>
              `  ${m.height >= HOUSE_MOBILE ? 'ok   ' : 'under'} ${`${m.width}x${m.height}`.padEnd(12)} ${m.name}`,
          )
          .join('\n') +
        `\n  ${reaching.length} of ${measured.length} reach it\n`,
    );

    expect(measured.length, 'the catalogue emptied itself').toBeGreaterThan(8);
  });
});

test.describe('touch targets — the rule itself', () => {
  test('axe reports a deliberately tiny target, so a clean run means something', async ({ page }) => {
    // The anti-vacuity probe `.claude/rules/verification.md` requires, and it
    // pins the exact defect the audit names: the jsdom axe assertions "pass
    // without measuring anything", because jsdom performs no layout and every
    // rect is zero. Proving the rule fires in a real engine is the whole
    // difference between this file and those.
    await page.setContent(`<!doctype html>
      <main>
        <button style="width:10px;height:10px;position:absolute;left:0;top:0">a</button>
        <button style="width:10px;height:10px;position:absolute;left:4px;top:4px">b</button>
      </main>`);

    const { checked, findings } = await findUndersizedTargets(page);
    expect(checked, 'the rule examined nothing').toBeGreaterThan(0);
    expect(findings.length, JSON.stringify(findings)).toBeGreaterThan(0);
  });

  test('and stays quiet on a comfortably large, well-spaced one', async ({ page }) => {
    // The control for the case above. Two 48px targets 24px apart satisfy both
    // the size rule and the spacing exception, so a probe that flags these is
    // over-reporting rather than strict — which is how the previous harness
    // turned a 32px button into an accessibility failure.
    await page.setContent(`<!doctype html>
      <main style="display:flex; gap:24px; padding:24px">
        <button style="width:48px;height:48px">a</button>
        <button style="width:48px;height:48px">b</button>
      </main>`);

    const { checked, findings } = await findUndersizedTargets(page);
    expect(checked, 'the rule examined nothing').toBeGreaterThan(0);
    expect(findings, JSON.stringify(findings)).toEqual([]);
  });
});

/**
 * Layer 2 — the same rule, on real pages.
 *
 * Six routes, chosen because `marketing-smoke.spec.ts` and
 * `activation-smoke.spec.ts` already prove they need no database, no Auth and
 * no seed: they are what the localci suite runs against a stub `DATABASE_URL`
 * that was never started. Reusing that set rather than inventing one means the
 * precondition is already established rather than assumed.
 *
 * What this adds over Layer 1, and it is the whole reason it exists: spacing is
 * contextual. A 16px checkbox is conformant alone and not conformant in a tight
 * row, and no amount of measuring components in isolation can tell you which
 * the app ships. It also catches the class of defect where a flex parent
 * crushes a control below its declared size — the `w-4` checkbox that measured
 * 13px until `shrink-0` was added.
 *
 * Phone widths only. Above 768px the pointer is usually a mouse, and the house
 * rule itself stops applying (`DESIGN.md:207`).
 *
 * `isMobile` / `hasTouch` / `deviceScaleFactor: 2` are set together and
 * deliberately: appendix bug 9 of the 2026-09-14 audit is a probe that omitted
 * the DPR the sweep used and reported a route clean that was not.
 */
const DB_FREE_ROUTES = [
  '/',
  '/resources',
  '/contact',
  '/login',
  '/signup/checkout',
  '/signup/checkout/return',
] as const;

test.describe('touch targets — real pages', () => {
  test.setTimeout(180_000);

  for (const width of [375, 414] as const) {
    test(`no target-size violation at ${width}px`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: 812 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      const report: string[] = [];
      let examined = 0;

      try {
        for (const route of DB_FREE_ROUTES) {
          await page.goto(route, { waitUntil: 'domcontentloaded' });
          const { checked, findings } = await findUndersizedTargets(page);
          examined += checked;
          for (const f of findings) {
            report.push(`  ${route}  ${f.selector}  ${f.width}x${f.height}  [${f.certainty}]`);
          }
        }
      } finally {
        await context.close();
      }

      // The denominator, printed as well as asserted. Six routes that between
      // them examined a handful of targets would pass this while proving
      // almost nothing, and an empty `report` would read as a clean bill of
      // health — so the number belongs in the log where a reader can judge it,
      // not just behind a comparison.
      console.log(
        `\ntarget-size at ${width}px: ${examined} targets examined across ` +
          `${DB_FREE_ROUTES.length} routes, ${report.length} unexcused\n`,
      );
      expect(examined, `the rule examined nothing across ${DB_FREE_ROUTES.length} routes`)
        .toBeGreaterThan(DB_FREE_ROUTES.length);

      expect(
        report,
        `WCAG 2.2 SC 2.5.8 (AA) — targets under 24x24 with no spacing to excuse them, ` +
          `at ${width}px (examined ${examined}):\n${report.join('\n')}`,
      ).toEqual([]);
    });
  }
});

/**
 * Layer 3 — the densest authenticated screens.
 *
 * Layer 1 asserts that no PRIMITIVE is under 24x24 except four that are, and
 * Layer 2 checks the public routes. Neither can see the failure mode that
 * actually threatens those four: **crowding**. `Checkbox` (16x16), `Switch`
 * (36x20) and the help tooltip (20x20) are conformant only while nothing else
 * clickable sits within 24px of them, so their conformance is a property of the
 * screen, not of the component — and one CSS change to a row's gap can take it
 * away without touching a single component file.
 *
 * Measured 2026-09-17 over all 93 authenticated routes at 375 and 414 as the
 * property_manager persona: **2,612 targets examined across 68 distinct pages,
 * zero unexcused**, plus 103 more on the three apartment-only dashboards a
 * condo-pinned persona cannot reach. This block is the part of that sweep worth
 * paying for on every PR — the five densest screens, which are also the five
 * `responsive-overflow.spec.ts` already proves render against the CI seed, so
 * it adds no new seed dependency.
 *
 * 375px only. It is the tighter of the two widths, nothing was found at either,
 * and a second width doubles the cost of the block for a second chance at the
 * same answer. Device pixel ratio is deliberately NOT set: measured both ways on
 * these routes, `target-size` returns the same counts and the same findings, and
 * matching `responsive-overflow.spec.ts`'s context is worth more than parity
 * with an offline sweep. What DOES move the count is page settle, which is why
 * this waits the way that spec waits and then some.
 */
test.describe('touch targets — the densest authenticated screens', () => {
  // A dev server compiles these on demand and one block visits five of them.
  test.setTimeout(240_000);

  const ROUTES = [
    ['meetings', (id: number) => `/communities/${id}/meetings`],
    ['documents', (id: number) => `/communities/${id}/documents`],
    ['payments', (id: number) => `/communities/${id}/payments`],
    ['announcements composer', (id: number) => `/announcements/new?communityId=${id}`],
    ['settings', (id: number) => `/settings?communityId=${id}`],
  ] as const;

  test('no target-size violation at 375px', async ({ page }) => {
    // Pinned, for the same reason `responsive-overflow.spec.ts` pins: an
    // unpinned demo user lands in Palm Shores (Essentials), where several of
    // these render "Upgrade now" — a different page with different controls.
    const { communityId } = await loginAs(page, 'cam', {
      communitySlug: 'sunset-condos',
      skipPortalNav: true,
    });
    await page.setViewportSize({ width: 375, height: 900 });

    const report: string[] = [];
    let examined = 0;

    for (const [label, buildPath] of ROUTES) {
      await page.goto(buildPath(communityId), { waitUntil: 'domcontentloaded' });
      await page.locator('main').waitFor({ state: 'visible' });
      await page.evaluate(() => document.fonts.ready);
      // Controls arrive with the data on these screens. Without this,
      // `/communities/N/documents` measured 18 targets on one run and 53 on
      // another — a skeleton scores clean because it has nothing to measure.
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

      const { checked, findings } = await findUndersizedTargets(page);
      examined += checked;
      for (const f of findings) {
        report.push(`  ${label}  ${f.selector}  ${f.width}x${f.height}  [${f.certainty}]`);
      }
    }

    // The denominator, asserted. Five dense screens examined 2 targets between
    // them would mean they rendered as login pages — which is exactly what
    // happened during the offline sweep, where a "clean" /dashboard turned out
    // to have examined 4 targets because the session cookie was never sent.
    expect(
      examined,
      `the rule examined almost nothing across ${ROUTES.length} screens (${examined}) — ` +
        'these pages did not render',
    ).toBeGreaterThan(40);

    expect(
      report,
      `WCAG 2.2 SC 2.5.8 (AA) — targets under 24x24 that no spacing excuses ` +
        `(examined ${examined}):\n${report.join('\n')}`,
    ).toEqual([]);
  });
});

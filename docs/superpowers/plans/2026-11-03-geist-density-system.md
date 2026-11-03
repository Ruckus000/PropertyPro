# Geist Density System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the app's excess empty space and make its components respond to the space they sit in. The approach adopts Geist's structure (density, type, flat hairline components) and keeps every Florida Modern colour.

**Architecture:** Most of the change lands at the three single-sourced layers the app already has:
- the token source (`packages/tokens/src/static.ts`, generated into `tokens.css`)
- the shell gutter (`PageContainer`)
- the shared primitives in `packages/ui`

Pages are not edited one by one. The only per-page work is:
- four call sites that use the display serif;
- about 20 call sites that override a Button height;
- one dashboard list, which becomes the first container-query consumer.

**Tech Stack:** Next.js 15 App Router, Tailwind 3.4 + CVA, `next/font/local`, vitest + Testing Library, the token generator in `packages/tokens/scripts/build.ts`.

**Spec:** The mockup canvas "PropertyPro Geist System" (https://claude.ai/artifact/D6M2db1C13PWqeRuuAhoQ7, version 6). Its Foundations board's "What changes" table is the source of every number below. Where the codebase forced a different value, the change is noted in **Decisions**.

## Decisions (made by this plan; overrule before execution)

- **D1. Root font size 18px → browser default (16px).** Root is 18px in `apps/web/src/app/globals.css` (#346). Large text is also on by default (`packages/ui/src/tokens/text-size.ts`). So today `text-sm` renders at 18px and `text-base` at 20.25px, the largest single source of the bloat.
  - Remove the root override and keep large text as the default.
  - Default (large) mode: interface text renders at **16px**, prose at **18px**. Standard mode gives the mockup's 14/16.
  - This keeps the 16px body floor in the default experience. It resolves the "14px is below the rule" caveat raised with the mockup.
- **D2. Desktop control floor 36px → 32px.** Below 768px everything interactive stays **44px**. The primitives now carry that rule, so call sites no longer have to.
- **D3. Fraunces leaves the authenticated app.** The four authenticated `font-display` call sites move to Geist semibold. Fraunces stays in four places:
  - signup (`front-porch-shell.tsx`)
  - the printable audit record
  - marketing
  - admin's `AdminPageHeader`. Admin's visible-title decision is documented in DESIGN.md; do not change it.
- **D4. Colours are untouched.** No edit to `primitives.ts` or `semantic.ts`. The one colour-adjacent change: Input/Textarea borders move from `border-edge` (sand-200) to `border-edge-strong` (sand-300), as in the mockup.
- **D5. No new StatStrip component.** The dashboard already has `metric-strip.tsx`. `KpiCard` and `MetricStrip` are tightened in place.
- **D6. Admin parity is its own task (Task 9), which can be dropped.** Admin inherits the `packages/ui` primitive changes automatically. Task 9 only swaps its root size and sans font.

## Global Constraints

- Tokens are generated. Edit `packages/tokens/src/static.ts`, then run `pnpm -F @propertypro/tokens generate`. Never hand-edit `packages/ui/src/styles/tokens.css`.
- Fonts are vendored files loaded with `next/font/local`. Never use `next/font/google` (#962).
- Touch targets are 44px (`h-11`/`min-h-11`) below `md` (768px). On desktop they are at least 32px.
- Status is never shown by colour alone. No new raw hex, palette classes or slash-opacity on semantic tokens (`pnpm guard:design-tokens`).
- Every new colour class must resolve (`pnpm guard:class-resolution`). After any admin Tailwind config edit, build admin and run `pnpm guard:admin-semantic-css`.
- `packages/ui` stays import-time pure (`"sideEffects": ["**/*.css"]`).
- Page gutter lives only in `PageContainer`. Pages add no root `px-*`/`py-*` (`pnpm guard:page-padding`).
- Run one test file with `pnpm test <path>`, with no `--`.
- Each task ends green on `pnpm typecheck && pnpm lint` plus its own tests. Each test that pins a fix gets a revert-check, recorded in the commit message (`.claude/rules/verification.md`).

## Review Focus

1. **Call sites that set their own Button height** (`<Button className="h-9">`). `tailwind-merge` keeps the base `md:h-8`, so a caller's explicit height silently shrinks on desktop. Expected: an explicit height wins at every width. Task 4 inventories and migrates them, and adds a test that pins the merge result.
2. **A control inside a dense mobile row.** A table row action or toolbar icon gets taller at 375px now that every Button is 44px there. Expected: the row grows, nothing overlaps or clips. Task 10's 375px screenshots cover the dashboard, Documents and a table page.
3. **Large text off ("standard").** Every size drops one step. Expected: no text below 12px, and `xs` stays metadata-only. Task 10 captures each page in both modes.
4. **A container-query component rendered with no `.cq` ancestor.** Its `cq-*` variants never match, so it shows its narrowest layout on every screen with no error. Task 7 adds a test that fails when a `cq-` class appears in a file whose rendered tree has no `.cq`.
5. **Pages that depended on the 18px root for width.** `PageBody` widths are rem, so `prose`/`form`/`content` columns get about 11% narrower. Expected: forms still fit their fields on one line at 1280px. Task 10 screenshots a settings form and a document detail page.

---

### Task 1: Root type scale

**Files:**
- Modify: `apps/web/src/app/globals.css:7-9` (delete the `:root { font-size: 18px; }` block)
- Modify: `packages/ui/src/components/shared/page-body.tsx`. Rewrite the WIDTHS docblock: no 18px root, widths are the nominal Tailwind rem figures (lg 512, 2xl 672, 3xl 768, 4xl 896, 5xl 1024). Also drop the "260px sidebar" sentence; top tabs are the default since #1442.
- Test: `apps/web/__tests__/styles/root-font-size.test.ts` (create)

**Interfaces:** Produces: rem = browser default (16px) in apps/web. Tasks 2–8 size against this.

- [ ] **Step 1: Write the failing test.** `root-font-size.test.ts` reads `apps/web/src/app/globals.css` and asserts it does not match `/:root\s*\{[^}]*font-size/`. The test docblock names #346 and D1: the root is left at the browser default so a user's own browser font size is honoured.
- [ ] **Step 2: Run it.** `pnpm test apps/web/__tests__/styles/root-font-size.test.ts`. Expected: FAIL.
- [ ] **Step 3: Delete the block. Rewrite the PageBody docblock** as above.
- [ ] **Step 4: Run it again.** Expected: PASS. Revert-check: restore the block, confirm red, re-delete.
- [ ] **Step 5: Commit.** `style(web): drop the 18px root font size (D1)`

### Task 2: Static tokens: radius, sizing, fonts

**Files:**
- Modify: `packages/tokens/src/static.ts`
- Modify: `apps/web/tailwind.config.ts:45-51` and `apps/admin/tailwind.config.ts:279-285` (`borderRadius`)
- Regenerate: `packages/ui/src/styles/tokens.css`, `packages/tokens/src/generated/tokens.css`
- Modify: the TypeScript mirror in `packages/ui/src/tokens/`. Nothing in either app imports it, but `packages/ui/__tests__/tokens/tokens.test.ts` pins it, so it must agree:
  - `radius.ts`: add `xs: 4`; set `md: 8`, `lg: 12`.
  - `breakpoints.ts`: `interactionSizing.pointerTarget.minimum` `32`; `responsiveDensity.spacious.buttonHeight` `44`; `responsiveDensity.default.buttonHeight` `32`.
- Test: `packages/tokens/__tests__/static.test.ts`, `packages/ui/__tests__/tokens/tokens.test.ts:341-351`

**Interfaces:**
- Produces:
  - CSS vars `--radius-xs` (new), `--radius-sm`, `--radius-md`, `--radius-lg`.
  - Tailwind `rounded-xs` (new), `rounded-sm`, `rounded-md` and `rounded-lg` read those vars.
  - `--font-sans` and `--font-mono` fallbacks name Geist.

- [ ] **Step 1: Update the static token tests to these exact values.**
  - `radius.xs` `"4px"`, `radius.sm` `"6px"`, `radius.md` `"8px"`, `radius.lg` `"12px"`.
  - `sizing["button-height"]` and `sizing["input-height"]` `"44px"`.
  - `sizingDesktop["button-height"]` and `sizingDesktop["input-height"]` `"32px"`.
  - `sizing["pointer-target-min"]` `"32px"` and `sizingDesktop["touch-target-min"]` `"32px"`.
  - `fontFamily.sans` starts with `"Geist"`; `fontFamily.mono` starts with `"Geist Mono"`.
  - In `tokens.test.ts`, set the mirror expectations to the values in the Files list above.
- [ ] **Step 2: Run the tests.** `pnpm --filter @propertypro/tokens test && pnpm test packages/ui/__tests__/tokens/tokens.test.ts`. Expected: those assertions FAIL.
- [ ] **Step 3: Edit `static.ts` to those values.**
  - Leave `xl`/`2xl`/`full` radius, spacing, elevation, motion and focus unchanged.
  - Keep `fontFamily.display` (signup, print, admin still use it).
  - Fix the stale `48px`/`40px` figures in the header comment.
  - Point both Tailwind configs' `borderRadius` at `var(--radius-*)`, adding `xs`, so the value is single-sourced.
- [ ] **Step 4: Regenerate and run the tests.** Run `pnpm -F @propertypro/tokens generate`, then `pnpm --filter @propertypro/tokens test` (includes `sync.test.ts`, which proves the generated files match), then `pnpm guard:token-coverage`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(tokens): Geist radius, 44/32 control sizing, Geist font stacks`

### Task 3: Vendor Geist and switch the web app's fonts

**Files:**
- Create: `apps/web/src/app/fonts/geist-latin-var.woff2`, `geist-mono-latin-var.woff2`, `OFL-Geist.txt`
- Modify: `apps/web/src/app/fonts/README.md` (table row per file: family, axes, sha256, bytes, source URL; same format as the Inter row)
- Modify: `apps/web/src/app/layout.tsx:26-32, 84`
- Modify (D3): `components/dashboard/overview/status-hero.tsx:15`, `components/audit/AuditTrailViewer.tsx:134`, `components/pm/site-editor-v3/settings/SettingsView.tsx:286`, `components/pm/site-editor-v3/EditorTopBar.tsx:216`. Replace `font-display` with `font-semibold tracking-tight` (keep each size class).
- Modify: `DESIGN.md` §Typography (fonts line, size table rows for default-large and standard, Fraunces scope)
- Modify: `apps/web/src/app/(marketing)/layout.tsx` and `marketing-theme.css:49`. Marketing's `--mk-sans` is `var(--font-sans), Inter, …`, so swapping the root font would silently restyle the landing page merged in #1428.
  - The marketing layout loads Inter itself: `localFont`, `src: "../fonts/inter-latin-var.woff2"`, `variable: "--font-marketing-sans"`.
  - `--mk-sans` becomes `var(--font-marketing-sans), Inter, system-ui, sans-serif`.
  - Changing a `var()` line adds no raw value, so the file's frozen baseline counts must not move. `pnpm guard:design-tokens` confirms it.
- Test: `apps/web/__tests__/styles/font-loading.test.ts` (create)

**Interfaces:**
- Consumes: Task 2's font stacks.
- Produces: `--font-sans` = Geist and `--font-mono` = Geist Mono on `<html>` in apps/web. `font-mono` now resolves to a loaded face; today nothing loads a mono font.

- [ ] **Step 1: Write the failing test.** `font-loading.test.ts` reads `layout.tsx` and the four D3 files. It asserts:
  - `layout.tsx` references `./fonts/geist-latin-var.woff2` with `variable: "--font-sans"`, and `./fonts/geist-mono-latin-var.woff2` with `variable: "--font-mono"`.
  - `layout.tsx` no longer references `inter-latin-var.woff2`.
  - `(marketing)/layout.tsx` declares `--font-marketing-sans`, and `marketing-theme.css` contains `--mk-sans:var(--font-marketing-sans)`.
  - None of the four component files contains `font-display`.
  - Each `.woff2` file exists and its sha256 equals the value in the README table.
- [ ] **Step 2: Run it.** `pnpm test apps/web/__tests__/styles/font-loading.test.ts`. Expected: FAIL.
- [ ] **Step 3: Fetch the font files.** Get the `/* latin */` variable instances from `https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900`, using the same procedure as the README's "Refreshing them" section. Record the hashes. Copy the OFL text from the Geist repository.
- [ ] **Step 4: Load the fonts.** In the root layout, add two `localFont` calls (`weight: "100 900"`, `display: "swap"`), keep `fraunces` and drop `inter`. The Inter file stays, because marketing now loads it. Make the marketing edits, the four D3 edits and the DESIGN.md update.
- [ ] **Step 5: Run the test and the build.** Run the test (expected PASS), then `pnpm --filter @propertypro/web build` to confirm the local font loader resolves. Revert-check: point `variable` back to Inter's file and confirm the sha/path assertion goes red.
- [ ] **Step 6: Commit.** `feat(web): Geist + Geist Mono, vendored; Fraunces leaves the authenticated app`

### Task 4: Button, Input, Textarea

**Files:**
- Modify: `packages/ui/src/components/ui/button.tsx:8-31`, `input.tsx:10`, `textarea.tsx:11`
- Modify: `packages/ui/src/tokens/components.ts`. Set `button.height` to `{ sm: 28, md: 32, lg: 40 }` and `input.height` to `{ sm: 32, md: 32, lg: 40 }`. This is the desktop scale; the 44px mobile floor is `interactionSizing.touchTarget.minimum`.
- Modify: the call sites found by Step 5's inventory
- Test: `packages/ui/src/components/ui/__tests__/button.test.tsx`, `packages/ui/src/components/ui/__tests__/input.test.tsx` (create)

**Interfaces:**
- Produces: `buttonVariants` sizes (the `size` prop keys are unchanged, so no call site breaks on type):
  - `sm` = `h-11 md:h-7 px-3 text-xs` (44/28)
  - `default` = `h-11 md:h-8 px-3` (44/32)
  - `lg` = `h-11 md:h-10 px-4` (44/40)
  - `icon` = `h-11 w-11 md:h-8 md:w-8`

- [ ] **Step 1: Write the failing tests.** In `button.test.tsx`:
  - `it.each` over the four sizes asserts `buttonVariants({ size })` contains exactly the classes above.
  - The default, outline, secondary and destructive variants contain no `shadow` class (`/\bshadow(-\w+)?\b/` does not match).
  - `cn(buttonVariants(), "h-9 md:h-9")` contains `md:h-9` and not `md:h-8`. This pins the migration pattern for Review Focus #1.

  In `input.test.tsx`:
  - The rendered `<input>` className contains `h-11`, `md:h-8`, `rounded-sm` and `border-edge-strong`.
  - It contains no `shadow-sm`.
- [ ] **Step 2: Run them.** `pnpm test packages/ui/src/components/ui/__tests__`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Button: drop `shadow`/`shadow-sm` from every variant. `focus-visible:ring-1` stays.
  - Input: the classes above, with `px-3`, `text-base md:text-sm` kept.
  - Textarea: `rounded-sm border-edge-strong` and no shadow.
- [ ] **Step 4: Run them again.** Expected: PASS. Revert-check: put `shadow` back on `default` and confirm only that case goes red.
- [ ] **Step 5: Inventory the height overrides.**
  - Run `grep -rEn 'className="[^"]*\b(md:)?h-(7|8|9|10|11|12)\b' apps/web/src apps/admin/src | grep -i button`, and repeat with `-A3` to catch multi-line `<Button` openings. Measured 2026-11-03: 20 single-line hits.
  - For each override, either delete it so the size prop decides, or add the matching `md:` class so the caller's height holds on desktop.
  - The `h-11 md:h-9` pairs in `dashboard/overview/*` become `size="default"` with no className. Update `apps/web/__tests__/dashboard/overview-components.test.tsx:105-106` and `dashboard-page-composition.test.tsx:247` to assert `md:h-8`. The "View all" link at `:108-109` is not a Button and keeps `min-h-11 md:min-h-9`.
- [ ] **Step 6: Run the full checks.** `pnpm typecheck && pnpm lint && pnpm test`. Expected: green.
- [ ] **Step 7: Commit.** `feat(ui): 44/32 controls, flat buttons, stronger input borders`

### Task 5: Card, KpiCard, MetricStrip

**Files:**
- Modify: `packages/ui/src/components/ui/card.tsx` (Card, CardHeader, CardContent, CardFooter)
- Modify: `packages/ui/src/components/shared/kpi-card.tsx:37, 80` (skeleton + content padding)
- Modify: `packages/ui/src/tokens/components.ts` `card.padding` to `{ sm: space[3], md: space[4], lg: space[5] }` (12/16/20)
- Modify: `apps/web/src/components/dashboard/overview/metric-strip.tsx:7`
- Modify: the 7 call sites with `CardContent|CardHeader className="p-…"` (`grep -rn 'Card\(Content\|Header\) className="p-' apps`). Delete each override where it only restated the old p-6.
- Test: `packages/ui/src/components/ui/__tests__/card.test.tsx` (create), `packages/ui/src/components/shared/__tests__/kpi-card.test.tsx`

**Interfaces:** Produces:
- Card = `rounded-md border border-edge bg-surface-card text-content` (no shadow)
- CardHeader = `flex flex-col gap-1 p-4`
- CardContent = `p-4 pt-0`
- CardFooter = `flex items-center p-4 pt-0`

- [ ] **Step 1: Write the failing tests.**
  - `card.test.tsx` asserts those exact base classes, and that Card has no `shadow`.
  - Extend `kpi-card.test.tsx`: the content wrapper has `p-4` and not `p-6`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** MetricStrip (`tiles` prop) keeps its current column count. Only its gap tightens, `gap-6` → `gap-3`; a column change is a dashboard decision outside this plan. Cards with a hover state keep `hover:shadow` (E1 on hover is still the rule).
- [ ] **Step 4: Run them again,** then `pnpm test apps/web/__tests__/dashboard`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(ui): flat 16px-padded cards`

### Task 6: Table density

**Files:**
- Modify: `apps/web/src/components/ui/table.tsx:132` (TableHead `h-10` → `h-8`) and `:147` (TableCell `py-3` → `py-2`)
- Modify: `packages/ui/src/tokens/components.ts` `table`: `row.height` 52 → `40`, `header.height` 40 → `32`, `row.padding` and `header.padding` → `primitiveSpace[3]`
- Test: `apps/web/__tests__/components/ui/table-density.test.tsx` (create)

**Interfaces:** Produces: a body row of 40px (16px text × 1.5 line height + 2×8px) and a 32px header.

- [ ] **Step 1: Write the failing test.** It renders `<Table><TableHeader><TableRow><TableHead>` and a body cell, then asserts `TableHead` contains `h-8` and `TableCell` contains `py-2`.
- [ ] **Step 2: Run it.** Expected: FAIL. **Step 3:** Implement. **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(web): 40px table rows`

### Task 7: Shell gutter, width, and container-query variants

**Files:**
- Modify: `apps/web/src/components/layout/page-container.tsx`:
  - `PAGE_GUTTER_X = 'px-4 sm:px-6'`
  - root `py-8` → `py-5`
  - `WIDTHS.default` = `max-w-[1600px]`
  - delete `wide` (no `width="wide"` caller exists; confirm with grep)
  - rewrite the docblock numbers
- Modify: `apps/web/tailwind.config.ts` and `apps/admin/tailwind.config.ts` plugins. Add a `.cq` utility (`container-type: inline-size; container-name: cq`) and variants `cq-sm` / `cq-md` / `cq-lg` = `@container cq (min-width: 480px | 720px | 960px)`. Use the same `plugin()` shape as `site-frame`. The name must stay `cq` so these never match the public site's `site` container.
- Modify: `apps/web/src/components/dashboard/overview/attention-queue-list.tsx`:
  - `<ul>` gains `cq`
  - each `<li>` becomes `flex flex-col gap-3 p-3 cq-sm:flex-row cq-sm:items-center cq-sm:justify-between`
  - heights stay on viewport `md:`, because touch size follows the device, not the box
- Modify: `CLAUDE.md` and `.claude/rules/design.md`, page-padding paragraphs (the `px-6 sm:px-8 lg:px-10 py-8`, `max-w-[1400px]` figures)
- Test: `apps/web/__tests__/layout/page-container.test.tsx` (create), `apps/web/__tests__/styles/container-queries.test.ts` (create)

**Interfaces:** Produces: the `cq` + `cq-sm|md|lg:` vocabulary in both apps. A component that uses `cq-*` must sit under a `.cq` element.

- [ ] **Step 1: Write the failing tests.**
  - `page-container.test.tsx` asserts `PAGE_GUTTER_X === 'px-4 sm:px-6'`, and that the rendered root has `py-5` and `max-w-[1600px]`.
  - `container-queries.test.ts` compiles `apps/web/tailwind.config.ts` with postcss, as `site-frame.test.ts` does, and asserts `cq-sm:flex-row` emits `@container cq (min-width: 480px)`.
  - Review Focus #4: every file under `apps/web/src` that contains `cq-` (`/\bcq-(sm|md|lg):/`) must also contain `\bcq\b` in a className, or appear in an explicit allowlist of files rendered inside a `.cq` parent, each with a reason. Model it on `NOT_ROOTS`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run them again,** then `pnpm guard:page-padding && pnpm guard:class-resolution && pnpm test apps/web/__tests__/public-site/site-frame.test.ts`. Expected: all green. Revert-check: remove `cq` from the `<ul>` and confirm the Review Focus #4 assertion goes red.
- [ ] **Step 5: Commit.** `feat(web): 16/24 gutter, fluid 1600 width, container-query variants`

### Task 8: Rules and reference docs

**Files:**
- Modify: `.claude/rules/design.md` §Component Dimensions + §Accessibility:
  - Buttons 28/32/40, 44 below md
  - Inputs 32, 44 below md
  - Radius xs 4 / sm 6 inputs / md 8 cards & buttons / lg 12 modals
  - Table 40/32
  - Touch targets 44 below 768px, 32 at and above
  - Cards flat at rest
- Modify: `DESIGN.md` §Spacing, §Component Dimensions, §Surface & Elevation (cards have no shadow at rest; E2/E3 overlays only)
- Modify: `apps/web/__tests__/components/ui/close-button-hit-area.test.tsx:1-10` docblock (the 36px wording), with the assertions unchanged. Dialog close buttons stay `md:h-9`, which still meets the 32px floor.

- [ ] **Step 1: Make the edits.** Then `grep -rn "36px desktop\|52 (body)\|max-w-\[1400px\]\|10px) cards" DESIGN.md .claude/rules CLAUDE.md`. Expected: no hits.
- [ ] **Step 2: Commit.** `docs(design): Geist density dimensions`

### Task 9: Admin parity (drop if D6 is overruled)

**Files:**
- Modify: `apps/admin/src/styles/globals.css:17` (remove the 18px root)
- Modify: `apps/admin/src/app/layout.tsx` (load Geist from `apps/admin/src/app/fonts/`, vendored by copying Task 3's files and licence; keep Fraunces for `AdminPageHeader`)
- Test: `apps/admin/__tests__/styles/font-loading.test.ts` (create; same assertions as Task 3 against admin paths, minus the D3 files)

- [ ] **Step 1: Write the test** and run it. Expected: FAIL.
- [ ] **Step 2: Implement.** Then `pnpm --filter @propertypro/admin build && pnpm guard:admin-semantic-css`. Expected: green.
- [ ] **Step 3: Commit.** `feat(admin): Geist and browser-default root size`

### Task 10: Visual verification

**Files:**
- Create: `docs/audits/2026-11-03-geist-density-screenshots.md` (before/after table linking the PNGs)

The before shots are taken from `main` before Task 1 merges; the after shots from the branch tip. Use the agent sandbox (`pnpm agent:live:web`, `/dev/agent-login?as=root_sunset`, which pins Sunset Condos on Professional so no page is plan-gated).

- [ ] **Step 1: Capture each page** at 1440, 1024 and 375px wide, in large-text (default) and standard modes:
  - `/dashboard`
  - `/documents`
  - a document detail page
  - `/settings` (a form)
  - `/maintenance` (a table)
  - the public site home
  - the marketing landing page
- [ ] **Step 2: Check each Review Focus line against the shots.**
  - #2: no clipped or overlapping row controls at 375px.
  - #3: no text under 12px in standard mode.
  - #5: settings fields keep a single line at 1024px.
  - The public site and marketing are visually unchanged apart from rem-based text, which should be about 11% smaller; flag anything else.
- [ ] **Step 3: Run axe and the full gates.** `pnpm test apps/web/__tests__/accessibility`, then `pnpm typecheck && pnpm lint && pnpm test`. Expected: green.
- [ ] **Step 4: Commit** the audit note, then open one PR for the branch. Its description carries the before/after table and D1–D6.

# Geist density system: before/after screenshots (2026-11-03)

Task 10 of `docs/superpowers/plans/2026-11-03-geist-density-system.md`. Evidence only: no product
code changed. Five Review Focus risks checked against real pages.

## Method

- **Before** = `a88cdf795` (the branch's merge-base with `main`), a temporary detached worktree
  running `next dev` on :31050. **After** = branch tip `a1d173e59`, on :31040. Both servers pointed
  at the same local agent sandbox (one Supabase stack, seeded demo data), so the data is identical.
- Logged in as `root_sunset` (Sunset Condos, Professional, nothing plan-gated). Headless Chromium
  (Playwright), deviceScaleFactor 1, JPEG q78 for the working set; the committed JPEGs here are
  downscaled/recompressed copies of 13 of them.
- Matrix: 7 pages x 1440 / 1024 / 375 px x large text (default) / standard text
  (`localStorage propertypro.text-size = standard`) = 42 shots per side, 84 in all. Working set and
  per-shot JSON metrics (minimum computed font size of visible text, control bounding boxes,
  overlaps, truncated inputs, horizontal scroll) were kept outside the repo.
- The shell scrolls inside `<main>`, so each shot grows the viewport to the content height
  (capped at 2600 px) instead of using `fullPage`.
- Pages: `/dashboard`, `/documents` (renders `/communities/1/documents`), a document detail
  (`/documents/31` redirects to the library with the inspector open), `/settings`, `/maintenance`
  (redirects to `/communities/1/operations?tab=requests`, so "a table page" is an empty state here;
  the Documents library is the real table), the public site (`/pm/site-preview?communityId=1`) and
  the marketing landing (`/`).
- No `[rate-limit] 429` in either server log; 9 s between authenticated loads.

## Before / after

| Page, width, mode | Before | After | What changed |
|---|---|---|---|
| Dashboard, 1440, large | [before](dashboard-1440-large-before.jpg) | [after](dashboard-1440-large-after.jpg) | Page content 2988 -> 2860 px tall; checklist row actions 27 -> 24 px; 16/24 gutter; Geist |
| Document detail, 1440, large | [before](doc-detail-1440-large-before.jpg) | [after](doc-detail-1440-large-after.jpg) | Library 3510 -> 2936 px; rows and chips tighter (filter chips 41 -> 36 px); list pane wider |
| Settings, 1024, large | [before](settings-1024-large-before.jpg) | [after](settings-1024-large-after.jpg) | 4483 -> 4137 px; inputs 36 -> 32 px; fields stay on one line |
| Documents, 375, large | [before](documents-375-large-before.jpg) | [after](documents-375-large-after.jpg) | 3305 -> 2717 px; record titles show more characters; Button rows 44 px |
| Dashboard, 375, standard | [before](dashboard-375-standard-before.jpg) | [after](dashboard-375-standard-after.jpg) | Smallest text 13.5 -> 12 px; no overlap, no horizontal scroll |
| Maintenance (Operations), 375, large | | [after](maintenance-375-large-after.jpg) | Submit Request 44 px; tab pills 43 -> 40 px |
| Public site, 1440, large | [before](public-site-1440-large-before.jpg) | [after](public-site-1440-large-after.jpg) | Content column 1296 -> 1152 px (rem widths); text 18 -> 16 px; **body font Inter -> Geist** (see below) |
| Marketing landing, 1440, large | not committed | not committed | Pixel-identical: 51 differing pixels in 3.7 M, all in one animated dot. Document height 8202 px both. |

## Review Focus results

**#2, controls in dense mobile rows at 375 px: no clipping, no overlap, no horizontal scroll.**
Measured on the dashboard, Documents, document detail, settings and Operations pages in both text
modes, after, with `elementFromPoint` at each visible control's centre (closed drawers and
`aria-hidden` subtrees excluded): 0 covered controls, 0 overlapping control pairs, no page
scrolled sideways. Controls that sit past the right edge are the Documents queue tabs and the
Settings section menu, both intentional sideways-scrolling rows (same before). Screenshots agree.
Caveat, not a regression: raw `<button>`s that are not the shared Button stay under 44 px at 375 px,
and shrank one step with the 16 px root: dashboard checklist actions (Upload, Add, Create,
Customize) 27 -> 24 px, Documents record-title buttons 27 -> 24 px, Documents filter chips
41 -> 36 px, Operations tabs 43 -> 40 px. Settings native selects stay 40 px (both). The shared
Button, Input and primary actions are 44 px (44 px controls on the dashboard: 6 -> 13).

**#3, standard mode, nothing under 12 px: pass, with one pre-existing exception.** At 375 px the
smallest visible text is 12.0 px in standard mode (13.5 before) and 14.0 px in large mode.
At 1024 and 1440 px the only text under 12 px on any page is the plan chip in the top bar
("Professional", `packages/ui/src/components/PlanBadge.tsx:52`, `text-[10px]`), 10 px before and
after, in both modes. Everything else measured was 12 px or larger.

**#5, forms keep their fields on one line: pass.** Settings at 1024 and 1440 px, large and standard:
0 truncated inputs, the City / State / ZIP row stays on one line, and the Community profile inputs
are 934 px wide at 1024 (902 before) and 726 px at 1440 (822 before). No label or input wrapped. At 375 px every input is full width (301 px).

**Public site and marketing.** Marketing: unchanged (see the pixel diff above; it sets its own
Inter/px sizes). Public site: text is 16 px instead of 18 px and the `max-w-6xl` column is 1152 px
instead of 1296 px, as expected. Not expected: its body text (996 characters measured) now renders
in **Geist** instead of Inter. Headings stay Playfair Display.

## Defects and observations (not fixed here)

1. **Public association site body font changed Inter -> Geist.** (Re-measured after fix rounds 1 and 2: see the section below; body is Inter again at e82439ff2.) `/pm/site-preview` at all three
   widths. The site inherits the root layout's body font. Marketing keeps Inter because its layout
   loads it. The brief expected the public site to differ only in rem-based sizes.
2. **Plan chip is 10 px** (`PlanBadge.tsx:52`, arbitrary `text-[10px]`) on every authenticated page
   at >= 1024 px, in both modes. Pre-existing; fails the "no text under 12 px" line only through
   this one element.
3. **Sub-44 px raw buttons at 375 px**, listed under #2. Pre-existing, about 3 px smaller now.
4. **Native `<select>`s are 40 px** in Settings next to 32 px inputs at 1024/1440 (and 40 px at
   375, under 44). Pre-existing; selects are not among the primitives the plan resized.
5. **Documents state pill wraps to 3-4 lines** ("Owed to public site") in the narrow State column at
   1440 with the inspector open. Same before; cosmetic.

## Gates (branch tip `a1d173e59`)

- `pnpm test apps/web/__tests__/accessibility`: 7 files, 91 tests passed.
- `pnpm typecheck`, run as its two halves so the turbo cache could be forced: `turbo run typecheck --force` (15/15 tasks, 0 cached) then `tsc -p scripts/tsconfig.json`; both exit 0.
- `pnpm lint`: ESLint plus all 34 guards passed, exit 0.
- `pnpm test`: 1390 files passed, 1 skipped; 18679 tests passed, 33 skipped; exit 0.

## Public-site font, re-measured after the fixes

Same sandbox, restarted on each fix commit. Rendered face from Chrome's own record
(`CSS.getPlatformFontsForNode`) plus a text-node census, not the computed string.

| Surface (1440 / 1024 / 375 unless noted) | Before (a88cdf795) | After a1d173e59 | After e1e11e459 | After e82439ff2 |
|---|---|---|---|---|
| Sunset Condos site, body (theme body `Source Sans 3`) | Inter | Geist | Geist | **Inter** (996 chars, all three widths) |
| Sunset Condos site, h1 | Playfair Display | Playfair Display | Playfair Display | Playfair Display |
| Sunset Condos site, first h2 | Inter | Geist | Geist | Inter (census 199 Playfair / 996 Inter chars, identical to before) |
| Inter-themed fixture community, preview, 1440 | not measured | Geist | Inter | **Inter**, headings Inter SemiBold (269 chars) |
| Editor canvas, Sunset Condos, 1440 | not measured | not measured | Geist | **Inter** body, h1 Playfair Display |
| Editor canvas, Inter-themed fixture, 1440 | not measured | not measured | Inter | **Inter** throughout |
| Marketing `/` | Inter | Inter | Inter | Inter (5528 chars; headings Fraunces) |
| Authenticated dashboard | Inter | Geist | Geist | Geist (1794 chars; only the screen-reader-only h1 is Fraunces) |

Round 2 puts Inter's `className` (a `font-family`) on every `.site-frame` element as well as its
variable, so text that inherits instead of using `.font-body` gets Inter. The unquoted
`--theme-font-body:Source Sans 3` is still invalid (`3` is not an identifier), so `.font-body` is
still dropped for that community and its chosen body font, Source Sans 3, is still never applied;
the site now inherits Inter from the frame, as it did before Geist. Playfair Display, Lora and
Nunito Sans apply because they are plain identifiers. Quoting family names in `toCssVars` would
make Source Sans 3 apply; not done here (`packages/theme` unchanged).

## Follow-ups (branch `claude/design-system-followups`, 2026-11-03)

Measured in the agent sandbox (dev server) with headless Chromium, same method as above.

**Theme fonts.** `toCssVars` now quotes family names. Sunset Condos site preview at 1440:
`--theme-font-body` is `"Source Sans 3"`, a paragraph renders **Source Sans 3**, the h1 Playfair
Display. Only "Source Sans 3" and "Source Serif 4" of the 25 allowlisted families were affected;
in production 1 of 5 live communities used one, a demo.

**Touch targets at 375px** (`cam`, Sunset Condos, both text modes). Every audited control now
measures 44px tall: dashboard checklist actions, Documents title buttons, header actions and
category chips, Operations tab pills, Board section links. The WCAG 2.5.8 probe
(`apps/web/e2e/helpers/target-size.ts`) finds **no** target under 24px without spacing on any of
dashboard (22 controls scanned), documents (46), operations (6), board (3) and settings (37), nor
on the six `responsive-overflow` pages. Census of the long tail: 352 raw `<button>`s in
`apps/web/src`, 31 floored at 44px; settings still has 12 controls between 24 and 44px. That tail
is a recorded `ponytail:` in `.claude/rules/design.md`.

**PlanBadge.** 14px with large text, 12px standard (was 10px in both); 20px tall; the top bar does
not overflow at 1024 or 1440.

**Font preloads** (`pnpm perf:check`, production build). Marketing `/`: 4 fonts, 221.2 KiB (was 5,
244 KiB; Geist Mono no longer preloads). App routes: 2 fonts, 94.4 KiB. Site editor: 3, 141.6 KiB.
Ceiling 250 KiB. Geist still preloads on marketing (29 KB unused); recorded as a `ponytail:` in
`scripts/perf-check.ts`.

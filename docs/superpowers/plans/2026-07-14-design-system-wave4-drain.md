# Design System Wave 4 — Baseline Drain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drain the design-token baseline for non-mobile `apps/web` to zero drainable violations — every remaining literal is either migrated to semantic tokens or explicitly exempted with a reason — plus the spinner→Skeleton triage and the 2-page PageHeader gap.

**Architecture:** The guard report (`pnpm exec tsx scripts/verify-design-tokens.ts --report`) is the authoritative worklist. Work splits into an exemption pass (intentional literals get `design-tokens:exempt` comments or documented-frozen status), an esign palette consolidation, four feature-area drain batches (semantic-token substitutions per the mapping table), a spinner triage, and the PageHeader fix. Every task ends by regenerating the shrunken baseline (`--write-baseline`) so the diff shows the ratchet tightening.

**Tech Stack:** Next.js 15 / React 19, Tailwind semantic classes (mapped to CSS vars), the Wave 1 guard (`scripts/verify-design-tokens.ts` + `scripts/design-token-baseline.json`).

**Spec:** `docs/superpowers/specs/2026-07-13-design-system-standardization-design.md` §5 Wave 4.

---

## Ground truth (measured 2026-07-14 on the Wave 3 branch)

Non-mobile `apps/web`: **44 files, 312 violations** (raw-hex 152, raw-palette 109, raw-color-fn 33, arbitrary-font 12, arbitrary-color 6, arbitrary-space 0). This is much smaller than the spec's audit-time estimate (~414 raw-palette alone) — earlier waves and unrelated merges already drained a lot. The PageHeader gap is **2 pages**, not 96 (the audit counted `<h1>`s inside pages that already render PageHeader). Hand-rolled spinners: **40 files** (many legitimate).

**Scope guard (unchanged from spec):** `apps/admin`, `apps/web/src/components/mobile/`, `apps/web/src/app/mobile/`, and `apps/web/src/styles/mobile.css` stay frozen in the baseline. Do not touch them.

## The semantic mapping table (used by every drain task)

Verify a class exists in `apps/web/tailwind.config.ts` before first use; these are the established mappings:

| Raw | Semantic |
|---|---|
| `text-gray-900` / `text-gray-800` | `text-content` |
| `text-gray-600` / `text-gray-700` | `text-content-secondary` |
| `text-gray-500` | `text-content-tertiary` |
| `text-gray-400` | `text-content-disabled` (or `-placeholder` for inputs) |
| `text-white` on colored fill | `text-content-inverse` |
| `bg-white` | `bg-surface-card` |
| `bg-gray-50` | `bg-surface-page` (page bg) or `bg-surface-hover` (hover) |
| `bg-gray-100` | `bg-surface-muted` |
| `border-gray-200` | `border-edge` |
| `border-gray-100` | `border-edge-subtle` |
| `border-gray-300` | `border-edge-strong` |
| `text-blue-600` (link/action) | `text-content-link` (or `text-interactive`) |
| `bg-blue-600` + `hover:bg-blue-700` | `bg-interactive` + `hover:bg-interactive-hover` |
| `bg-blue-50` / `bg-blue-100` | `bg-interactive-subtle` / `bg-interactive-muted` |
| red-* (error/danger) | `text-status-danger`, `bg-status-danger-bg`, `border-status-danger-border` |
| green-* (success) | `status-success` family |
| amber-*/yellow-* (warning) | `status-warning` family |
| informational blue-* badges/banners | `status-info` family |
| `text-[11px]` | `text-xs` |
| `text-[13px]` / `text-[14px]` | `text-sm` |
| `text-[15px]` | `text-sm` or `text-base` (judgment: body text → base) |
| inline `style={{ color: '#4b5563' }}` etc. | `var(--text-secondary)` etc., or a Tailwind class if the element takes className |

Rules for every drain task: keep the visual intent (a gray-500 icon should still read tertiary); when the literal encodes a STATUS, use the status family, never interactive blue; never introduce a new raw class; after each file run the guard — its per-file count must hit 0 or the file must be in the task's exempt list.

## Exemption policy (Task 1 formalizes this)

`// design-tokens:exempt — <reason>` per line for TS/TSX. Whole files that are *intentionally* literal-heavy and CSS-based (no comment mechanism per declaration is practical) stay **frozen in the baseline** and are listed in `.claude/rules/design.md` as intentional. The two buckets:

- **Exempt-annotate (TS/TSX, few lines):** chart internals (`components/ui/chart.tsx`, `pm/reports/chart-configs.ts` — charts need literal color values), canvas internals (`esign/signature-capture.tsx`), branding color-picker features whose *product feature is choosing hex colors* (`pm/BrandingForm.tsx`, `pm/BrandingPreview.tsx`, `pm/site-editor/CustomStylingForm.tsx` — verify each hit is a picker default, not UI chrome), test fixtures asserting hex round-trips (`hooks/__tests__/use-branding-form.test.ts`, `use-pm-branding.test.tsx`), self-contained error pages that render without the token stylesheet (`app/global-error.tsx` — it replaces the root layout, so `var(--*)` may not exist; its inline hex is load-bearing).
- **Frozen-documented (bulk CSS):** `app/(marketing)/marketing-theme.css` (62 — deliberate marketing palette), `lib/documents/render-authored-html.ts` (23 — authored-document print/export styling, email-template class), `styles/mobile.css` (8 — mobile scope).

---

### Task 1: Exemption pass — annotate intentional literals, document frozen files

**Files:**
- Modify: `apps/web/src/components/ui/chart.tsx`, `apps/web/src/components/pm/reports/chart-configs.ts`, `apps/web/src/components/esign/signature-capture.tsx`, `apps/web/src/components/pm/BrandingForm.tsx`, `apps/web/src/components/pm/BrandingPreview.tsx`, `apps/web/src/components/pm/site-editor/CustomStylingForm.tsx`, `apps/web/src/app/global-error.tsx`, `apps/web/src/hooks/__tests__/use-branding-form.test.ts`, `apps/web/src/hooks/__tests__/use-pm-branding.test.tsx`, `apps/web/src/app/demo/[slug]/page.tsx` (1 hex — inspect: if it's a branding default, exempt; if UI chrome, move to Task 6)
- Modify: `scripts/design-token-baseline.json` (regenerated), `.claude/rules/design.md`

- [ ] **Step 1: Inspect each file's hits.** Run `pnpm exec tsx scripts/verify-design-tokens.ts --report | grep <file>` then read each flagged line. For every hit that matches the exemption policy, append the comment on that line, with a specific reason:

```ts
// chart-configs.ts — example
overdue: "hsl(0 72% 42%)", // design-tokens:exempt — chart series palette; charts render literal colors
```

```tsx
// global-error.tsx — example
<body style={{ color: '#4b5563' /* design-tokens:exempt — global-error replaces root layout; tokens.css is not loaded */ }}>
```

For CSS-in-string hits inside TS (render-authored-html.ts is frozen, skip), and for any hit that is actually UI chrome pretending to be intentional (e.g. a gray border in BrandingForm's own layout), do NOT exempt — leave it for the drain batches and note it in your report.

- [ ] **Step 2: Verify counts.** `pnpm exec tsx scripts/verify-design-tokens.ts --report | grep -E "chart|signature|Branding|global-error|use-branding|use-pm-branding|CustomStyling"` → every exempt-annotated file now reports 0 (or only the hits you deliberately left for draining).

- [ ] **Step 3: Regenerate baseline + document.**

Run: `pnpm exec tsx scripts/verify-design-tokens.ts --write-baseline && pnpm guard:design-tokens`
Expected: OK; baseline shrinks (~50 fewer violations).

Add to `.claude/rules/design.md`'s Token enforcement section:

```markdown
- Intentionally-literal files kept frozen in the baseline (do not drain):
  `apps/web/src/app/(marketing)/marketing-theme.css` (marketing palette),
  `apps/web/src/lib/documents/render-authored-html.ts` (authored-doc export styling),
  `apps/web/src/styles/mobile.css` + `components/mobile/` + `app/mobile/` + `apps/admin/`
  (out of standardization scope until their own migration programs).
```

- [ ] **Step 4: Verify + commit**

Run: `pnpm --filter web typecheck && pnpm guard:design-tokens`

```bash
git add -A apps/web/src scripts/design-token-baseline.json .claude/rules/design.md
git commit -m "chore(design-tokens): exempt intentional literals (charts/canvas/branding/tests/global-error)"
```

### Task 2: Esign field-palette consolidation (kills the duplicated 8-hex arrays)

**Files:**
- Create: `apps/web/src/components/esign/esign-field-colors.ts`
- Modify: `apps/web/src/app/(authenticated)/esign/templates/new/template-builder-client.tsx` (8 hex), `apps/web/src/app/(authenticated)/esign/templates/[id]/template-detail-client.tsx` (8 hex — the same colors copy-pasted, different casing), `apps/web/src/components/esign/field-palette.tsx` (1 hex), `apps/web/src/components/esign/field-overlay.tsx` (1 hex)

- [ ] **Step 1: Read all four files** and inventory the color arrays (the two template clients each hard-code the same 8 signer/field colors; field-palette/field-overlay each carry one more literal). These colors annotate PDF fields — they must stay literal hex (rendered into PDF coordinates/overlays), so the fix is ONE exempted source of truth, not tokenization.

- [ ] **Step 2: Create the module** with the exact colors currently used (transcribe from `template-builder-client.tsx:63-70`; normalize casing to lowercase):

```ts
/**
 * E-sign field/signer annotation colors — the single source for the colors
 * painted onto PDF field overlays and signer chips. These are rendered into
 * PDF-coordinate overlays, so they are literal by design.
 */
export const ESIGN_FIELD_COLORS = [
  '#2563eb', // design-tokens:exempt — PDF field-overlay palette (single source)
  // … transcribe the remaining 7 entries verbatim, one per line, each with the exempt comment
] as const;

export type EsignFieldColor = (typeof ESIGN_FIELD_COLORS)[number];
```

- [ ] **Step 3: Replace both inline arrays** with `import { ESIGN_FIELD_COLORS } from '@/components/esign/esign-field-colors'` and migrate the two stray literals in field-palette/field-overlay to reference the module (or exempt-annotate if they're genuinely distinct, e.g. an overlay alpha fill — report which).

- [ ] **Step 4: Verify + commit**

Run: `pnpm --filter web typecheck && cd apps/web && pnpm exec vitest run __tests__/esign && cd ../.. && pnpm exec tsx scripts/verify-design-tokens.ts --write-baseline && pnpm guard:design-tokens`
Expected: esign template clients report 0; tests green.

```bash
git add -A apps/web/src scripts/design-token-baseline.json
git commit -m "refactor(esign): single exempted field-color palette; kills duplicated hex arrays"
```

### Task 3: Drain batch A — settings + support + select-community (~50 violations)

**Files:**
- Modify: `apps/web/src/app/(authenticated)/settings/page.tsx` (raw-palette:17), `apps/web/src/components/settings/SupportAccessSettings.tsx` (raw-palette:21), `apps/web/src/components/support/SupportBanner.tsx` (raw-palette:6), `apps/web/src/app/(authenticated)/select-community/page.tsx` (raw-palette:6)

- [ ] **Step 1:** For each file, list its flagged lines (`grep -nE "(bg|text|border|ring|divide|placeholder)-(gray|blue|red|green|amber|yellow|slate|zinc)-[0-9]+" <file>`), apply the mapping table. Status-colored elements (e.g. a red "access expires" warning in SupportAccessSettings) use the status family.
- [ ] **Step 2:** Per file: `pnpm exec tsx scripts/verify-design-tokens.ts --report | grep <file>` → no output.
- [ ] **Step 3:** Verify the pages render: `pnpm --filter web typecheck`; dev-server spot-check `/settings` and `/select-community` via `/dev/agent-login?as=founding_admin` (colors read the same: secondary text still muted, warnings still amber/red).
- [ ] **Step 4:** Run any tests covering these files (`cd apps/web && pnpm exec vitest run __tests__/settings __tests__/support 2>/dev/null` — adjust to what exists; update class assertions if any test pins raw classes, and report).
- [ ] **Step 5: Baseline + commit**

```bash
pnpm exec tsx scripts/verify-design-tokens.ts --write-baseline && pnpm guard:design-tokens
git add -A apps/web scripts/design-token-baseline.json
git commit -m "refactor(web): drain raw palette classes — settings/support/select-community"
```

### Task 4: Drain batch B — command palette, layout, notifications, shared (~24)

**Files:**
- Modify: `apps/web/src/components/command-palette/CommandItem.tsx` (raw-palette:14, arbitrary-font:1), `apps/web/src/components/command-palette/CommandInput.tsx` (arbitrary-font:1), `apps/web/src/components/layout/command-palette.tsx` (arbitrary-font:1), `apps/web/src/components/layout/app-sidebar.tsx` (arbitrary-font:1), `apps/web/src/components/notifications/cross-community-dropdown.tsx` (arbitrary-font:2), `apps/web/src/components/notifications/notification-bell.tsx` (arbitrary-font:1), `apps/web/src/components/shared/checklist-stepper.tsx` (arbitrary-font:1), `apps/web/src/components/shared/quick-filter-tabs.tsx` (arbitrary-font:1), `apps/web/src/app/layout.tsx` (raw-palette:2)

- [ ] **Step 1:** Same mapping-table procedure. The arbitrary fonts here are `text-[13px]`/`text-[11px]`-class one-offs → `text-sm`/`text-xs`. CommandItem's gray palette → content/surface/edge semantics; keyboard-shortcut chips typically `bg-surface-muted text-content-tertiary border-edge`.
- [ ] **Step 2:** Per-file guard grep → clean. Typecheck. Dev-server spot-check: open the command palette (⌘K) and the notification dropdown; text sizes must not visibly jump (13px→14px is accepted, 13px→12px is not — choose per element and note choices).
- [ ] **Step 3: Baseline + commit** (same commands as Task 3, message `refactor(web): drain raw palette/arbitrary fonts — command palette, layout, notifications`)

### Task 5: Drain batch C — announcements, help, onboarding (~27)

**Files:**
- Modify: `apps/web/src/components/announcements/announcement-feed.tsx` (raw-palette:11), `apps/web/src/components/announcements/announcement-toolbar.tsx` (raw-palette:5), `apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx` (raw-palette:3), `apps/web/src/app/(authenticated)/help/[category]/page.tsx` (arbitrary-font:1), `apps/web/src/components/help/mdx-components.tsx` (raw-palette:3), `apps/web/src/components/onboarding/welcome-snapshot-cards.tsx` (raw-palette:4)

- [ ] **Step 1:** Mapping-table procedure. Watch: announcement pinned/urgent styling is STATUS (warning/danger family), not decoration. mdx-components styles rendered help articles — check prose colors keep contrast (content-secondary for body, content for headings).
- [ ] **Step 2:** Per-file guard grep → clean; typecheck; spot-check `/announcements` and a help article page.
- [ ] **Step 3:** Baseline + commit (`refactor(web): drain raw palette classes — announcements, help, onboarding`).

### Task 6: Drain batch D — billing, demo, marketing components, misc (~35)

**Files:**
- Modify: `apps/web/src/components/billing/feature-hero.tsx` (raw-hex:6 + arbitrary-color:6 — the same 6 hex inside `from-[#…]` gradient stops; map to the nearest primitive vars: `from-[var(--blue-600)]` style, or semantic where one fits), `apps/web/src/components/demo/DemoTrialBanner.tsx` (raw-palette:12), `apps/web/src/components/demo/DemoBanner.tsx` (1), `apps/web/src/components/marketing/footer.tsx` (raw-hex:1), `apps/web/src/components/marketing/portfolio-card.tsx` (raw-hex:4), `apps/web/src/components/finance/payment-dialog.tsx` (raw-hex:1), `apps/web/src/app/dev/site-preview/page.tsx` (raw-palette:4), `apps/web/src/components/ErrorBoundary.tsx` (raw-hex:3 — unlike global-error, this renders INSIDE the app where tokens.css is loaded → drain to `var(--*)`), `apps/web/src/app/demo/[slug]/page.tsx` (raw-hex:1, if Task 1 classified it as chrome)
- [ ] **Step 1:** Mapping-table procedure; `var(--…)` inside arbitrary values is allowed (`bg-[var(--surface-card)]` pattern is established). Marketing components inside apps/web share the app tokens — the frozen file is only marketing-theme.css.
- [ ] **Step 2:** Per-file guard grep → clean; typecheck; spot-check `/dashboard` (DemoTrialBanner), billing settings (feature-hero), and throw a test error to see ErrorBoundary if practical (or rely on its unit test).
- [ ] **Step 3:** Baseline + commit (`refactor(web): drain raw colors — billing, demo, marketing components, error boundary`).

### Task 7: Spinner triage — hand-rolled `animate-spin` → Skeleton / Button loading (40 files)

**Files:** run the inventory fresh: `grep -rln "animate-spin" apps/web/src --include="*.tsx" | grep -v "components/mobile\|components/ui/"`

- [ ] **Step 1: Triage every file into three buckets** (record the classification in your report):
  1. **Section/page loading state** (a lone centered spinner where content will appear) → replace with `Skeleton` blocks matching the content's shape (import from `@/components/ui/skeleton`; existing usage examples: `grep -rln "Skeleton" apps/web/src | head`). Follow the four-states rule (loading/empty/error/success).
  2. **In-button busy state** (spinner inside a `<Button>` next to a label) → replace with the Button `loading` prop (Task 6 of the Waves 0–2 plan added it).
  3. **Genuine inline busy indicator** (e.g. a processing status icon, a spinner in a dropdown item, esign's `Loader2` status icon) → KEEP; no change.
- [ ] **Step 2:** Apply buckets 1–2. One commit per ~8-file chunk to keep diffs reviewable:

```bash
git add -A apps/web/src && git commit -m "refactor(web): spinner triage chunk <n> — Skeleton for section loading, Button loading for busy buttons"
```

- [ ] **Step 3:** After all chunks: typecheck, run the web unit suite (`cd apps/web && pnpm exec vitest run` — the 3 DATABASE_URL collection failures are pre-existing), spot-check two converted pages with throttled network if practical.

### Task 8: PageHeader gap — 2 pages

**Files:**
- Modify: `apps/web/src/app/(authenticated)/announcements/page.tsx`, `apps/web/src/app/(authenticated)/communities/[id]/documents/author/[draftId]/page.tsx`

- [ ] **Step 1:** Read both pages + `apps/web/src/components/shared/page-header.tsx` + two existing consumers for the pattern. Convert each hand-rolled `<h1>` header block to `<PageHeader breadcrumb={<Breadcrumbs items={[…]} currentLabel="…"/>} …>` following `.claude/rules/design.md`'s breadcrumb rules (parent labels match nav-config; `breadcrumb=` before JSX-valued props; nested `/communities/[id]/…` hrefs must NOT append `?communityId=`; the breadcrumb becomes the only back affordance — remove any existing back link).
- [ ] **Step 2:** Run `pnpm guard:breadcrumbs` → passes (the author page is in the guard's glob; announcements is a list page — adding PageHeader must not break the guard either way).
- [ ] **Step 3:** Typecheck, spot-check both pages, commit: `feat(web): PageHeader + breadcrumbs on announcements and document-author pages`.

### Task 9: Final verification + PR

- [ ] **Step 1:** `pnpm exec tsx scripts/verify-design-tokens.ts --report | grep "^apps/web" | grep -v "components/mobile\|app/mobile"` → ONLY the frozen-documented files remain (marketing-theme.css, render-authored-html.ts, styles/mobile.css). Anything else = missed drain; fix before proceeding.
- [ ] **Step 2:** Full gate: `pnpm exec turbo run typecheck --force && pnpm lint && pnpm test && scripts/with-env-local.sh pnpm build` (test: the 3 DATABASE_URL collection failures are local-only; verify CI-parity by letting the PR run).
- [ ] **Step 3:** Screenshot spot-checks: `/settings`, command palette open, `/announcements`, a help article, billing feature-hero, one Skeleton-converted loading state.
- [ ] **Step 4:** Update the memory/status line in `.claude/rules/design.md` if Task 1's note needs amending, commit any baseline slack tightening, push branch `claude/design-system-wave4-drain`, open PR titled `feat(design-system): Wave 4 — baseline drain (semantic tokens everywhere drainable)` with before/after violation counts in the body.

---

## Out of scope

- `apps/admin`, all mobile surfaces (frozen; future programs).
- The frozen-documented CSS files (intentional literals).
- Any Wave 3 visual re-tuning (shipped separately).

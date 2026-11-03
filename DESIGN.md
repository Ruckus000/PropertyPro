# PropertyPro Design System

## Philosophy

PropertyPro is a **production compliance system**, not a marketing site. Every visual decision serves readability under deadline pressure, clear hierarchy without noise, and predictable interaction behavior.

**Dual audience:**
- **HOA board members** — tablet-first, readability-first typography, larger touch targets, straightforward status communication
- **Property managers** — desktop-heavy, denser scanning patterns, fast keyboard-accessible navigation, high information throughput

**Component architecture follows shadcn/ui principles:**
- **Ownership model** — components live in the project as source code, not npm dependencies. You own it, you customize it.
- **Two-layer separation** — behavior (Radix UI primitives) is decoupled from style (Tailwind CSS + CVA variants)
- **Composable styling** — `cn()` utility (clsx + tailwind-merge) for class composition. CVA for variant management.

Source: `docs/design-system/README.md`, `docs/design-system/DESIGN_LAWS.md`

---

## Token Architecture

Three-tier system. **Never use primitive tokens directly** — always go through semantic or component layers.

Tokens are DEFINED in `packages/tokens` (`src/primitives.ts` / `src/semantic.ts` /
`src/static.ts`) and GENERATED into `packages/ui/src/styles/tokens.css`. That
CSS file is never hand-edited — a sync test
(`packages/tokens/__tests__/sync.test.ts`) and `pnpm guard:token-freshness`
both fail the build if it drifts from source. Component-specific dimension
contracts live in `packages/ui/src/tokens/components.ts`.

```
Primitive (raw scales)     →  Semantic (purpose-driven)                →  Component (specific contracts)
packages/tokens/src/          generated packages/ui/src/styles/tokens.css   packages/ui/src/tokens/components.ts
```

### Key Semantic Tokens

| Category | Token | Purpose |
|----------|-------|---------|
| Text | `--text-primary` | Body text, headings |
| Text | `--text-secondary` | Supporting text, descriptions |
| Text | `--text-tertiary` | Metadata, timestamps |
| Text | `--text-disabled` | Disabled controls |
| Surface | `--surface-page` | Page background — `var(--sand-50)`, #FBF7F1 |
| Surface | `--surface-card` | Card/panel background — `var(--sand-0)`, #FFFEFC |
| Surface | `--surface-muted` | Subdued sections — `var(--sand-100)`, #F6EFE6 |
| Border | `--border-default` | Card boundaries, dividers |
| Border | `--border-subtle` | Light separators |
| Border | `--border-strong` | Emphasis borders |
| Interactive | `--interactive-primary` | Primary actions (theme-overridable) |
| Interactive | `--interactive-primary-hover` | Primary hover state |
| Status | `--status-success-*` / `--status-danger-*` / `--status-warning-*` | fg/bg/border per status |
| Accent | `--status-premium-*` | "Florida Modern" gold — Professional-tier / premium markers (see `PlanBadge`). Not a status variant (no icon); consumed via `bg-status-premium-subtle` / `text-status-premium` (or `var()` refs in shared UI). |

The neutral story is two scales, not one: `--gray-*` for text and borders, and the warm `sand` ramp for surfaces (`packages/tokens/src/primitives.ts`, landed 2026-07-15). `--surface-page` resolves to `var(--sand-50)`.

> **`packages/ui/src/styles/tokens.css` is GENERATED from `packages/tokens/src/` and is the authority.** A table here restates a generated file and will drift from it; this one did, for about eight weeks, naming a `--surface-page-warm` that exists nowhere in the codebase. Read the token values out of `tokens.css`; use this table for the vocabulary and the intent.

### Spacing

4px base unit grid. Use **only** token values.

- **Page frame** (Geist density, adopted 2026-11-03): `PageContainer` owns the gutter — `px-4 sm:px-6` (16px under 640px, 24px from there up), `py-5` (20px), fluid up to `max-w-[1600px]`. Macro spacing between sections stays at the token scale below.
- **Micro** (component internals): `inline` (horizontal gaps 4–24px), `stack` (vertical gaps 8–32px), `inset` (padding 8–24px)
- **Macro** (layout composition): `section` (24–64px), `page` (48–80px)
- Macro spacing is constant across viewports. Only micro spacing adapts by breakpoint.
- **Container queries.** Components that must lay out by the width of their own box rather than the window's (the sidebar and top nav change how much of the viewport a page gets) use `cq` plus `cq-sm` / `cq-md` / `cq-lg:`, which apply from 480 / 720 / 960px of the nearest `.cq` ancestor (a container named `cq`; defined in `apps/web/tailwind.config.ts`). Touch heights stay on the viewport `md:` breakpoint.

### Token Enforcement

`pnpm guard:design-tokens` bans raw hex, raw Tailwind palette classes
(`bg-blue-500`), arbitrary colors (`bg-[#…]`), functional color literals
(`rgba(…)`, `hsl(…)`, `oklch(…)`), arbitrary font sizes (`text-[13px]`), and
arbitrary pixel spacing (`p-[13px]`) in `apps/*/src`. Existing violations are
frozen in `scripts/design-token-baseline.json` on a shrink-only, per-file
ceiling — new files must be clean, and baselined files can't exceed their
frozen count. Escape hatch: a `// design-tokens:exempt — <reason>` comment on
the offending line (email-template hex, chart/canvas internals).

---

## Typography

**Fonts:** Geist (sans-serif, body/data/headings — `--font-sans`) and Geist Mono (monospace — `--font-mono`), both vendored in `apps/web/src/app/fonts/` and loaded with `next/font/local`. `apps/admin` loads the same two faces from byte-identical copies in `apps/admin/src/app/fonts/` (as `--font-sans` / `--font-mono`) and, like web, sets no root font size. Fraunces (display serif — `--font-display`) was removed from four authenticated components, which moved to Geist `font-semibold tracking-tight`: the dashboard status headline, the audit trail scope label, the site-editor title bar and the site settings heading. Fraunces is kept for signup (`front-porch-shell.tsx`), the printable audit record, the marketing landing page and `apps/admin`'s `AdminPageHeader`. It also still reaches any standalone visible `<h1>` in web through the global `h1` rule in `apps/web/src/app/globals.css` (for example payments/success, select-community, the auth pages, help pages and the error/not-found pages) — see the page-titles note below. The marketing page keeps Inter, loaded by its own layout as `--font-marketing-sans`, so the app's sans face cannot restyle it.

> **Page titles are not painted — in `apps/web`.** Per the PropertyPro design prototype ("the rail already says which page you are on"), `PageHeader` renders its `h1` visually hidden and does not paint `description`; the header is a toolbar. The `h1` still exists for the breadcrumb leaf and assistive tech. Consequence, accepted 2026-09-02: a standalone visible `h1` in web still picks up Fraunces from the global `h1` rule in `globals.css`, until it migrates onto `PageHeader` or opts out with `font-sans`.
>
> **`apps/admin` made the opposite decision, on purpose.** The console has no breadcrumb trail, so a screen's `h1` is the only thing that names it: `apps/admin/src/components/shell/AdminPageHeader.tsx` paints a visible Fraunces `h1` (`font-display text-2xl md:text-3xl`) plus an optional `description`, `eyebrow`, `backHref` and `actions`. Do not reconcile the two components or mimic one in the other app — they answer different questions. (`guard:page-header` polices only web's `(authenticated)/**`, so nothing stops admin painting its titles.)

| Token | Size | Usage |
|-------|------|-------|
| `xs` | 12px | Metadata labels only — never primary content |
| `sm` | 14px | Captions, helper text |
| `base` | 16px | Body text (minimum for readable content) |
| `lg` | 18px | Emphasized body, subheadings |
| `xl` | 20px | Section headings |
| `2xl` | 24px | Page headings |
| `3xl` | 30px | Hero/display text |

Those are the standard-mode token values. Large text is on by default and the root font size is the browser default (no 18px override), so the sizes the default experience renders are one step up:

| Token | Default (large text) | Standard |
|-------|----------------------|----------|
| `xs` | 14px | 12px |
| `sm` | 16px | 14px |
| `base` | 18px | 16px |
| `lg` | 20px | 18px |
| `xl` | 24px | 20px |
| `2xl` | 28px | 24px |
| `3xl` | 34px | 30px |

Interface text (`text-sm`) is 16px in the default experience and prose (`text-base`) is 18px; standard mode gives 14px and 16px. Values come from the `.large-text` block in `packages/ui/src/styles/tokens.css`.

**Rules:** Body text floor is 16px in both modes: `sm` and up with large text (the default), `base` and up in standard mode. Compliance document content uses `base` or `lg` minimum. Caption (`xs`) is metadata-only, never primary content. Large text is the `.large-text` class the root layout puts on `<html>`; choosing standard text size removes it before first paint (`LARGE_TEXT_INIT_SCRIPT`).

---

## Component System

Four layers, each with a specific role:

| Layer | Location | Purpose |
|-------|----------|---------|
| **shadcn/ui** | `packages/ui/src/components/ui/` (Button, Card, Badge, Skeleton, Input, Textarea, Label, Switch, Dialog, AlertDialog, Sheet, Command) + `apps/web/src/components/ui/` (Checkbox, Separator, Tooltip, Popover, Tabs, Select, Table, DropdownMenu, Chart, HelpTooltip) | **Canonical layer for standard controls** — form controls, dialogs, tables, tabs, buttons, cards — Tailwind + CVA. The twelve lifted into `packages/ui` are shared with admin; `apps/web/src/components/ui/` keeps a one-line re-export for each, so every `@/components/ui/...` import is unchanged |
| **Design system** | `packages/ui/src/components/` | Status Badge family, NavRail, PhoneFrame, TipTap editor. The old `@deprecated` `packages/ui` `Button`/`Card` are **deleted** — both apps now use the shadcn Button/Card above |
| **Primitives** | `packages/ui/src/primitives/` | Layout building blocks (Stack, Text, Box) — polymorphic `as` prop |
| **Domain patterns** | `packages/ui/src/components/shared/` (AlertBanner, EmptyState, KpiCard, PageBody, QuickFilterTabs) + `apps/web/src/components/shared/` (PageHeader, DataTable, StatusBadge, Breadcrumbs, …) | App-specific compositions. The five in `packages/ui` are re-exported from `apps/web/src/components/shared/`; KpiCard and EmptyState go through thin web wrappers that bind `next/link` and resolve web-only preset keys, since `packages/ui` carries no `next` dependency. Documented (not implemented) at `docs/design-system/README.md` |

**When to use which:** shadcn/ui for standard controls. `packages/ui` for the branded/token-driven elements listed above. Primitives for layout. `apps/web/src/components/shared/` for domain-specific compositions — keep importing from the web paths; they resolve to the shared implementations.

### Component Dimensions

| Component | Heights | Radius | Notes |
|-----------|---------|--------|-------|
| Button | 44 below 768px; from 768px sm 28 / default 32 / lg 40 / icon 32 | md (8px) | Geist density adopted 2026-11-03; every size is 44px below `md`. No shadow on any variant. Canonical component: `packages/ui/src/components/ui/button.tsx`. Variants: default, secondary, outline, ghost, destructive, link |
| Input, Select trigger | 44 below 768px, 32 from 768px | sm (6px) | `border-edge-strong`, no shadow; 1px border, 2px on focus |
| Textarea | min 60 at every width | sm (6px) | Multi-line field, not a 44/32 control. `border-edge-strong`, no shadow |
| Card | — | md (8px) | Flat at rest (no shadow). Padding 16px (header `p-4`, content/footer `p-4 pt-0`). E1 on hover only where a call site opts in |
| Modal | — | lg (12px) | E3. Widths: 400/560/720/960px |
| Badge | 20 / 24 / 28 | full | Status indicators |
| NavRail item | 44 | md (8px) | Rail: 64px collapsed, 240px expanded |
| Table row | 40 (body) / 32 (header) | — | Cell padding: 12px |

Source: `packages/ui/src/tokens/components.ts` (Badge/Card/Modal/NavRail/Table); Button dimensions live in `packages/ui/src/components/ui/button.tsx`'s CVA. The deprecated `packages/ui` Button that kept the old 36/40/48 scale for admin is deleted — admin renders this same scale.

**Desktop control floor is 32px.** Below 768px every interactive control is 44px, and the primitives carry that rule so call sites do not. From 768px up a control is at least 32px; Button `sm` (28px) is the single dense exception, and it still clears WCAG 2.5.8's 24px minimum. The Dialog/Sheet close button is `md:h-9` (36px), which meets the floor.

---

## Surface & Elevation

**Borders first, shadows second.** Define surfaces with `--border-default` before reaching for elevation.

| Level | Name | Usage |
|-------|------|-------|
| E0 | Flat | Default cards (no shadow at rest), page surfaces |
| E1 | Raised | Sticky bars; card hover lift only where a call site opts in |
| E2 | Overlay | Dropdowns, popovers, sheets — **overlays only** |
| E3 | Modal | Dialogs, command palettes — **overlays only** |

**Radius scale** (Geist, adopted 2026-11-03): `xs` (4px) → `sm` (6px) inputs → `md` (8px) cards/buttons → `lg` (12px) modals → `xl`/`2xl` (20/24px) → `full` badges/avatars. Tailwind `rounded-*` read `var(--radius-*)`.

Shadows are slate-tinted (`rgba(15,23,42,…)`, never pure black) and single-sourced from `--elevation-e0..e3` (defined in `packages/tokens/src/static.ts`). Tailwind's `shadow-sm`/`shadow` map to E1, `shadow-md` to E2, and `shadow-lg`/`xl`/`2xl` to E3 — so the ladder holds even for stock utility classes.

Source: `packages/tokens/src/static.ts` (elevation values); `packages/ui/src/tokens/radius.ts`

### Accent Scarcity

- **One filled primary button per view region.** Everything else in that region is `outline`, `ghost`, or `link`. A "region" is a card, modal, page header, or form footer. (Review-checklist rule — not lint-enforceable.)
- Brand coral (the "Florida Modern" primary, matching the marketing landing page) appears only on primary actions, focus rings, and active nav. Per-community branding may override the primary via `--theme-primary`.
- Ink, not black: `--text-primary` is deep slate (`#111827`) by design — never introduce pure-black text.
- Data tables run dense with tabular figures (`tabular-nums` is built into the canonical Table) while page chrome keeps generous macro-spacing — "dense data, generous chrome."

---

## UX Patterns & States

### Every Data View Must Handle Four States

1. **Loading** — Skeleton placeholders for content areas, Spinner for in-progress actions, Button `loading` prop for submits
2. **Empty** — EmptyState pattern: icon + encouraging title + description + action. Use configs from `apps/web/src/lib/constants/empty-states.ts`
3. **Error** — AlertBanner `status="danger"` with actionable recovery ("We couldn't load this data. Please try again." + Retry button)
4. **Success** — The actual content, rendered with proper hierarchy

### Status Communication

4-tier compliance escalation (from `packages/ui/src/tokens/compliance.ts`):

| Tier | Condition | Treatment |
|------|-----------|-----------|
| Calm | >30 days remaining | Subtle neutral |
| Aware | 8–30 days | Standard brand |
| Urgent | 1–7 days | Prominent warning |
| Critical | Overdue | Persistent danger |

**Rule:** NEVER communicate status by color alone. Always pair with icon + text label. Critical items must be visible without scrolling on dashboard. Use `getStatusConfig()` from `packages/ui/src/constants/status.ts` (re-exported via `apps/web/src/lib/constants/status.ts`).

### Form Design

- Labels above inputs, not floating labels
- All states defined: default, focus (ring), disabled (muted bg), error (`--border-error` + `--status-danger` text), required (asterisk)
- Inline validation errors below the field
- Group related fields with SectionHeader pattern
- Button states: normal, hover, focused, pressed, disabled, loading

### Data Display

- DataRow pattern: 44px touch target on mobile, 32px on desktop
- Tables: row height 40px, header 32px, 12px cell padding
- ColumnHeader for sortable columns
- StatusPills for aggregated status summaries
- CSV export for any tabular data visible to admins

### UX Writing

- **Empty state titles:** Encouraging and action-oriented ("Let's get you compliant", not "No data found")
- **Error messages:** What happened + what to do ("We couldn't load this data. Please try again.")
- **Button labels:** Verb-first ("Upload Document", "Add Owners", "Export Report")
- **Status labels:** Use `STATUS_CONFIG` for consistent naming across the app

---

## Accessibility

- **Focus:** `:focus-visible` ring system — 2px solid, 2px offset. NEVER suppress on any interactive element.
- **Touch targets:** 44px minimum on mobile (<768px), 32px floor on desktop (>=768px); Button `sm` (28px) is the single dense exception, above WCAG 2.5.8's 24px minimum
- **Skip link:** `.skip-link` class supported for keyboard users
- **Motion:** All animations respect `prefers-reduced-motion`. Motion must be functional (feedback/orientation/attention), never decorative.
- **Color:** Never rely on color alone. Always icon + text + color for status.
- **Forced colors:** `@media (forced-colors: active)` fallback (3px solid CanvasText) for focus ring
- **ARIA:** `role="alert"` on AlertBanner, `aria-expanded` on collapsible sections, `aria-hidden="true"` on decorative icons
- **Large text:** on by default (`.large-text` on `<html>`), one type step up; users can switch to standard size

Source: `packages/ui/src/styles/tokens.css` (focus ring + motion + forced-colors sections)

---

## Quality Gate

Every PR touching UI must pass:

- [ ] All spacing from the token scale (no ad-hoc px values)
- [ ] All colors from semantic tokens (no raw hex in components)
- [ ] All radii from the radius scale
- [ ] All shadows from the elevation scale
- [ ] Focus ring visible on every interactive element
- [ ] Touch targets meet minimums (44px mobile, 32px desktop)
- [ ] Status uses icon + text + color (never color alone)
- [ ] `prefers-reduced-motion` respected (no decorative animation)
- [ ] Loading, empty, and error states handled for all data-dependent views

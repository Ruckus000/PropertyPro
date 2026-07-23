# PropertyPro Design System — Redesign Contract (Website Editor hand-off)

> **What this document is.** A **closed design-system vocabulary** and a hard
> **"don't invent" contract** for anyone (human or AI) redesigning the PM
> **Website** editor page. It enumerates the *complete* set of tokens,
> components, and patterns you are allowed to use, states the rules that bound
> them, and defines what to do when the design seems to need something that
> isn't here. Every value below was read directly from the repo
> (`packages/tokens/src/*`, `DESIGN.md`, `docs/design-system/DESIGN_LAWS.md`,
> and the companion mockup's `:root`) — this is not a new system, it is a fence
> around the existing one.
>
> **Read it alongside its two companions:**
> - `website-editor-spec.md` — *what* the page is (structure, copy, states, data/API/DB wiring, product scope).
> - `website-editor-mockup.html` — a faithful static render of today's design, with the resolved token values in its `:root`.
> - **this file** — *how* you are allowed to build it (the design-system + scope guardrails).

---

## 0. How to use this document

1. **Treat these three files as the complete brief.** If you find yourself
   wanting a color, size, component, font, block type, or field that appears in
   none of them, that is the signal described in §1 — stop and ask, do not
   invent.
2. **Authority order.** Where guidance conflicts: the repo's live source and CI
   guards (§8) win over this document; this document wins over the mockup for
   *rules*; the mockup wins for *pixel-level visual fidelity* of today's design;
   the spec wins for *product behavior and scope*.
3. **This is a redesign, not a redefinition.** You are re-composing the **same
   feature** out of the **same design system**. The visual arrangement is yours
   to improve; the vocabulary is fixed.

---

## 1. Prime directive — the closed vocabulary

> **You may only use the tokens, components, and patterns enumerated in this
> document (and its two companions). You may not introduce anything outside
> them.**

Concretely, you may **NOT**:

- add a new color, or a new shade of an existing one (no raw hex, no
  `bg-blue-500`-style palette classes, no `bg-[#…]`, no `rgba()/hsl()/oklch()`);
- apply slash-opacity to a semantic color token (`bg-interactive/10`,
  `border-accent/40`, …) — see §2.1 for why these silently render as *nothing*;
- invent a spacing value, radius, shadow, or font size outside the scales in §2;
- add a new font family beyond the three in §2.2;
- create a new component archetype (a new kind of card, a new button style, a
  bespoke modal) when an enumerated component in §3 already covers the need;
- add a new content block type, field, setting, page, or nav entry (see the
  **scope fence**, §7).

**If the design seems to require something not listed here, that is not a
license to add it — it is a prompt to stop and ask a human** (§9). Ninety-nine
times out of a hundred, the thing you want already exists under a name you
haven't reached for yet.

---

## 2. Design tokens — the complete allowed set

Three-tier system: **primitives** (raw scales) → **semantic** (purpose-driven)
→ **component** (dimension contracts). **Never reference a primitive directly in
UI** — always consume the semantic token. Primitives are listed only so you can
see what a semantic token resolves to.

Tokens are defined in `packages/tokens/src/{primitives,semantic,static}.ts` and
generated into `packages/ui/src/styles/tokens.css` (never hand-edited; a sync
test + `guard:token-freshness` fail the build on drift).

### 2.1 Color — semantic tokens only

Use the CSS variable (or its Tailwind alias). The hex column shows what it
resolves to today so you can read the mockup; **do not paste the hex into
code** — reference the variable.

**Text**

| Token | Resolves to | Hex | Use |
|---|---|---|---|
| `--text-primary` | gray-900 | `#111827` | Body text, headings. Deep slate — **never** pure black. |
| `--text-secondary` | gray-600 | `#4B5563` | Supporting text, descriptions, subtitles. |
| `--text-tertiary` | gray-500 | `#6B7280` | Metadata, timestamps, block-card labels. |
| `--text-disabled` / `--text-placeholder` | gray-400 | `#9CA3AF` | Disabled controls, input placeholders. |
| `--text-inverse` | gray-0 | `#FFFFFF` | Text on filled/inverse surfaces (e.g. on a coral button). |
| `--text-brand` / `--text-link` | coral-700 | `#A8412C` | Brand text + links (700 clears AA on warm surfaces). |
| `--text-link-hover` | coral-800 | `#87331F` | Link hover. |

**Surface**

| Token | Resolves to | Hex | Use |
|---|---|---|---|
| `--surface-page` | sand-50 | `#FBF7F1` | Page/canvas background (warm off-white). |
| `--surface-card` | sand-0 | `#FFFEFC` | Card / panel / section background. |
| `--surface-subtle` | sand-25 | `#FDFAF6` | Faintly raised regions. |
| `--surface-muted` | sand-100 | `#F6EFE6` | Subdued sections, inline `code`, muted pills. |
| `--surface-hover` | sand-50 | `#FBF7F1` | Hover fill on secondary/ghost controls. |

**Border**

| Token | Resolves to | Hex | Use |
|---|---|---|---|
| `--border-default` | sand-200 | `#EFE7DC` | Card boundaries, dividers (the default). |
| `--border-subtle` | sand-100 | `#F6EFE6` | Light separators. |
| `--border-strong` | sand-300 | `#E3D8C9` | Emphasis borders. |
| `--border-focus` | coral-500 | `#CB6047` | Focus ring (see §6). |
| `--border-error` | red-500 | `#EF4444` | Field error border. |

**Interactive (brand primary — theme-overridable)**

| Token | Resolves to | Hex | Use |
|---|---|---|---|
| `--interactive-primary` | coral-600 (via `--theme-primary`) | `#C2533A` | Primary action fills, active nav. Per-community branding may override via `--theme-primary`. |
| `--interactive-primary-hover` | coral-700 (via `--theme-primary-hover`) | `#A8412C` | Primary hover. |
| `--interactive-primary-active` | coral-800 | `#87331F` | Primary pressed. |
| `--interactive-subtle` | coral-50 | `#FCF1ED` | Subtle brand-tinted fill (use this **instead of** `bg-interactive/10`). |
| `--interactive-disabled` | gray-300 | `#D1D5DB` | Disabled primary. |

**Status** — each has `foreground` / `background` / `border` / `subtle`. Always
pair with an icon + text (§5). Consume as `text-status-success`,
`bg-status-success-bg`, `border-status-success-border`, etc.

| Status | fg | bg | border |
|---|---|---|---|
| `success` | green-700 `#047857` | green-50 `#ECFDF5` | green-200 `#A7F3D0` |
| `warning` | amber-700 `#B45309` | amber-50 `#FFFBEB` | amber-200 `#FDE68A` |
| `danger` | red-700 `#B91C1C` | red-50 `#FEF2F2` | red-200 `#FECACA` |
| `info` | teal-700 `#1C5A52` | teal-50 `#ECF6F4` | teal-200 `#A6D5CD` |
| `premium` (gold) | gold-800 `#6F4C13` | gold-50 `#FDF6E7` | gold-200 `#F3D488` |

> **`premium` is the "Florida Modern" gold** used for Professional-tier / Pro
> markers (the `PlanBadge`). It is **not** a status variant (no icon of its own).
> This is the *only* gold in the app — do not introduce another.

> ⚠️ **Slash-opacity on semantic tokens is banned and broken.** The app's
> semantic colors are declared as bare `var(--x)` with **no alpha channel**, so
> Tailwind emits *zero* CSS for `bg-interactive/10`, `border-accent/40`,
> `bg-accent/15`, etc. — the color renders as **nothing**. (Today's page ships
> this bug on the wizard banner and the publish-bar draft badge — spec §8.)
> **Fix:** use a solid pre-tinted token (`--interactive-subtle`,
> `bg-status-*-bg`, `bg-status-*-subtle`, `--surface-muted`). For genuine
> translucency over a photo only, use built-in `white`/`black` alpha
> (`bg-white/20`) — those *are* defined with rgb channels.

### 2.2 Typography

**Font families (the only three):**

| Token | Family | Use |
|---|---|---|
| `--font-sans` | **Inter** | All body, UI, form, and table text. The default. |
| `--font-display` | **Fraunces** (serif) | **Page-title `<h1>` only**, via a global `h1 { font-family: var(--font-display) }` rule. Nothing else is serif — not `<h2>`, not section headings. |
| `--font-mono` | **JetBrains Mono** | Code, DNS records, hex inputs, tabular monospace. |

**Type scale** — source of truth is `static.ts` (rem-based). **The app's root
font-size is `18px`** (`globals.css` → `:root { font-size: 18px }`, confirmed in
the mockup), so **`1rem = 18px`** and the *effective* pixel sizes are the rem
value × 18:

| Token | rem | Effective px (18px root) | Use |
|---|---|---|---|
| `xs` | `0.75rem` | ~13.5px | Metadata labels **only** — never primary content. |
| `sm` | `0.875rem` | ~15.75px | Captions, helper text. |
| `base` | `1rem` | **18px** | Body text. The floor for readable content. |
| `lg` | `1.125rem` | ~20.25px | Emphasized body, subheadings. |
| `xl` | `1.25rem` | ~22.5px | Section headings (`<h2>`). |
| `2xl` | `1.5rem` | **~27px** | Page heading (`<h1>` "Website"). |
| `3xl` | `1.875rem` | ~33.75px | Hero/display. |

> **Doc-drift note:** the px columns in `DESIGN.md` / `docs/design-system/README.md`
> (which show `xs=11px`, `base=16px`, `2xl=24px`) assume a **16px** root and are
> **nominal, not what renders**. Trust `static.ts` (rem) + the 18px root + the
> mockup. A `.large-text` mode on `<html>` scales the whole ramp up.

**Rules:** body text floor is `base`. `xs` is metadata-only. Only the `<h1>` is
serif.

### 2.3 Spacing

**4px base grid. Absolute px — spacing does *not* scale with the 18px root.**
Use **only** these steps:

`space-1` 4 · `space-2` 8 · `space-3` 12 · `space-4` 16 · `space-5` 20 ·
`space-6` 24 · `space-8` 32 · `space-12` 48 · `space-16` 64 · `space-20` 80.

- **Micro** (component internals): semantic `inline` / `stack` / `inset` tokens.
- **Macro** (layout composition): `section` (24–64) / `page` (48–80).
- **Macro spacing is constant across viewports; only micro spacing adapts.**
- No ad-hoc values — `p-[13px]`, `gap-[7px]`, `mt-[30px]` are all banned.
- Today's page rhythm to preserve: sections separated by `space-y-6` / `mt-8`;
  cards `p-6` (block cards `p-4`); dashboard grids `gap-6 lg:grid-cols-2`.

### 2.4 Radius

`sm` 6px (inputs) · `md` 10px (cards, buttons) · `lg` 16px (modals) · `xl` 20px
· `2xl` 24px · `full` 9999px (badges, pills, avatars). No other radii.

### 2.5 Elevation (shadow)

**Borders first, shadows second.** Reach for `--border-default` before elevation.

| Level | Value | Use |
|---|---|---|
| `E0` | `none` | Default cards, page surfaces (rest state). |
| `E1` | `0 1px 3px rgba(15,23,42,.06), 0 1px 2px rgba(15,23,42,.04)` | Hover lift, sticky bars (the PublishBar). |
| `E2` | `0 4px 6px rgba(15,23,42,.06), 0 2px 4px rgba(15,23,42,.04)` | Dropdowns, popovers, sheets — **overlays only**. |
| `E3` | `0 10px 15px rgba(15,23,42,.08), 0 4px 6px rgba(15,23,42,.05)` | Dialogs, command palettes — **overlays only**. |

Shadows are slate-tinted (`#0F172A` base), never pure black, single-sourced from
`--elevation-e0..e3`. Tailwind `shadow-sm`/`shadow` → E1, `shadow-md` → E2,
`shadow-lg`/`xl`/`2xl` → E3. **E2/E3 are exclusively for overlays.**

### 2.6 Focus ring

`--focus-ring` = coral-500 `#CB6047`, **2px solid, 2px offset**. Danger variant
= red-500. **Never suppress `:focus-visible`** (§6). A `@media (forced-colors:
active)` fallback (3px `CanvasText`) already exists — don't remove it.

### 2.7 Motion (only if functional)

Durations: `instant` 0 · `micro` 100 · `quick` 150 · `standard` 250 · `slow`
350 · `expressive` 500 (ms). Eases: `standard` / `enter` / `exit` / `bounce`.
**Motion must be functional** (feedback / orientation / attention), never
decorative, and must respect `prefers-reduced-motion` (§6).

---

## 3. Component inventory — the allowed building blocks

Compose the redesign from **these** components. Do not build a new component
archetype when one below already fits. Four layers, each with a job:

| Layer | Path | Use for |
|---|---|---|
| **shadcn/ui (canonical)** | `apps/web/src/components/ui/` | Standard controls — the default reach. |
| **Design-system** | `packages/ui/src/components/` | Branded/token-driven elements listed below. |
| **Primitives** | `packages/ui/src/primitives/` | Layout building blocks (Stack, Text, Box; polymorphic `as`). |
| **Domain patterns** | `apps/web/src/components/shared/` | App-specific compositions. |

**shadcn/ui (`apps/web/src/components/ui/`) — canonical controls:**
`button`, `input`, `textarea`, `select`, `checkbox`, `switch`, `label`,
`card`, `badge`, `dialog`, `alert-dialog`, `sheet`, `popover`, `tooltip`,
`dropdown-menu`, `command`, `tabs`, `table`, `separator`, `skeleton`,
`help-tooltip`, `chart`.

**Domain patterns (`apps/web/src/components/shared/`) — use before inventing:**
`page-header` (renders the `<h1>`), `page-body` (content root — see §4),
`alert-banner`, `empty-state`, `status-badge`, `data-table` (+
`data-table-column-header`, `data-table-pagination`), `kpi-card`,
`checklist-stepper`, `quick-filter-tabs`, `bulk-action-bar`, `slide-over-panel`,
`csv-export-button`, `chart-skeleton`, `chart-empty-state`, the
`*SearchCombobox` family.

**Design-system (`packages/ui/src/components/`):** `Badge` (status family),
`PlanBadge` (the gold **PRO** pill), `NavRail`, `PhoneFrame`.

> ⛔ **`Button` and `Card` in `packages/ui` are `@deprecated` for web** (admin-only
> until its own migration). Use the shadcn `apps/web/src/components/ui/`
> `button` / `card` — do **not** add new `apps/web` imports of the packages/ui
> Button/Card.

**Class composition:** always use `cn()` from `@/lib/utils` (clsx +
tailwind-merge). New variants go through **CVA**, not ad-hoc conditionals.

### Component dimension contracts (fixed)

| Component | Heights | Radius | Notes |
|---|---|---|---|
| **Button** | sm 32 / **default 36** / lg 40 / icon 36 | `md` | Variants: `default`, `secondary`, `outline`, `ghost`, `destructive`, `link`. Canonical: `ui/button.tsx`. `loading` prop shows a spinner + disables. |
| **Input** | sm 36 / md 40 / lg 48 | `sm` | 1px border, **2px on focus**. |
| **Card** | — | `md` | Padding 16 / 20 / 24. **E0** rest, **E1** hover. |
| **Modal** | — | `lg` | **E3**. Widths 400 / 560 / 720 / 960. |
| **Badge / pill** | 20 / 24 / 28 | `full` | Status indicator. |
| **Table row** | 52 body / 40 header | — | 12px cell padding; `tabular-nums` built in. |
| **NavRail item** | 44 | `md` | Rail 64 collapsed / 240 expanded (shell-owned). |

**One filled primary button per view region** — a region is a card, modal, page
header, or form footer. Everything else in that region is `outline` / `ghost` /
`link`. (On this page today: the wizard-banner CTA, each form's **Save**, and the
PublishBar's **Publish** are the primaries; header actions and domain "View
site" are secondary.)

---

## 4. Layout & structure rules

- **The app shell owns the page gutter — the page must not.** Horizontal
  padding, vertical padding, and the centred max-width are single-sourced in
  `PageContainer` (`components/layout/page-container.tsx`:
  `px-6 sm:px-8 lg:px-10 py-8`, `max-w-[1400px]`), rendered by the shell around
  every authenticated route. **Author the page with `PageBody`
  (`components/shared/page-body.tsx`) as the content root** — it owns vertical
  rhythm (`space-y-6`) and offers narrower centred columns via
  `width="prose|form|content|reading|narrow"` **without** adding horizontal
  padding. Do **not** add root `px-*`/`py-*` (double-pads the gutter) and do
  **not** render your own `<main>` (the shell owns the only
  `<main id="main-content">`). Enforced by `guard:page-padding`.
  > Today's page uses a legacy hand-rolled container
  > (`<div class="mx-auto max-w-5xl px-6 py-8">`, spec §2). The redesign should
  > **drop that** and use `PageBody` (e.g. `width="content"` for a narrower
  > column) so it stays on-standard.
- **Breadcrumbs are shell-owned.** A single global trail renders in the shell
  (`components/layout/shell-breadcrumbs.tsx`), derived from the URL + the page
  `<h1>`. The page **must** render a page-title `<h1>` (it does: "Website") and
  must **not** author its own breadcrumb, back-link, or inline trail.
- **Card conventions:** `rounded-md border border-default bg-surface-card p-6
  shadow-e0` for sections (`p-4` for content-block cards; the sticky PublishBar
  is `p-4 shadow-e1`). Sections separated by `space-y-6` / `mt-8`.

---

## 5. Required states & UX patterns

### Every data-dependent view MUST handle four states

1. **Loading** — `skeleton` placeholders (never a bare spinner for content);
   Button `loading` prop for submits.
2. **Empty** — the `empty-state` pattern (icon + encouraging title + description
   + a constructive action). Copy configs in
   `apps/web/src/lib/constants/empty-states.ts`.
3. **Error** — `alert-banner` with `status="danger"`, actionable recovery copy +
   a retry affordance (`role="alert"`).
4. **Success** — the actual content with proper hierarchy.

### Status communication

- **Never communicate status by color alone — always icon + text + color.** Use
  `getStatusConfig()` from `packages/ui/src/constants/status.ts` (re-exported via
  `apps/web/src/lib/constants/status.ts`). The Live / Not-published-yet /
  Pending pills already follow this — keep it.
- Compliance escalation (where relevant): `calm` (>30d) · `aware` (8–30d) ·
  `urgent` (1–7d) · `critical` (overdue). Source
  `packages/ui/src/tokens/compliance.ts`.

### Form states

Labels **above** inputs (never floating). Define every state: default, focus
(ring), disabled (muted bg + disabled text), error (`--border-error` + danger
text), required (asterisk). Inline validation below the field. Button states:
normal, hover, focused, pressed, disabled, loading.

### UX writing

- **Button labels: verb-first** ("Upload Document", "Add question", "Publish
  Website"). Preserve the spec's verbatim copy (§3 of the spec) unless the spec
  §8 explicitly flags it for cleanup.
- **Empty-state titles: encouraging** ("Let's get you compliant", not "No data").
- **Error messages: what happened + what to do** ("We couldn't remove this
  section. Please try again.").
- **Status labels:** use `STATUS_CONFIG` naming for consistency.

---

## 6. Accessibility floor (non-negotiable)

- **Never suppress `:focus-visible`.** Every interactive element shows the coral
  focus ring (2px solid, 2px offset).
- **Touch targets:** ≥44px on mobile (<768px), ≥36px on desktop (≥768px).
- **Color is never the only signal** — always icon + text + color for status.
- **Decorative icons** `aria-hidden="true"`; **alerts** `role="alert"`;
  **collapsible** `aria-expanded` (the DomainFinder disclosure already does this).
- **Respect `prefers-reduced-motion`** — motion is functional only. Keep the
  `@media (forced-colors: active)` focus fallback.
- **Body text ≥ `base`** (18px actual / 16px nominal). `xs` is metadata-only.

---

## 7. Scope fence — reuse the feature, don't extend it

This is a **visual / interaction redesign of the same page**. The product
surface is fixed by `website-editor-spec.md`. **Reuse, do not invent:**

- The **9 content block types** exactly as specified — `text`, `image`,
  `announcements`, `documents`, `meetings`, `contact`, and the Pro-gated `faq`,
  `gallery`, `amenities` (spec §3.4) — plus the hero. No new block types.
- Every **field, constraint, default, and validation** as specified (spec §3,
  §6.4). Don't add fields (e.g. don't invent a hero-image field — its absence is
  a *known* gap in spec §8; adding it is a product decision, not a redesign
  liberty). Don't relax a `maxLength` or a required rule.
- The **routes, hooks, services, DB schema, and data envelopes** as wired (spec
  §6). The redesign is presentational — it does not change the API contract.
- The **Pro-gating model** — visible-but-disabled upsell (never hidden),
  re-enforced server-side (spec §5, §6.6). Keep gated controls present + locked
  with the `PlanBadge`.
- The **three-places-in-lockstep** live/draft signal (header pill + PublishBar
  badge + publish gating) and the **draft-layer + atomic publish** model (spec
  §4). Don't add a page-level dirty flag.
- **No new pages, routes, or nav entries.** Both nav entries stay feature-gated
  on `hasSiteEditor`.

**What *is* fair game** — only the presentational cleanups explicitly listed in
**spec §8**, e.g.: replace the broken slash-opacity tints with solid coral
`-subtle`/`-bg` tokens; normalize "Saving…" copy (ContactBlockForm's `Saving...`
→ ellipsis); give block cards a friendly, iconized header instead of
`#{order} — {blockType}`; unify section-heading ownership. These are **visual**
fixes inside the existing vocabulary — not license to expand scope. Anything
beyond spec §8 is a §9 stop-and-ask.

---

## 8. Enforcement — why "inventing" fails CI

Inventing outside this vocabulary isn't just off-style; it turns the build red.
These guards run on every PR (all bundled into `pnpm lint`):

| Guard | Rejects |
|---|---|
| `guard:design-tokens` | Raw hex, raw palette classes (`bg-blue-500`), arbitrary colors/fonts/spacing (`bg-[#…]`, `text-[13px]`, `p-[13px]`), functional color literals, **slash-opacity on semantic tokens**. New files must be clean (shrink-only baseline). |
| `guard:token-coverage` | Any referenced `var(--*)` that isn't defined. |
| `guard:page-padding` | Per-page root `px-*`/`py-*` and page-level `<main>` (the gutter belongs to the shell — §4). |
| `guard:breadcrumbs` | Detail/new/edit pages missing a page-title `<h1>`; page-authored breadcrumbs. |
| `guard:token-freshness` | A hand-edited `tokens.css` that drifted from `packages/tokens/src`. |

Escape hatches exist (`// design-tokens:exempt — <reason>`) **but are not for
redesign use** — they're reserved for email-template hex and chart/canvas
internals. If you feel you need one, that's a §9 stop-and-ask.

---

## 9. The stop-and-ask protocol

When the design seems to need something not in this document, **do not inline a
raw value or spin up a new component to "just get it working."** Instead, in
order:

1. **Search the vocabulary first.** The thing you want almost always exists:
   need a tint? → `--interactive-subtle` / `bg-status-*-subtle`. Need a "new"
   card? → the shadcn `card`. Need a pill? → `Badge` / `status-badge`. Need a
   narrower column? → `PageBody width="…"`. Re-read §2–§3 before concluding
   anything is missing.
2. **If it is genuinely absent, stop and surface it.** Write a specific
   proposal to the human — "the redesign needs X; the closest existing token/
   component is Y; here's the gap" — and **wait** for a decision. New tokens are
   added at the source (`packages/tokens/src/*`) by a human, then regenerated —
   never faked inline in the page.
3. **Never** reach for a raw hex, an arbitrary px value, a `packages/ui`
   deprecated Button/Card, a slash-opacity semantic tint, or a
   `design-tokens:exempt` comment to bypass the fence.

The default answer to "should I add something new here?" is **no — ask first**.

---

## 10. Canonical source pointers

Self-contained values live above; these are where they actually come from (read
/ edit source, never the generated CSS):

| Thing | Canonical source |
|---|---|
| Color tokens | `packages/tokens/src/primitives.ts`, `semantic.ts` |
| Spacing / radius / type / motion / elevation / focus | `packages/tokens/src/static.ts` |
| Generated CSS variables (read-only) | `packages/ui/src/styles/tokens.css` |
| Component dimension contracts | `packages/ui/src/tokens/components.ts` |
| Buttons / inputs / dialogs / tables … | `apps/web/src/components/ui/` |
| Status Badge family / PlanBadge / NavRail | `packages/ui/src/components/` |
| Status config | `packages/ui/src/constants/status.ts` |
| EmptyState / AlertBanner / PageHeader / PageBody / DataTable | `apps/web/src/components/shared/` |
| Empty-state copy | `apps/web/src/lib/constants/empty-states.ts` |
| Root font-size + fonts | `apps/web/src/app/globals.css`, `app/layout.tsx` |
| Full design reference | `/DESIGN.md`, `docs/design-system/DESIGN_LAWS.md` |
| This page's product spec | `website-editor-spec.md` (this folder) |

---

## 11. Pre-flight checklist

Before calling a redesign done, confirm every box — each maps to a rule above:

- [ ] All colors are semantic tokens — no raw hex, no palette classes, no slash-opacity on semantic tokens (§2.1).
- [ ] All spacing is on the 4px token scale — no ad-hoc px (§2.3).
- [ ] All radii from the radius scale; all shadows from `E0`–`E3`, with `E2`/`E3` only on overlays (§2.4–2.5).
- [ ] Only Inter / Fraunces (`<h1>` only) / JetBrains Mono; body text ≥ `base` (§2.2).
- [ ] Built from the §3 component inventory — no new archetypes; no deprecated `packages/ui` Button/Card in web.
- [ ] One filled primary button per region (§3).
- [ ] Page uses `PageBody`, adds no root `px`/`py`, renders no `<main>`, renders exactly one page-title `<h1>` (§4).
- [ ] Loading, empty, and error states handled for every data view (§5).
- [ ] Status is icon + text + color, never color alone (§5–§6).
- [ ] `:focus-visible` visible on every control; touch targets met; `prefers-reduced-motion` respected (§6).
- [ ] No new block types, fields, routes, or nav; scope stays within spec §1–§7; only spec §8 cleanups applied (§7).
- [ ] `pnpm lint` (all guards, §8) is green.

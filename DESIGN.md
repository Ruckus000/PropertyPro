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

```
Primitive (raw scales)  →  Semantic (purpose-driven)  →  Component (specific contracts)
packages/ui/src/tokens/    packages/ui/src/styles/tokens.css   packages/ui/src/tokens/components.ts
```

### Key Semantic Tokens

| Category | Token | Purpose |
|----------|-------|---------|
| Text | `--text-primary` | Body text, headings |
| Text | `--text-secondary` | Supporting text, descriptions |
| Text | `--text-tertiary` | Metadata, timestamps |
| Text | `--text-disabled` | Disabled controls |
| Surface | `--surface-page` | Page background (`--surface-page-warm`, #F5F5F4 — a purpose-named warm neutral, not a new scale family) |
| Surface | `--surface-card` | Card/panel background (white) |
| Surface | `--surface-muted` | Subdued sections (gray-100) |
| Border | `--border-default` | Card boundaries, dividers |
| Border | `--border-subtle` | Light separators |
| Border | `--border-strong` | Emphasis borders |
| Interactive | `--interactive-primary` | Primary actions (theme-overridable) |
| Interactive | `--interactive-primary-hover` | Primary hover state |
| Status | `--status-success-*` / `--status-danger-*` / `--status-warning-*` | fg/bg/border per status |

`--surface-page-warm` is a purpose-named primitive for the page surface, not the start of a new neutral scale family. The project still uses `--gray-*` as its only neutral scale.

### Spacing

4px base unit grid. Use **only** token values.

- **Micro** (component internals): `inline` (horizontal gaps 4–24px), `stack` (vertical gaps 8–32px), `inset` (padding 8–24px)
- **Macro** (layout composition): `section` (24–64px), `page` (48–80px)
- Macro spacing is constant across viewports. Only micro spacing adapts by breakpoint.

---

## Typography

**Fonts:** Inter (sans-serif), JetBrains Mono (monospace)

| Token | Size | Usage |
|-------|------|-------|
| `xs` | 11px | Metadata labels only — never primary content |
| `sm` | 13px | Captions, helper text |
| `base` | 16px | Body text (minimum for readable content) |
| `lg` | 18px | Emphasized body, subheadings |
| `xl` | 20px | Section headings |
| `2xl` | 24px | Page headings |
| `3xl` | 30px | Hero/display text |

**Rules:** Body text floor is 16px (`base`). Compliance document content uses `base` or `lg` minimum. Caption (11px/`xs`) is metadata-only, never primary content. Large text mode available via `.large-text` class on `<html>`.

---

## Component System

Three layers, each with a specific role:

| Layer | Location | Purpose |
|-------|----------|---------|
| **shadcn/ui** | `apps/web/src/components/ui/` | Standard form controls, dialogs, tables, tabs — Tailwind + CVA |
| **Design system** | `packages/ui/src/components/` | Token-driven branded components (Button, Card, Badge, NavRail) |
| **Primitives** | `packages/ui/src/primitives/` | Layout building blocks (Stack, Text, Box) — polymorphic `as` prop |
| **Patterns** | `docs/design-system/patterns/` | Domain compositions (SectionHeader, DataRow, AlertBanner, EmptyState, StatusPills) |

**When to use which:** shadcn/ui for standard controls. Design system components for branded/token-driven elements. Primitives for layout. Patterns for domain-specific compositions.

### Component Dimensions

| Component | Heights (sm/md/lg) | Radius | Notes |
|-----------|-------------------|--------|-------|
| Button | 36 / 40 / 48 | md (10px) | Variants: primary, secondary, ghost, danger, link |
| Input | 36 / 40 / 48 | sm (6px) | 1px border, 2px on focus |
| Card | — | md (10px) | Padding: 16/20/24px. E0 rest, E1 hover |
| Modal | — | lg (16px) | E3. Widths: 400/560/720/960px |
| Badge | 20 / 24 / 28 | full | Status indicators |
| NavRail item | 44 | md (10px) | Rail: 64px collapsed, 240px expanded |
| Table row | 52 (body) / 40 (header) | — | Cell padding: 12px |

Source: `packages/ui/src/tokens/components.ts`

---

## Surface & Elevation

**Borders first, shadows second.** Define surfaces with `--border-default` before reaching for elevation.

| Level | Name | Usage |
|-------|------|-------|
| E0 | Flat | Default cards, page surfaces |
| E1 | Raised | Hover lift, sticky bars |
| E2 | Overlay | Dropdowns, popovers, sheets — **overlays only** |
| E3 | Modal | Dialogs, command palettes — **overlays only** |

**Radius scale:** `sm` (6px) inputs → `md` (10px) cards/buttons → `lg` (16px) modals → `xl`/`2xl` (20/24px) → `full` badges/avatars

Source: `packages/ui/src/tokens/shadows.ts`, `packages/ui/src/tokens/radius.ts`

---

## UX Patterns & States

### Every Data View Must Handle Four States

1. **Loading** — Skeleton placeholders for content areas, Spinner for in-progress actions, Button `loading` prop for submits
2. **Empty** — EmptyState pattern: icon + encouraging title + description + action. Use configs from `docs/design-system/constants/empty-states.ts`
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

**Rule:** NEVER communicate status by color alone. Always pair with icon + text label. Critical items must be visible without scrolling on dashboard. Use `getStatusConfig()` from `docs/design-system/constants/status.ts`.

### Form Design

- Labels above inputs, not floating labels
- All states defined: default, focus (ring), disabled (muted bg), error (`--border-error` + `--status-danger` text), required (asterisk)
- Inline validation errors below the field
- Group related fields with SectionHeader pattern
- Button states: normal, hover, focused, pressed, disabled, loading

### Data Display

- DataRow pattern: 44px touch target on mobile, 36px on desktop
- Tables: row height 52px, header 40px, 12px cell padding
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
- **Touch targets:** 44px minimum on mobile (<768px), 36px on desktop (>=768px)
- **Skip link:** `.skip-link` class supported for keyboard users
- **Motion:** All animations respect `prefers-reduced-motion`. Motion must be functional (feedback/orientation/attention), never decorative.
- **Color:** Never rely on color alone. Always icon + text + color for status.
- **Forced colors:** `@media (forced-colors: active)` fallback (3px solid CanvasText) for focus ring
- **ARIA:** `role="alert"` on AlertBanner, `aria-expanded` on collapsible sections, `aria-hidden="true"` on decorative icons
- **Large text:** `.large-text` class on `<html>` scales all type sizes up for readability

Source: `packages/ui/src/styles/tokens.css` (focus ring + motion + forced-colors sections)

---

## Quality Gate

Every PR touching UI must pass:

- [ ] All spacing from the token scale (no ad-hoc px values)
- [ ] All colors from semantic tokens (no raw hex in components)
- [ ] All radii from the radius scale
- [ ] All shadows from the elevation scale
- [ ] Focus ring visible on every interactive element
- [ ] Touch targets meet minimums (44px mobile, 36px desktop)
- [ ] Status uses icon + text + color (never color alone)
- [ ] `prefers-reduced-motion` respected (no decorative animation)
- [ ] Loading, empty, and error states handled for all data-dependent views

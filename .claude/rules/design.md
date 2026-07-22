<important if="creating components, writing UI code, building pages, styling elements, or modifying frontend">

# Design System Rules

Full reference: `/DESIGN.md`. Tokens are DEFINED in `packages/tokens` (`src/primitives.ts` / `src/semantic.ts` / `src/static.ts`) and GENERATED into `packages/ui/src/styles/tokens.css` — never hand-edit that file.

## Component Tooling

- Use `cn()` from `@/lib/utils` (clsx + tailwind-merge) for all class composition
- shadcn/ui components: `apps/web/src/components/ui/` — canonical layer for standard controls, Tailwind + CVA
- Design system components: `packages/ui/src/components/` — status Badge family, NavRail, PhoneFrame, TipTap editor. `Button`/`Card` here are `@deprecated` for web (admin-only until its migration) — use the shadcn `apps/web/src/components/ui/` versions instead
- Layout primitives: `packages/ui/src/primitives/` — Stack (HStack/VStack/Center), Text, Box with polymorphic `as` prop
- Domain patterns: implemented in `apps/web/src/components/shared/` (AlertBanner, EmptyState, PageHeader, DataTable, KpiCard, StatusBadge, Breadcrumbs, …); documented (not implemented) at `docs/design-system/README.md`
- Status config: canonical source `packages/ui/src/constants/status.ts`, re-exported via `apps/web/src/lib/constants/status.ts`
- New components: Tailwind classes + CVA variants. Own the source (shadcn model), never install as a dependency.

## Spacing

- 4px base grid. ONLY token values: space-1(4px), space-2(8px), space-3(12px), space-4(16px), space-5(20px), space-6(24px), space-8(32px)
- Component internals: `inline`/`stack`/`inset` semantic spacing
- Page layout: `section`/`page` semantic spacing. Dashboard sections: `space-y-6`, grids: `gap-6 lg:grid-cols-2`
- Macro spacing is constant across viewports. Only micro spacing adapts.
- NEVER use ad-hoc spacing values.
- **Page gutter is the shell's job, not the page's.** The authenticated page gutter
  (horizontal `px`, vertical `py`, centred max-width) is single-sourced in
  `PageContainer` (`components/layout/page-container.tsx`, rendered by the app shell:
  `px-6 sm:px-8 lg:px-10 py-8`, `max-w-[1400px]`). Author pages with `PageBody`
  (`components/shared/page-body.tsx`) as the content root — it owns vertical rhythm
  (`space-y-6`) and optional narrower centred columns
  (`width="prose|form|content|reading|narrow"`), and applies NO horizontal padding.
  Do NOT add root `px-*`/`py-*` (double-pads the gutter) or a page-level `<main>`
  (the shell owns the only `<main>`). Enforced by `guard:page-padding` (shrink-only
  `scripts/page-padding-baseline.json`; escape hatch `// page-padding:exempt — …`).
  Retune app-wide padding by editing `PAGE_GUTTER_X`/`py-*` in `PageContainer`.

## Colors & Surfaces

- ALWAYS use semantic CSS variables: `--text-primary`, `--surface-card`, `--border-default`, `--interactive-primary`. Never raw hex.
- Borders first, shadows second. Use `--border-default` before reaching for elevation.
- Elevation: E0 (cards) → E1 (hover/sticky) → E2 (dropdowns/popovers) → E3 (modals). E2/E3 are ONLY for overlays. Shadows are slate-tinted and single-sourced from `--elevation-*`; Tailwind `shadow-sm`/`shadow`→E1, `shadow-md`→E2, `shadow-lg`/`xl`/`2xl`→E3.
- One filled primary button per view region (card/modal/page header/form footer); everything else `outline`/`ghost`/`link`.
- Radius: sm(6px) inputs, md(10px) cards/buttons, lg(16px) modals, full badges/avatars.
- Status: NEVER color alone. Always icon + text + color. Use `getStatusConfig()` from `packages/ui/src/constants/status.ts` (re-exported via `apps/web/src/lib/constants/status.ts`).

## Token enforcement

- `pnpm guard:design-tokens` bans raw hex, raw Tailwind palette classes
  (`bg-blue-500`), arbitrary colors (`bg-[#…]`, `shadow-[…rgba(…)]`),
  functional color literals (`rgba(…)`, `hsl(…)`, `oklch(…)`), arbitrary font
  sizes (`text-[13px]`), and arbitrary pixel spacing (`p-[13px]`) in `apps/*/src`.
- It also bans slash-opacity on the app's SEMANTIC tokens
  (`slash-opacity-semantic`: `bg-interactive/10`, `hover:bg-status-danger/90`,
  `focus:ring-interactive/40`, `border-edge/50`, …). Those tokens are declared
  as bare `var(--x)` with no `<alpha-value>` channel, so Tailwind emits ZERO
  CSS for the modifier — the color silently renders as nothing. Fix by reaching
  for a solid token that already encodes the tint (`-subtle` / `-bg` / `-hover` /
  `-border`, e.g. `bg-interactive-subtle`, `bg-status-danger-bg`,
  `hover:bg-interactive-hover`). For a real darken with no darker semantic token,
  use the raw palette var (`hover:bg-[var(--red-900)]`). For GENUINE
  translucency (glass over a photo), use built-in `white`/`black` alpha
  (`bg-white/20`, `bg-black/40`) — Tailwind's built-in palette IS defined with
  rgb channels, so those compile.
- Existing violations are frozen in `scripts/design-token-baseline.json`
  (shrink-only; per-file, per-rule ceilings). New files must be clean; existing
  baselined files cannot exceed their frozen per-rule counts. Caveat: ceilings
  are counts, not pinned lines — a baselined file with slack below its ceiling
  can absorb a new violation undetected, so ratchet ceilings down
  (`--write-baseline` in a reviewed PR) whenever a drain lands.
- Escape hatch: `// design-tokens:exempt — <reason>` on the offending line
  (email-template hex, chart/canvas internals).
- Renamed/moved files must arrive clean or update the baseline in the same PR.
- Intentionally-literal files kept frozen in the baseline (do not drain):
  `apps/web/src/app/(marketing)/marketing-theme.css` (marketing palette),
  `apps/web/src/lib/documents/render-authored-html.ts` (authored-doc export styling),
  `apps/web/src/styles/mobile.css` + `components/mobile/` + `app/mobile/` + `apps/admin/`
  (out of standardization scope until their own migration programs — admin still
  uses its own Tailwind `blue`/`gray`/`coral` ramps + raw palette classes, not the
  semantic tokens). **Exception:** admin's *brand* hue was migrated tech-blue →
  "Florida Modern" coral for cross-surface brand consistency (`coral-*` classes,
  which the guard does not count; informational blue status badges — Trial,
  Cancelled, Converted, community-type/plan chips — intentionally kept blue), and
  the admin baseline was ratcheted down to lock in that drain. **Mobile** got the
  same scoped brand exception: its demo-preview mockup brand defaults
  (`app/mobile/page.tsx`) were swapped tech-blue → coral (hex→hex, baseline counts
  unchanged); mobile chrome stays warm-stone neutral (`mobile.css`) with
  status-blue badges kept — no other mobile de-blueing was needed since its
  brand hue already flows through the coral `--interactive-primary`/`--theme-primary`
  tokens. Also frozen:
  `dark:` raw-palette variants layered on semantic base classes
  (select-community/page.tsx, app/layout.tsx, CommandItem.tsx,
  announcement-feed/toolbar.tsx, ui/chart.tsx) — dark mode is explicitly out of
  scope per the spec
  (docs/superpowers/specs/2026-07-13-design-system-standardization-design.md,
  "the token layer must not pretend to theme"); these are the app's only
  dark-mode story and must not be mapped to non-theming tokens or deleted
  without a product decision.

## Component Dimensions

- Buttons: sm(32px) default(36px) lg(40px) icon(36px). Radius md. Variants: default/secondary/outline/ghost/destructive/link. Canonical: `apps/web/src/components/ui/button.tsx`.
- Inputs: sm(36px) md(40px) lg(48px). Radius sm. 1px border, 2px on focus.
- Cards: radius md. Padding sm(16) md(20) lg(24). E0 rest, E1 hover.
- Modals: radius lg. E3. Widths: sm(400) md(560) lg(720) xl(960).
- Table rows: 52px body, 40px header, 12px cell padding.
- Touch targets: 44px mobile (<768px), 36px desktop (>=768px).

## State Handling

- Every data-dependent view MUST handle: loading (Skeleton), empty (EmptyState), error (AlertBanner danger), and success states.
- Empty states: use configs from `apps/web/src/lib/constants/empty-states.ts`. Always include a constructive action.
- Compliance escalation: calm(>30d) / aware(8-30d) / urgent(1-7d) / critical(overdue). See `packages/ui/src/tokens/compliance.ts`.
- Form states: focus (ring), disabled (muted bg + disabled text), error (border-error + danger text), required (asterisk).
- Button states: normal, hover, focused, pressed, disabled, loading.

## Accessibility

- NEVER suppress `:focus-visible`. All interactive elements must show the focus ring.
- All decorative icons: `aria-hidden="true"`. Collapsible sections: `aria-expanded`. Alerts: `role="alert"`.
- Respect `prefers-reduced-motion`. Motion must be functional (feedback/orientation/attention), never decorative.
- Body text minimum: `base` (16px). Caption (`xs`/11px) is metadata-only, never primary content.

## UX Writing

- Empty state titles: encouraging, action-oriented ("Let's get you compliant", not "No data found")
- Error messages: what happened + what to do ("We couldn't load this data. Please try again.")
- Button labels: verb-first ("Upload Document", "Add Owners", "Export Report")
- Status labels: use `STATUS_CONFIG` from `packages/ui/src/constants/status.ts` for consistent naming

## Page Navigation & Breadcrumbs

- Breadcrumbs are **not authored per page.** A single global trail renders in
  the app shell (`apps/web/src/components/layout/shell-breadcrumbs.tsx`),
  derived from the URL plus the page's `<h1>`. Pages must NOT render their own
  breadcrumb, back-link, or inline trail — the shell owns the only back
  affordance.
- Every authenticated detail/new/edit page MUST render a page-title `<h1>` so
  the trail can resolve a real leaf label — via `<PageHeader title="...">` (the
  canonical header, which renders the `<h1>`) or a literal `<h1>`. The current
  page label is that `<h1>` title.
- Parent-crumb labels are derived from route segments in
  `apps/web/src/lib/breadcrumbs/segment-labels.ts`. Section labels that map to a
  sidebar nav item are pulled from `nav-config.ts` by id (single source — a
  sidebar rename flows through automatically); breadcrumb-only sub-segments and
  intentional divergences live in that file's `SUB_SEGMENT_LABELS`. To relabel a
  section, edit nav-config (for nav-linked sections) or `segment-labels.ts` (for
  sub-segments) — never hard-code a crumb on a page.
- Crumb hrefs are built by `build-auto-trail.ts`: nested `/communities/[id]/...`
  routes are path-scoped (no `?communityId=`); top-level routes keep
  `?communityId=` for tenant context. This is handled centrally — pages don't
  construct crumb hrefs.
- Pages that delegate chrome to a client component opt out of the page-title
  check with a top-of-file `// breadcrumbs:exempt — delegated to <path>` comment
  naming the file that renders the `<PageHeader title=…>`/`<h1>`.
- Redirect-only pages opt out with a top-of-file
  `// breadcrumbs:exempt — redirect-only page` comment.
- The CI guard (`pnpm guard:breadcrumbs`) enforces the page-title requirement on
  the in-scope glob: `**/[<param>]/page.tsx`, `**/new/page.tsx`,
  `**/[<param>]/edit/page.tsx` under `apps/web/src/app/(authenticated)/`.

</important>

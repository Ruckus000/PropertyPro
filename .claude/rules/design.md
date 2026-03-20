<important if="creating components, writing UI code, building pages, styling elements, or modifying frontend">

# Design System Rules

Full reference: `/DESIGN.md`. Token source: `packages/ui/src/tokens/`, `packages/ui/src/styles/tokens.css`.

## Component Tooling

- Use `cn()` from `@/lib/utils` (clsx + tailwind-merge) for all class composition
- shadcn/ui components: `apps/web/src/components/ui/` — standard controls, Tailwind + CVA
- Design system components: `packages/ui/src/components/` — token-driven (Button, Card, Badge, NavRail)
- Layout primitives: `packages/ui/src/primitives/` — Stack (HStack/VStack/Center), Text, Box with polymorphic `as` prop
- Domain patterns: `docs/design-system/patterns/` — SectionHeader, DataRow, AlertBanner, EmptyState, StatusPills
- New components: Tailwind classes + CVA variants. Own the source (shadcn model), never install as a dependency.

## Spacing

- 4px base grid. ONLY token values: space-1(4px), space-2(8px), space-3(12px), space-4(16px), space-5(20px), space-6(24px), space-8(32px)
- Component internals: `inline`/`stack`/`inset` semantic spacing
- Page layout: `section`/`page` semantic spacing. Dashboard sections: `space-y-6`, grids: `gap-6 lg:grid-cols-2`
- Macro spacing is constant across viewports. Only micro spacing adapts.
- NEVER use ad-hoc spacing values.

## Colors & Surfaces

- ALWAYS use semantic CSS variables: `--text-primary`, `--surface-card`, `--border-default`, `--interactive-primary`. Never raw hex.
- Borders first, shadows second. Use `--border-default` before reaching for elevation.
- Elevation: E0 (cards) → E1 (hover/sticky) → E2 (dropdowns/popovers) → E3 (modals). E2/E3 are ONLY for overlays.
- Radius: sm(6px) inputs, md(10px) cards/buttons, lg(16px) modals, full badges/avatars.
- Status: NEVER color alone. Always icon + text + color. Use `getStatusConfig()` from `docs/design-system/constants/status.ts`.

## Component Dimensions

- Buttons: sm(36px) md(40px) lg(48px). Radius md. Variants: primary/secondary/ghost/danger/link.
- Inputs: sm(36px) md(40px) lg(48px). Radius sm. 1px border, 2px on focus.
- Cards: radius md. Padding sm(16) md(20) lg(24). E0 rest, E1 hover.
- Modals: radius lg. E3. Widths: sm(400) md(560) lg(720) xl(960).
- Table rows: 52px body, 40px header, 12px cell padding.
- Touch targets: 44px mobile (<768px), 36px desktop (>=768px).

## State Handling

- Every data-dependent view MUST handle: loading (Skeleton), empty (EmptyState), error (AlertBanner danger), and success states.
- Empty states: use configs from `docs/design-system/constants/empty-states.ts`. Always include a constructive action.
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
- Status labels: use `STATUS_CONFIG` from `docs/design-system/constants/status.ts` for consistent naming

</important>

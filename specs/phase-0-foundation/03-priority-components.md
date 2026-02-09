# Spec: P0-03 — Priority Components

> Port the Button, Card, Badge, and NavRail components from the design system specification.

## Phase
0 — Foundation

## Priority
P0 — Must Have

## Dependencies
- P0-02

## Functional Requirements
- Build Button component with variants: primary, secondary, ghost, danger; sizes: sm, md, lg; loading and disabled states; icon support with optional label
- Build Card component with header, body, and footer slots; elevation variants (none, sm, md, lg); support for full-width layouts
- Build Badge component with status colors (green for success, yellow for warning, red for critical, plus info and neutral); two sizes (sm, md)
- Build NavRail component for vertical sidebar navigation with icon+label items; active state styling; collapsible behavior; keyboard navigation support
- All components use design tokens for colors, spacing, and typography
- All components use Tailwind utilities exclusively (no inline styles)
- Proper focus states and accessibility attributes (aria-label, aria-current, role attributes)
- Support dark mode via Tailwind's dark: prefix

## Acceptance Criteria
- [ ] Button component renders all variant + size combinations correctly
- [ ] Button loading state shows spinner and disables interaction
- [ ] Button disabled state prevents clicks and shows disabled styling
- [ ] Card component renders with header, body, footer slots independently
- [ ] Badge component renders all status colors correctly with appropriate contrast
- [ ] NavRail component renders list of items with active state indicator
- [ ] NavRail keyboard navigation (arrow keys, Enter) works correctly
- [ ] All components have correct TypeScript types — no `any` types
- [ ] Storybook-style test page renders all components with all variant combinations
- [ ] Unit tests cover all variants for each component
- [ ] `pnpm typecheck` passes
- [ ] No console warnings or errors on render

## Technical Notes
- Button icon support should use standard icon library (consider @radix-ui/react-icons for base, can be extended).
- Card should use Stack and Box primitives internally to maintain consistency.
- Badge should use text-transform: uppercase and appropriate font-weight.
- NavRail active state can use Next.js usePathname hook for automatic active detection in the app layer.
- Consider creating an Icon wrapper component that maintains consistent sizing.
- All components should forward refs properly for composition.

## Files Expected
- packages/ui/src/components/Button.tsx
- packages/ui/src/components/Card.tsx
- packages/ui/src/components/Badge.tsx
- packages/ui/src/components/NavRail.tsx
- packages/ui/src/components/Icon.tsx
- packages/ui/src/components/index.ts
- packages/ui/src/index.ts (update barrel export)
- tests/components/Button.test.tsx
- tests/components/Card.test.tsx
- tests/components/Badge.test.tsx
- tests/components/NavRail.test.tsx
- tests/component-showcase.tsx (demo page)

## Attempts
0

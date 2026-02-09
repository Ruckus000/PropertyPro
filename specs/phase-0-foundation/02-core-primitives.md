# Spec: P0-02 — Core Primitives

> Build the Box, Stack, and Text primitive components in the design system package.

## Phase
0 — Foundation

## Priority
P0 — Must Have

## Dependencies
- P0-01

## Functional Requirements
- Build Box component: polymorphic container with padding, margin, and flexbox props mapped to design tokens
- Build Stack component: vertical/horizontal layout helper with gap prop using token-based spacing
- Build Text component: typography component with variant prop (heading-1 through body-small) using the type scale
- All components use TypeScript generics for polymorphic `as` prop (render as div, section, article, etc.)
- Proper prop inheritance and spreading to avoid prop clashing
- All components use token-based styles exclusively (no magic numbers)
- Export all primitives from packages/ui barrel file (packages/ui/src/index.ts)
- Support className prop on all primitives for composability

## Acceptance Criteria
- [ ] Box component renders with all padding/margin props correctly
- [ ] Stack component renders vertical and horizontal layouts with correct gap spacing
- [ ] Text component renders all typography variants with correct font-size, line-height, and letter-spacing
- [ ] All components accept `as` prop and render correct HTML element
- [ ] TypeScript types are correct — no `any` types in component definitions
- [ ] Components use token-based styles exclusively (can be verified by inspecting Tailwind classes)
- [ ] Unit tests pass for each component (render, props, variants)
- [ ] `pnpm typecheck` passes
- [ ] Storybook stories render correctly for all variants

## Technical Notes
- Use Radix UI's polymorphic component pattern as reference for `as` prop implementation.
- Ensure margin/padding props are consistent across components (use design token spacing scale).
- Stack component should be the primary layout tool — discourage direct CSS flexbox in pages.
- All components should be fully typed with proper React.ComponentPropsWithoutRef for the `as` element.
- Consider creating a variant helper function using clsx or classnames for managing Tailwind classes.

## Files Expected
- packages/ui/src/primitives/Box.tsx
- packages/ui/src/primitives/Stack.tsx
- packages/ui/src/primitives/Text.tsx
- packages/ui/src/primitives/index.ts
- packages/ui/src/index.ts (update barrel export)
- packages/ui/src/types/polymorphic.ts
- tests/primitives/Box.test.tsx
- tests/primitives/Stack.test.tsx
- tests/primitives/Text.test.tsx

## Attempts
0

# Spec: P0-01 — Design Tokens

> Port the custom design token system as CSS variables and TypeScript constants into the UI package.

## Phase
0 — Foundation

## Priority
P0 — Must Have

## Dependencies
- P0-00

## Functional Requirements
- Create CSS custom properties file with all design tokens (colors, spacing on 8pt grid, typography scale, border radius, shadows, breakpoints)
- Create TypeScript constants that mirror the CSS tokens for use in component logic
- Extend Tailwind config to use custom token values instead of defaults
- Map spacing scale (space-1=4px, space-2=8px, space-3=12px, etc.) to Tailwind utility classes
- Define color palette (primary, secondary, success, warning, danger, neutral) with light/dark variants
- Define typography scale (heading-1 through body-small with line-height and letter-spacing)
- Define border radius tokens (sm, md, lg, xl, full)
- Define shadow tokens (none, sm, md, lg, xl)
- Export all tokens from packages/ui/src/tokens/index.ts barrel

## Acceptance Criteria
- [ ] Tailwind config uses custom token values for colors, spacing, and typography
- [ ] TypeScript constants in tokens package match CSS variable values
- [ ] `pnpm typecheck` passes across all packages
- [ ] Test component renders with token-based styles without console errors
- [ ] CSS variables are available in all components via Tailwind classes
- [ ] No hardcoded color or spacing values in component files

## Technical Notes
- Extend Tailwind's theme, don't fight defaults — override them completely.
- Disable Tailwind defaults that conflict with the token system using `corePlugins: { ... }`.
- CSS custom properties should follow --token-name pattern (kebab-case).
- TypeScript constants should follow CONSTANT_NAME pattern (UPPER_SNAKE_CASE).
- Store token definitions in separate files by category (colors.ts, spacing.ts, typography.ts, etc.) for maintainability.

## Files Expected
- packages/ui/src/tokens/colors.ts
- packages/ui/src/tokens/spacing.ts
- packages/ui/src/tokens/typography.ts
- packages/ui/src/tokens/shadows.ts
- packages/ui/src/tokens/radius.ts
- packages/ui/src/tokens/breakpoints.ts
- packages/ui/src/tokens/index.ts
- packages/ui/src/styles/tokens.css
- apps/web/tailwind.config.ts (update)

## Attempts
0

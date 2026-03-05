# Task 0.4 — Create `packages/theme`

> **Context files to read first:** `SHARED-CONTEXT.md`, `CLAUDE.md`
> **Branch:** `feat/theme-package`
> **Estimated time:** 1-2 hours
> **Files touched by other parallel agents:** None. This task creates an entirely new directory.

## Objective

Create a new `packages/theme` package that exports the theming contract used by every surface of the platform. This is a library package — no consumer app uses it yet.

## Deliverables

### 1. Package structure

```
packages/theme/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── constants.ts
│   ├── resolve-theme.ts
│   ├── to-css-vars.ts
│   └── to-font-links.ts
└── __tests__/
    ├── resolve-theme.test.ts
    ├── to-css-vars.test.ts
    └── to-font-links.test.ts
```

### 2. `package.json`

```json
{
  "name": "@propertypro/theme",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

### 3. `types.ts`

```typescript
export interface CommunityTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  logoUrl: string | null;
  communityName: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
}
```

### 4. `constants.ts`

Export `THEME_DEFAULTS`, `THEME_CSS_VARS`, and `ALLOWED_FONTS` using the exact values from `SHARED-CONTEXT.md`. Do not change any values.

```typescript
import type { CommunityTheme } from './types';

export const THEME_DEFAULTS: Omit<CommunityTheme, 'communityName' | 'communityType'> = {
  primaryColor: '#2563EB',
  secondaryColor: '#6B7280',
  accentColor: '#DBEAFE',
  fontHeading: 'Inter',
  fontBody: 'Inter',
  logoUrl: null,
};

export const THEME_CSS_VARS = {
  primaryColor: '--theme-primary',
  secondaryColor: '--theme-secondary',
  accentColor: '--theme-accent',
  fontHeading: '--theme-font-heading',
  fontBody: '--theme-font-body',
  logoUrl: '--theme-logo-url',
  communityName: '--theme-community-name',
} as const;

export const ALLOWED_FONTS = [
  'Inter', 'Open Sans', 'Lato', 'Roboto', 'Source Sans 3',
  'Nunito', 'Nunito Sans', 'Poppins', 'Raleway', 'Montserrat',
  'Work Sans', 'DM Sans', 'Plus Jakarta Sans', 'Outfit',
  'Barlow', 'Manrope', 'Urbanist', 'Figtree',
  'Merriweather', 'Lora', 'Playfair Display', 'Source Serif 4',
  'Libre Baskerville', 'Crimson Text', 'EB Garamond',
] as const;
```

### 5. `resolve-theme.ts`

```typescript
export function resolveTheme(
  branding: unknown,
  communityName: string,
  communityType: 'condo_718' | 'hoa_720' | 'apartment',
): CommunityTheme
```

- Accept `unknown` for safety (raw JSONB from DB)
- If `branding` is null/undefined/not-object → return all defaults
- For each color field: validate with `/^#[0-9a-fA-F]{6}$/`, fall back to default if invalid
- For font fields: validate against `ALLOWED_FONTS`, fall back to `'Inter'` if not in list
- `logoUrl`: pass through if string, otherwise `null`
- `communityName`: from parameter, not branding
- `communityType`: from parameter, not branding

### 6. `to-css-vars.ts`

```typescript
export function toCssVars(theme: CommunityTheme): Record<string, string>
```

- Returns `{ '--theme-primary': '#2563EB', ... }` for all keys in `THEME_CSS_VARS`
- Skips `communityType` (not a CSS variable)
- For `logoUrl`: if null, set value to `'none'`

### 7. `to-font-links.ts`

```typescript
export function toFontLinks(theme: CommunityTheme): string[]
```

- Returns Google Fonts `<link>` URLs
- Format: `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap`
- Replace spaces in font name with `+` for URL encoding
- Deduplicate: if `fontHeading === fontBody`, return 1 URL, not 2
- Always request weights: 400, 500, 600, 700

### 8. `index.ts`

Re-export everything:
```typescript
export type { CommunityTheme } from './types';
export { THEME_DEFAULTS, THEME_CSS_VARS, ALLOWED_FONTS } from './constants';
export { resolveTheme } from './resolve-theme';
export { toCssVars } from './to-css-vars';
export { toFontLinks } from './to-font-links';
```

### 9. Unit tests (minimum 7 cases)

1. `resolveTheme` with full valid branding → correct CommunityTheme
2. `resolveTheme` with `null` → all defaults applied
3. `resolveTheme` with invalid hex color (e.g., `'not-a-color'`) → falls back to default
4. `resolveTheme` with invalid font (e.g., `'Comic Sans'`) → falls back to `'Inter'`
5. `toCssVars` → correct key-value mapping, `logoUrl: null` → `'none'`
6. `toFontLinks` with same heading/body → 1 URL
7. `toFontLinks` with different heading/body → 2 URLs, correctly formatted

### 10. Register in vitest workspace

**Modify:** `vitest.workspace.ts` at the repo root — add `'packages/theme'` to the workspace array.

## Do NOT

- Do not modify any files in `apps/web` or `apps/admin`
- Do not consume this package from any app yet — that happens in later phases
- Do not change the CSS variable names from `SHARED-CONTEXT.md`
- Do not add fonts beyond the 25 listed

## Acceptance Criteria

- [ ] `pnpm install` resolves the new package
- [ ] `pnpm --filter @propertypro/theme typecheck` passes
- [ ] All 7+ unit tests pass
- [ ] `ALLOWED_FONTS` has exactly 25 entries
- [ ] `THEME_DEFAULTS.primaryColor` is `'#2563EB'`

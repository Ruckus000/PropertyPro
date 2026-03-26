# Design: Shared Color Token Package + Email Branding Alignment

**Date:** 2026-03-26
**Status:** Draft
**Scope:** Color tokens only (spacing, radius, typography, motion stay in `packages/ui`)

## Problem

Email templates in `packages/email/` hardcode ~15 distinct hex values per template across 29 templates. These values drift from the design system tokens in `packages/ui/`. The audit found mismatches in secondary text color (`#374151` vs `#4B5563`), body background (`#F6F9FC` vs `#F9FAFB`), button radius (`6px` vs `10px`), and status colors (different green/red scales).

The root cause: `packages/ui` owns the token source, but email clients don't support CSS custom properties. There's no way for email templates to consume the same token values.

## Solution

Create `packages/tokens` (`@propertypro/tokens`) as the single source of truth for color tokens. Both `packages/ui` (CSS vars for web) and `packages/email` (resolved hex for inline styles) consume from it.

## Architecture

```
packages/tokens/src/primitives.ts   ← raw hex palette (source of truth)
packages/tokens/src/semantic.ts     ← token definitions as discriminated union refs
packages/tokens/src/email.ts        ← resolved hex values via shared toHex() resolver
packages/tokens/scripts/build.ts    ← generates CSS vars via shared toCssValue() resolver
packages/tokens/src/generated/
  └── tokens.css                    ← generated color-only CSS custom properties
packages/tokens/dist/
  ├── index.js / .d.ts              ← primitives + semantic definitions + resolvers
  ├── email.js / .d.ts              ← resolved hex for email consumers
  └── styles.css                    ← generated color CSS (copied from src/generated/)
```

### Package Exports

```json
{
  "name": "@propertypro/tokens",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./email": { "types": "./dist/email.d.ts", "import": "./dist/email.js" },
    "./styles.css": "./dist/styles.css"
  }
}
```

## Detailed Design

### 1. Token Source: `src/primitives.ts`

Raw hex palette migrated from `packages/ui/src/tokens/colors.ts`. Identical values, identical structure.

```ts
export const primitiveColors = {
  blue: {
    50: '#EFF6FF', 100: '#DBEAFE', 200: '#BFDBFE', 300: '#93C5FD',
    400: '#60A5FA', 500: '#3B82F6', 600: '#2563EB', 700: '#1D4ED8',
    800: '#1E40AF', 900: '#1E3A8A', 950: '#172554',
  },
  gray: {
    0: '#FFFFFF', 25: '#FCFCFD', 50: '#F9FAFB', 100: '#F3F4F6',
    200: '#E5E7EB', 300: '#D1D5DB', 400: '#9CA3AF', 500: '#6B7280',
    600: '#4B5563', 700: '#374151', 800: '#1F2937', 900: '#111827',
    950: '#0D1117',
  },
  green: {
    50: '#ECFDF5', 100: '#D1FAE5', 200: '#A7F3D0',
    500: '#10B981', 600: '#059669', 700: '#047857',
  },
  amber: {
    50: '#FFFBEB', 100: '#FEF3C7', 200: '#FDE68A',
    500: '#F59E0B', 600: '#D97706', 700: '#B45309',
  },
  red: {
    50: '#FEF2F2', 100: '#FEE2E2', 200: '#FECACA',
    500: '#EF4444', 600: '#DC2626', 700: '#B91C1C',
  },
} as const;
```

### 2. Token Definitions: `src/semantic.ts`

Semantic tokens are defined as a discriminated union of references, not pre-resolved values. This models both plain primitive aliases and theme-aware tokens in a single system.

```ts
import { primitiveColors } from './primitives';

type ColorScale = keyof typeof primitiveColors;
type ColorStep<S extends ColorScale> = keyof (typeof primitiveColors)[S];

/** Plain reference to a primitive color */
export type PrimitiveRef = {
  kind: 'primitive';
  scale: ColorScale;
  step: number;
};

/** Theme-overridable reference with CSS var fallback chain */
export type ThemeRef = {
  kind: 'theme';
  cssVar: '--theme-primary' | '--theme-primary-hover' | '--theme-accent';
  fallback: PrimitiveRef;
};

export type TokenRef = PrimitiveRef | ThemeRef;

// --- Shared resolvers (single path from definition to output) ---

/** Resolve to hex — always returns the concrete fallback value */
export function toHex(ref: TokenRef): string {
  const prim = ref.kind === 'theme' ? ref.fallback : ref;
  return primitiveColors[prim.scale][prim.step as ColorStep<typeof prim.scale>] as string;
}

/** Resolve to CSS value — preserves var() indirection and theme fallbacks */
export function toCssValue(ref: TokenRef): string {
  if (ref.kind === 'theme') {
    const fallbackVar = `var(--${ref.fallback.scale}-${ref.fallback.step})`;
    return `var(${ref.cssVar}, ${fallbackVar})`;
  }
  return `var(--${ref.scale}-${ref.step})`;
}

// --- Helper to reduce boilerplate ---

function prim(scale: ColorScale, step: number): PrimitiveRef {
  return { kind: 'primitive', scale, step };
}

function theme(
  cssVar: ThemeRef['cssVar'],
  scale: ColorScale,
  step: number
): ThemeRef {
  return { kind: 'theme', cssVar, fallback: prim(scale, step) };
}

// --- Token definitions ---

export const tokenDefinitions = {
  text: {
    primary:     prim('gray', 900),
    secondary:   prim('gray', 600),
    tertiary:    prim('gray', 600),
    disabled:    prim('gray', 400),
    placeholder: prim('gray', 400),
    inverse:     prim('gray', 0),
    brand:       prim('blue', 600),
    link:        prim('blue', 600),
    linkHover:   prim('blue', 700),
  },
  surface: {
    page:          prim('gray', 50),
    card:          prim('gray', 0),
    subtle:        prim('gray', 25),
    muted:         prim('gray', 100),
    elevated:      prim('gray', 0),
    sunken:        prim('gray', 50),
    hover:         prim('gray', 50),
    inverse:       prim('gray', 950),
    inverseSubtle: prim('gray', 900),
  },
  border: {
    default: prim('gray', 200),
    subtle:  prim('gray', 100),
    strong:  prim('gray', 300),
    muted:   prim('gray', 50),
    focus:   prim('blue', 500),
    error:   prim('red', 500),
  },
  brandAccent: theme('--theme-accent', 'blue', 200),
  interactive: {
    primary:      theme('--theme-primary', 'blue', 600),
    primaryHover: theme('--theme-primary-hover', 'blue', 700),
    primaryActive: prim('blue', 800),
    disabled:      prim('gray', 300),
    subtle:        prim('blue', 50),
    subtleHover:   prim('blue', 100),
    muted:         prim('blue', 100),
  },
  status: {
    success: {
      foreground: prim('green', 700),
      background: prim('green', 50),
      border:     prim('green', 200),
      subtle:     prim('green', 100),
    },
    brand: {
      foreground: theme('--theme-primary', 'blue', 600),
      background: prim('blue', 50),
      border:     prim('blue', 200),
      subtle:     prim('blue', 100),
    },
    warning: {
      foreground: prim('amber', 700),
      background: prim('amber', 50),
      border:     prim('amber', 200),
      subtle:     prim('amber', 100),
    },
    danger: {
      foreground: prim('red', 700),
      background: prim('red', 50),
      border:     prim('red', 200),
      subtle:     prim('red', 100),
    },
    info: {
      foreground: prim('blue', 700),
      background: prim('blue', 50),
      border:     prim('blue', 200),
      subtle:     prim('blue', 100),
    },
    neutral: {
      foreground: prim('gray', 600),
      background: prim('gray', 100),
      border:     prim('gray', 200),
      subtle:     prim('gray', 50),
    },
  },
} as const;
```

**Key design properties:**
- `interactive.primary` and `interactive.primaryHover` are `ThemeRef` — `toCssValue()` emits `var(--theme-primary, var(--blue-600))`, `toHex()` emits `#2563EB`
- `status.brand.foreground` is also `ThemeRef` — same pattern
- `brandAccent` is `ThemeRef` — `var(--theme-accent, var(--blue-200))`
- All other tokens are `PrimitiveRef` — simple alias to hex

### 3. CSS Generator: `scripts/build.ts`

Generates `src/generated/tokens.css` containing **color declarations only**:

```
:root {
  /* Primitive Colors */
  --blue-50: #EFF6FF;
  --blue-100: #DBEAFE;
  ... (all primitives)

  /* Semantic Colors */
  --text-primary: var(--gray-900);
  --text-secondary: var(--gray-600);
  ... (all semantic aliases via toCssValue())

  /* Brand-overridable */
  --brand-accent: var(--theme-accent, var(--blue-200));

  /* Interactive */
  --interactive-primary: var(--theme-primary, var(--blue-600));
  --interactive-primary-hover: var(--theme-primary-hover, var(--blue-700));
  ... (rest via toCssValue())

  /* Status */
  --status-success: var(--green-700);
  --status-brand: var(--theme-primary, var(--blue-600));
  ... (all status tokens)
}
```

The build script imports `primitiveColors`, `tokenDefinitions`, and `toCssValue` — no hardcoded CSS var names or theme fallbacks outside of `semantic.ts`.

**CSS var naming convention** (matches current `tokens.css` exactly):
- Primitives: `--{scale}-{step}` (e.g., `--blue-600`)
- Text: `--text-{name}` (e.g., `--text-primary`)
- Surface: `--surface-{name}` (e.g., `--surface-card`)
- Border: `--border-{name}` (e.g., `--border-default`)
- Interactive: `--interactive-{name}` (e.g., `--interactive-primary`)
- Status: `--status-{variant}`, `--status-{variant}-bg`, `--status-{variant}-border`, `--status-{variant}-subtle`

The naming map from token definition keys to CSS var names is defined in `build.ts` as a lookup, not derived by convention, so we can match the existing CSS exactly (e.g., `surface.card` → `--surface-card`, not `--surface-default`).

### 4. Email Entry: `src/email.ts`

Resolves all semantic tokens to hex using the same `toHex()` resolver. This is a hand-authored source file (not generated).

```ts
import { tokenDefinitions as t, toHex } from './semantic';
import { primitiveColors as p } from './primitives';

/**
 * Resolved color values for email inline styles.
 * Email clients don't support CSS custom properties.
 *
 * For theme-aware tokens (interactive.primary, status.brand),
 * these resolve to the DEFAULT fallback hex. Runtime per-community
 * branding overrides are handled by email-layout.tsx via
 * branding.accentColor.
 */
export const emailColors = {
  // Text
  textPrimary:     toHex(t.text.primary),        // #111827
  textSecondary:   toHex(t.text.secondary),       // #4B5563
  textDisabled:    toHex(t.text.disabled),         // #9CA3AF
  textInverse:     toHex(t.text.inverse),          // #FFFFFF
  textBrand:       toHex(t.text.brand),            // #2563EB
  textLink:        toHex(t.text.link),             // #2563EB

  // Surfaces
  surfacePage:     toHex(t.surface.page),          // #F9FAFB
  surfaceCard:     toHex(t.surface.card),          // #FFFFFF
  surfaceMuted:    toHex(t.surface.muted),         // #F3F4F6

  // Borders
  borderDefault:   toHex(t.border.default),        // #E5E7EB

  // Interactive (default fallback — overridden by branding.accentColor at runtime)
  interactivePrimary:      toHex(t.interactive.primary),      // #2563EB
  interactivePrimaryHover: toHex(t.interactive.primaryHover), // #1D4ED8

  // Status — success
  successForeground: toHex(t.status.success.foreground), // #047857
  successBackground: toHex(t.status.success.background), // #ECFDF5
  successBorder:     toHex(t.status.success.border),     // #A7F3D0
  successSubtle:     toHex(t.status.success.subtle),     // #D1FAE5

  // Status — warning
  warningForeground: toHex(t.status.warning.foreground), // #B45309
  warningBackground: toHex(t.status.warning.background), // #FFFBEB
  warningBorder:     toHex(t.status.warning.border),     // #FDE68A
  warningSubtle:     toHex(t.status.warning.subtle),     // #FEF3C7

  // Status — danger
  dangerForeground: toHex(t.status.danger.foreground),   // #B91C1C
  dangerBackground: toHex(t.status.danger.background),   // #FEF2F2
  dangerBorder:     toHex(t.status.danger.border),       // #FECACA
  dangerSubtle:     toHex(t.status.danger.subtle),       // #FEE2E2

  // Status — info
  infoForeground: toHex(t.status.info.foreground),       // #1D4ED8
  infoBackground: toHex(t.status.info.background),       // #EFF6FF
  infoBorder:     toHex(t.status.info.border),           // #BFDBFE
  infoSubtle:     toHex(t.status.info.subtle),           // #DBEAFE

  // Status — neutral
  neutralForeground: toHex(t.status.neutral.foreground), // #4B5563
  neutralBackground: toHex(t.status.neutral.background), // #F3F4F6
  neutralBorder:     toHex(t.status.neutral.border),     // #E5E7EB
  neutralSubtle:     toHex(t.status.neutral.subtle),     // #F9FAFB
} as const;
```

### 5. Consumer Migration: `packages/ui`

**`packages/ui/src/tokens/colors.ts`** becomes a thin compatibility layer:

```ts
/**
 * Color tokens — re-exported from @propertypro/tokens.
 * packages/ui no longer owns the color source of truth.
 */
export { primitiveColors } from '@propertypro/tokens';

// Semantic colors for web — CSS var() references (unchanged public API)
export const semanticColors = {
  text: {
    primary: "var(--text-primary)",
    secondary: "var(--text-secondary)",
    // ... (all current entries preserved exactly)
  },
  surface: {
    page: "var(--surface-page)",
    default: "var(--surface-card)",
    // ... (all current entries preserved exactly)
  },
  // ... (border, interactive, status — all preserved)
} as const;

export type StatusVariant = keyof typeof semanticColors.status;

export function getStatusColors(status: StatusVariant) {
  return semanticColors.status[status];
}
```

**Why `semanticColors` isn't re-exported from tokens:** The UI semantic colors are CSS `var()` string references (`"var(--text-primary)"`), which is a web-specific representation. The token package owns the definitions and resolvers; UI continues to provide the web-specific API. This keeps the public API identical — no consumer changes needed.

**`packages/ui/src/styles/tokens.css`** — The color sections (primitive colors lines 8-54 and semantic colors lines 130-208) are replaced with content inlined from `@propertypro/tokens/styles.css` during the UI build step. Non-color sections (spacing, radius, typography, motion, focus, elevation, responsive density, focus styles, reduced motion) remain hand-authored in this file.

**Build integration:** Add a `prebuild` script in `packages/ui/package.json` that reads `@propertypro/tokens/styles.css` and splices the color declarations into `tokens.css`, replacing the existing color sections. This is a simple string replacement bounded by the existing section comment markers (`/* Colors */` and `/* Spacing */`).

### 6. Consumer Migration: `packages/email`

**`packages/email/package.json`** — Add `@propertypro/tokens` as a workspace dependency.

**`packages/email/src/components/email-layout.tsx`** — Replace hardcoded hex with `emailColors`:

```ts
import { emailColors } from '@propertypro/tokens/email';

// Before: backgroundColor: '#f6f9fc'
// After:  backgroundColor: emailColors.surfacePage

// Before: color: '#9ca3af'
// After:  color: emailColors.textDisabled

// Accent color override stays:
// backgroundColor: branding.accentColor ?? emailColors.interactivePrimary
```

**All 29 templates** — Same mechanical change:
1. Add `import { emailColors } from '@propertypro/tokens/email';`
2. Replace each hardcoded hex with the corresponding `emailColors.*` property
3. Accent color overrides via `branding.accentColor` remain as-is

**Color corrections applied during migration:**

| Token | Current Email Value | Correct Value (from tokens) | emailColors key |
|-------|--------------------|-----------------------------|-----------------|
| Secondary text | `#374151` (gray-700) | `#4B5563` (gray-600) | `textSecondary` |
| Body background | `#F6F9FC` (custom) | `#F9FAFB` (gray-50) | `surfacePage` |
| Muted text | `#6b7280` (gray-500) | `#9CA3AF` (gray-400) | `textDisabled` |
| Success green | `#16a34a` / `#22c55e` | `#047857` (green-700) | `successForeground` |
| Danger red | `#dc2626` (red-600) | `#B91C1C` (red-700) | `dangerForeground` |

**Colors that stay hardcoded (intentionally):**
- Emergency severity colors (`#ea580c` urgent orange) — not in the semantic token system. Can be added as a future primitive if needed.
- Per-community `branding.accentColor` runtime overrides — these are tenant-specific, not design-system tokens.

### 7. Workspace Wiring

**New dependency edges:**
- `packages/ui` → `@propertypro/tokens` (workspace dependency)
- `packages/email` → `@propertypro/tokens` (workspace dependency)

**Next.js config:**
- Add `@propertypro/tokens` to `transpilePackages` in `apps/web/next.config.ts` and `apps/admin/next.config.ts`

**Turbo pipeline:**
- Workspace dependency graph handles build ordering automatically — `packages/tokens` builds before `packages/ui` and `packages/email` because they declare it as a dependency.

**tsup config (`packages/tokens/tsup.config.ts`):**
- Two entry points: `src/index.ts` and `src/email.ts`
- Output: ESM to `dist/`
- Copy `src/generated/tokens.css` → `dist/styles.css`

### 8. Testing

**`packages/tokens/__tests__/parity.test.ts`** — The contract test:

```ts
import { tokenDefinitions, toCssValue, toHex } from '../src/semantic';
import { emailColors } from '../src/email';
import fs from 'node:fs';
import path from 'node:path';

const cssContent = fs.readFileSync(
  path.resolve(__dirname, '../src/generated/tokens.css'),
  'utf-8'
);

describe('Token parity', () => {
  it('generated CSS contains toCssValue() output for every token', () => {
    // Walk tokenDefinitions recursively, call toCssValue() on each TokenRef,
    // assert CSS file contains a declaration with that value
  });

  it('emailColors matches toHex() output for every mapped token', () => {
    // For each key in emailColors, find the corresponding TokenRef,
    // assert emailColors[key] === toHex(ref)
  });

  it('every toCssValue() output resolves to a CSS var declared in the file', () => {
    // For PrimitiveRef tokens, verify the referenced --scale-step var is declared
    // For ThemeRef tokens, verify the fallback var is declared
  });
});
```

**`packages/ui/__tests__/tokens/tokens.test.ts` updates:**

The existing test reads `packages/ui/src/styles/tokens.css` directly and checks for CSS var declarations. After migration:

- The color section of `tokens.css` is now inlined from `@propertypro/tokens` during the UI prebuild step
- The CSS content is identical (same var names, same values), just sourced differently
- Tests that check `cssContent.includes('--blue-50: #EFF6FF')` still pass
- Tests that check `cssContent.includes('--text-primary: var(--gray-900)')` still pass
- Tests that check `semanticColors.text.primary === 'var(--text-primary)'` still pass (UI's `semanticColors` unchanged)
- The structural check that all semantic color values start with `var(--` still passes

**Possible test adjustments:**
- If the generated CSS has different whitespace or comment formatting, the test's `cssContent.includes()` calls may need minor formatting alignment
- The `primitiveColors` import path changes from `../../src/tokens` to either the same path (if UI re-exports) or `@propertypro/tokens` — either way, the import in the test should use UI's barrel export to test the compatibility layer

## What This Does NOT Change

- Non-color tokens (spacing, radius, typography, motion, elevation) — stay in `packages/ui`
- `packages/shared` — no changes (stays domain logic)
- Email template structure/layout — only color values change
- Runtime `branding.accentColor` override behavior — preserved
- CSS theming via `--theme-primary` / `--theme-accent` injection — preserved
- `packages/ui` public API surface — `primitiveColors`, `semanticColors`, `StatusVariant`, `getStatusColors` all unchanged

## Future Work (Out of Scope)

- Move spacing, radius, typography, motion to `packages/tokens` when they have a second consumer
- Adopt Style Dictionary if token categories grow or Figma sync becomes important
- Add React Email dev server for template preview
- Email dark mode (`@media (prefers-color-scheme: dark)`)
- Add emergency severity colors as a primitive scale

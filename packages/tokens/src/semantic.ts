import { primitiveColors } from './primitives';

type ColorScale = keyof typeof primitiveColors;
type ColorStep<S extends ColorScale> = keyof (typeof primitiveColors)[S] & number;

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
  const scale = primitiveColors[prim.scale] as Record<number, string>;
  return scale[prim.step]!;
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

function prim<S extends ColorScale>(scale: S, step: ColorStep<S>): PrimitiveRef {
  return { kind: 'primitive', scale, step };
}

function theme<S extends ColorScale>(
  cssVar: ThemeRef['cssVar'],
  scale: S,
  step: ColorStep<S>
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

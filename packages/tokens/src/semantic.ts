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
    tertiary:    prim('gray', 500),
    disabled:    prim('gray', 400),
    placeholder: prim('gray', 400),
    inverse:     prim('gray', 0),
    // Text uses the DARKER coral (700 = the landing page's --mk-coral-d, used
    // there for text/links) so brand text/links clear WCAG AA 4.5:1 on the warm
    // off-white surfaces and the coral status tint. Button FILLS stay on coral
    // 600 (interactive.primary) where white text needs the mid step.
    brand:       prim('coral', 700),
    link:        prim('coral', 700),
    linkHover:   prim('coral', 800),
  },
  // Surfaces warm to the `sand` ramp so the app canvas/cards feel consistent
  // with the marketing cream palette instead of clinical-cool. Inverse
  // (dark) surfaces stay on `gray`.
  surface: {
    page:          prim('sand', 50),
    card:          prim('sand', 0),
    subtle:        prim('sand', 25),
    muted:         prim('sand', 100),
    elevated:      prim('sand', 0),
    sunken:        prim('sand', 50),
    hover:         prim('sand', 50),
    inverse:       prim('gray', 950),
    inverseSubtle: prim('gray', 900),
  },
  // Borders warm to `sand` to match the warmed surfaces; focus/error keep
  // their semantic hues.
  border: {
    default: prim('sand', 200),
    subtle:  prim('sand', 100),
    strong:  prim('sand', 300),
    muted:   prim('sand', 50),
    focus:   prim('coral', 500),
    error:   prim('red', 500),
  },
  brandAccent: theme('--theme-accent', 'coral', 200),
  interactive: {
    primary:      theme('--theme-primary', 'coral', 600),
    primaryHover: theme('--theme-primary-hover', 'coral', 700),
    primaryActive: prim('coral', 800),
    disabled:      prim('gray', 300),
    subtle:        prim('coral', 50),
    subtleHover:   prim('coral', 100),
    muted:         prim('coral', 100),
  },
  status: {
    success: {
      foreground: prim('green', 700),
      background: prim('green', 50),
      border:     prim('green', 200),
      subtle:     prim('green', 100),
    },
    brand: {
      // Fallback on coral 700 (not 600): this foreground renders as TEXT on the
      // coral-50 tint (alert-banner brand variant, community cards), where 600
      // is only ~4.1:1. 700 clears AA. Community --theme-primary still overrides.
      foreground: theme('--theme-primary', 'coral', 700),
      background: prim('coral', 50),
      border:     prim('coral', 200),
      subtle:     prim('coral', 100),
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
      foreground: prim('teal', 700),
      background: prim('teal', 50),
      border:     prim('teal', 200),
      subtle:     prim('teal', 100),
    },
    neutral: {
      foreground: prim('gray', 600),
      background: prim('gray', 100),
      border:     prim('gray', 200),
      subtle:     prim('gray', 50),
    },
    owner: {
      foreground: prim('violet', 700),
      background: prim('violet', 50),
      border:     prim('violet', 200),
      subtle:     prim('violet', 100),
    },
    board: {
      foreground: prim('pink', 700),
      background: prim('pink', 50),
      border:     prim('pink', 200),
      subtle:     prim('pink', 100),
    },
    // "Florida Modern" gold accent — marks Professional-tier / premium features
    // (the reserved gold ramp's semantic home). Foreground on gold 800 (not 700)
    // so small "Pro" badge text clears WCAG AA on the gold-100 subtle tint.
    premium: {
      foreground: prim('gold', 800),
      background: prim('gold', 50),
      border:     prim('gold', 200),
      subtle:     prim('gold', 100),
    },
  },
} as const;

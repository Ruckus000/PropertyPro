/**
 * Typography tokens — font families, sizes, weights, line heights
 */

export const primitiveFonts = {
  family: {
    sans: "var(--font-sans, 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
    mono: "var(--font-mono, 'JetBrains Mono', 'SF Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)",
  },
  size: {
    xs: "var(--font-size-xs, 0.6875rem)",
    sm: "var(--font-size-sm, 0.8125rem)",
    base: "var(--font-size-base, 1rem)",
    lg: "var(--font-size-lg, 1.125rem)",
    xl: "var(--font-size-xl, 1.25rem)",
    "2xl": "var(--font-size-2xl, 1.5rem)",
    "3xl": "var(--font-size-3xl, 1.875rem)",
  },
  lineHeight: {
    tight: 1.2,
    snug: 1.35,
    normal: 1.5,
    relaxed: 1.625,
  },
  weight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  letterSpacing: {
    tight: "-0.01em",
    normal: "0",
    wide: "0.02em",
    wider: "0.05em",
  },
} as const;

export const semanticTypography = {
  display: {
    fontFamily: primitiveFonts.family.sans,
    fontSize: primitiveFonts.size["2xl"],
    fontWeight: primitiveFonts.weight.bold,
    lineHeight: primitiveFonts.lineHeight.tight,
    letterSpacing: primitiveFonts.letterSpacing.tight,
  },
  heading: {
    lg: {
      fontFamily: primitiveFonts.family.sans,
      fontSize: primitiveFonts.size.xl,
      fontWeight: primitiveFonts.weight.semibold,
      lineHeight: primitiveFonts.lineHeight.tight,
      letterSpacing: primitiveFonts.letterSpacing.tight,
    },
    md: {
      fontFamily: primitiveFonts.family.sans,
      fontSize: primitiveFonts.size.lg,
      fontWeight: primitiveFonts.weight.semibold,
      lineHeight: primitiveFonts.lineHeight.snug,
      letterSpacing: primitiveFonts.letterSpacing.normal,
    },
    sm: {
      fontFamily: primitiveFonts.family.sans,
      fontSize: primitiveFonts.size.base,
      fontWeight: primitiveFonts.weight.semibold,
      lineHeight: primitiveFonts.lineHeight.snug,
      letterSpacing: primitiveFonts.letterSpacing.normal,
    },
  },
  body: {
    normal: {
      fontFamily: primitiveFonts.family.sans,
      fontSize: primitiveFonts.size.base,
      fontWeight: primitiveFonts.weight.normal,
      lineHeight: primitiveFonts.lineHeight.normal,
      letterSpacing: primitiveFonts.letterSpacing.normal,
    },
    medium: {
      fontFamily: primitiveFonts.family.sans,
      fontSize: primitiveFonts.size.base,
      fontWeight: primitiveFonts.weight.medium,
      lineHeight: primitiveFonts.lineHeight.normal,
      letterSpacing: primitiveFonts.letterSpacing.normal,
    },
  },
  bodySmall: {
    normal: {
      fontFamily: primitiveFonts.family.sans,
      fontSize: primitiveFonts.size.sm,
      fontWeight: primitiveFonts.weight.normal,
      lineHeight: primitiveFonts.lineHeight.normal,
      letterSpacing: primitiveFonts.letterSpacing.normal,
    },
    medium: {
      fontFamily: primitiveFonts.family.sans,
      fontSize: primitiveFonts.size.sm,
      fontWeight: primitiveFonts.weight.medium,
      lineHeight: primitiveFonts.lineHeight.normal,
      letterSpacing: primitiveFonts.letterSpacing.normal,
    },
  },
  caption: {
    fontFamily: primitiveFonts.family.sans,
    fontSize: primitiveFonts.size.xs,
    fontWeight: primitiveFonts.weight.medium,
    lineHeight: primitiveFonts.lineHeight.normal,
    letterSpacing: primitiveFonts.letterSpacing.wide,
  },
  mono: {
    fontFamily: primitiveFonts.family.mono,
    fontSize: primitiveFonts.size.xs,
    fontWeight: primitiveFonts.weight.normal,
    lineHeight: primitiveFonts.lineHeight.normal,
    letterSpacing: primitiveFonts.letterSpacing.normal,
  },
} as const;

export type TypographyVariant = keyof typeof semanticTypography;

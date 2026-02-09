/**
 * Spacing tokens — 4px base unit grid + semantic spacing scales
 */

export const primitiveSpace = {
  0: 0,
  px: 1,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  11: 44,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
} as const;

export const semanticSpacing = {
  inline: {
    xs: primitiveSpace[1],
    sm: primitiveSpace[2],
    md: primitiveSpace[3],
    lg: primitiveSpace[4],
    xl: primitiveSpace[6],
  },
  stack: {
    xs: primitiveSpace[2],
    sm: primitiveSpace[3],
    md: primitiveSpace[4],
    lg: primitiveSpace[6],
    xl: primitiveSpace[8],
  },
  inset: {
    xs: primitiveSpace[2],
    sm: primitiveSpace[3],
    md: primitiveSpace[4],
    lg: primitiveSpace[5],
    xl: primitiveSpace[6],
  },
  section: {
    sm: primitiveSpace[6],
    md: primitiveSpace[8],
    lg: primitiveSpace[12],
    xl: primitiveSpace[16],
  },
  page: {
    sm: primitiveSpace[12],
    md: primitiveSpace[16],
    lg: primitiveSpace[20],
  },
} as const;

export type SpaceCategory = keyof typeof semanticSpacing;

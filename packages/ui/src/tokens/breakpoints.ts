/**
 * Breakpoint tokens
 */

export const primitiveBreakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

/**
 * Interaction sizing — minimum interactive element dimensions
 */
export const interactionSizing = {
  touchTarget: {
    minimum: 44,
    comfortable: 48,
  },
  pointerTarget: {
    minimum: 36,
    comfortable: 40,
  },
} as const;

/**
 * Responsive density — viewport-driven, not user-toggle
 */
export const responsiveDensity = {
  spacious: {
    componentPadding: "inset.md",
    componentGap: "inline.md",
    buttonHeight: 48,
    inputHeight: 48,
  },
  default: {
    componentPadding: "inset.sm",
    componentGap: "inline.sm",
    buttonHeight: 40,
    inputHeight: 40,
  },
} as const;

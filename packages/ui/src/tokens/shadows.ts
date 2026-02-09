/**
 * Shadow tokens + elevation system
 */

export const primitiveShadow = {
  none: "none",
  xs: "0 1px 2px rgba(0,0,0,0.03)",
  sm: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
  md: "0 4px 6px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.02)",
  lg: "0 10px 15px rgba(0,0,0,0.06), 0 4px 6px rgba(0,0,0,0.03)",
  xl: "0 20px 25px rgba(0,0,0,0.08), 0 8px 10px rgba(0,0,0,0.04)",
  "2xl": "0 25px 50px rgba(0,0,0,0.12)",
} as const;

export const semanticElevation = {
  e0: {
    shadow: primitiveShadow.none,
    description: "Flat — default content surface",
  },
  e1: {
    shadow: primitiveShadow.sm,
    description: "Raised — hover lift, sticky bars, subtle emphasis",
  },
  e2: {
    shadow: primitiveShadow.md,
    description: "Overlay — menus, popovers, dropdowns, bottom sheets",
  },
  e3: {
    shadow: primitiveShadow.lg,
    description: "Modal — dialogs, command palettes",
  },
} as const;

export type ElevationLevel = keyof typeof semanticElevation;

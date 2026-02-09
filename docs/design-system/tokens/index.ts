/**
 * PropertyPro Design System - Token Architecture
 *
 * Three-tier token system based on industry best practices:
 * - Primitive: Raw values (colors, spacing, typography) - NEVER use directly
 * - Semantic: Purpose-driven tokens (text colors, surfaces, status) - USE in components
 * - Component: Component-specific tokens - USE for component internals
 *
 * @see https://medium.com/eightshapes-llc/tokens-in-design-systems-25dd82d58421
 * @see https://atlassian.design/foundations/color/
 */

// ═══════════════════════════════════════════════════════════════════════════
// PRIMITIVE TOKENS
// Reference values only - never use directly in components
// ═══════════════════════════════════════════════════════════════════════════

export const primitiveColors = {
  // Brand blues
  blue: {
    50: "#EFF6FF",
    100: "#DBEAFE",
    200: "#BFDBFE",
    300: "#93C5FD",
    400: "#60A5FA",
    500: "#3B82F6",
    600: "#2563EB",
    700: "#1D4ED8",
    800: "#1E40AF",
    900: "#1E3A8A",
    950: "#172554",
  },
  // Neutral grays
  gray: {
    0: "#FFFFFF",
    25: "#FCFCFD",
    50: "#F9FAFB",
    100: "#F3F4F6",
    200: "#E5E7EB",
    300: "#D1D5DB",
    400: "#9CA3AF",
    500: "#6B7280",
    600: "#4B5563",
    700: "#374151",
    800: "#1F2937",
    900: "#111827",
    950: "#0D1117",
  },
  // Status colors
  green: {
    50: "#ECFDF5",
    100: "#D1FAE5",
    200: "#A7F3D0",
    500: "#10B981",
    600: "#059669",
    700: "#047857",
  },
  amber: {
    50: "#FFFBEB",
    100: "#FEF3C7",
    200: "#FDE68A",
    500: "#F59E0B",
    600: "#D97706",
    700: "#B45309",
  },
  red: {
    50: "#FEF2F2",
    100: "#FEE2E2",
    200: "#FECACA",
    500: "#EF4444",
    600: "#DC2626",
    700: "#B91C1C",
  },
} as const;

export const primitiveFonts = {
  family: {
    sans: "var(--font-sans, 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
    mono: "var(--font-mono, 'JetBrains Mono', 'SF Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)",
  },
  // Modular scale (base 16px, ratio ~1.2) using rem units
  size: {
    xs: "var(--font-size-xs, 0.6875rem)", // 11px
    sm: "var(--font-size-sm, 0.8125rem)", // 13px
    base: "var(--font-size-base, 1rem)", // 16px
    lg: "var(--font-size-lg, 1.125rem)", // 18px
    xl: "var(--font-size-xl, 1.25rem)", // 20px
    "2xl": "var(--font-size-2xl, 1.5rem)", // 24px
    "3xl": "var(--font-size-3xl, 1.875rem)", // 30px
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

// 8pt grid with 4pt half-step
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

export const primitiveRadius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  "2xl": 24,
  full: 9999,
} as const;

// Primitive shadow values that back the semantic elevation system.
export const primitiveShadow = {
  none: "none",
  xs: "0 1px 2px rgba(0,0,0,0.03)",
  sm: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
  md: "0 4px 6px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.02)",
  lg: "0 10px 15px rgba(0,0,0,0.06), 0 4px 6px rgba(0,0,0,0.03)",
  xl: "0 20px 25px rgba(0,0,0,0.08), 0 8px 10px rgba(0,0,0,0.04)",
  "2xl": "0 25px 50px rgba(0,0,0,0.12)",
} as const;

export const primitiveMotion = {
  duration: {
    instant: 0,
    micro: 100,
    quick: 150,
    standard: 250,
    slow: 350,
    expressive: 500,
  },
  easing: {
    linear: "linear",
    standard: "cubic-bezier(0.4, 0, 0.2, 1)",
    enter: "cubic-bezier(0, 0, 0.2, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
    bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
} as const;

export const primitiveBreakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// SEMANTIC TOKENS
// Purpose-driven, context-aware - USE these in components
// ═══════════════════════════════════════════════════════════════════════════

export const semanticColors = {
  // Text hierarchy
  text: {
    primary: "var(--text-primary)",
    secondary: "var(--text-secondary)",
    tertiary: "var(--text-tertiary)",
    disabled: "var(--text-disabled)",
    placeholder: "var(--text-placeholder)",
    inverse: "var(--text-inverse)",
    brand: "var(--text-brand)",
    link: "var(--text-link)",
    linkHover: "var(--text-link-hover)",
  },
  // Surfaces & backgrounds
  surface: {
    page: "var(--surface-page)",
    default: "var(--surface-card)",
    subtle: "var(--surface-subtle)",
    muted: "var(--surface-muted)",
    elevated: "var(--surface-elevated)",
    sunken: "var(--surface-sunken)",
    inverse: "var(--surface-inverse)",
    inverseSubtle: "var(--surface-inverse-subtle)",
  },
  // Borders
  border: {
    default: "var(--border-default)",
    subtle: "var(--border-subtle)",
    strong: "var(--border-strong)",
    muted: "var(--border-muted)",
    focus: "var(--border-focus)",
    error: "var(--border-error)",
  },
  // Interactive elements
  interactive: {
    default: "var(--interactive-primary)",
    hover: "var(--interactive-primary-hover)",
    active: "var(--interactive-primary-active)",
    disabled: "var(--interactive-disabled)",
    subtle: "var(--interactive-subtle)",
    subtleHover: "var(--interactive-subtle-hover)",
    muted: "var(--interactive-muted)",
  },
  // Status colors with full context
  status: {
    success: {
      foreground: "var(--status-success)",
      background: "var(--status-success-bg)",
      border: "var(--status-success-border)",
      subtle: "var(--status-success-subtle)",
    },
    brand: {
      // Blue (brand) status for "good but not perfect" metrics (80–99%)
      foreground: "var(--status-brand)",
      background: "var(--status-brand-bg)",
      border: "var(--status-brand-border)",
      subtle: "var(--status-brand-subtle)",
    },
    warning: {
      foreground: "var(--status-warning)",
      background: "var(--status-warning-bg)",
      border: "var(--status-warning-border)",
      subtle: "var(--status-warning-subtle)",
    },
    danger: {
      foreground: "var(--status-danger)",
      background: "var(--status-danger-bg)",
      border: "var(--status-danger-border)",
      subtle: "var(--status-danger-subtle)",
    },
    info: {
      foreground: "var(--status-info)",
      background: "var(--status-info-bg)",
      border: "var(--status-info-border)",
      subtle: "var(--status-info-subtle)",
    },
    neutral: {
      foreground: "var(--status-neutral)",
      background: "var(--status-neutral-bg)",
      border: "var(--status-neutral-border)",
      subtle: "var(--status-neutral-subtle)",
    },
  },
} as const;

export const semanticTypography = {
  // Display - Hero text, large numbers
  display: {
    fontFamily: primitiveFonts.family.sans,
    fontSize: primitiveFonts.size["2xl"],
    fontWeight: primitiveFonts.weight.bold,
    lineHeight: primitiveFonts.lineHeight.tight,
    letterSpacing: primitiveFonts.letterSpacing.tight,
  },
  // Headings (use size prop: sm|md|lg)
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
  // Body text (use weight prop: normal|medium)
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
  // Body small (use weight prop: normal|medium)
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
  // Captions & labels
  caption: {
    fontFamily: primitiveFonts.family.sans,
    fontSize: primitiveFonts.size.xs,
    fontWeight: primitiveFonts.weight.medium,
    lineHeight: primitiveFonts.lineHeight.normal,
    letterSpacing: primitiveFonts.letterSpacing.wide,
  },
  // Monospace
  mono: {
    fontFamily: primitiveFonts.family.mono,
    fontSize: primitiveFonts.size.xs,
    fontWeight: primitiveFonts.weight.normal,
    lineHeight: primitiveFonts.lineHeight.normal,
    letterSpacing: primitiveFonts.letterSpacing.normal,
  },
} as const;

export const semanticSpacing = {
  // ── Micro tokens (component internals) ──
  inline: {
    xs: primitiveSpace[1],  // 4px
    sm: primitiveSpace[2],  // 8px
    md: primitiveSpace[3],  // 12px
    lg: primitiveSpace[4],  // 16px
    xl: primitiveSpace[6],  // 24px
  },
  stack: {
    xs: primitiveSpace[2],  // 8px
    sm: primitiveSpace[3],  // 12px
    md: primitiveSpace[4],  // 16px
    lg: primitiveSpace[6],  // 24px
    xl: primitiveSpace[8],  // 32px
  },
  inset: {
    xs: primitiveSpace[2],  // 8px
    sm: primitiveSpace[3],  // 12px
    md: primitiveSpace[4],  // 16px
    lg: primitiveSpace[5],  // 20px
    xl: primitiveSpace[6],  // 24px
  },
  // ── Macro tokens (section/page composition) ──
  section: {
    sm: primitiveSpace[6],  // 24px
    md: primitiveSpace[8],  // 32px
    lg: primitiveSpace[12], // 48px
    xl: primitiveSpace[16], // 64px
  },
  page: {
    sm: primitiveSpace[12], // 48px
    md: primitiveSpace[16], // 64px
    lg: primitiveSpace[20], // 80px
  },
} as const;

/**
 * Elevation System
 *
 * E0 — Flat: Default content surfaces (cards at rest, page content)
 * E1 — Raised: Hover states, sticky headers, subtle emphasis
 * E2 — Overlay: Menus, popovers, dropdowns, bottom sheets
 * E3 — Modal: Dialogs, command palettes, full-screen overlays
 *
 * Rules:
 * - E2/E3 are ONLY for elements that overlay page content
 * - Prefer borders over shadows for hierarchy; use elevation sparingly
 * - Mobile bottom sheets use E2
 */
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

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT TOKENS
// Component-specific values - USE for specific component internals
// ═══════════════════════════════════════════════════════════════════════════

export const componentTokens = {
  button: {
    height: {
      sm: 36,
      md: 40,
      lg: 48,
    },
    padding: {
      sm: primitiveSpace[3],  // 12px
      md: primitiveSpace[4],  // 16px
      lg: primitiveSpace[5],  // 20px
    },
    iconSize: {
      sm: 14,
      md: 16,
      lg: 18,
    },
    gap: primitiveSpace[2],
    radius: primitiveRadius.md,
  },
  badge: {
    height: {
      sm: 20,
      md: 24,
      lg: 28,
    },
    padding: {
      sm: primitiveSpace[2],  // 8px
      md: primitiveSpace[3],  // 12px
      lg: primitiveSpace[3],  // 12px
    },
    iconSize: {
      sm: 12,
      md: 14,
      lg: 16,
    },
    gap: primitiveSpace[1],
    radius: primitiveRadius.full,
  },
  input: {
    height: {
      sm: 36,
      md: 40,
      lg: 48,
    },
    padding: {
      sm: primitiveSpace[2],
      md: primitiveSpace[3],
      lg: primitiveSpace[4],
    },
    radius: primitiveRadius.sm,
    borderWidth: 1,
    focusBorderWidth: 2,
  },
  card: {
    padding: {
      sm: primitiveSpace[4],
      md: primitiveSpace[5],
      lg: primitiveSpace[6],
    },
    radius: primitiveRadius.md,
    gap: primitiveSpace[4],
    elevation: {
      rest: "e0",
      hover: "e1",
      interactive: "e1",
    },
  },
  nav: {
    rail: {
      widthCollapsed: 64,
      widthExpanded: 240,
    },
    item: {
      height: 44,
      padding: primitiveSpace[3],
      radius: primitiveRadius.md,
      iconSize: 20,
      gap: primitiveSpace[3],
    },
  },
  table: {
    row: {
      height: 52,
      padding: primitiveSpace[4],
    },
    header: {
      height: 40,
      padding: primitiveSpace[4],
    },
    cell: {
      padding: primitiveSpace[3],
    },
  },
  modal: {
    width: {
      sm: 400,
      md: 560,
      lg: 720,
      xl: 960,
    },
    padding: primitiveSpace[6],
    radius: primitiveRadius.lg,
    elevation: "e3",
  },
  tooltip: {
    padding: `${primitiveSpace[2]}px ${primitiveSpace[3]}px`,
    radius: primitiveRadius.md,
    maxWidth: 280,
  },
} as const;

/**
 * Interaction Sizing
 *
 * Minimum interactive element dimensions for accessibility.
 * Based on WCAG 2.2 Target Size (Level AA: 24px minimum, AAA: 44px).
 * We target 44px on touch, 36px on pointer devices.
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
 * Compliance Status Escalation
 *
 * Defines how status presentation intensifies as deadlines approach.
 * Components should use these tiers to determine rendering treatment.
 *
 * - calm: > 30 days out. Subtle background only, no icon emphasis.
 * - aware: 8–30 days out. Standard badge with icon.
 * - urgent: 1–7 days out. Prominent badge, stronger color, icon pulse optional.
 * - critical: Overdue. Full danger treatment, persistent visibility.
 *
 * Rules:
 * - NEVER rely on color alone. Always pair with icon + text.
 * - Critical items must be visible without scrolling on the dashboard.
 */
export const complianceEscalation = {
  calm: {
    variant: "neutral" as const,
    treatment: "subtle",
    iconEmphasis: false,
    description: "> 30 days from deadline",
  },
  aware: {
    variant: "brand" as const,
    treatment: "standard",
    iconEmphasis: false,
    description: "8–30 days from deadline",
  },
  urgent: {
    variant: "warning" as const,
    treatment: "prominent",
    iconEmphasis: true,
    description: "1–7 days from deadline",
  },
  critical: {
    variant: "danger" as const,
    treatment: "persistent",
    iconEmphasis: true,
    description: "Overdue",
  },
} as const;

export type EscalationTier = keyof typeof complianceEscalation;

/**
 * Semantic Motion
 *
 * Motion is functional in PropertyPro, not decorative.
 * Every animation must serve one of these purposes:
 * - Feedback: Confirm user action completed
 * - Orientation: Show where content came from or went
 * - Attention: Draw focus to status changes or deadlines
 *
 * Rules:
 * - ALWAYS respect prefers-reduced-motion
 * - Status transitions (compliant → overdue) use `attention` timing
 * - Page transitions use `orientation` timing
 * - Button/hover states use `feedback` timing
 */
export const semanticMotion = {
  feedback: {
    duration: primitiveMotion.duration.quick,
    easing: primitiveMotion.easing.standard,
    description: "Hover, press, toggle — immediate response",
  },
  orientation: {
    duration: primitiveMotion.duration.standard,
    easing: primitiveMotion.easing.enter,
    description: "Page transitions, panel slides, content reveals",
  },
  attention: {
    duration: primitiveMotion.duration.slow,
    easing: primitiveMotion.easing.bounce,
    description: "Status changes, deadline alerts, celebration moments",
  },
  none: {
    duration: primitiveMotion.duration.instant,
    easing: primitiveMotion.easing.linear,
    description: "Reduced motion fallback",
  },
} as const;

/**
 * Responsive Density
 *
 * Density is NOT a user toggle. It is driven by viewport:
 * - Mobile (< 768px): "spacious" — larger touch targets, generous padding
 * - Desktop (>= 768px): "default" — tighter components, same macro spacing
 *
 * Implementation:
 * - Component tokens adjust padding/gap by one step down at desktop breakpoints
 * - Section/page spacing (macro) stays constant across all viewports
 * - Touch targets: 44px minimum on mobile, 36px minimum on desktop
 */
export const responsiveDensity = {
  spacious: {
    componentPadding: "inset.md",
    componentGap: "inline.md",
    buttonHeight: componentTokens.button.height.lg,
    inputHeight: componentTokens.input.height.lg,
  },
  default: {
    componentPadding: "inset.sm",
    componentGap: "inline.sm",
    buttonHeight: componentTokens.button.height.md,
    inputHeight: componentTokens.input.height.md,
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate CSS transition string from motion tokens
 */
export function createTransition(
  properties: string | string[] = "all",
  duration: keyof typeof primitiveMotion.duration = "quick",
  easing: keyof typeof primitiveMotion.easing = "standard"
): string {
  const props = Array.isArray(properties) ? properties : [properties];
  const dur = primitiveMotion.duration[duration];
  const ease = primitiveMotion.easing[easing];
  return props.map((p) => `${p} ${dur}ms ${ease}`).join(", ");
}

/**
 * Get spacing value from semantic spacing
 */
export function space<C extends keyof typeof semanticSpacing>(
  category: C,
  size: keyof (typeof semanticSpacing)[C]
): number {
  return semanticSpacing[category][size] as number;
}

/**
 * Get status color set by key
 */
export function getStatusColors(
  status: StatusVariant
) {
  return semanticColors.status[status];
}

// ═══════════════════════════════════════════════════════════════════════════
// THEME TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export type PrimitiveColors = typeof primitiveColors;
export type SemanticColors = typeof semanticColors;
export type SemanticTypography = typeof semanticTypography;
export type SemanticSpacing = typeof semanticSpacing;
export type ComponentTokens = typeof componentTokens;
export type TypographyVariant = keyof typeof semanticTypography;
export type SpaceCategory = keyof typeof semanticSpacing;
export type StatusVariant = keyof typeof semanticColors.status;

// Combined theme object for context
export const theme = {
  colors: semanticColors,
  typography: semanticTypography,
  spacing: semanticSpacing,
  components: componentTokens,
  radius: primitiveRadius,
  shadow: primitiveShadow,
  elevation: semanticElevation,
  motion: primitiveMotion,
  motionSemantic: semanticMotion,
  escalation: complianceEscalation,
  interactionSizing,
  density: responsiveDensity,
  breakpoints: primitiveBreakpoints,
} as const;

export type Theme = typeof theme;

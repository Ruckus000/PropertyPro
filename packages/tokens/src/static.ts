/**
 * Static (non-color) design tokens — spacing, radius, typography, motion,
 * sizing, focus, elevation, and navigation.
 *
 * These values are the source of truth consumed by scripts/build.ts to
 * regenerate packages/ui/src/styles/tokens.css (originally transcribed 1:1
 * from that file; deliberate value changes happen HERE). Color tokens live
 * in primitives.ts / semantic.ts instead.
 */

export const staticTokens = {
  spacing: {
    "1": "4px",
    "2": "8px",
    "3": "12px",
    "4": "16px",
    "5": "20px",
    "6": "24px",
    "8": "32px",
    "12": "48px",
    "16": "64px",
    "20": "80px",
  },
  radius: {
    sm: "6px",
    md: "10px",
    lg: "16px",
    xl: "20px",
    "2xl": "24px",
    full: "9999px",
  },
  fontFamily: {
    sans: `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
    mono: `"JetBrains Mono", "SF Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
  },
  fontSize: {
    xs: { value: "0.75rem", px: "12px" },
    sm: { value: "0.875rem", px: "14px" },
    base: { value: "1rem", px: "16px" },
    lg: { value: "1.125rem", px: "18px" },
    xl: { value: "1.25rem", px: "20px" },
    "2xl": { value: "1.5rem", px: "24px" },
    "3xl": { value: "1.875rem", px: "30px" },
  },
  fontSizeLargeText: {
    xs: { value: "0.875rem", note: "14px (default 12px)" },
    sm: { value: "1rem", note: "16px (default 14px)" },
    base: { value: "1.125rem", note: "18px (default 16px)" },
    lg: { value: "1.25rem", note: "20px (default 18px)" },
    xl: { value: "1.5rem", note: "24px (default 20px)" },
    "2xl": { value: "1.75rem", note: "28px (default 24px)" },
    "3xl": { value: "2.125rem", note: "34px (default 30px)" },
  },
  motionDuration: {
    instant: "0ms",
    micro: "100ms",
    quick: "150ms",
    standard: "250ms",
    slow: "350ms",
    expressive: "500ms",
  },
  ease: {
    standard: "cubic-bezier(0.4, 0, 0.2, 1)",
    enter: "cubic-bezier(0, 0, 0.2, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
    bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
  sizing: {
    "touch-target-min": "44px",
    "pointer-target-min": "36px",
    "component-padding": "var(--space-4)",
    "component-gap": "var(--space-3)",
    "input-height": "48px",
    "button-height": "48px",
  },
  sizingDesktop: {
    "component-padding": "var(--space-3)",
    "component-gap": "var(--space-2)",
    "input-height": "40px",
    "button-height": "40px",
    "touch-target-min": "36px",
  },
  focus: {
    "focus-ring-color": "var(--blue-500)",
    "focus-ring-offset": "2px",
    "focus-ring-width": "2px",
    "focus-ring-style": "solid",
    "focus-ring-color-danger": "var(--red-500)",
    "focus-ring-color-inverse": "var(--gray-0)",
  },
  elevation: {
    // Slate-tinted (#0F172A base) rather than pure-black shadows — Stripe-style
    // warmth; alpha nudged up slightly to compensate for the tint (Wave 3).
    e0: "none",
    e1: "0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)",
    e2: "0 4px 6px rgba(15,23,42,0.06), 0 2px 4px rgba(15,23,42,0.04)",
    e3: "0 10px 15px rgba(15,23,42,0.08), 0 4px 6px rgba(15,23,42,0.05)",
  },
  nav: {
    "nav-surface": "var(--surface-card)",
    "nav-text-active": "var(--text-primary)",
    "nav-text-inactive": "var(--text-secondary)",
    "nav-text-muted": "var(--text-tertiary)",
    "nav-bg-active": "var(--surface-muted)",
    "nav-bg-hover": "var(--surface-hover)",
    "nav-divider": "var(--border-subtle)",
    "nav-border-divider": "var(--border-default)",
    "nav-badge-bg": "var(--surface-muted)",
    "nav-badge-border": "var(--surface-card)",
    "nav-indicator": "var(--interactive-primary)",
  },
} as const;

export type StaticTokens = typeof staticTokens;

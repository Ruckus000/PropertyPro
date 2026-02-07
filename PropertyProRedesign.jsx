/**
 * PropertyPro Compliance Dashboard - Redesigned with Design System
 *
 * This implementation follows the PropertyPro Design System guidelines:
 * - Three-tier token architecture (primitive → semantic → component)
 * - Compound component patterns for flexibility
 * - Semantic HTML and accessibility
 * - Consistent spacing using semantic tokens
 *
 * @see /docs/design-system/README.md
 */

import { useState, useEffect, useMemo, createContext, useContext, forwardRef, Fragment, isValidElement, cloneElement } from "react";
import {
  Shield, FileText, Calendar, Bell, Wrench, Users, Search,
  ChevronDown, AlertTriangle, Clock, Upload, Download, Eye, Plus,
  Settings, Building, DollarSign, HardHat, CheckCircle, ArrowRight, Menu, X, ChevronLeft
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   DESIGN SYSTEM TOKENS
   Three-tier architecture: Primitive → Semantic → Component
   @see /docs/design-system/tokens/index.ts
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Primitive Tokens (NEVER use directly in components) ───
const primitiveColors = {
  blue: {
    50: "#EFF6FF", 100: "#DBEAFE", 200: "#BFDBFE", 300: "#93C5FD",
    400: "#60A5FA", 500: "#3B82F6", 600: "#2563EB", 700: "#1D4ED8",
    800: "#1E40AF", 900: "#1E3A8A", 950: "#172554"
  },
  gray: {
    0: "#FFFFFF", 25: "#FCFCFD", 50: "#F9FAFB", 100: "#F3F4F6",
    200: "#E5E7EB", 300: "#D1D5DB", 400: "#9CA3AF", 500: "#6B7280",
    600: "#4B5563", 700: "#374151", 800: "#1F2937", 900: "#111827",
    950: "#0D1117"
  },
  green: { 50: "#ECFDF5", 100: "#D1FAE5", 200: "#A7F3D0", 500: "#10B981", 600: "#059669", 700: "#047857" },
  amber: { 50: "#FFFBEB", 100: "#FEF3C7", 200: "#FDE68A", 500: "#F59E0B", 600: "#D97706", 700: "#B45309" },
  red: { 50: "#FEF2F2", 100: "#FEE2E2", 200: "#FECACA", 500: "#EF4444", 600: "#DC2626", 700: "#B91C1C" }
};

const primitiveFonts = {
  family: {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', Consolas, monospace"
  },
  size: { xs: "0.694rem", sm: "0.833rem", base: "1rem", lg: "1.2rem", xl: "1.44rem", "2xl": "1.728rem", "3xl": "2.074rem" },
  lineHeight: { tight: 1.2, snug: 1.35, normal: 1.5, relaxed: 1.625 },
  weight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
  letterSpacing: { tight: "-0.01em", normal: "0", wide: "0.02em", wider: "0.05em" }
};

const primitiveSpace = {
  0: 0, 1: 4, 1.5: 6, 2: 8, 2.5: 10, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64
};

const primitiveRadius = { none: 0, sm: 4, md: 8, lg: 12, xl: 16, full: 9999 };

const primitiveShadow = {
  none: "none",
  xs: "0 1px 2px rgba(0,0,0,0.03)",
  sm: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
  md: "0 4px 6px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.02)",
  lg: "0 10px 15px rgba(0,0,0,0.06), 0 4px 6px rgba(0,0,0,0.03)",
  xl: "0 20px 25px rgba(0,0,0,0.08), 0 8px 10px rgba(0,0,0,0.04)"
};

const primitiveMotion = {
  duration: { instant: 0, micro: 100, quick: 150, standard: 250, slow: 350 },
  easing: {
    linear: "linear",
    standard: "cubic-bezier(0.4, 0, 0.2, 1)",
    enter: "cubic-bezier(0, 0, 0.2, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)"
  }
};

// ─── Semantic Tokens (USE these in components) ───
const semanticColors = {
  text: {
    primary: "var(--text-primary)",
    secondary: "var(--text-secondary)",
    tertiary: "var(--text-tertiary)",
    disabled: "var(--text-disabled)",
    inverse: "var(--text-inverse)",
    brand: "var(--text-brand)",
    link: "var(--text-link)",
    linkHover: "var(--text-link-hover)"
  },
  surface: {
    page: "var(--surface-page)",
    default: "var(--surface-card)",
    subtle: "var(--surface-subtle)",
    muted: "var(--surface-muted)",
    elevated: "var(--surface-elevated)",
    inverse: "var(--surface-inverse)",
    // Translucent overlays for dark surfaces
    inverseOverlay: "var(--surface-inverse-overlay)",
    inverseOverlayHover: "var(--surface-inverse-overlay-hover)",
    inverseBorder: "var(--surface-inverse-border)",
    inverseTextMuted: "var(--surface-inverse-text-muted)",
    inverseTextSubtle: "var(--surface-inverse-text-subtle)"
  },
  border: {
    default: "var(--border-default)",
    subtle: "var(--border-subtle)",
    strong: "var(--border-strong)",
    focus: "var(--border-focus)"
  },
  interactive: {
    default: "var(--interactive-primary)",
    hover: "var(--interactive-primary-hover)",
    active: "var(--interactive-primary-active)",
    subtle: "var(--interactive-subtle)",
    subtleHover: "var(--interactive-subtle-hover)"
  },
  status: {
    success: {
      foreground: "var(--status-success)",
      background: "var(--status-success-bg)",
      border: "var(--status-success-border)"
    },
    brand: {
      // Blue (brand) status for "good but not perfect" metrics (80–99%)
      foreground: "var(--status-brand)",
      background: "var(--status-brand-bg)",
      border: "var(--status-brand-border)"
    },
    warning: {
      foreground: "var(--status-warning)",
      background: "var(--status-warning-bg)",
      border: "var(--status-warning-border)"
    },
    danger: {
      foreground: "var(--status-danger)",
      background: "var(--status-danger-bg)",
      border: "var(--status-danger-border)"
    },
    info: {
      foreground: "var(--status-info)",
      background: "var(--status-info-bg)",
      border: "var(--status-info-border)"
    },
    neutral: {
      foreground: "var(--status-neutral)",
      background: "var(--status-neutral-bg)",
      border: "var(--status-neutral-border)"
    }
  }
};

const semanticTypography = {
  display: {
    fontFamily: primitiveFonts.family.sans,
    fontSize: primitiveFonts.size["2xl"],
    fontWeight: primitiveFonts.weight.bold,
    lineHeight: primitiveFonts.lineHeight.tight,
    letterSpacing: primitiveFonts.letterSpacing.tight
  },
  heading1: {
    fontFamily: primitiveFonts.family.sans,
    fontSize: primitiveFonts.size.xl,
    fontWeight: primitiveFonts.weight.semibold,
    lineHeight: primitiveFonts.lineHeight.tight
  },
  heading2: {
    fontFamily: primitiveFonts.family.sans,
    fontSize: primitiveFonts.size.lg,
    fontWeight: primitiveFonts.weight.semibold,
    lineHeight: primitiveFonts.lineHeight.snug
  },
  heading3: {
    fontFamily: primitiveFonts.family.sans,
    fontSize: primitiveFonts.size.base,
    fontWeight: primitiveFonts.weight.semibold,
    lineHeight: primitiveFonts.lineHeight.snug
  },
  body: {
    fontFamily: primitiveFonts.family.sans,
    fontSize: primitiveFonts.size.base,
    fontWeight: primitiveFonts.weight.normal,
    lineHeight: primitiveFonts.lineHeight.normal
  },
  bodyMedium: {
    fontFamily: primitiveFonts.family.sans,
    fontSize: primitiveFonts.size.base,
    fontWeight: primitiveFonts.weight.medium,
    lineHeight: primitiveFonts.lineHeight.normal
  },
  bodySm: {
    fontFamily: primitiveFonts.family.sans,
    fontSize: primitiveFonts.size.sm,
    fontWeight: primitiveFonts.weight.normal,
    lineHeight: primitiveFonts.lineHeight.normal
  },
  bodySmMedium: {
    fontFamily: primitiveFonts.family.sans,
    fontSize: primitiveFonts.size.sm,
    fontWeight: primitiveFonts.weight.medium,
    lineHeight: primitiveFonts.lineHeight.normal
  },
  caption: {
    fontFamily: primitiveFonts.family.sans,
    fontSize: primitiveFonts.size.xs,
    fontWeight: primitiveFonts.weight.medium,
    lineHeight: primitiveFonts.lineHeight.normal,
    letterSpacing: primitiveFonts.letterSpacing.wide
  },
  mono: {
    fontFamily: primitiveFonts.family.mono,
    fontSize: primitiveFonts.size.xs,
    fontWeight: primitiveFonts.weight.normal,
    lineHeight: primitiveFonts.lineHeight.normal
  }
};

const semanticSpacing = {
  inline: { xs: primitiveSpace[1], sm: primitiveSpace[2], md: primitiveSpace[3], lg: primitiveSpace[4], xl: primitiveSpace[6] },
  stack: { xs: primitiveSpace[2], sm: primitiveSpace[3], md: primitiveSpace[4], lg: primitiveSpace[6], xl: primitiveSpace[8] },
  section: { sm: primitiveSpace[6], md: primitiveSpace[8], lg: primitiveSpace[12], xl: primitiveSpace[16] },
  inset: { xs: primitiveSpace[2], sm: primitiveSpace[3], md: primitiveSpace[4], lg: primitiveSpace[5], xl: primitiveSpace[6] }
};

// ─── Component Tokens ───
const componentTokens = {
  button: {
    height: { sm: 32, md: 40, lg: 48 },
    padding: { sm: primitiveSpace[3], md: primitiveSpace[4], lg: primitiveSpace[5] },
    iconSize: { sm: 14, md: 16, lg: 18 },
    gap: primitiveSpace[2],
    radius: primitiveRadius.md
  },
  badge: {
    height: { sm: 20, md: 24, lg: 28 },
    padding: { sm: primitiveSpace[2], md: primitiveSpace[3], lg: primitiveSpace[3] },
    iconSize: { sm: 12, md: 14, lg: 16 },
    gap: primitiveSpace[1],
    radius: primitiveRadius.full
  },
  card: {
    padding: { sm: primitiveSpace[4], md: primitiveSpace[5], lg: primitiveSpace[6] },
    radius: primitiveRadius.lg,
    gap: primitiveSpace[4]
  },
  nav: {
    rail: { widthCollapsed: 64, widthExpanded: 240 },
    item: { height: 44, padding: primitiveSpace[3], radius: primitiveRadius.md, iconSize: 20, gap: primitiveSpace[3] }
  }
};

// ─── Utility Functions ───
function createTransition(properties = "all", duration = "quick", easing = "standard") {
  const props = Array.isArray(properties) ? properties : [properties];
  const dur = primitiveMotion.duration[duration];
  const ease = primitiveMotion.easing[easing];
  return props.map(p => `${p} ${dur}ms ${ease}`).join(", ");
}

// ─── Hooks (inlined from docs/design-system/hooks/) ───
function useKeyboardClick(onClick) {
  return {
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick?.(e);
      }
    },
    onClick,
    tabIndex: onClick ? 0 : undefined,
    role: onClick ? "button" : undefined
  };
}

const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280 };

function useBreakpoint() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : breakpoints.lg
  );

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return useMemo(() => {
    const breakpoint =
      Object.entries(breakpoints)
        .slice()
        .reverse()
        .find(([, value]) => width >= value)?.[0] ?? "xs";

    return {
      width,
      isMobile: width < breakpoints.sm,
      isTablet: width >= breakpoints.sm && width < breakpoints.lg,
      isDesktop: width >= breakpoints.lg,
      breakpoint
    };
  }, [width]);
}

function useHashParams() {
  const [params, setParams] = useState(() => {
    if (typeof window === "undefined") return {};
    const hash = window.location.hash.slice(1);
    return Object.fromEntries(new URLSearchParams(hash));
  });

  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.slice(1);
      setParams(Object.fromEntries(new URLSearchParams(hash)));
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const setParam = (key, value) => {
    const current = new URLSearchParams(window.location.hash.slice(1));
    if (value === undefined || value === null) {
      current.delete(key);
    } else {
      current.set(key, value);
    }
    window.location.hash = current.toString();
  };

  const setParamsMultiple = (obj) => {
    const current = new URLSearchParams(window.location.hash.slice(1));
    Object.entries(obj).forEach(([k, v]) => {
      if (v === undefined || v === null) current.delete(k);
      else current.set(k, v);
    });
    window.location.hash = current.toString();
  };

  return { params, setParam, setParamsMultiple };
}

const injectedGlobalStyles = `
  html { font-size: 93.75%; }

  :root {
    /* Focus */
    --focus-ring-color: #3b82f6;
    --focus-ring-offset: 2px;
    --focus-ring-width: 2px;

    /* Breakpoints */
    --breakpoint-sm: 640px;
    --breakpoint-md: 768px;
    --breakpoint-lg: 1024px;
    --breakpoint-xl: 1280px;
    --breakpoint-2xl: 1536px;

    /* Primitives: Colors */
    --blue-50: #EFF6FF;
    --blue-100: #DBEAFE;
    --blue-200: #BFDBFE;
    --blue-300: #93C5FD;
    --blue-400: #60A5FA;
    --blue-500: #3B82F6;
    --blue-600: #2563EB;
    --blue-700: #1D4ED8;
    --blue-800: #1E40AF;
    --blue-900: #1E3A8A;
    --blue-950: #172554;

    --gray-0: #FFFFFF;
    --gray-25: #FCFCFD;
    --gray-50: #F9FAFB;
    --gray-100: #F3F4F6;
    --gray-200: #E5E7EB;
    --gray-300: #D1D5DB;
    --gray-400: #9CA3AF;
    --gray-500: #6B7280;
    --gray-600: #4B5563;
    --gray-700: #374151;
    --gray-800: #1F2937;
    --gray-900: #111827;
    --gray-950: #0D1117;

    --green-50: #ECFDF5;
    --green-100: #D1FAE5;
    --green-200: #A7F3D0;
    --green-500: #10B981;
    --green-600: #059669;
    --green-700: #047857;

    --amber-50: #FFFBEB;
    --amber-100: #FEF3C7;
    --amber-200: #FDE68A;
    --amber-500: #F59E0B;
    --amber-600: #D97706;
    --amber-700: #B45309;

    --red-50: #FEF2F2;
    --red-100: #FEE2E2;
    --red-200: #FECACA;
    --red-500: #EF4444;
    --red-600: #DC2626;
    --red-700: #B91C1C;

    /* Semantic */
    --text-primary: var(--gray-900);
    --text-secondary: var(--gray-600);
    --text-tertiary: var(--gray-600);
    --text-disabled: var(--gray-400);
    --text-inverse: var(--gray-0);
    --text-brand: var(--blue-600);
    --text-link: var(--blue-600);
    --text-link-hover: var(--blue-700);

    --surface-page: var(--gray-50);
    --surface-card: var(--gray-0);
    --surface-subtle: var(--gray-25);
    --surface-muted: var(--gray-100);
    --surface-elevated: var(--gray-0);
    --surface-inverse: var(--gray-950);
    --surface-inverse-overlay: rgba(255,255,255,0.1);
    --surface-inverse-overlay-hover: rgba(255,255,255,0.15);
    --surface-inverse-border: rgba(255,255,255,0.08);
    --surface-inverse-text-muted: rgba(255,255,255,0.5);
    --surface-inverse-text-subtle: rgba(255,255,255,0.6);

    --border-default: var(--gray-200);
    --border-subtle: var(--gray-100);
    --border-strong: var(--gray-300);
    --border-focus: var(--blue-500);

    --interactive-primary: var(--blue-600);
    --interactive-primary-hover: var(--blue-700);
    --interactive-primary-active: var(--blue-800);
    --interactive-subtle: var(--blue-50);
    --interactive-subtle-hover: var(--blue-100);

    --status-success: var(--green-700);
    --status-success-bg: var(--green-50);
    --status-success-border: var(--green-200);

    --status-brand: var(--blue-600);
    --status-brand-bg: var(--blue-50);
    --status-brand-border: var(--blue-200);

    --status-warning: var(--amber-700);
    --status-warning-bg: var(--amber-50);
    --status-warning-border: var(--amber-200);

    --status-danger: var(--red-700);
    --status-danger-bg: var(--red-50);
    --status-danger-border: var(--red-200);

    --status-info: var(--blue-700);
    --status-info-bg: var(--blue-50);
    --status-info-border: var(--blue-200);

    --status-neutral: var(--gray-600);
    --status-neutral-bg: var(--gray-100);
    --status-neutral-border: var(--gray-200);

    /* Spacing */
    --space-1: 4px;
    --space-2: 8px;
    --space-3: 12px;
    --space-4: 16px;
    --space-6: 24px;
    --space-8: 32px;

    /* Radius */
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-full: 9999px;

    /* Shadow */
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
    --shadow-lg: 0 10px 15px rgba(0,0,0,0.06), 0 4px 6px rgba(0,0,0,0.03);

    /* Motion */
    --duration-instant: 0ms;
    --duration-micro: 100ms;
    --duration-quick: 150ms;
    --duration-standard: 250ms;
    --duration-slow: 350ms;
    --duration-expressive: 500ms;

    --ease-default: cubic-bezier(0.4, 0, 0.2, 1);
    --ease-in: cubic-bezier(0.4, 0, 1, 1);
    --ease-out: cubic-bezier(0, 0, 0.2, 1);
    --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  button:focus,
  a:focus,
  [tabindex]:focus {
    outline: none;
  }

  button:focus-visible,
  a:focus-visible,
  [tabindex]:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring-color);
    outline-offset: var(--focus-ring-offset);
  }

  @media (forced-colors: active) {
    button:focus-visible,
    a:focus-visible,
    [tabindex]:focus-visible {
      outline: 3px solid CanvasText;
    }
  }

  .dark-surface button:focus-visible,
  .dark-surface a:focus-visible,
  .dark-surface [tabindex]:focus-visible {
    --focus-ring-color: #93c5fd;
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }

  button[data-pp-button] {
    background: var(--button-bg);
    color: var(--button-color);
    border: var(--button-border, none);
    text-decoration: var(--button-text-decoration, none);
  }

  button[data-pp-button]:hover {
    background: var(--button-bg-hover, var(--button-bg));
    color: var(--button-color-hover, var(--button-color));
    text-decoration: var(--button-text-decoration-hover, var(--button-text-decoration, none));
  }

  button[data-pp-button]:active {
    background: var(--button-bg-active, var(--button-bg-hover, var(--button-bg)));
  }

  button[data-pp-button]:disabled {
    cursor: not-allowed;
  }

  button[data-pp-button][data-loading="true"] {
    opacity: 0.7;
    pointer-events: none;
  }

  [data-pp-card][data-interactive="true"]:hover {
    box-shadow: var(--shadow-lg);
  }

  [data-pp-datarow][data-selected="false"]:hover {
    background: var(--surface-subtle);
  }

  @keyframes skeleton-shimmer {
    0% { opacity: 1; }
    50% { opacity: 0.4; }
    100% { opacity: 1; }
  }

  [data-pp-skeleton] {
    animation: skeleton-shimmer 1.5s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    [data-pp-skeleton] {
      animation: none;
      opacity: 0.6;
    }
  }

  @media (pointer: coarse) {
    button[data-pp-button][data-size="sm"] {
      min-height: 44px;
      min-width: 44px;
    }

    [data-pp-datarow] {
      padding-top: 14px !important;
      padding-bottom: 14px !important;
    }
  }
`;

/* ═══════════════════════════════════════════════════════════════════════════
   PRIMITIVES
   Low-level building blocks with consistent APIs
   @see /docs/design-system/primitives/
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Stack: Flexbox layout primitive ───
const Stack = forwardRef(({
  as: Component = "div",
  direction = "column",
  gap,
  align = "stretch",
  justify = "flex-start",
  wrap = false,
  flex,
  padding,
  paddingX,
  paddingY,
  children,
  style,
  ...props
}, ref) => {
  const resolveGap = (value) => {
    if (value === undefined) return undefined;
    if (typeof value === "number") return value;
    return semanticSpacing.stack[value] || value;
  };

  const resolveInset = (value) => {
    if (value === undefined) return undefined;
    if (typeof value === "number") return value;
    return semanticSpacing.inset[value];
  };

  const computedGap = resolveGap(gap);
  const paddingVertical = resolveInset(paddingY ?? padding);
  const paddingHorizontal = resolveInset(paddingX ?? padding);
  const flexWrap = wrap === true ? "wrap" : wrap === false ? "nowrap" : wrap;

  return (
    <Component
      ref={ref}
      style={{
        boxSizing: "border-box",
        display: "flex",
        flexDirection: direction,
        alignItems: align,
        justifyContent: justify,
        flexWrap,
        ...(flex !== undefined && { flex }),
        ...(computedGap !== undefined && { gap: computedGap }),
        ...(paddingVertical !== undefined && { paddingTop: paddingVertical, paddingBottom: paddingVertical }),
        ...(paddingHorizontal !== undefined && { paddingLeft: paddingHorizontal, paddingRight: paddingHorizontal }),
        ...style
      }}
      {...props}
    >
      {children}
    </Component>
  );
});
Stack.displayName = "Stack";

// Convenience variants
const HStack = forwardRef((props, ref) => <Stack ref={ref} direction="row" {...props} />);
const VStack = forwardRef((props, ref) => <Stack ref={ref} direction="column" {...props} />);
HStack.displayName = "HStack";
VStack.displayName = "VStack";

// ─── Text: Typography primitive ───
const Text = forwardRef(({
  as,
  variant = "body",
  size,
  color = "primary",
  weight,
  align,
  transform,
  truncate = false,
  children,
  style,
  ...props
}, ref) => {
  const legacyVariantMap = {
    heading1: { variant: "heading", size: "lg" },
    heading2: { variant: "heading", size: "md" },
    heading3: { variant: "heading", size: "sm" },
    bodyMedium: { variant: "body", weight: "medium" },
    bodySm: { variant: "bodySmall", weight: "normal" },
    bodySmMedium: { variant: "bodySmall", weight: "medium" }
  };

  const legacy = legacyVariantMap[variant];
  const resolvedVariant = legacy?.variant || variant;
  const resolvedSize = legacy?.size || size || (resolvedVariant === "heading" ? "md" : undefined);
  const resolvedWeight = legacy?.weight || weight;

  const resolveTypographyKey = () => {
    if (resolvedVariant === "display") return "display";
    if (resolvedVariant === "heading") {
      if (resolvedSize === "lg") return "heading1";
      if (resolvedSize === "sm") return "heading3";
      return "heading2";
    }
    if (resolvedVariant === "bodySmall") {
      return resolvedWeight === "medium" ? "bodySmMedium" : "bodySm";
    }
    if (resolvedVariant === "caption") return "caption";
    if (resolvedVariant === "mono") return "mono";
    return resolvedWeight === "medium" ? "bodyMedium" : "body";
  };

  const typographyKey = resolveTypographyKey();
  const typography = semanticTypography[typographyKey] || semanticTypography.body;
  const textColor = semanticColors.text[color] || color;

  // Default element based on variant
  const legacyDefaultElements = {
    display: "h1",
    heading1: "h2",
    heading2: "h3",
    heading3: "h4",
    body: "p",
    bodyMedium: "span",
    bodySm: "p",
    bodySmMedium: "span",
    caption: "span",
    mono: "code"
  };
  const defaultElements = {
    display: "h1",
    heading: resolvedSize === "lg" ? "h2" : resolvedSize === "sm" ? "h4" : "h3",
    body: "p",
    bodySmall: "p",
    caption: "span",
    mono: "code"
  };
  const Component = as || legacyDefaultElements[variant] || defaultElements[resolvedVariant] || "span";

  const truncateStyles = truncate ? {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  } : {};

  return (
    <Component
      ref={ref}
      style={{
        fontFamily: typography.fontFamily,
        fontSize: typography.fontSize,
        fontWeight: weight ? primitiveFonts.weight[weight] : typography.fontWeight,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
        color: textColor,
        margin: 0,
        ...(align && { textAlign: align }),
        ...(transform && { textTransform: transform }),
        ...truncateStyles,
        ...style
      }}
      {...props}
    >
      {children}
    </Component>
  );
});
Text.displayName = "Text";

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENTS
   Interactive UI elements using compound component patterns
   @see /docs/design-system/components/
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Button with Compound Pattern ───
const ButtonContext = createContext(null);

const ButtonIcon = ({ children, position = "start" }) => {
  const ctx = useContext(ButtonContext);
  const iconSize = componentTokens.button.iconSize[ctx?.size || "md"];

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: iconSize,
      height: iconSize,
      flexShrink: 0,
      order: position === "end" ? 1 : 0
    }} aria-hidden="true">
      {children}
    </span>
  );
};
ButtonIcon.displayName = "Button.Icon";

const ButtonLabel = ({ children }) => <span style={{ order: 0 }}>{children}</span>;
ButtonLabel.displayName = "Button.Label";

const ButtonRoot = forwardRef(({
  variant = "primary",
  size = "md",
  fullWidth = false,
  leftIcon,
  rightIcon,
  loading = false,
  disabled = false,
  children,
  style,
  ...props
}, ref) => {
  const isDisabled = disabled || loading;

  const getVariantVars = () => {
    const base = {
      primary: {
        bg: semanticColors.interactive.default,
        bgHover: semanticColors.interactive.hover,
        bgActive: semanticColors.interactive.active,
        color: semanticColors.text.inverse,
        border: "none"
      },
      secondary: {
        bg: "transparent",
        bgHover: semanticColors.surface.subtle,
        bgActive: semanticColors.surface.muted,
        color: semanticColors.text.primary,
        border: `1px solid ${semanticColors.border.default}`
      },
      ghost: {
        bg: "transparent",
        bgHover: semanticColors.surface.subtle,
        bgActive: semanticColors.surface.muted,
        color: semanticColors.text.secondary,
        border: "none"
      },
      danger: {
        bg: semanticColors.status.danger.background,
        bgHover: semanticColors.status.danger.foreground,
        bgActive: semanticColors.status.danger.foreground,
        color: semanticColors.status.danger.foreground,
        colorHover: semanticColors.text.inverse,
        border: `1px solid ${semanticColors.status.danger.border}`
      },
      link: {
        bg: "transparent",
        bgHover: "transparent",
        bgActive: "transparent",
        color: semanticColors.text.link,
        colorHover: semanticColors.text.linkHover,
        border: "none"
      }
    };

    return base[variant] || base.primary;
  };

  const { height, padding, gap, radius } = componentTokens.button;
  const variantVars = getVariantVars();
  const { type = "button", ...buttonProps } = props;

  const containsCompoundChildren = (node) => {
    if (!node) return false;
    if (Array.isArray(node)) return node.some(containsCompoundChildren);
    if (!isValidElement(node)) return false;
    if (node.type === ButtonIcon || node.type === ButtonLabel) return true;
    if (node.type === Fragment) return containsCompoundChildren(node.props?.children);
    return containsCompoundChildren(node.props?.children);
  };

  const hasCompoundChildren = containsCompoundChildren(children);
  const showSimpleIcons = !hasCompoundChildren && (leftIcon || rightIcon);

  const iconSize = componentTokens.button.iconSize[size];
  const iconStyles = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: iconSize,
    height: iconSize,
    flexShrink: 0
  };

  const renderIcon = (icon) => {
    if (!isValidElement(icon)) return icon;
    if (icon.props?.size !== undefined) return icon;
    return cloneElement(icon, { size: iconSize });
  };

  const baseVars = {
    "--button-bg": variantVars.bg,
    "--button-bg-hover": variantVars.bgHover,
    "--button-bg-active": variantVars.bgActive,
    "--button-color": variantVars.color,
    "--button-color-hover": variantVars.colorHover || variantVars.color,
    "--button-border": variantVars.border,
    "--button-text-decoration": "none",
    "--button-text-decoration-hover": "none"
  };

  const disabledVars = isDisabled ? {
    "--button-bg": variant === "link" ? "transparent" : semanticColors.surface.muted,
    "--button-bg-hover": variant === "link" ? "transparent" : semanticColors.surface.muted,
    "--button-bg-active": variant === "link" ? "transparent" : semanticColors.surface.muted,
    "--button-color": semanticColors.text.disabled,
    "--button-color-hover": semanticColors.text.disabled
  } : {};

  return (
    <ButtonContext.Provider value={{ size, variant, disabled: isDisabled }}>
      <button
        ref={ref}
        type={type}
        data-pp-button
        data-size={size}
        data-variant={variant}
        disabled={isDisabled}
        style={{
          appearance: "none",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap,
          height: height[size],
          padding: `0 ${padding[size]}px`,
          width: fullWidth ? "100%" : "auto",
          fontFamily: primitiveFonts.family.sans,
          fontSize: primitiveFonts.size.sm,
          fontWeight: primitiveFonts.weight.medium,
          lineHeight: 1,
          borderRadius: radius,
          cursor: isDisabled ? "not-allowed" : "pointer",
          transition: createTransition(["background", "color", "border-color"], "micro"),
          ...baseVars,
          ...disabledVars,
          ...style
        }}
        {...buttonProps}
      >
        {showSimpleIcons ? (
          <>
            {leftIcon && <span aria-hidden="true" style={iconStyles}>{renderIcon(leftIcon)}</span>}
            <span>{children}</span>
            {rightIcon && <span aria-hidden="true" style={iconStyles}>{renderIcon(rightIcon)}</span>}
          </>
        ) : children}
      </button>
    </ButtonContext.Provider>
  );
});

const Button = Object.assign(ButtonRoot, { Icon: ButtonIcon, Label: ButtonLabel });
Button.displayName = "Button";

// ─── Badge & StatusBadge with Compound Pattern ───
const BadgeContext = createContext(null);

const BadgeIcon = ({ children }) => {
  const ctx = useContext(BadgeContext);
  const iconSize = componentTokens.badge.iconSize[ctx?.size || "md"];

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: iconSize,
      height: iconSize,
      flexShrink: 0
    }} aria-hidden="true">
      {children}
    </span>
  );
};

const BadgeLabel = ({ children }) => <span>{children}</span>;

const BadgeRoot = forwardRef(({ variant = "neutral", size = "md", children, style, ...props }, ref) => {
  const { height, padding, gap, radius } = componentTokens.badge;

  const getColors = () => {
    if (variant === "brand") {
      return { background: semanticColors.interactive.subtle, color: semanticColors.interactive.default };
    }
    const statusColors = semanticColors.status[variant] || semanticColors.status.neutral;
    return { background: statusColors.background, color: statusColors.foreground };
  };

  const colors = getColors();
  const isSimpleText = typeof children === "string" || typeof children === "number";

  return (
    <BadgeContext.Provider value={{ size, variant }}>
      <span
        ref={ref}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap,
          height: height[size],
          padding: `0 ${padding[size]}px`,
          borderRadius: radius,
          background: colors.background,
          color: colors.color,
          fontFamily: primitiveFonts.family.sans,
          fontSize: primitiveFonts.size.xs,
          fontWeight: primitiveFonts.weight.semibold,
          letterSpacing: primitiveFonts.letterSpacing.wide,
          whiteSpace: "nowrap",
          ...style
        }}
        {...props}
      >
        {isSimpleText ? <BadgeLabel>{children}</BadgeLabel> : children}
      </span>
    </BadgeContext.Provider>
  );
});

const Badge = Object.assign(BadgeRoot, { Icon: BadgeIcon, Label: BadgeLabel });
Badge.displayName = "Badge";

// Status Icons for StatusBadge
const StatusIcons = {
  success: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13.5 4.5L6 12L2.5 8.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  warning: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 5V8M8 11H8.01M14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8Z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  danger: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 6L6 10M6 6L10 10M14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8Z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  info: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 11V8M8 5H8.01M14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8Z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  neutral: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.5" />
    </svg>
  )
};

const statusConfig = {
  compliant: { variant: "success", label: "Compliant", icon: "success" },
  completed: { variant: "success", label: "Completed", icon: "success" },
  pending: { variant: "warning", label: "Due Soon", icon: "warning" },
  due_soon: { variant: "warning", label: "Due Soon", icon: "warning" },
  in_progress: { variant: "warning", label: "In Progress", icon: "warning" },
  overdue: { variant: "danger", label: "Overdue", icon: "danger" },
  submitted: { variant: "info", label: "Submitted", icon: "info" },
  brand: { variant: "brand", label: "Good", icon: "info" },
  neutral: { variant: "neutral", label: "Neutral", icon: "neutral" }
};

const StatusBadge = forwardRef(({ status, size = "md", showIcon = true, showLabel = true, ...props }, ref) => {
  const config = statusConfig[status] || statusConfig.neutral;
  const colors = semanticColors.status[config.variant] || semanticColors.status.neutral;
  const IconComponent = StatusIcons[config.icon];
  const iconSize = componentTokens.badge.iconSize[size];

  return (
    <Badge ref={ref} variant={config.variant} size={size} aria-label={config.label} {...props}>
      {showIcon && (
        <Badge.Icon>
          <IconComponent size={iconSize} color={colors.foreground} />
        </Badge.Icon>
      )}
      {showLabel && <Badge.Label>{config.label}</Badge.Label>}
    </Badge>
  );
});
StatusBadge.displayName = "StatusBadge";

// PriorityBadge
const priorityConfig = {
  high: { variant: "danger", label: "High" },
  medium: { variant: "warning", label: "Medium" },
  low: { variant: "neutral", label: "Low" }
};

const PriorityBadge = forwardRef(({ priority, size = "sm", ...props }, ref) => {
  const config = priorityConfig[priority] || priorityConfig.low;
  return <Badge ref={ref} variant={config.variant} size={size} {...props}>{config.label}</Badge>;
});
PriorityBadge.displayName = "PriorityBadge";

// ─── Card with Compound Pattern ───
const CardContext = createContext(null);

const CardHeader = forwardRef(({ bordered = false, children, style, ...props }, ref) => {
  const ctx = useContext(CardContext);
  const padding = componentTokens.card.padding[ctx?.size || "md"];

  return (
    <div
      ref={ref}
      style={{
        padding: `${padding}px ${padding}px ${bordered ? padding : padding / 2}px`,
        borderBottom: bordered ? `1px solid ${semanticColors.border.subtle}` : undefined,
        ...style
      }}
      {...props}
    >
      <HStack align="center" justify="space-between" gap={semanticSpacing.inline.lg}>
        {children}
      </HStack>
    </div>
  );
});
CardHeader.displayName = "Card.Header";

const CardTitle = forwardRef(({ children, style, ...props }, ref) => (
  <Text ref={ref} as="h3" variant="heading3" color="primary" style={{ flex: 1, ...style }} {...props}>
    {children}
  </Text>
));
CardTitle.displayName = "Card.Title";

const CardSubtitle = forwardRef(({ children, style, ...props }, ref) => (
  <Text ref={ref} as="span" variant="caption" color="tertiary" style={style} {...props}>
    {children}
  </Text>
));
CardSubtitle.displayName = "Card.Subtitle";

const CardActions = forwardRef(({ children, style, ...props }, ref) => (
  <HStack ref={ref} align="center" gap={semanticSpacing.inline.sm} style={{ flexShrink: 0, ...style }} {...props}>
    {children}
  </HStack>
));
CardActions.displayName = "Card.Actions";

const CardBody = forwardRef(({ children, style, ...props }, ref) => {
  const ctx = useContext(CardContext);
  const padding = componentTokens.card.padding[ctx?.size || "md"];

  return (
    <div ref={ref} style={{ padding, ...style }} {...props}>
      {children}
    </div>
  );
});
CardBody.displayName = "Card.Body";

const CardRoot = forwardRef(({
  size = "md",
  elevated = false,
  status,
  interactive = false,
  selected = false,
  noPadding = false,
  children,
  style,
  onClick,
  ...props
}, ref) => {
  const { padding, radius } = componentTokens.card;
  const isInteractive = interactive && typeof onClick === "function";

  // Check if children use compound components
  const hasCompoundChildren = Array.isArray(children)
    ? children.some(child => child?.type?.displayName?.startsWith?.("Card."))
    : children?.type?.displayName?.startsWith?.("Card.");

  const statusBorderColor = status ? semanticColors.status[status].foreground : "transparent";
  const sharedStyle = {
    display: "flex",
    flexDirection: "column",
    background: selected ? semanticColors.interactive.subtle : semanticColors.surface.default,
    borderRadius: radius,
    border: `1px solid ${selected ? semanticColors.interactive.default : semanticColors.border.subtle}`,
    borderLeft: status ? `3px solid ${statusBorderColor}` : undefined,
    boxShadow: elevated ? primitiveShadow.lg : primitiveShadow.sm,
    padding: hasCompoundChildren || noPadding ? 0 : padding[size],
    cursor: interactive ? "pointer" : "default",
    transition: createTransition(["box-shadow", "border-color", "background"], "quick"),
    ...style
  };

  return (
    <CardContext.Provider value={{ size, interactive }}>
      {isInteractive ? (
        <button
          ref={ref}
          type="button"
          data-pp-card
          data-interactive="true"
          onClick={onClick}
          style={{
            ...sharedStyle,
            width: "100%",
            textAlign: "left",
            border: sharedStyle.border,
            borderLeft: sharedStyle.borderLeft,
            appearance: "none"
          }}
          {...props}
        >
          {children}
        </button>
      ) : (
        <div
          ref={ref}
          data-pp-card
          data-interactive="true"
          style={sharedStyle}
          {...props}
        >
          {children}
        </div>
      )}
    </CardContext.Provider>
  );
});

const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Title: CardTitle,
  Subtitle: CardSubtitle,
  Actions: CardActions,
  Body: CardBody
});
Card.displayName = "Card";

// ─── MetricCard ───
const MetricCard = forwardRef(({ value, label, icon: Icon, color, change, style, ...props }, ref) => (
  <Card ref={ref} style={{ position: "relative", overflow: "hidden", ...style }} {...props}>
    {color && (
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: color,
        opacity: 0.8
      }} aria-hidden="true" />
    )}
    <VStack gap={semanticSpacing.stack.sm}>
      <HStack align="center" justify="space-between">
        <Text variant="display" style={{ color: color || semanticColors.text.primary }}>
          {value}
        </Text>
        {Icon && <Icon size={24} color={semanticColors.text.tertiary} strokeWidth={1.5} />}
      </HStack>
      <Text variant="bodySm" color="secondary">{label}</Text>
      {change !== undefined && (
        <Text variant="caption" style={{
          color: change >= 0 ? semanticColors.status.success.foreground : semanticColors.status.danger.foreground
        }}>
          {change >= 0 ? "↑" : "↓"} {Math.abs(change)}% from last month
        </Text>
      )}
    </VStack>
  </Card>
));
MetricCard.displayName = "MetricCard";

/* ═══════════════════════════════════════════════════════════════════════════
   PATTERNS
   Higher-level UI patterns composed from primitives and components
   @see /docs/design-system/patterns/
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── DataRow ───
const DataRow = forwardRef(({
  columns,
  status,
  selected = false,
  compact = false,
  children,
  onClick,
  style,
  ...props
}, ref) => {
  const isInteractive = !!onClick;
  const padding = compact ? semanticSpacing.inset.xs : semanticSpacing.inset.sm;

  const statusBorderColor = status ? semanticColors.status[status].foreground : "transparent";
  const background = selected ? semanticColors.interactive.subtle : semanticColors.surface.default;

  const computedStyle = {
    display: columns ? "grid" : "flex",
    gridTemplateColumns: columns,
    alignItems: "center",
    gap: semanticSpacing.inline.md,
    padding: `${padding}px ${semanticSpacing.inset.md}px`,
    background,
    borderRadius: primitiveRadius.md,
    borderLeft: `3px solid ${statusBorderColor}`,
    cursor: isInteractive ? "pointer" : "default",
    transition: createTransition(["background"], "micro"),
    ...style
  };

  if (isInteractive) {
    return (
      <button
        ref={ref}
        type="button"
        data-pp-datarow
        data-selected={selected ? "true" : "false"}
        onClick={onClick}
        style={{
          ...computedStyle,
          width: "100%",
          textAlign: "left",
          border: "none",
          borderLeft: computedStyle.borderLeft,
          appearance: "none"
        }}
        {...props}
      >
        {children}
      </button>
    );
  }

  return (
    <div
      ref={ref}
      data-pp-datarow
      data-selected={selected ? "true" : "false"}
      role="row"
      style={computedStyle}
      {...props}
    >
      {children}
    </div>
  );
});
DataRow.displayName = "DataRow";

// ─── ColumnHeader ───
const ColumnHeader = forwardRef(({ as: Component = "th", width, flex, align = "left", children, style, ...props }, ref) => (
  <Component
    ref={ref}
    {...(Component === "th" ? { scope: "col" } : {})}
    style={{
      width,
      flex,
      textAlign: align,
      fontSize: primitiveFonts.size.xs,
      fontWeight: primitiveFonts.weight.semibold,
      color: semanticColors.text.tertiary,
      textTransform: "uppercase",
      letterSpacing: primitiveFonts.letterSpacing.wider,
      fontVariantNumeric: "tabular-nums",
      ...style
    }}
    {...props}
  >
    {children}
  </Component>
));
ColumnHeader.displayName = "ColumnHeader";

// ─── DataHeaderRow ───
const DataHeaderRow = forwardRef(({ columns, children, style, ...props }, ref) => (
  <div
    ref={ref}
    role="row"
    style={{
      display: columns ? "grid" : "flex",
      gridTemplateColumns: columns,
      alignItems: "center",
      gap: semanticSpacing.inline.md,
      padding: `${semanticSpacing.inset.xs}px ${semanticSpacing.inset.md}px`,
      ...style
    }}
    {...props}
  >
    {children}
  </div>
));
DataHeaderRow.displayName = "DataHeaderRow";

// ─── SectionHeader ───
const SectionHeader = forwardRef(({
  title,
  subtitle,
  action,
  collapsible = false,
  collapsed = false,
  onToggle,
  size = "md",
  style,
  ...props
}, ref) => {
  const titleTextProps =
    size === "sm"
      ? { variant: "bodySmall", weight: "medium", as: "span" }
      : { variant: "heading", size: size === "lg" ? "md" : "sm" };
  const marginBottom = size === "lg" ? semanticSpacing.section.sm : size === "sm" ? semanticSpacing.stack.sm : semanticSpacing.stack.md;

  const headerContent = (
    <HStack align={subtitle ? "flex-start" : "center"} justify="space-between" style={{ flex: 1 }}>
      <VStack gap={semanticSpacing.inline.xs}>
        <Text {...titleTextProps} color="primary">{title}</Text>
        {subtitle && <Text variant="caption" color="tertiary">{subtitle}</Text>}
      </VStack>
      {action && <HStack align="center" gap={semanticSpacing.inline.sm}>{action}</HStack>}
    </HStack>
  );

  if (collapsible) {
    return (
      <div ref={ref} style={{ marginBottom, ...style }} {...props}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          style={{
            display: "flex",
            alignItems: "center",
            gap: semanticSpacing.inline.sm,
            width: "100%",
            padding: semanticSpacing.inset.xs,
            margin: -semanticSpacing.inset.xs,
            background: "transparent",
            border: "none",
            borderRadius: primitiveRadius.md,
            cursor: "pointer",
            fontFamily: primitiveFonts.family.sans,
            textAlign: "left",
            color: semanticColors.text.secondary,
            transition: createTransition("background", "micro")
          }}
        >
          <ChevronDown
            size={18}
            style={{
              transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
              transition: createTransition("transform", "quick")
            }}
          />
          {headerContent}
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ marginBottom, ...style }} {...props}>
      {headerContent}
    </div>
  );
});
SectionHeader.displayName = "SectionHeader";

// ─── AlertBanner ───
const AlertIcons = {
  success: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M16.5 5.5L7.5 14.5L3.5 10.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  warning: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 7V10M10 13H10.01M18 10C18 14.4183 14.4183 18 10 18C5.58172 18 2 14.4183 2 10C2 5.58172 5.58172 2 10 2C14.4183 2 18 5.58172 18 10Z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  danger: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M12 8L8 12M8 8L12 12M18 10C18 14.4183 14.4183 18 10 18C5.58172 18 2 14.4183 2 10C2 5.58172 5.58172 2 10 2C14.4183 2 18 5.58172 18 10Z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  info: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 14V10M10 6H10.01M18 10C18 14.4183 14.4183 18 10 18C5.58172 18 2 14.4183 2 10C2 5.58172 5.58172 2 10 2C14.4183 2 18 5.58172 18 10Z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  neutral: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke={color} strokeWidth="1.5" />
    </svg>
  )
};

const AlertBanner = forwardRef(({
  status,
  title,
  description,
  action,
  dismissible = false,
  onDismiss,
  variant = "filled",
  style,
  ...props
}, ref) => {
  const statusColors = semanticColors.status[status] || semanticColors.status.neutral;
  const IconComponent = AlertIcons[status] || AlertIcons.neutral;

  return (
    <div
      ref={ref}
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: semanticSpacing.inline.md,
        padding: `${semanticSpacing.inset.sm}px ${semanticSpacing.inset.md}px`,
        borderRadius: primitiveRadius.md,
        background: statusColors.background,
        borderLeft: `3px solid ${statusColors.foreground}`,
        ...style
      }}
      {...props}
    >
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        <IconComponent size={18} color={statusColors.foreground} />
      </div>
      <VStack gap={semanticSpacing.inline.xs} style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodySmall" weight="medium" as="span" style={{ color: statusColors.foreground }}>{title}</Text>
        {description && (
          <Text variant="bodySmall" style={{ color: statusColors.foreground, opacity: 0.85 }}>{description}</Text>
        )}
      </VStack>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
});
AlertBanner.displayName = "AlertBanner";

// ─── EmptyState ───
const EmptyState = forwardRef(({ icon: Icon, title, description, action, size = "md", style, ...props }, ref) => {
  const iconSize = size === "lg" ? 64 : size === "sm" ? 40 : 48;
  const containerPadding = size === "lg" ? semanticSpacing.section.lg : size === "sm" ? semanticSpacing.section.sm : semanticSpacing.section.md;

  return (
    <VStack
      ref={ref}
      align="center"
      gap={semanticSpacing.stack.md}
      style={{ padding: containerPadding, textAlign: "center", ...style }}
      {...props}
    >
      <div style={{
        width: iconSize + 24,
        height: iconSize + 24,
        borderRadius: primitiveRadius.full,
        background: semanticColors.surface.muted,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        {Icon && <Icon size={iconSize * 0.6} color={semanticColors.text.tertiary} strokeWidth={1.5} />}
      </div>
      <VStack gap={semanticSpacing.inline.sm} align="center">
        <Text variant="heading" size={size === "lg" ? "md" : "sm"} color="primary">{title}</Text>
        {description && <Text variant="bodySmall" color="tertiary" style={{ maxWidth: 320 }}>{description}</Text>}
      </VStack>
      {action}
    </VStack>
  );
});
EmptyState.displayName = "EmptyState";

// ─── Skeleton ───
const Skeleton = forwardRef(({ width, height, variant = "text", style, ...props }, ref) => (
  <div
    ref={ref}
    aria-hidden="true"
    style={{
      width: width || (variant === "text" ? "100%" : undefined),
      height: height || (variant === "text" ? "1em" : variant === "circle" ? width : undefined),
      borderRadius: variant === "circle" ? primitiveRadius.full : primitiveRadius.sm,
      background: semanticColors.surface.muted,
      ...style
    }}
    data-pp-skeleton
    {...props}
  />
));
Skeleton.displayName = "Skeleton";

// ─── ProgressBar ───
const ProgressBar = forwardRef(({ value, max = 100, color, showLabel = true, size = "md", style, ...props }, ref) => {
  const pct = Math.round((value / max) * 100);
  const heights = { sm: 4, md: 6, lg: 8 };
  const status =
    pct >= 100 ? "success" :
      pct >= 80 ? "brand" :
        pct >= 50 ? "warning" :
          "danger";
  const statusColors = semanticColors.status[status] || semanticColors.status.neutral;

  return (
    <VStack ref={ref} gap={semanticSpacing.stack.xs} style={style} {...props}>
      {showLabel && (
        <HStack justify="space-between">
          <Text variant="caption" color="tertiary">Progress</Text>
          <Text variant="caption" color="secondary" weight="semibold">{value}/{max}</Text>
        </HStack>
      )}
      <div style={{
        height: heights[size],
        background: semanticColors.surface.muted,
        borderRadius: primitiveRadius.full,
        overflow: "hidden"
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: color || statusColors.foreground,
          borderRadius: primitiveRadius.full,
          transition: createTransition("width", "standard")
        }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
    </VStack>
  );
});
ProgressBar.displayName = "ProgressBar";

// ─── Tabs ───
const Tabs = ({ tabs, activeTab, onTabChange, style, ...props }) => {
  const handleKeyDown = (e, index) => {
    const key = e.key;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;

    e.preventDefault();

    const nextIndex =
      key === "Home" ? 0 :
        key === "End" ? tabs.length - 1 :
          key === "ArrowRight" ? (index + 1) % tabs.length :
            (index - 1 + tabs.length) % tabs.length;

    onTabChange(tabs[nextIndex].id);

    // Keep focus aligned with the active tab for keyboard users
    requestAnimationFrame(() => {
      const tabList = e.currentTarget.closest?.('[role="tablist"]');
      const buttons = tabList?.querySelectorAll?.('button[role="tab"]');
      buttons?.[nextIndex]?.focus?.();
    });
  };

  return (
    <HStack
      gap={semanticSpacing.inline.xs}
      style={{
        background: semanticColors.surface.muted,
        padding: semanticSpacing.inset.xs,
        borderRadius: primitiveRadius.md,
        width: "fit-content",
        ...style
      }}
      role="tablist"
      {...props}
    >
      {tabs.map((tab, idx) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          tabIndex={activeTab === tab.id ? 0 : -1}
          onClick={() => onTabChange(tab.id)}
          onKeyDown={(e) => handleKeyDown(e, idx)}
          style={{
            padding: `${semanticSpacing.inset.xs}px ${semanticSpacing.inset.md}px`,
            borderRadius: primitiveRadius.sm,
            border: "none",
            background: activeTab === tab.id ? semanticColors.surface.default : "transparent",
            color: activeTab === tab.id ? semanticColors.text.primary : semanticColors.text.secondary,
            fontFamily: primitiveFonts.family.sans,
            fontSize: primitiveFonts.size.sm,
            fontWeight: activeTab === tab.id ? primitiveFonts.weight.medium : primitiveFonts.weight.normal,
            cursor: "pointer",
            boxShadow: activeTab === tab.id ? primitiveShadow.sm : "none",
            transition: createTransition("all", "micro")
          }}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span style={{
              marginLeft: semanticSpacing.inline.sm,
              padding: `0 ${semanticSpacing.inline.sm}px`,
              borderRadius: primitiveRadius.full,
              background: activeTab === tab.id ? semanticColors.interactive.subtle : semanticColors.surface.muted,
              color: activeTab === tab.id ? semanticColors.interactive.default : semanticColors.text.tertiary,
              fontSize: primitiveFonts.size.xs,
              fontWeight: primitiveFonts.weight.medium
            }}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </HStack>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════════════════ */

const complianceData = {
  categories: [
    {
      id: "governing",
      name: "Governing Documents",
      icon: FileText,
      items: [
        { id: "declaration", name: "Declaration of Condominium & Amendments", ref: "§718.111(12)(g)(2)(a)", status: "compliant", date: "Jan 15, 2026" },
        { id: "bylaws", name: "Bylaws & Amendments", ref: "§718.111(12)(g)(2)(b)", status: "compliant", date: "Jan 15, 2026" },
        { id: "articles", name: "Articles of Incorporation & Amendments", ref: "§718.111(12)(g)(2)(c)", status: "compliant", date: "Jan 15, 2026" },
        { id: "rules", name: "Rules & Regulations", ref: "§718.111(12)(g)(2)(d)", status: "compliant", date: "Jan 18, 2026" },
        { id: "qa", name: "Question & Answer Sheet", ref: "§718.504", status: "pending", date: null }
      ]
    },
    {
      id: "financial",
      name: "Financial Records",
      icon: DollarSign,
      items: [
        { id: "budget", name: "Annual Budget 2026", ref: "§718.112(2)(f)", status: "compliant", date: "Dec 10, 2025" },
        { id: "financial", name: "Annual Financial Report 2025", ref: "§718.111(13)", status: "compliant", date: "Jan 22, 2026" },
        { id: "insurance", name: "Current Insurance Policies", ref: "§718.111(11)", status: "overdue", date: null },
        { id: "contracts", name: "List of Executory Contracts", ref: "§718.111(12)(g)(2)", status: "compliant", date: "Jan 20, 2026" }
      ]
    },
    {
      id: "meetings",
      name: "Meetings & Minutes",
      icon: Calendar,
      items: [
        { id: "minutes", name: "Approved Board Meeting Minutes (12 months)", ref: "§718.111(12)(g)(2)(e)", status: "compliant", date: "Jan 28, 2026" }
      ]
    },
    {
      id: "structural",
      name: "Structural Reports",
      icon: HardHat,
      items: [
        { id: "inspection", name: "Milestone Inspection Reports", ref: "§553.899", status: "compliant", date: "Aug 14, 2024" },
        { id: "sirs", name: "Structural Integrity Reserve Study", ref: "§718.112(2)(g)", status: "compliant", date: "Sep 3, 2024" }
      ]
    }
  ]
};

const allComplianceItems = complianceData.categories.flatMap(c => c.items);
const compliantCount = allComplianceItems.filter(i => i.status === "compliant" || i.status === "completed").length;
const pendingCount = allComplianceItems.filter(i => i.status === "pending").length;
const overdueCount = allComplianceItems.filter(i => i.status === "overdue").length;
const totalCount = allComplianceItems.length;
const compliancePct = Math.round((compliantCount / totalCount) * 100);

const upcomingDeadlines = [
  { name: "Insurance Policy Renewal", deadline: "Jan 28, 2026", daysLeft: -6, status: "danger" },
  { name: "Q&A Sheet Update", deadline: "Feb 18, 2026", daysLeft: 15, status: "warning" }
];

const maintenanceRequests = [
  { id: "MR-0041", title: "Pool pump making grinding noise", category: "Pool", priority: "high", status: "in_progress", submitter: "Sarah Johnson", unit: "108", date: "Jan 29, 2026" },
  { id: "MR-0040", title: "Parking garage light out — Level 2", category: "Electrical", priority: "medium", status: "submitted", submitter: "Michael Brown", unit: "215", date: "Jan 28, 2026" },
  { id: "MR-0039", title: "Lobby door not closing properly", category: "Common Area", priority: "high", status: "in_progress", submitter: "Robert Chen", unit: "205", date: "Jan 25, 2026" },
  { id: "MR-0038", title: "Landscaping — dead shrubs near entrance", category: "Landscaping", priority: "low", status: "submitted", submitter: "Linda Thompson", unit: "312", date: "Jan 22, 2026" },
  { id: "MR-0037", title: "HVAC noise in hallway — 3rd floor", category: "HVAC", priority: "medium", status: "completed", submitter: "Emily Davis", unit: "304", date: "Jan 18, 2026" }
];

// ─── Empty State Constants (single source of truth for copy) ───
const EMPTY_STATES = {
  offline: { icon: AlertTriangle, title: "You're offline", description: "Check your internet connection and try again." },
  error: { icon: AlertTriangle, title: "Something went wrong", description: "We couldn't load this data. Please try again." },
  newAssociation: { icon: Upload, title: "Let's get you compliant", description: "Upload your first document to start tracking Florida Statute compliance." },
  actionClear: { icon: CheckCircle, title: "You're all set!", description: "No items currently require your attention." },
  noMaintenance: { icon: Wrench, title: "All clear!", description: "There are no open maintenance requests. Residents can submit requests through the portal." },
  noFilterResults: { icon: Wrench, title: "No requests found", description: "There are no maintenance requests matching your filter." },
  noAnnouncements: { icon: Bell, title: "Keep your community informed", description: "Post announcements to notify owners about meetings, updates, and community news." },
  noOwners: { icon: Users, title: "Add your first owner", description: "Import owners via CSV or add them manually to enable portal access." },
  placeholder: { icon: FileText, description: "This section is under development. Check back later for updates." }
};

/* ═══════════════════════════════════════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════════════════════════════════════ */

const navItems = [
  { id: "compliance", label: "Compliance", icon: Shield },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "meetings", label: "Meetings", icon: Calendar },
  { id: "announcements", label: "Announcements", icon: Bell },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "owners", label: "Owners", icon: Users }
];

const NavRail = ({ activeView, setActiveView, expanded, onToggle }) => {
  const { rail, item } = componentTokens.nav;
  const width = expanded ? rail.widthExpanded : rail.widthCollapsed;

  return (
    <VStack style={{
      width,
      minWidth: width,
      background: semanticColors.surface.inverse,
      transition: createTransition(["width", "min-width"], "standard"),
      overflow: "hidden",
      height: "100%",
      position: "relative"
    }} className="dark-surface">
      {/* Brand */}
      <HStack
        align="center"
        gap={semanticSpacing.inline.md}
        style={{
          height: 64,
          padding: `0 ${semanticSpacing.inset.md}px`,
          borderBottom: `1px solid ${semanticColors.surface.inverseBorder}`,
          flexShrink: 0
        }}
      >
        <div style={{
          width: 32,
          height: 32,
          borderRadius: primitiveRadius.md,
          background: semanticColors.interactive.default,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }}>
          <Building size={18} color={semanticColors.text.inverse} />
        </div>
        <VStack
          gap={0}
          style={{
            opacity: expanded ? 1 : 0,
            transition: createTransition("opacity", "quick"),
            whiteSpace: "nowrap"
          }}
        >
          <Text variant="bodySmMedium" style={{ color: semanticColors.text.inverse }}>PropertyPro</Text>
          <Text variant="caption" style={{ color: semanticColors.surface.inverseTextMuted }}>Palm Gardens</Text>
        </VStack>
      </HStack>

      {/* Nav Items */}
      <VStack gap={semanticSpacing.inline.xs} style={{ flex: 1, padding: semanticSpacing.inset.xs, overflowY: "auto" }}>
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeView === id;

          // Badge Logic
          let badge = null;
          let badgeVariant = "neutral";

          if (id === "compliance" && overdueCount > 0) {
            badge = overdueCount;
            badgeVariant = "danger";
          } else if (id === "maintenance") {
            const count = maintenanceRequests.filter(r => r.status === "submitted" || r.status === "in_progress").length;
            if (count > 0) {
              badge = count;
              badgeVariant = "neutral";
            }
          }

          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveView(id)}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: item.gap,
                height: item.height,
                padding: `0 ${item.padding}px`,
                background: isActive ? semanticColors.surface.inverseOverlay : "transparent",
                border: "none",
                borderRadius: item.radius,
                cursor: "pointer",
                position: "relative",
                transition: createTransition("background", "micro"),
                width: "100%"
              }}
            >
              {isActive && (
                <div style={{
                  position: "absolute",
                  left: 0,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 3,
                  height: 24,
                  background: semanticColors.interactive.default,
                  borderRadius: `0 ${primitiveRadius.sm}px ${primitiveRadius.sm}px 0`
                }} />
              )}
              <div style={{ position: "relative" }}>
                <Icon
                  size={item.iconSize}
                  color={isActive ? semanticColors.text.inverse : semanticColors.surface.inverseTextMuted}
                  strokeWidth={isActive ? 2 : 1.5}
                />
                {/* Collapsed Badge Dot */}
                {!expanded && badge && (
                  <div style={{
                    position: "absolute",
                    top: -2,
                    right: -2,
                    width: 8,
                    height: 8,
                    borderRadius: primitiveRadius.full,
                    background: badgeVariant === "danger" ? semanticColors.status.danger.foreground : semanticColors.status.neutral.foreground,
                    border: `2px solid ${semanticColors.surface.inverse}`
                  }} />
                )}
              </div>

              <HStack align="center" justify="space-between" style={{
                flex: 1,
                opacity: expanded ? 1 : 0,
                transition: createTransition("opacity", "quick"),
                whiteSpace: "nowrap",
                overflow: "hidden"
              }}>
                <Text
                  variant="bodySm"
                  style={{
                    color: isActive ? semanticColors.text.inverse : semanticColors.surface.inverseTextSubtle,
                    fontWeight: isActive ? primitiveFonts.weight.medium : primitiveFonts.weight.normal
                  }}
                >
                  {label}
                </Text>
                {badge && (
                  <span style={{
                    background: badgeVariant === "danger" ? semanticColors.status.danger.foreground : semanticColors.surface.inverseOverlay,
                    color: badgeVariant === "danger" ? semanticColors.text.inverse : semanticColors.text.inverse,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "0 6px",
                    borderRadius: 10,
                    height: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    {badge}
                  </span>
                )}
              </HStack>
            </button>
          );
        })}
      </VStack>

      {/* Toggle & User */}
      <VStack gap={0} style={{ borderTop: `1px solid ${semanticColors.surface.inverseBorder}` }}>
        {/* Toggle Button */}
        {onToggle && (
          <button
            onClick={onToggle}
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: expanded ? "flex-end" : "center",
              padding: semanticSpacing.inset.md,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: semanticColors.surface.inverseTextMuted,
              width: "100%"
            }}
          >
            <ChevronLeft
              size={20}
              style={{
                transform: expanded ? "rotate(0)" : "rotate(180deg)",
                transition: createTransition("transform", "standard")
              }}
            />
          </button>
        )}

        {/* User Profile */}
        <HStack
          align="center"
          gap={semanticSpacing.inline.md}
          style={{
            padding: semanticSpacing.inset.md,
            paddingTop: 0
          }}
        >
          <div style={{
            width: 32,
            height: 32,
            borderRadius: primitiveRadius.full,
            background: semanticColors.surface.inverseOverlay,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...semanticTypography.caption,
            color: semanticColors.text.inverse,
            flexShrink: 0
          }}>
            MS
          </div>
          <VStack
            gap={0}
            style={{
              opacity: expanded ? 1 : 0,
              transition: createTransition("opacity", "quick"),
              whiteSpace: "nowrap"
            }}
          >
            <Text variant="caption" style={{ color: semanticColors.text.inverse, fontWeight: primitiveFonts.weight.medium }}>
              Maria Santos
            </Text>
            <Text variant="caption" style={{ color: semanticColors.surface.inverseTextMuted }}>
              Board President
            </Text>
          </VStack>
        </HStack>
      </VStack>
    </VStack>
  );
};

const TopBar = ({ title, subtitle, onSearchOpen, bp, onNavOpen }) => (
  <HStack
    align="center"
    justify="space-between"
    style={{
      height: 64,
      padding: `0 ${(bp?.isMobile ? semanticSpacing.section.sm : semanticSpacing.section.md)}px`,
      background: semanticColors.surface.default,
      borderBottom: `1px solid ${semanticColors.border.subtle}`
    }}
  >
    <HStack align="center" gap={semanticSpacing.inline.md}>
      {bp?.isMobile && (
        <Button
          variant="ghost"
          size="sm"
          style={{ width: 44, height: 44, padding: 0 }}
          onClick={onNavOpen}
          aria-label="Open navigation"
        >
          <Button.Icon><Menu size={18} /></Button.Icon>
        </Button>
      )}
      <VStack gap={semanticSpacing.inline.xs}>
        <Text variant="heading2" color="primary">{title}</Text>
        {subtitle && <Text variant="caption" color="tertiary">{subtitle}</Text>}
      </VStack>
    </HStack>

    <HStack align="center" gap={semanticSpacing.inline.md}>
      <button
        type="button"
        onClick={onSearchOpen}
        aria-label="Search"
        style={{
          display: "flex",
          alignItems: "center",
          gap: semanticSpacing.inline.sm,
          padding: `${semanticSpacing.inset.xs}px ${semanticSpacing.inset.sm}px`,
          background: semanticColors.surface.subtle,
          border: `1px solid ${semanticColors.border.default}`,
          borderRadius: primitiveRadius.md,
          cursor: "pointer",
          fontFamily: primitiveFonts.family.sans
        }}
      >
        <Search size={14} color={semanticColors.text.tertiary} />
        {!bp?.isMobile && <Text variant="bodySm" color="tertiary" style={{ minWidth: 100 }}>Search...</Text>}
        {!bp?.isMobile && (
          <span style={{
            fontSize: primitiveFonts.size.xs,
            color: semanticColors.text.tertiary,
            background: semanticColors.surface.default,
            padding: `1px ${semanticSpacing.inline.sm}px`,
            borderRadius: primitiveRadius.sm,
            border: `1px solid ${semanticColors.border.default}`
          }}>⌘K</span>
        )}
      </button>
      <Button variant="ghost" size="sm" style={{ width: 36, padding: 0 }}>
        <Button.Icon><Settings size={16} /></Button.Icon>
      </Button>
    </HStack>
  </HStack>
);

/* ═══════════════════════════════════════════════════════════════════════════
   FEATURE VIEWS
   ═══════════════════════════════════════════════════════════════════════════ */

const PageContainer = ({ children, bp }) => (
  <VStack
    gap={semanticSpacing.section.md}
    style={{
      padding: bp?.isMobile ? semanticSpacing.section.sm : semanticSpacing.section.md,
      maxWidth: 1400,
      margin: "0 auto",
      width: "100%"
    }}
  >
    {children}
  </VStack>
);

// ─── HeroMetric ───
const HeroMetric = forwardRef(({
  value,
  label,
  context,
  trend,
  trendValue,
  status = "neutral",
  style,
  ...props
}, ref) => {
  const colors = semanticColors.status[status] || semanticColors.status.neutral;
  const isPositive = trend === "up";

  return (
    <Card ref={ref} style={{ ...style }} {...props}>
      <VStack gap={semanticSpacing.stack.sm}>
        <Text variant="caption" color="tertiary" weight="medium" transform="uppercase" style={{ letterSpacing: "0.05em" }}>
          {label}
        </Text>
        <HStack align="baseline" gap={semanticSpacing.inline.sm}>
          <Text variant="display" style={{ color: colors.foreground }}>{value}</Text>
          {trend && (
            <HStack align="center" gap={4} style={{
              padding: "2px 6px",
              borderRadius: primitiveRadius.sm,
              background: isPositive ? semanticColors.status.success.background : semanticColors.status.danger.background,
              color: isPositive ? semanticColors.status.success.foreground : semanticColors.status.danger.foreground,
              fontSize: primitiveFonts.size.xs,
              fontWeight: primitiveFonts.weight.bold
            }}>
              {isPositive ? "↑" : "↓"} {trendValue}
            </HStack>
          )}
        </HStack>
        <Text variant="bodySm" color="secondary">
          {context}
        </Text>
        <div style={{
          height: 4,
          width: "100%",
          background: semanticColors.surface.muted,
          borderRadius: primitiveRadius.full,
          overflow: "hidden",
          marginTop: semanticSpacing.stack.xs
        }}>
          <div style={{
            height: "100%",
            width: typeof value === 'string' && value.includes('%') ? value : '100%',
            background: colors.foreground
          }} />
        </div>
      </VStack>
    </Card>
  );
});
HeroMetric.displayName = "HeroMetric";

// ─── DeadlineAlert ───
const DeadlineAlert = forwardRef(({ title, days, date, action, style, ...props }, ref) => {
  const isOverdue = days < 0;
  const isUrgent = days >= 0 && days <= 7;
  const status = isOverdue ? "danger" : isUrgent ? "warning" : "neutral";
  const colors = semanticColors.status[status];

  return (
    <Card
      ref={ref}
      style={{
        borderLeft: `4px solid ${colors.foreground}`,
        background: isOverdue ? semanticColors.status.danger.background : semanticColors.surface.default,
        ...style
      }}
      {...props}
    >
      <HStack align="center" justify="space-between" gap={semanticSpacing.inline.md} wrap="wrap">
        <HStack align="start" gap={semanticSpacing.inline.md} style={{ flex: 1, minWidth: 200 }}>
          <div style={{
            padding: semanticSpacing.inset.xs,
            borderRadius: primitiveRadius.full,
            background: colors.background,
            color: colors.foreground
          }}>
            <Clock size={20} />
          </div>
          <VStack gap={semanticSpacing.inline.xs}>
            <Text variant="heading3" style={{ color: isOverdue ? colors.foreground : semanticColors.text.primary }}>
              {title}
            </Text>
            <Text variant="bodySm" color="secondary">
              {isOverdue ? `Overdue by ${Math.abs(days)} days` : `Due in ${days} days`} • {date}
            </Text>
          </VStack>
        </HStack>
        {action}
      </HStack>
    </Card>
  );
});
DeadlineAlert.displayName = "DeadlineAlert";

// ─── Compliance Dashboard ───
const ComplianceDashboard = ({ bp, isLoading = false, hasError = false, isOffline = false, onRetry }) => {
  const { params, setParam, setParamsMultiple } = useHashParams();
  const activeTab = params.tab || "action_required";
  const setActiveTab = (t) => setParam("tab", t);
  const [deadlinesExpanded, setDeadlinesExpanded] = useState(false);

  // Derived state
  const urgentDeadline = upcomingDeadlines.sort((a, b) => a.daysLeft - b.daysLeft)[0];
  const otherDeadlines = upcomingDeadlines.filter(d => d !== urgentDeadline);
  const itemsNeedingAction = allComplianceItems.filter(i => i.status !== "compliant" && i.status !== "completed");

  // Status summary pills + optional filtering via hash param (e.g. #view=compliance&tab=all_items&status=overdue)
  const statusFilter = params.status || null;
  const itemsNeedingActionFiltered =
    statusFilter === "overdue" || statusFilter === "pending"
      ? itemsNeedingAction.filter(i => i.status === statusFilter)
      : itemsNeedingAction;
  const allItemsFiltered =
    statusFilter === "overdue" || statusFilter === "pending"
      ? allComplianceItems.filter(i => i.status === statusFilter)
      : statusFilter === "compliant"
        ? allComplianceItems.filter(i => i.status === "compliant" || i.status === "completed")
        : allComplianceItems;

  // Phase 2.3: URL-synchronized category expansion state
  const expandedParam = params.expanded;
  const expandedFromUrl = expandedParam
    ? expandedParam.split(",").filter(Boolean)
    : complianceData.categories.map(c => c.id); // default: all expanded

  const expandedCategories = Object.fromEntries(
    complianceData.categories.map(c => [c.id, expandedFromUrl.includes(c.id)])
  );

  const toggleCategory = (id) => {
    const current = expandedFromUrl.includes(id)
      ? expandedFromUrl.filter(x => x !== id)
      : [...expandedFromUrl, id];
    setParam("expanded", current.length > 0 ? current.join(",") : null);
  };

  const dashboardTabs = [
    { id: "action_required", label: "Action Required", count: itemsNeedingAction.length > 0 ? itemsNeedingAction.length : undefined },
    { id: "all_items", label: "All Items", count: totalCount },
    { id: "by_category", label: "By Category" }
  ];

  const metricColumns = bp?.isMobile ? "1fr" : bp?.isTablet ? "1fr" : "repeat(3, 1fr)";
  const isNewAssociation = totalCount === 0 || compliancePct === 0;

  if (isOffline) {
    return (
      <PageContainer bp={bp}>
        <EmptyState
          {...EMPTY_STATES.offline}
          action={<Button variant="secondary" onClick={onRetry}>Retry</Button>}
        />
      </PageContainer>
    );
  }

  if (hasError) {
    return (
      <PageContainer bp={bp}>
        <EmptyState
          {...EMPTY_STATES.error}
          action={<Button variant="secondary" onClick={onRetry}>Retry</Button>}
        />
      </PageContainer>
    );
  }

  if (isNewAssociation) {
    return (
      <PageContainer bp={bp}>
        <EmptyState
          {...EMPTY_STATES.newAssociation}
          action={<Button variant="primary">Upload Document</Button>}
          size="lg"
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer bp={bp}>
      {/* Overdue Alert (if critically overdue) */}
      {overdueCount > 0 && (
        <AlertBanner
          status="danger"
          title="Insurance Policies upload is overdue"
          description="Required under §718.111(11) — immediate action needed to maintain compliance."
          action={
            <Button variant="link" size="sm">
              <Button.Label>Upload now</Button.Label>
              <Button.Icon position="end"><ArrowRight size={14} /></Button.Icon>
            </Button>
          }
        />
      )}

      {/* Hero Metric Section */}
      <div style={{ display: "grid", gridTemplateColumns: metricColumns, gap: semanticSpacing.stack.md }}>
        {isLoading ? (
          <VStack
            gap={semanticSpacing.stack.md}
            style={{ gridColumn: bp?.isMobile ? "1" : "1 / span 1" }}
          >
            <Skeleton variant="rect" height={120} />
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="text" width="40%" />
          </VStack>
        ) : (
          <HeroMetric
            value={`${compliancePct}%`}
            label="Overall Compliance"
            context={compliancePct === 100 ? "You're fully compliant!" : `${totalCount - compliantCount} of ${totalCount} items need attention`}
            trend="up"
            trendValue="4%"
            status={
              compliancePct >= 100 ? "success" :
                compliancePct >= 80 ? "brand" :
                  compliancePct >= 50 ? "warning" :
                    "danger"
            }
            style={{ gridColumn: bp?.isMobile ? "1" : "1 / span 1" }}
          />
        )}
        {/* We can keep other metrics if needed, or just layout the content. 
             Plan says "Single hero metric... dominates". 
             Let's put deadline next to it if desktop, or stacking.
         */}
        <div style={{ gridColumn: bp?.isMobile ? "1" : "2 / span 2" }}>
          <VStack gap={semanticSpacing.stack.sm} style={{ height: "100%" }}>
            {isLoading ? (
              <VStack gap={semanticSpacing.stack.sm}>
                <Skeleton variant="rect" height={72} />
                <Skeleton variant="text" width="55%" />
                <Skeleton variant="rect" height={52} />
              </VStack>
            ) : (
              <>
            {/* Urgent Deadline */}
            {urgentDeadline && (
              <DeadlineAlert
                title={urgentDeadline.name}
                days={urgentDeadline.daysLeft}
                date={urgentDeadline.deadline}
                action={
                  <Button variant="secondary" size="sm">
                    <Button.Icon><Upload size={14} /></Button.Icon>
                    <Button.Label>Upload</Button.Label>
                  </Button>
                }
              />
            )}
            {/* Secondary Deadlines Expandable */}
            {otherDeadlines.length > 0 && (
              <div style={{ padding: `0 ${semanticSpacing.inset.xs}px` }}>
                <button
                  onClick={() => setDeadlinesExpanded(!deadlinesExpanded)}
                  style={{
                    background: "none",
                    border: "none",
                    color: semanticColors.text.brand,
                    fontSize: primitiveFonts.size.sm,
                    fontWeight: primitiveFonts.weight.medium,
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 4
                  }}
                >
                  {deadlinesExpanded ? "Hide" : "View"} {otherDeadlines.length} other upcoming deadlines
                  <ChevronDown size={14} style={{ transform: deadlinesExpanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
                </button>

                {deadlinesExpanded && (
                  <VStack gap={semanticSpacing.stack.sm} style={{ marginTop: semanticSpacing.stack.sm }}>
                    {otherDeadlines.map((d, i) => (
                      <DeadlineAlert
                        key={i}
                        title={d.name}
                        days={d.daysLeft}
                        date={d.deadline}
                        action={<Button variant="ghost" size="sm">Upload</Button>}
                      />
                    ))}
                  </VStack>
                )}
              </div>
            )}
              </>
            )}
          </VStack>
        </div>
      </div>

      {/* Status summary pills (Phase 2.1) */}
      <HStack gap={semanticSpacing.inline.sm} justify="center" wrap>
        {overdueCount > 0 && (
          <button
            type="button"
            onClick={() => setParamsMultiple({ tab: "action_required", status: "overdue" })}
            style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
            aria-label={`${overdueCount} Overdue`}
          >
            <Badge variant="danger">{overdueCount} Overdue</Badge>
          </button>
        )}
        {pendingCount > 0 && (
          <button
            type="button"
            onClick={() => setParamsMultiple({ tab: "action_required", status: "pending" })}
            style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
            aria-label={`${pendingCount} Due Soon`}
          >
            <Badge variant="warning">{pendingCount} Due Soon</Badge>
          </button>
        )}
        <button
          type="button"
          onClick={() => setParamsMultiple({ tab: "all_items", status: "compliant" })}
          style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
          aria-label={`${compliantCount} Complete`}
        >
          <Badge variant="success">{compliantCount} Complete</Badge>
        </button>
      </HStack>

      {compliancePct === 100 && (
        <Card elevated style={{ textAlign: "center", padding: semanticSpacing.section.lg }}>
          <VStack align="center" gap={semanticSpacing.stack.lg}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: primitiveRadius.full,
              background: semanticColors.status.success.background,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <CheckCircle size={40} color={semanticColors.status.success.foreground} />
            </div>
            <Text variant="heading" size="lg">You're fully compliant!</Text>
            <Text variant="body" color="secondary">
              All Florida Statute §718.111(12)(g) requirements are met.
              Keep your documents up to date to maintain compliance.
            </Text>
            <Button variant="secondary" leftIcon={<Download size={16} />}>
              Download Compliance Report
            </Button>
          </VStack>
        </Card>
      )}

      {/* Tabs */}
      <Tabs tabs={dashboardTabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab Content */}
      <VStack gap={semanticSpacing.section.sm}>
        {/* ACTION REQUIRED TAB */}
        {activeTab === "action_required" && (
          itemsNeedingActionFiltered.length === 0 ? (
            <EmptyState {...EMPTY_STATES.actionClear} />
          ) : (
            <Card>
              <SectionHeader
                title="Items needing attention"
                subtitle="Compliance items that are pending or overdue"
              />
              <VStack gap={0} style={{ padding: bp?.isMobile ? semanticSpacing.inset.sm : semanticSpacing.inset.xs }}>
                {/* Header if desktop */}
                {!bp?.isMobile && (
                  <DataHeaderRow columns="100px 1fr 160px 100px 80px">
                    <ColumnHeader>Status</ColumnHeader>
                    <ColumnHeader>Requirement</ColumnHeader>
                    <ColumnHeader>Statute</ColumnHeader>
                    <ColumnHeader>Updated</ColumnHeader>
                    <ColumnHeader align="right">Action</ColumnHeader>
                  </DataHeaderRow>
                )}

                {itemsNeedingActionFiltered.map(item => {
                  const statusKey = item.status === "pending" ? "warning" : "danger";

                  if (bp?.isMobile) {
                    return (
                      <Card key={item.id} size="sm" elevated={false} style={{ marginBottom: semanticSpacing.stack.sm, padding: semanticSpacing.inset.md }}>
                        <VStack gap={semanticSpacing.stack.sm}>
                          <HStack align="center" justify="space-between">
                            <StatusBadge status={item.status} size="sm" />
                            <Button variant="secondary" size="sm">
                              <Button.Icon><Upload size={14} /></Button.Icon>
                              <Button.Label>Upload</Button.Label>
                            </Button>
                          </HStack>
                          <Text variant="bodySmMedium">{item.name}</Text>
                          <HStack align="center" justify="space-between">
                            <Text variant="mono" color="tertiary">{item.ref}</Text>
                            <Text variant="caption" color="secondary">{item.date || "—"}</Text>
                          </HStack>
                        </VStack>
                      </Card>
                    );
                  }

                  return (
                    <DataRow key={item.id} columns="100px 1fr 160px 100px 80px" status={statusKey}>
                      <StatusBadge status={item.status} />
                      <Text variant="bodySmMedium">{item.name}</Text>
                      <Text variant="mono" color="tertiary">{item.ref}</Text>
                      <Text variant="bodySm" color="secondary">{item.date || "—"}</Text>
                      <HStack justify="flex-end">
                        <Button variant="link" size="sm">
                          <Button.Icon><Upload size={14} /></Button.Icon>
                          <Button.Label>Upload</Button.Label>
                        </Button>
                      </HStack>
                    </DataRow>
                  );
                })}
              </VStack>
            </Card>
          )
        )}

        {/* ALL ITEMS TAB */}
        {activeTab === "all_items" && (
          <Card>
            <SectionHeader
              title="All Compliance Items"
              subtitle={`${totalCount} total requirements`}
              action={
                <Button variant="ghost" size="sm">
                  <Button.Icon><Download size={14} /></Button.Icon>
                  <Button.Label>Export</Button.Label>
                </Button>
              }
            />
            <VStack gap={0} style={{ padding: bp?.isMobile ? semanticSpacing.inset.sm : semanticSpacing.inset.xs }}>
              {!bp?.isMobile && (
                <DataHeaderRow columns="100px 1fr 160px 100px 80px">
                  <ColumnHeader>Status</ColumnHeader>
                  <ColumnHeader>Requirement</ColumnHeader>
                  <ColumnHeader>Statute</ColumnHeader>
                  <ColumnHeader>Updated</ColumnHeader>
                  <ColumnHeader align="right">Action</ColumnHeader>
                </DataHeaderRow>
              )}
              {allItemsFiltered.map(item => {
                const isCompliant = item.status === "compliant" || item.status === "completed";
                const statusKey = isCompliant ? "success" : item.status === "pending" ? "warning" : "danger";
                if (bp?.isMobile) {
                  return (
                    <Card key={item.id} size="sm" elevated={false} style={{ marginBottom: semanticSpacing.stack.sm, padding: semanticSpacing.inset.md }}>
                      <VStack gap={semanticSpacing.stack.sm}>
                        <HStack align="center" justify="space-between">
                          <StatusBadge status={item.status} size="sm" />
                          <Button variant="ghost" size="sm">
                            <Button.Icon><Eye size={14} /></Button.Icon>
                          </Button>
                        </HStack>
                        <Text variant="bodySmMedium">{item.name}</Text>
                        <HStack align="center" justify="space-between">
                          <Text variant="mono" color="tertiary">{item.ref}</Text>
                          <Text variant="caption" color="secondary">{item.date || "—"}</Text>
                        </HStack>
                      </VStack>
                    </Card>
                  );
                }
                return (
                  <DataRow key={item.id} columns="100px 1fr 160px 100px 80px" status={statusKey}>
                    <StatusBadge status={item.status} />
                    <Text variant="bodySmMedium">{item.name}</Text>
                    <Text variant="mono" color="tertiary">{item.ref}</Text>
                    <Text variant="bodySm" color="secondary">{item.date || "—"}</Text>
                    <HStack justify="flex-end">
                      {!isCompliant ? (
                        <Button variant="link" size="sm">
                          <Button.Icon><Upload size={14} /></Button.Icon>
                          <Button.Label>Upload</Button.Label>
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" style={{ padding: semanticSpacing.inset.xs }}>
                          <Button.Icon><Eye size={14} /></Button.Icon>
                        </Button>
                      )}
                    </HStack>
                  </DataRow>
                );
              })}
            </VStack>
          </Card>
        )}

        {/* BY CATEGORY TAB (Existing accordion view) */}
        {activeTab === "by_category" && (
          <VStack gap={semanticSpacing.section.sm}>
            {complianceData.categories.map(category => {
              const CategoryIcon = category.icon;
              const categoryCompliant = category.items.filter(i => i.status === "compliant").length;
              const isExpanded = expandedCategories[category.id];

              return (
                <Card key={category.id} noPadding>
                  {/* Category Header */}
                  <Card.Header bordered={isExpanded}>
                    <HStack
                      align="center"
                      gap={semanticSpacing.inline.md}
                      style={{ cursor: "pointer", flex: 1 }}
                      {...useKeyboardClick(() => toggleCategory(category.id))}
                    >
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: primitiveRadius.md,
                        background: semanticColors.surface.muted,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}>
                        <CategoryIcon size={18} color={semanticColors.text.secondary} />
                      </div>
                      <VStack gap={semanticSpacing.inline.xs}>
                        <Text variant="heading3">{category.name}</Text>
                        <Text variant="caption" color="tertiary">
                          {categoryCompliant} of {category.items.length} items compliant
                        </Text>
                      </VStack>
                    </HStack>
                    <HStack align="center" gap={semanticSpacing.inline.md}>
                      <div style={{ width: 100 }}>
                        <ProgressBar
                          value={categoryCompliant}
                          max={category.items.length}
                          showLabel={false}
                          size="sm"
                          color={categoryCompliant === category.items.length ? semanticColors.status.success.foreground : undefined}
                        />
                      </div>
                      <ChevronDown
                        size={18}
                        color={semanticColors.text.tertiary}
                        style={{
                          transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
                          transition: createTransition("transform", "quick")
                        }}
                      />
                    </HStack>
                  </Card.Header>

                  {/* Category Items */}
                  {isExpanded && (
                    bp?.isMobile ? (
                      <VStack gap={semanticSpacing.stack.sm} style={{ padding: semanticSpacing.inset.sm }}>
                        {category.items.map(item => (
                          <Card key={item.id} size="sm" elevated={false} style={{ padding: semanticSpacing.inset.md }}>
                            <VStack gap={semanticSpacing.stack.sm}>
                              <HStack align="center" justify="space-between">
                                <StatusBadge status={item.status} size="sm" />
                                {item.status !== "compliant" ? (
                                  <Button variant="secondary" size="sm">
                                    <Button.Icon><Upload size={14} /></Button.Icon>
                                    <Button.Label>Upload</Button.Label>
                                  </Button>
                                ) : (
                                  <Button variant="ghost" size="sm" style={{ padding: semanticSpacing.inset.xs }}>
                                    <Button.Icon><Eye size={14} /></Button.Icon>
                                  </Button>
                                )}
                              </HStack>
                              <Text variant="bodySmMedium">{item.name}</Text>
                              <HStack align="center" justify="space-between">
                                <Text variant="mono" color="tertiary">{item.ref}</Text>
                                <Text variant="caption" color="secondary">{item.date || "—"}</Text>
                              </HStack>
                            </VStack>
                          </Card>
                        ))}
                      </VStack>
                    ) : (
                      <VStack gap={0} style={{ padding: semanticSpacing.inset.xs }}>
                        <DataHeaderRow columns="100px 1fr 160px 100px 80px">
                          <ColumnHeader>Status</ColumnHeader>
                          <ColumnHeader>Requirement</ColumnHeader>
                          <ColumnHeader>Statute</ColumnHeader>
                          <ColumnHeader>Updated</ColumnHeader>
                          <ColumnHeader align="right">Action</ColumnHeader>
                        </DataHeaderRow>

                        {category.items.map(item => {
                          const statusKey = item.status === "compliant" ? "success" : item.status === "pending" ? "warning" : "danger";
                          return (
                            <DataRow key={item.id} columns="100px 1fr 160px 100px 80px" status={statusKey}>
                              <StatusBadge status={item.status} />
                              <Text variant="bodySmMedium">{item.name}</Text>
                              <Text variant="mono" color="tertiary">{item.ref}</Text>
                              <Text variant="bodySm" color="secondary">{item.date || "—"}</Text>
                              <HStack justify="flex-end">
                                {item.status !== "compliant" ? (
                                  <Button variant="link" size="sm">
                                    <Button.Icon><Upload size={14} /></Button.Icon>
                                    <Button.Label>Upload</Button.Label>
                                  </Button>
                                ) : (
                                  <Button variant="ghost" size="sm" style={{ padding: semanticSpacing.inset.xs }}>
                                    <Button.Icon><Eye size={14} /></Button.Icon>
                                  </Button>
                                )}
                              </HStack>
                            </DataRow>
                          );
                        })}
                      </VStack>
                    )
                  )}
                </Card>
              );
            })}
          </VStack>
        )}
      </VStack>
    </PageContainer>
  );
};

// ─── Maintenance View ───
const MaintenanceView = ({ bp, isLoading = false, hasError = false, isOffline = false, onRetry }) => {
  const { params, setParam } = useHashParams();
  const activeTab = params.tab || "all";
  const setActiveTab = (t) => setParam("tab", t);
  const hasNoMaintenanceRequests = maintenanceRequests.length === 0;

  const tabs = [
    { id: "all", label: "All", count: maintenanceRequests.length },
    { id: "submitted", label: "Submitted", count: maintenanceRequests.filter(r => r.status === "submitted").length },
    { id: "in_progress", label: "In Progress", count: maintenanceRequests.filter(r => r.status === "in_progress").length },
    { id: "completed", label: "Completed", count: maintenanceRequests.filter(r => r.status === "completed").length }
  ];

  const filtered = activeTab === "all"
    ? maintenanceRequests
    : maintenanceRequests.filter(r => r.status === activeTab);
  const openRequestsCount = maintenanceRequests.filter(
    r => r.status === "submitted" || r.status === "in_progress"
  ).length;
  const inProgressCount = maintenanceRequests.filter(r => r.status === "in_progress").length;
  const resolvedCount = maintenanceRequests.filter(r => r.status === "completed").length;

  const metricColumns = bp?.isMobile ? "1fr" : bp?.isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)";

  if (isOffline) {
    return (
      <PageContainer bp={bp}>
        <EmptyState
          {...EMPTY_STATES.offline}
          action={<Button variant="secondary" onClick={onRetry}>Retry</Button>}
        />
      </PageContainer>
    );
  }

  if (hasError) {
    return (
      <PageContainer bp={bp}>
        <EmptyState
          {...EMPTY_STATES.error}
          action={<Button variant="secondary" onClick={onRetry}>Retry</Button>}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer bp={bp}>
      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: metricColumns, gap: semanticSpacing.stack.md }}>
        <MetricCard value={String(openRequestsCount)} label="Open requests" icon={Wrench} />
        <MetricCard value={String(inProgressCount)} label="In progress" color={semanticColors.status.warning.foreground} />
        <MetricCard value={String(resolvedCount)} label="Resolved (30d)" color={semanticColors.status.success.foreground} />
        <MetricCard value="4.2d" label="Avg resolution time" />
      </div>

      {/* Filters and List */}
      <Card noPadding>
        <Card.Header bordered>
          <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
          <Card.Actions>
            <Button variant="primary" size="sm">
              <Button.Icon><Plus size={14} /></Button.Icon>
              <Button.Label>New Request</Button.Label>
            </Button>
          </Card.Actions>
        </Card.Header>

        {isLoading ? (
          <VStack gap={semanticSpacing.stack.sm} style={{ padding: semanticSpacing.inset.md }}>
            <Skeleton variant="rect" height={56} />
            <Skeleton variant="rect" height={56} />
            <Skeleton variant="rect" height={56} />
            <Skeleton variant="text" width="50%" />
          </VStack>
        ) : hasNoMaintenanceRequests ? (
          <EmptyState {...EMPTY_STATES.noMaintenance} />
        ) : filtered.length === 0 ? (
          <EmptyState
            {...EMPTY_STATES.noFilterResults}
            action={<Button variant="secondary" onClick={() => setActiveTab("all")}>View all requests</Button>}
          />
        ) : bp?.isMobile ? (
          <VStack gap={semanticSpacing.stack.sm} style={{ padding: semanticSpacing.inset.sm }}>
            {filtered.map(request => (
              <Card key={request.id} size="sm" interactive onClick={() => { }}>
                <VStack gap={semanticSpacing.stack.sm}>
                  <HStack align="center" justify="space-between">
                    <Text variant="mono" color="brand" weight="medium">{request.id}</Text>
                    <HStack align="center" gap={semanticSpacing.inline.sm}>
                      <PriorityBadge priority={request.priority} />
                      <StatusBadge status={request.status} size="sm" />
                    </HStack>
                  </HStack>

                  <VStack gap={semanticSpacing.inline.xs}>
                    <Text variant="bodySmMedium">{request.title}</Text>
                    <Text variant="caption" color="tertiary">{request.date}</Text>
                  </VStack>

                  <HStack align="center" justify="space-between">
                    <Text variant="caption" color="secondary">{request.category}</Text>
                    <HStack align="center" gap={semanticSpacing.inline.sm}>
                      <div style={{
                        width: 24,
                        height: 24,
                        borderRadius: primitiveRadius.full,
                        background: semanticColors.surface.muted,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        ...semanticTypography.caption,
                        color: semanticColors.text.secondary
                      }}>
                        {request.submitter.split(" ").map(n => n[0]).join("")}
                      </div>
                      <VStack gap={0}>
                        <Text variant="caption" color="secondary">{request.submitter.split(" ")[0]}</Text>
                        <Text variant="caption" color="tertiary">Unit {request.unit}</Text>
                      </VStack>
                    </HStack>
                  </HStack>
                </VStack>
              </Card>
            ))}
          </VStack>
        ) : (
          <VStack gap={0} style={{ padding: semanticSpacing.inset.xs }}>
            <DataHeaderRow columns="80px 1fr 100px 80px 100px 120px">
              <ColumnHeader>ID</ColumnHeader>
              <ColumnHeader>Description</ColumnHeader>
              <ColumnHeader>Category</ColumnHeader>
              <ColumnHeader>Priority</ColumnHeader>
              <ColumnHeader>Status</ColumnHeader>
              <ColumnHeader>Submitted by</ColumnHeader>
            </DataHeaderRow>

            {filtered.map(request => {
              const statusKey = request.status === "completed" ? "success" : request.status === "in_progress" ? "warning" : "info";
              return (
                <DataRow key={request.id} columns="80px 1fr 100px 80px 100px 120px" status={statusKey} onClick={() => { }}>
                  <Text variant="mono" color="brand" weight="medium">{request.id}</Text>
                  <VStack gap={semanticSpacing.inline.xs}>
                    <Text variant="bodySmMedium">{request.title}</Text>
                    <Text variant="caption" color="tertiary">{request.date}</Text>
                  </VStack>
                  <Text variant="caption" color="secondary">{request.category}</Text>
                  <PriorityBadge priority={request.priority} />
                  <StatusBadge status={request.status} size="sm" />
                  <HStack align="center" gap={semanticSpacing.inline.sm}>
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: primitiveRadius.full,
                      background: semanticColors.surface.muted,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      ...semanticTypography.caption,
                      color: semanticColors.text.secondary
                    }}>
                      {request.submitter.split(" ").map(n => n[0]).join("")}
                    </div>
                    <VStack gap={0}>
                      <Text variant="caption" color="secondary">{request.submitter.split(" ")[0]}</Text>
                      <Text variant="caption" color="tertiary">Unit {request.unit}</Text>
                    </VStack>
                  </HStack>
                </DataRow>
              );
            })}
          </VStack>
        )}
      </Card>
    </PageContainer>
  );
};

// ─── Placeholder Views ───
const PlaceholderView = ({ title, bp }) => (
  <PageContainer bp={bp}>
    <EmptyState
      {...EMPTY_STATES.placeholder}
      title={`${title} coming soon`}
    />
  </PageContainer>
);

const AnnouncementsView = ({ bp }) => (
  <PageContainer bp={bp}>
    <EmptyState
      {...EMPTY_STATES.noAnnouncements}
      action={<Button variant="primary">Create Announcement</Button>}
    />
  </PageContainer>
);

const OwnersView = ({ bp }) => (
  <PageContainer bp={bp}>
    <EmptyState
      {...EMPTY_STATES.noOwners}
      action={<Button variant="primary">Add Owners</Button>}
    />
  </PageContainer>
);

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN APPLICATION
   ═══════════════════════════════════════════════════════════════════════════ */

const viewConfig = {
  compliance: { title: "Compliance Dashboard", subtitle: "Florida Statute §718.111(12)(g)", component: ComplianceDashboard },
  documents: { title: "Documents", subtitle: "Upload & manage files", component: ({ bp }) => <PlaceholderView title="Documents" bp={bp} /> },
  meetings: { title: "Meetings", subtitle: "Schedule & notices", component: ({ bp }) => <PlaceholderView title="Meetings" bp={bp} /> },
  announcements: { title: "Announcements", subtitle: "Community updates", component: AnnouncementsView },
  maintenance: { title: "Maintenance", subtitle: "Service requests", component: MaintenanceView },
  owners: { title: "Owners & Residents", subtitle: "Directory & access", component: OwnersView }
};

export default function PropertyProRedesign() {
  const { params, setParamsMultiple } = useHashParams();
  const activeView = params.view || "compliance";
  const setActiveView = (view) => setParamsMultiple({ view, tab: null });

  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // Start true to avoid flash-of-content before skeletons
  const [hasError, setHasError] = useState(() => params.error === "true"); // URL-triggerable: #error=true
  const [isOffline, setIsOffline] = useState(() => (typeof navigator !== "undefined" ? !navigator.onLine : false));
  const bp = useBreakpoint();

  // Navigation State with Persistence
  const [navExpanded, setNavExpanded] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nav-expanded");
      if (saved !== null) return JSON.parse(saved);
    }
    return true; // Default expanded on desktop
  });

  // Automatically start expanded on desktop if not saved, but respect user choice
  useEffect(() => {
    // Sync with desktop/mobile if needed, but per-spec we prioritize user preference + desktop default
    if (!bp.isDesktop) {
      // Mobile always controls via overlay, so this state is for desktop rail
    }
  }, [bp.isDesktop]);

  // Simulate loading — starts true (no flash), clears after delay
  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  // Track online/offline browser state for resilient empty states
  useEffect(() => {
    const handleConnectionChange = () => setIsOffline(!navigator.onLine);
    window.addEventListener("online", handleConnectionChange);
    window.addEventListener("offline", handleConnectionChange);
    return () => {
      window.removeEventListener("online", handleConnectionChange);
      window.removeEventListener("offline", handleConnectionChange);
    };
  }, []);

  const handleNavToggle = () => {
    const newState = !navExpanded;
    setNavExpanded(newState);
    localStorage.setItem("nav-expanded", JSON.stringify(newState));
  };

  const handleRetry = () => {
    setHasError(false);
    if (typeof navigator !== "undefined") {
      setIsOffline(!navigator.onLine);
    }
    setIsLoading(true);
    window.setTimeout(() => setIsLoading(false), 1500);
  };

  // Keyboard shortcut for search
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const { title, subtitle, component: ViewComponent } = viewConfig[activeView];

  return (
    <>
      <style>{injectedGlobalStyles}</style>
      {/* Font imports */}
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <HStack style={{
        height: "100vh",
        background: semanticColors.surface.page,
        fontFamily: primitiveFonts.family.sans,
        color: semanticColors.text.primary,
        overflow: "hidden",
        position: "relative"
      }}>
        {!bp.isMobile && (
          <NavRail
            activeView={activeView}
            setActiveView={setActiveView}
            expanded={navExpanded}
            onToggle={handleNavToggle}
          />
        )}

        {bp.isMobile && mobileNavOpen && (
          <div
            onClick={() => setMobileNavOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              zIndex: 50,
              display: "flex"
            }}
          >
            <div
              className="dark-surface"
              onClick={(e) => e.stopPropagation()}
              style={{ position: "relative" }}
            >
              <NavRail
                activeView={activeView}
                setActiveView={(v) => { setActiveView(v); setMobileNavOpen(false); }}
                expanded={true}
              />
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  width: 44,
                  height: 44,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: primitiveRadius.md
                }}
              >
                <X size={18} color={semanticColors.text.inverse} />
              </button>
            </div>
          </div>
        )}

        <VStack style={{ flex: 1, overflow: "hidden" }}>
          <TopBar
            title={title}
            subtitle={subtitle}
            onSearchOpen={() => setSearchOpen(true)}
            bp={bp}
            onNavOpen={() => setMobileNavOpen(true)}
          />

          <div style={{ flex: 1, overflow: "auto" }}>
            <ViewComponent
              bp={bp}
              isLoading={isLoading}
              hasError={hasError}
              isOffline={isOffline}
              onRetry={handleRetry}
            />
          </div>
        </VStack>
      </HStack>
    </>
  );
}

/**
 * PropertyPro Design System — Token Architecture
 *
 * Three-tier system:
 * - Primitive: Raw values (colors, spacing, typography) — NEVER use directly
 * - Semantic: Purpose-driven tokens (text, surfaces, status) — USE in components
 * - Component: Component-specific tokens — USE for component internals
 */

// Primitive tokens
export { primitiveColors } from "./colors";
export { primitiveFonts } from "./typography";
export { primitiveSpace, semanticSpacing } from "./spacing";
export { primitiveRadius } from "./radius";
export { primitiveShadow, semanticElevation } from "./shadows";
export { primitiveMotion, semanticMotion, createTransition } from "./motion";
export { primitiveBreakpoints, interactionSizing, responsiveDensity } from "./breakpoints";

// Semantic tokens
export { semanticColors, getStatusColors } from "./colors";
export type { StatusVariant } from "./colors";
export { semanticTypography } from "./typography";
export type { TypographyVariant } from "./typography";
export type { SpaceCategory } from "./spacing";
export type { ElevationLevel } from "./shadows";

// Component tokens
export { componentTokens } from "./components";
export type { ComponentTokens } from "./components";

// Compliance tokens
export { complianceEscalation } from "./compliance";
export type { EscalationTier } from "./compliance";

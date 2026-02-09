/**
 * PropertyPro Design System
 *
 * A comprehensive design system for Florida condominium compliance software.
 *
 * Architecture:
 * - tokens/     Design tokens (colors, spacing, typography)
 * - primitives/ Low-level building blocks (Box, Stack, Text)
 * - components/ Interactive UI elements (Button, Badge, Card)
 * - patterns/   Higher-level UI patterns (DataRow, AlertBanner)
 * - hooks/      Shared React hooks
 * - utils/      Helper functions
 *
 * Usage:
 * ```tsx
 * import { Button, Card, StatusBadge } from '@propertypro/design-system';
 * import { Stack, Text } from '@propertypro/design-system/primitives';
 * import { semanticColors } from '@propertypro/design-system/tokens';
 * ```
 *
 * @see /docs/README.md for full documentation
 */

import "./tokens/index.css";

// ═══════════════════════════════════════════════════════════════════════════
// TOKENS
// ═══════════════════════════════════════════════════════════════════════════

export {
  // Primitive tokens (reference only)
  primitiveColors,
  primitiveFonts,
  primitiveSpace,
  primitiveRadius,
  primitiveShadow,
  primitiveMotion,
  primitiveBreakpoints,
  // Semantic tokens (use these)
  semanticColors,
  semanticTypography,
  semanticSpacing,
  semanticElevation,
  interactionSizing,
  complianceEscalation,
  semanticMotion,
  responsiveDensity,
  // Component tokens
  componentTokens,
  // Utilities
  createTransition,
  space,
  getStatusColors,
  // Theme object
  theme,
} from "./tokens";

export type {
  Theme,
  TypographyVariant,
  SpaceCategory,
  StatusVariant,
  ElevationLevel,
  EscalationTier,
} from "./tokens";

// ═══════════════════════════════════════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════

export {
  Box,
  Stack,
  HStack,
  VStack,
  Center,
  Spacer,
  Text,
  Heading,
  Label,
  Caption,
  Code,
  Paragraph,
} from "./primitives";

export type { BoxProps, StackProps, TextProps } from "./primitives";

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  Button,
  Badge,
  StatusBadge,
  PriorityBadge,
  Card,
  MetricCard,
  HeroMetric,
  ProgressBar,
  Skeleton,
  Spinner,
  Tabs,
  DeadlineAlert,
  NavRail,
} from "./components";

export type {
  ButtonProps,
  ButtonVariant,
  ButtonSize,
  BadgeProps,
  BadgeVariant,
  BadgeSize,
  StatusBadgeProps,
  CardProps,
  CardSize,
  HeroMetricProps,
  HeroMetricFormat,
  HeroMetricTrend,
  MetricCardProps,
  MetricCardChange,
  ProgressBarProps,
  ProgressBarSize,
  SkeletonProps,
  SkeletonVariant,
  SpinnerProps,
  TabsProps,
  TabsItem,
  DeadlineAlertProps,
  NavRailProps,
  NavRailItem,
} from "./components";

// ═══════════════════════════════════════════════════════════════════════════
// PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

export {
  DataRow,
  ColumnHeader,
  DataHeaderRow,
  SectionHeader,
  AlertBanner,
  EmptyState,
  NoResults,
  NoData,
  ComplianceHero,
  ComplianceCelebration,
  StatusPills,
  countStatuses,
} from "./patterns";

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

export { useKeyboardClick, useBreakpoint, useHashParams, useLocalStorage } from "./hooks";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  STATUS_CONFIG,
  getStatusConfig,
  EMPTY_STATE_CONFIGS,
  getEmptyStateConfig,
} from "./constants";
export type {
  StatusKey,
  EmptyStateConfig,
  EmptyStateIconKey,
  EmptyStateKey,
} from "./constants";

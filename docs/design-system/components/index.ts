/**
 * Components - Design System Elements
 *
 * These are the styled, interactive components built on primitives.
 * They follow atomic design principles and compound component patterns.
 *
 * @see https://atomicdesign.bradfrost.com/chapter-2/
 * @see https://www.patterns.dev/react/compound-pattern/
 */

// Button
export { Button, default as ButtonDefault } from "./Button/Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button/Button";

// Badge
export {
  Badge,
  StatusBadge,
  PriorityBadge,
  default as BadgeDefault,
} from "./Badge/Badge";
export type {
  BadgeProps,
  BadgeVariant,
  BadgeSize,
  StatusBadgeProps,
} from "./Badge/Badge";
export type { StatusKey } from "./Badge/Badge";

// Card
export { Card, default as CardDefault } from "./Card/Card";
export type { CardProps, CardSize } from "./Card/Card";

// Metrics
export { HeroMetric, default as HeroMetricDefault } from "./Metrics/HeroMetric";
export type { HeroMetricProps, HeroMetricFormat, HeroMetricTrend } from "./Metrics/HeroMetric";
export { MetricCard, default as MetricCardDefault } from "./Metrics/MetricCard";
export type { MetricCardProps, MetricCardChange } from "./Metrics/MetricCard";

// Progress
export { ProgressBar, default as ProgressBarDefault } from "./Progress/ProgressBar";
export type { ProgressBarProps, ProgressBarSize } from "./Progress/ProgressBar";

// Navigation
export { Tabs, default as TabsDefault } from "./Navigation/Tabs";
export type { TabsProps, TabsItem } from "./Navigation/Tabs";
export { NavRail, default as NavRailDefault } from "./Navigation/NavRail";
export type { NavRailProps, NavRailItem } from "./Navigation/NavRail";

// Alert
export { DeadlineAlert, default as DeadlineAlertDefault } from "./Alert/DeadlineAlert";
export type { DeadlineAlertProps } from "./Alert/DeadlineAlert";

// Feedback
export { Skeleton, SkeletonDefault, Spinner, SpinnerDefault } from "./Feedback";
export type { SkeletonProps, SkeletonVariant, SpinnerProps } from "./Feedback";

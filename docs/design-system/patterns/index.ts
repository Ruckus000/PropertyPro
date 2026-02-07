/**
 * Patterns - Higher-level UI patterns
 *
 * These components compose primitives and elements into
 * complete UI patterns for common use cases.
 *
 * @see https://atomicdesign.bradfrost.com/chapter-2/
 */

// Data display
export { DataRow, ColumnHeader, DataHeaderRow, default as DataRowDefault } from "./DataRow";

// Section structure
export { SectionHeader, default as SectionHeaderDefault } from "./SectionHeader";

// Feedback
export { AlertBanner, default as AlertBannerDefault } from "./AlertBanner";
export { EmptyState, NoResults, NoData, default as EmptyStateDefault } from "./EmptyState";

// Phase 2 patterns
export { ComplianceHero, default as ComplianceHeroDefault } from "./ComplianceHero";
export type { ComplianceHeroProps } from "./ComplianceHero";
export {
  ComplianceCelebration,
  default as ComplianceCelebrationDefault,
} from "./ComplianceCelebration";
export type { ComplianceCelebrationProps } from "./ComplianceCelebration";
export { StatusPills, countStatuses, default as StatusPillsDefault } from "./StatusPills";
export type { StatusPillsProps, StatusCounts, StatusPillsKey } from "./StatusPills";

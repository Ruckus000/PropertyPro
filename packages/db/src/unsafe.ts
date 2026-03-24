/**
 * Unsafe DB access surface.
 *
 * This module is the only sanctioned escape hatch for unscoped database access.
 * Importers must treat usage as an exception and justify it in code review.
 */
import { closeDb, db } from './drizzle';

export { findCommunityBySlugUnscoped } from './queries/community-lookup';
export {
  claimDigestQueueRows,
  findCandidateDigestCommunityIds,
  hasMoreDigestRows,
} from './queries/notification-digest';
export type { DigestFrequency } from './queries/notification-digest';
/**
 * PM portfolio queries — cross-community by design.
 *
 * **Authorization contract:** callers MUST verify PM role via
 * `isPmAdminInAnyCommunity` (or equivalent) and return 403 for non-PMs
 * before invoking `findManagedCommunitiesPortfolioUnscoped`.
 */
export {
  isPmAdminInAnyCommunity,
  findManagedCommunitiesPortfolioUnscoped,
  getPortfolioDashboard,
  getMaintenanceVolumeReport,
  getComplianceStatusReport,
  getOccupancyTrendsReport,
  getViolationSummaryReport,
  getDelinquencyAgingReport,
  type ManagedCommunityPortfolioRow,
  type DashboardCommunityRow,
  type DashboardKpis,
  type DashboardFilters,
  type PortfolioDashboardResult,
  type PortfolioQueryFilters,
  type DateRange,
  type MaintenanceVolumeReport,
  type ComplianceStatusReport,
  type OccupancyTrendsReport,
  type ViolationSummaryReport,
  type DelinquencyAgingReport,
} from './queries/pm-portfolio';

/**
 * Community picker — cross-community user membership query.
 *
 * **Authorization contract:** callers MUST verify the user is authenticated
 * before invoking `findUserCommunitiesUnscoped`.
 */
export {
  findUserCommunitiesUnscoped,
  countUserCommunitiesUnscoped,
  type UserCommunityRow,
} from './queries/user-communities';

/**
 * Returns the raw Drizzle client without tenant scoping.
 * Use only for deliberate, reviewed escape-hatch flows.
 */
export function createUnscopedClient(): typeof db {
  return db;
}

/**
 * Closes the shared unscoped Drizzle client used by CLI scripts.
 */
export async function closeUnscopedClient(): Promise<void> {
  await closeDb();
}

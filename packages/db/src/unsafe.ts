/**
 * Unsafe DB access surface.
 *
 * This module is the only sanctioned escape hatch for unscoped database access.
 * Importers must treat usage as an exception and justify it in code review.
 */
import { closeDb, db } from './drizzle';

export { findCommunityBySlugUnscoped } from './queries/community-lookup';
/**
 * Community-scoped user display-name lookup.
 *
 * **Authorization contract:** callers MUST ensure the communityId has been
 * validated from the active request context and the actor is a member of that
 * community before using the resolved names.
 */
export { findCommunityUserDisplayNames, type CommunityUserDisplayNameRow } from './queries/user-display-names';
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
 * Rootless-communities report — cross-community by design.
 *
 * **Authorization contract:** callers MUST verify a platform-admin session
 * (apps/admin `requirePlatformAdmin`) before invoking `findRootlessCommunities`.
 */
export {
  findRootlessCommunities,
  findMyRootlessCommunities,
  type RootlessCommunityRow,
  type MyRootlessCommunityRow,
} from './queries/rootless-communities';

/**
 * Root-manager write-ops — cross-community by design.
 *
 * **Authorization contract:** `reassignRootOp` is a platform-admin-only
 * operation; callers MUST verify a platform-admin session (apps/admin
 * `requirePlatformAdmin`) before invoking it. The op enforces the
 * property_manager-only target guard internally and throws
 * `RoleOpForbiddenError` (map to 403) for an ineligible target.
 */
export {
  reassignRootOp,
  RoleOpForbiddenError,
  type ReassignRootOpParams,
} from './ops/root-ops';

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

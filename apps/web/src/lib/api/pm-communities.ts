// AUTHZ: P3-PRE-03: PM portfolio cross-community read boundary
import {
  findManagedCommunitiesPortfolioUnscoped,
  findManagedCommunityIdsUnscoped,
  hasOpenAddCommunityCheckoutUnscoped,
  isPmAdminInAnyCommunity,
  type PortfolioQueryFilters,
} from '@propertypro/db/unsafe';
import type { CommunityType } from '@propertypro/shared';

export interface PmCommunityFilters {
  communityType?: CommunityType;
  search?: string;
}

export interface PmCommunityPortfolioCard {
  communityId: number;
  communityName: string;
  slug: string;
  communityType: CommunityType;
  timezone: string;
  residentCount: number;
  totalUnits: number;
  openMaintenanceRequests: number;
  unsatisfiedComplianceItems: number;
  /** Count of distinct units with an active lease (apartment only, else 0) */
  occupiedUnits: number;
  /** Rounded occupancy percentage (apartment only when totalUnits > 0, else null) */
  occupancyRate: number | null;
}

/** Re-export so page-level code can check PM gate without a direct unsafe import. */
export { isPmAdminInAnyCommunity };

export async function listManagedCommunitiesForPm(
  pmUserId: string,
  filters: PmCommunityFilters = {},
): Promise<PmCommunityPortfolioCard[]> {
  const dbFilters: PortfolioQueryFilters = {};
  if (filters.communityType) dbFilters.communityType = filters.communityType;
  if (filters.search) dbFilters.search = filters.search;

  return findManagedCommunitiesPortfolioUnscoped(pmUserId, dbFilters);
}

/**
 * The one community `userId` manages, or null when they manage none or
 * several. Counts what the Communities summary counts: property or root
 * manager in a community that is not deleted.
 */
export async function findSoleManagedCommunityId(userId: string): Promise<number | null> {
  const ids = await findManagedCommunityIdsUnscoped(userId, 2);
  return ids.length === 1 ? ids[0]! : null;
}

/**
 * Whether `userId` has an Add Community checkout still open or being set up
 * (see `hasOpenAddCommunityCheckoutUnscoped`).
 */
export async function hasOpenAddCommunityCheckout(userId: string): Promise<boolean> {
  return hasOpenAddCommunityCheckoutUnscoped(userId);
}

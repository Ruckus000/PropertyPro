// AUTHZ: P3-PRE-03: PM portfolio cross-community read boundary
import {
  findAddCommunityFactsUnscoped,
  findManagedCommunitiesPortfolioUnscoped,
  findManagedCommunityIdsUnscoped,
  hasOpenAddCommunityCheckoutUnscoped,
  isPmAdminInAnyCommunity,
  type PortfolioQueryFilters,
} from '@propertypro/db/unsafe';
import type { CommunityType } from '@propertypro/shared';
import { ForbiddenError } from '@/lib/api/errors';
import {
  ADD_COMMUNITY_REFUSAL_MESSAGES,
  decideAddCommunityAccess,
  type AddCommunityAccess,
} from '@/lib/pm/add-community-access';

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

/** Whether `userId` may add a community (see `decideAddCommunityAccess`). */
export async function getAddCommunityAccess(userId: string): Promise<AddCommunityAccess> {
  return decideAddCommunityAccess(await findAddCommunityFactsUnscoped(userId));
}

/**
 * Throws 403 with a reason the person can act on unless `userId` may add a
 * community. Returns the billing group to add to, or null when this add
 * starts one.
 */
export async function requireAddCommunityAccess(userId: string): Promise<number | null> {
  const access = await getAddCommunityAccess(userId);
  if (!access.allowed) {
    throw new ForbiddenError(ADD_COMMUNITY_REFUSAL_MESSAGES[access.reason]);
  }
  return access.billingGroupId;
}

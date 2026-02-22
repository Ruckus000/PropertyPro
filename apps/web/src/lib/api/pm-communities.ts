import {
  findManagedCommunitiesPortfolioUnscoped,
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

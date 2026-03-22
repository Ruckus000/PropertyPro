import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../drizzle';
import { communities } from '../schema/communities';
import { userRoles } from '../schema/user-roles';

export interface UserCommunityRow {
  communityId: number;
  communityName: string;
  slug: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  city: string | null;
  state: string | null;
  logoPath: string | null;
  role: string;
  isUnitOwner: boolean;
  displayTitle: string | null;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  isDemo: boolean;
}

/**
 * Returns all non-deleted communities that the given user belongs to.
 * Intentionally unscoped — callers must only expose this through
 * `@propertypro/db/unsafe`.
 */
export async function findUserCommunitiesUnscoped(
  userId: string,
): Promise<UserCommunityRow[]> {
  return db
    .select({
      communityId: communities.id,
      communityName: communities.name,
      slug: communities.slug,
      communityType: communities.communityType,
      city: communities.city,
      state: communities.state,
      logoPath: communities.logoPath,
      role: userRoles.role,
      isUnitOwner: userRoles.isUnitOwner,
      displayTitle: userRoles.displayTitle,
      subscriptionStatus: communities.subscriptionStatus,
      subscriptionPlan: communities.subscriptionPlan,
      isDemo: communities.isDemo,
    })
    .from(userRoles)
    .innerJoin(communities, eq(communities.id, userRoles.communityId))
    .where(
      and(
        eq(userRoles.userId, userId),
        isNull(communities.deletedAt),
      ),
    )
    .orderBy(communities.name);
}

/**
 * Returns a count of distinct non-deleted communities the user belongs to.
 * More efficient than fetching the full list when only the count is needed.
 */
export async function countUserCommunitiesUnscoped(
  userId: string,
): Promise<number> {
  const rows = await db
    .selectDistinct({ communityId: userRoles.communityId })
    .from(userRoles)
    .innerJoin(communities, eq(communities.id, userRoles.communityId))
    .where(
      and(
        eq(userRoles.userId, userId),
        isNull(communities.deletedAt),
      ),
    );
  return rows.length;
}

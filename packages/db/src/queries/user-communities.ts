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

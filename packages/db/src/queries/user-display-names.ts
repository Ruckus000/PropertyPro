import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../drizzle';
import { communities } from '../schema/communities';
import { userRoles } from '../schema/user-roles';
import { users } from '../schema/users';

export interface CommunityUserDisplayNameRow {
  id: string;
  fullName: string | null;
}

/**
 * Resolves display names only for users who belong to the requested community.
 * Unknown users, non-members, and blank names are intentionally omitted so
 * callers can apply their own fallback display text.
 */
export async function findCommunityUserDisplayNames(
  communityId: number,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const uniqueUserIds = Array.from(
    new Set(userIds.filter((userId) => typeof userId === 'string' && userId.length > 0)),
  );

  const displayNames = new Map<string, string | null>();
  if (uniqueUserIds.length === 0) {
    return displayNames;
  }

  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
    })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .innerJoin(communities, eq(communities.id, userRoles.communityId))
    .where(
      and(
        eq(userRoles.communityId, communityId),
        isNull(communities.deletedAt),
        inArray(users.id, uniqueUserIds),
      ),
    );

  const typedRows = rows as CommunityUserDisplayNameRow[];
  for (const row of typedRows) {
    displayNames.set(row.id, row.fullName?.trim() || null);
  }

  return displayNames;
}

import { communities, createScopedClient, userRoles } from '@propertypro/db';
import { ForbiddenError } from '@/lib/api/errors';
import type { CommunityRole, CommunityType } from '@propertypro/shared';
import { requireCommunityRole, requireCommunityType } from '@/lib/utils/community-validators';

export interface CommunityMembership {
  userId: string;
  communityId: number;
  role: CommunityRole;
  communityType: CommunityType;
}

/**
 * Enforce that the authenticated actor belongs to the target community.
 * Throws 403 when the actor has no role assignment in that community.
 * Returns the membership details including the user's role.
 */
export async function requireCommunityMembership(
  communityId: number,
  userId: string,
): Promise<CommunityMembership> {
  const scoped = createScopedClient(communityId);
  const [roleRows, communityRows] = await Promise.all([
    scoped.query(userRoles),
    scoped.query(communities),
  ]);
  const membership = roleRows.find((row) => row['userId'] === userId);
  const community = communityRows.find((row) => row['id'] === communityId);

  if (!membership || !community) {
    throw new ForbiddenError('You are not a member of this community');
  }

  return {
    userId,
    communityId,
    role: requireCommunityRole(
      membership['role'],
      `requireCommunityMembership(communityId=${communityId}, userId=${userId}) role`,
    ),
    communityType: requireCommunityType(
      community['communityType'],
      `requireCommunityMembership(communityId=${communityId}) community`,
    ),
  };
}

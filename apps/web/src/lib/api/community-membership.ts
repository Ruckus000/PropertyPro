import { createScopedClient, userRoles } from '@propertypro/db';
import { ForbiddenError } from '@/lib/api/errors';

/**
 * Enforce that the authenticated actor belongs to the target community.
 * Throws 403 when the actor has no role assignment in that community.
 */
export async function requireCommunityMembership(
  communityId: number,
  userId: string,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  const roleRows = await scoped.query(userRoles);
  const isMember = roleRows.some((row) => row['userId'] === userId);

  if (!isMember) {
    throw new ForbiddenError('You are not a member of this community');
  }
}

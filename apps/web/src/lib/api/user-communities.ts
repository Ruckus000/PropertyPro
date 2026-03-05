import {
  findUserCommunitiesUnscoped,
  type UserCommunityRow,
} from '@propertypro/db/unsafe';

export type { UserCommunityRow };

export async function listCommunitiesForUser(
  userId: string,
): Promise<UserCommunityRow[]> {
  return findUserCommunitiesUnscoped(userId);
}

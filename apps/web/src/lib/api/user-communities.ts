import {
  findUserCommunitiesUnscoped,
  countUserCommunitiesUnscoped,
  type UserCommunityRow,
} from '@propertypro/db/unsafe';

export type { UserCommunityRow };

export async function listCommunitiesForUser(
  userId: string,
): Promise<UserCommunityRow[]> {
  return findUserCommunitiesUnscoped(userId);
}

export async function countCommunitiesForUser(
  userId: string,
): Promise<number> {
  return countUserCommunitiesUnscoped(userId);
}

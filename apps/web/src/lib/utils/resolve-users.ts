import { findCommunityUserDisplayNames } from '@propertypro/db/unsafe';

function getFallbackUserDisplayName(userId: string): string {
  return `User ${userId.slice(0, 8)}`;
}

export async function resolveUserDisplayNames(
  communityId: number,
  userIds: string[],
): Promise<Map<string, string>> {
  const uniqueUserIds = Array.from(
    new Set(userIds.filter((userId) => typeof userId === 'string' && userId.length > 0)),
  ).sort();

  const displayNames = new Map<string, string>();

  if (uniqueUserIds.length === 0) {
    return displayNames;
  }

  const communityDisplayNames = await findCommunityUserDisplayNames(communityId, uniqueUserIds);
  for (const userId of uniqueUserIds) {
    const resolved = communityDisplayNames.get(userId);
    if (resolved) {
      displayNames.set(userId, resolved);
    }
  }

  for (const userId of uniqueUserIds) {
    if (!displayNames.has(userId)) {
      displayNames.set(userId, getFallbackUserDisplayName(userId));
    }
  }

  return displayNames;
}

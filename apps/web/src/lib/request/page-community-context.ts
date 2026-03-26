import { cache } from 'react';
import { headers } from 'next/headers';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import {
  COMMUNITY_ID_HEADER,
  parseForwardedCommunityId,
  requireForwardedCommunityId,
} from './forwarded-headers';
import { requirePageAuthenticatedUserId } from './page-auth-context';

const getOptionalPageCommunityIdCached = cache(async (): Promise<number | null> => {
  const requestHeaders = await headers();
  return parseForwardedCommunityId(requestHeaders.get(COMMUNITY_ID_HEADER));
});

const getPageCommunityMembershipCached = cache(
  async (communityId: number, userId: string): Promise<CommunityMembership> =>
    requireCommunityMembership(communityId, userId),
);

export async function getOptionalPageCommunityId(): Promise<number | null> {
  return getOptionalPageCommunityIdCached();
}

export async function requirePageCommunityId(): Promise<number> {
  const requestHeaders = await headers();
  return requireForwardedCommunityId(requestHeaders.get(COMMUNITY_ID_HEADER));
}

export async function requirePageCommunityMembership(
  communityId?: number,
  userId?: string,
): Promise<CommunityMembership> {
  const resolvedCommunityId = communityId ?? (await requirePageCommunityId());
  const resolvedUserId = userId ?? (await requirePageAuthenticatedUserId());
  return getPageCommunityMembershipCached(resolvedCommunityId, resolvedUserId);
}

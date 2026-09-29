import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityFeatures } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { listCommunitiesForUser } from '@/lib/api/user-communities';
import { getSupportScope, narrowToSupportScope } from '@/lib/support/support-scope';
import { requirePageAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership } from '@/lib/request/page-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';

export interface HelpPageContext {
  userId: string;
  communityId: number;
  membership: CommunityMembership;
  features: CommunityFeatures;
}

export async function requireHelpPageContext(
  searchParams: Record<string, string | string[] | undefined>,
  pathname: string,
): Promise<HelpPageContext> {
  const [requestHeaders, userId] = await Promise.all([
    headers(),
    requirePageAuthenticatedUserId(),
  ]);
  const params = toUrlSearchParams(searchParams);
  const context = resolveCommunityContext({
    searchParams: params,
    host: requestHeaders.get('host'),
  });

  if (!context.communityId) {
    // Narrowed under a support session: the redirect below must not steer the
    // impersonated request into a community outside the session's grant.
    const communities = narrowToSupportScope(
      await listCommunitiesForUser(userId),
      getSupportScope(requestHeaders),
      (c) => c.communityId,
    );
    if (communities.length === 1) {
      params.set('communityId', String(communities[0]!.communityId));
      redirect(`${pathname}?${params.toString()}`);
    }
    redirect('/select-community');
  }

  const membership = await requirePageCommunityMembership(context.communityId, userId);

  return {
    userId,
    communityId: context.communityId,
    membership,
    features: getFeaturesForCommunity(membership.communityType),
  };
}

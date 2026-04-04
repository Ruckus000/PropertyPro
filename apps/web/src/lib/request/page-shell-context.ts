import { cache } from 'react';
import { COMMUNITY_TYPES, getFeaturesForCommunity, isAnyCommunityRole } from '@propertypro/shared';
import type {
  AnyCommunityRole,
  CommunityFeatures,
  CommunityType,
} from '@propertypro/shared';
import { getBrandingForCommunity } from '@/lib/api/branding';
import { listCommunitiesForUser } from '@/lib/api/user-communities';
import { getMembershipResourceAccess, type ResourceAccessMap } from '@/lib/db/access-control';
import { getOptionalPageCommunityId, requirePageCommunityMembership } from './page-community-context';
import { getOptionalPageAuthenticatedUser } from './page-auth-context';

export interface PageShellUser {
  id: string;
  fullName: string | null;
  email: string | null;
}

export interface PageShellCommunity {
  id: number;
  name: string;
  type: CommunityType;
  plan: string | null;
}

export interface PageShellContext {
  user: PageShellUser | null;
  community: PageShellCommunity | null;
  role: AnyCommunityRole | null;
  features: CommunityFeatures | null;
  resourceAccess: ResourceAccessMap | null;
  subscriptionStatus: string | null;
  freeAccessExpiresAt: Date | null;
  isDemo: boolean;
  trialEndsAt: Date | null;
  demoExpiresAt: Date | null;
}

const getPageShellContextCached = cache(async (): Promise<PageShellContext> => {
  const user = await getOptionalPageAuthenticatedUser();
  if (!user) {
    return {
      user: null,
      community: null,
      role: null,
      features: null,
      resourceAccess: null,
      subscriptionStatus: null,
      freeAccessExpiresAt: null,
      isDemo: false,
      trialEndsAt: null,
      demoExpiresAt: null,
    };
  }

  const shellUser: PageShellUser = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
  };

  const communityId = await getOptionalPageCommunityId();
  if (!communityId) {
    return {
      user: shellUser,
      community: null,
      role: null,
      features: null,
      resourceAccess: null,
      subscriptionStatus: null,
      freeAccessExpiresAt: null,
      isDemo: false,
      trialEndsAt: null,
      demoExpiresAt: null,
    };
  }

  const communities = await listCommunitiesForUser(user.id);
  const match = communities.find((community) => community.communityId === communityId);

  if (!match) {
    return {
      user: shellUser,
      community: null,
      role: null,
      features: null,
      resourceAccess: null,
      subscriptionStatus: null,
      freeAccessExpiresAt: null,
      isDemo: false,
      trialEndsAt: null,
      demoExpiresAt: null,
    };
  }

  const communityType = match.communityType;
  const role = match.role;
  if (
    !COMMUNITY_TYPES.includes(communityType as CommunityType) ||
    !isAnyCommunityRole(role)
  ) {
    return {
      user: shellUser,
      community: null,
      role: null,
      features: null,
      resourceAccess: null,
      subscriptionStatus: null,
      freeAccessExpiresAt: null,
      isDemo: false,
      trialEndsAt: null,
      demoExpiresAt: null,
    };
  }

  const membership = await requirePageCommunityMembership(match.communityId, user.id);

  return {
    user: shellUser,
    community: {
      id: match.communityId,
      name: match.communityName,
      type: communityType as CommunityType,
      plan: match.subscriptionPlan ?? null,
    },
    role: membership.role,
    features: getFeaturesForCommunity(communityType as CommunityType),
    resourceAccess: getMembershipResourceAccess(membership),
    subscriptionStatus: match.subscriptionStatus ?? null,
    freeAccessExpiresAt: match.freeAccessExpiresAt ?? null,
    isDemo: match.isDemo,
    trialEndsAt: match.trialEndsAt ?? null,
    demoExpiresAt: match.demoExpiresAt ?? null,
  };
});

const getPageBrandingCached = cache(async (communityId: number) =>
  getBrandingForCommunity(communityId),
);

export async function getPageShellContext(): Promise<PageShellContext> {
  return getPageShellContextCached();
}

export async function getPageShellBranding(communityId: number) {
  return getPageBrandingCached(communityId);
}

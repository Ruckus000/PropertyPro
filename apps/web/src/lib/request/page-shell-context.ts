import { cache } from 'react';
import { COMMUNITY_TYPES, getFeaturesForCommunity, isAnyCommunityRole } from '@propertypro/shared';
import type {
  AnyCommunityRole,
  CommunityFeatures,
  CommunityType,
} from '@propertypro/shared';
import { getBrandingForCommunity } from '@/lib/api/branding';
import { listCommunitiesForUser } from '@/lib/api/user-communities';
import { getOptionalPageCommunityId } from './page-community-context';
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
  subscriptionStatus: string | null;
  freeAccessExpiresAt: Date | null;
  isDemo: boolean;
}

const getPageShellContextCached = cache(async (): Promise<PageShellContext> => {
  const user = await getOptionalPageAuthenticatedUser();
  if (!user) {
    return {
      user: null,
      community: null,
      role: null,
      features: null,
      subscriptionStatus: null,
      freeAccessExpiresAt: null,
      isDemo: false,
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
      subscriptionStatus: null,
      freeAccessExpiresAt: null,
      isDemo: false,
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
      subscriptionStatus: null,
      freeAccessExpiresAt: null,
      isDemo: false,
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
      subscriptionStatus: null,
      freeAccessExpiresAt: null,
      isDemo: false,
    };
  }

  return {
    user: shellUser,
    community: {
      id: match.communityId,
      name: match.communityName,
      type: communityType as CommunityType,
      plan: match.subscriptionPlan ?? null,
    },
    role: role as AnyCommunityRole,
    features: getFeaturesForCommunity(communityType as CommunityType),
    subscriptionStatus: match.subscriptionStatus ?? null,
    freeAccessExpiresAt: match.freeAccessExpiresAt ?? null,
    isDemo: match.isDemo,
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

import { cache } from 'react';
import { getEffectiveFeatures, resolvePlanId } from '@propertypro/shared';
import type {
  AnyCommunityRole,
  CommunityFeatures,
  CommunityType,
} from '@propertypro/shared';
import { ForbiddenError } from '@/lib/api/errors';
import { getBrandingForCommunity } from '@/lib/api/branding';
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

const EMPTY_PAGE_SHELL_CONTEXT: PageShellContext = {
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

const getPageActiveCommunityShellContextCached = cache(
  async (
    communityId: number,
    userId: string,
  ): Promise<Omit<PageShellContext, 'user'> | null> => {
    try {
      const membership = await requirePageCommunityMembership(communityId, userId);

      return {
        community: {
          id: membership.communityId,
          name: membership.communityName,
          type: membership.communityType as CommunityType,
          plan: membership.subscriptionPlan,
        },
        role: membership.role as AnyCommunityRole,
        features: getEffectiveFeatures(
          membership.communityType,
          resolvePlanId(membership.subscriptionPlan),
        ),
        resourceAccess: getMembershipResourceAccess(membership),
        subscriptionStatus: membership.subscriptionStatus,
        freeAccessExpiresAt: membership.freeAccessExpiresAt,
        isDemo: membership.isDemo,
        trialEndsAt: membership.trialEndsAt,
        demoExpiresAt: membership.demoExpiresAt,
      };
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return null;
      }

      throw error;
    }
  },
);

const getPageShellContextCached = cache(async (): Promise<PageShellContext> => {
  const user = await getOptionalPageAuthenticatedUser();
  if (!user) {
    return EMPTY_PAGE_SHELL_CONTEXT;
  }

  const shellUser: PageShellUser = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
  };

  const communityId = await getOptionalPageCommunityId();
  if (!communityId) {
    return {
      ...EMPTY_PAGE_SHELL_CONTEXT,
      user: shellUser,
    };
  }

  const activeCommunityContext = await getPageActiveCommunityShellContextCached(
    communityId,
    user.id,
  );

  if (!activeCommunityContext) {
    return {
      ...EMPTY_PAGE_SHELL_CONTEXT,
      user: shellUser,
    };
  }

  return { user: shellUser, ...activeCommunityContext };
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

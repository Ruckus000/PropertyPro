/**
 * The gate every Contracts page passes before it renders: signed in, a member
 * of the community, a condo or HOA (`hasCompliance`), and permitted to read or
 * write contracts. The API checks the same permission, so the pages and the
 * routes agree by construction and not by coincidence.
 *
 * A page that is refused redirects (as the Contracts page always has): a 403
 * thrown from a page renders the error boundary, which reads as a fault.
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isEntitledState, resolveLifecycleState, type RbacAction } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { getEffectiveFeaturesForPage } from '@/lib/middleware/plan-guard';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { resolvePageCommunityContext } from '@/lib/tenant/resolve-community-context';

export type PageSearchParams = Record<string, string | string[] | undefined>;

/** The community this request is for, or null when the URL and host name none. */
export async function resolveContractsCommunityId(searchParams: PageSearchParams): Promise<number | null> {
  const context = resolvePageCommunityContext({
    searchParams: toUrlSearchParams(searchParams),
    headers: await headers(),
  });
  return context.communityId ?? null;
}

export interface ContractsPageAccess {
  userId: string;
  membership: CommunityMembership;
}

/**
 * Sign-in, membership, the compliance feature, then the permission, in that
 * order. `serverRead` is for a page that reads contracts on the server: the
 * list API refuses a manager of a lapsed community, so those pages do too.
 */
export async function requireContractsPageAccess(
  communityId: number,
  action: RbacAction,
  options: { serverRead?: boolean } = {},
): Promise<ContractsPageAccess> {
  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId);

  // Condo and HOA only.
  const features = await getEffectiveFeaturesForPage(communityId, membership.communityType);
  if (!features.hasCompliance) {
    redirect('/dashboard?reason=feature-not-available');
  }

  try {
    requirePermission(membership, 'contracts', action);
  } catch {
    redirect('/dashboard?reason=insufficient-permissions');
  }

  if (options.serverRead) {
    const state = resolveLifecycleState({
      subscriptionStatus: membership.subscriptionStatus,
      subscriptionCanceledAt: membership.subscriptionCanceledAt,
      freeAccessExpiresAt: membership.freeAccessExpiresAt,
    });
    if (!isEntitledState(state)) {
      redirect('/dashboard?reason=subscription-lapsed');
    }
  }

  return { userId, membership };
}

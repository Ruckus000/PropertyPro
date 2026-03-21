export const dynamic = 'force-dynamic';

/**
 * Mobile search page — full-screen search interface.
 *
 * Same feature registry filtering as the desktop command palette,
 * rendered in a single-column mobile layout.
 */
import { redirect } from 'next/navigation';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { eq } from '@propertypro/db/filters';
import { communities } from '@propertypro/db';
import { createScopedClient } from '@propertypro/db';
import { getFeaturesForCommunity, resolvePlanId } from '@propertypro/shared';
import { MobileSearchContent } from '@/components/mobile/MobileSearchContent';

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function MobileSearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const communityId = Number(params['communityId']);

  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  let membership: Awaited<ReturnType<typeof requireCommunityMembership>>;
  try {
    membership = await requireCommunityMembership(communityId, userId);
  } catch {
    redirect('/auth/login');
  }

  // Fetch subscription plan for plan-gating
  const scoped = createScopedClient(communityId);
  const communityRows = await scoped.selectFrom(
    communities,
    {},
    eq(communities.id, communityId),
  );
  const rawPlan = (communityRows[0] as Record<string, unknown> | undefined)?.['subscriptionPlan'];
  const planId = typeof rawPlan === 'string' ? resolvePlanId(rawPlan) : null;

  const features = getFeaturesForCommunity(membership.communityType);

  return (
    <MobileSearchContent
      communityId={communityId}
      role={membership.role}
      features={features}
      communityType={membership.communityType}
      planId={planId}
    />
  );
}

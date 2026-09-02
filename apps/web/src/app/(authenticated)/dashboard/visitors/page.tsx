/**
 * Visitor Logging Page — Wave 4 Apartment Features
 *
 * Route: /dashboard/visitors?communityId=X
 * Auth: all community members
 * Feature gate: hasVisitorLogging (apartment + condo)
 * View: staff see VisitorStaffView, residents see VisitorResidentView
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { communities, createScopedClient } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { isAdminRole, getFeaturesForCommunity } from '@propertypro/shared';
import { listActorUnitIds } from '@/lib/units/actor-units';
import { getUnitLabelMap } from '@/lib/services/units-lookup';
import { FeatureGate } from '@/components/billing/feature-gate';
import { VisitorStaffView } from '@/components/visitors/VisitorStaffView';
import { VisitorResidentView } from '@/components/visitors/VisitorResidentView';
import { PageHeader } from '@/components/shared/page-header';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function VisitorsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);

  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  const communityId = rawId;
  let userId: string;

  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId);

  const typeFeatures = getFeaturesForCommunity(membership.communityType);
  if (!typeFeatures.hasVisitorLogging) {
    redirect('/dashboard?reason=feature-unavailable');
  }

  const isStaff = isAdminRole(membership.role);
  const scoped = createScopedClient(communityId);
  const communityRows = await scoped.selectFrom(communities, {}, eq(communities.id, communityId));
  const community = communityRows[0];
  const communitySettings = (community?.communitySettings as Record<string, unknown> | undefined) ?? {};
  let hostUnitLabel: string | undefined;
  if (!isStaff) {
    const primaryId = (await listActorUnitIds(scoped, userId))[0];
    if (primaryId != null) {
      const labelMap = await getUnitLabelMap(communityId, [primaryId]);
      hostUnitLabel = labelMap.get(primaryId);
    }
  }

  return (
    <FeatureGate feature="hasVisitorLogging" communityId={communityId}>
      <PageHeader title={isStaff ? 'Visitor Management' : 'My Visitors'} />

      {isStaff ? (
        <VisitorStaffView communityId={communityId} />
      ) : (
        <VisitorResidentView
          communityId={communityId}
          hostUnitLabel={hostUnitLabel}
          allowResidentVisitorRevoke={communitySettings.allowResidentVisitorRevoke === true}
          currentUserId={userId}
        />
      )}
    </FeatureGate>
  );
}

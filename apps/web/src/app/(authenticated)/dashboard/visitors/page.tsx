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
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { isAdminRole } from '@propertypro/shared';
import { getEffectiveFeaturesForPage } from '@/lib/middleware/plan-guard';
import { listActorUnitIds } from '@/lib/units/actor-units';
import { VisitorStaffView } from '@/components/visitors/VisitorStaffView';
import { VisitorResidentView } from '@/components/visitors/VisitorResidentView';

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

  const features = await getEffectiveFeaturesForPage(communityId, membership.communityType);
  if (!features.hasVisitorLogging) {
    redirect('/dashboard?reason=feature-unavailable');
  }

  const isStaff = isAdminRole(membership.role);
  const scoped = createScopedClient(communityId);
  const communityRows = await scoped.selectFrom(communities, {}, eq(communities.id, communityId));
  const community = communityRows[0];
  const communitySettings = (community?.communitySettings as Record<string, unknown> | undefined) ?? {};
  const hostUnitId = isStaff ? undefined : (await listActorUnitIds(scoped, userId))[0];

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-content">
          {isStaff ? 'Visitor Management' : 'My Visitors'}
        </h1>
        <p className="mt-1 text-sm text-content-secondary">
          {isStaff
            ? 'Register visitors, manage check-ins and check-outs.'
            : 'Register guests and view your active visitor passes.'}
        </p>
      </div>

      {isStaff ? (
        <VisitorStaffView communityId={communityId} />
      ) : (
        <VisitorResidentView
          communityId={communityId}
          hostUnitId={hostUnitId}
          allowResidentVisitorRevoke={communitySettings.allowResidentVisitorRevoke === true}
          currentUserId={userId}
        />
      )}
    </>
  );
}

import { getEffectiveFeatures, resolvePlanId } from '@propertypro/shared';
import { OperationsHub } from '@/components/operations/operations-hub';
import { ForbiddenError } from '@/lib/api/errors';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { requirePageAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership } from '@/lib/request/page-community-context';

function canReadResource(
  membership: Awaited<ReturnType<typeof requirePageCommunityMembership>>,
  resource: 'maintenance' | 'work_orders' | 'amenities',
): boolean {
  return checkPermissionV2(
    membership.role,
    membership.communityType,
    resource,
    'read',
    {
      isUnitOwner: membership.isUnitOwner,
      permissions: membership.permissions,
    },
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    from?: string;
    tab?: string;
    status?: string;
    priority?: string;
    unitId?: string;
    q?: string;
    cursor?: string;
    page?: string;
    create?: string;
  }>;
}

export default async function OperationsPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { from, tab, status, priority, unitId, q, cursor, page, create } = await searchParams;
  const communityId = Number(id);
  const userId = await requirePageAuthenticatedUserId();
  const membership = await requirePageCommunityMembership(communityId, userId);
  const features = getEffectiveFeatures(
    membership.communityType,
    resolvePlanId(membership.subscriptionPlan),
  );

  const requestsEnabled = features.hasMaintenanceRequests && canReadResource(membership, 'maintenance');
  const workOrdersEnabled = features.hasWorkOrders && canReadResource(membership, 'work_orders');
  const reservationsEnabled = features.hasAmenities && canReadResource(membership, 'amenities');
  const requestScope = membership.role === 'resident' ? 'mine' : 'community';

  if (!requestsEnabled && !workOrdersEnabled && !reservationsEnabled) {
    throw new ForbiddenError('Operations are not enabled for this community or role');
  }

  const legacyNotice = from === 'maintenance'
    ? 'You were redirected from a legacy maintenance page. Operations now holds requests, work orders, and reservations.'
    : null;

  // membership.timezone is always defined; falls back to 'America/New_York'
  // when the communities row has a null/invalid timezone. See
  // requireCommunityMembership() in lib/api/community-membership.ts.
  const communityTimezone = membership.timezone;

  return (
    <OperationsHub
      communityId={communityId}
      legacyNotice={legacyNotice}
      requestsEnabled={requestsEnabled}
      workOrdersEnabled={workOrdersEnabled}
      reservationsEnabled={reservationsEnabled}
      requestScope={requestScope}
      isAdmin={membership.isAdmin}
      userId={userId}
      communityTimezone={communityTimezone}
      initialTab={tab}
      initialFilters={{ status, priority, unitId, q, cursor, page, create }}
    />
  );
}

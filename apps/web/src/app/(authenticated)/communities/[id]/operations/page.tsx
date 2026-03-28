import { getFeaturesForCommunity } from '@propertypro/shared';
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
  searchParams: Promise<{ from?: string }>;
}

export default async function OperationsPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { from } = await searchParams;
  const communityId = Number(id);
  const userId = await requirePageAuthenticatedUserId();
  const membership = await requirePageCommunityMembership(communityId, userId);
  const features = getFeaturesForCommunity(membership.communityType);

  const requestsEnabled = features.hasMaintenanceRequests && canReadResource(membership, 'maintenance');
  const workOrdersEnabled = features.hasWorkOrders && canReadResource(membership, 'work_orders');
  const reservationsEnabled = features.hasAmenities && canReadResource(membership, 'amenities');

  if (!requestsEnabled && !workOrdersEnabled && !reservationsEnabled) {
    throw new ForbiddenError('Operations are not enabled for this community or role');
  }

  const legacyNotice = from === 'maintenance'
    ? 'You were redirected from a legacy maintenance page. Operations now holds requests, work orders, and reservations.'
    : null;

  return (
    <OperationsHub
      communityId={communityId}
      legacyNotice={legacyNotice}
      requestsEnabled={requestsEnabled}
      workOrdersEnabled={workOrdersEnabled}
      reservationsEnabled={reservationsEnabled}
    />
  );
}

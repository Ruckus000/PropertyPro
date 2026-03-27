import { OperationsHub } from '@/components/operations/operations-hub';
import { requirePageAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership } from '@/lib/request/page-community-context';
import { requireAmenitiesEnabled, requireAmenitiesReadPermission, requireWorkOrdersEnabled, requireWorkOrdersReadPermission } from '@/lib/work-orders/common';

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

  requireWorkOrdersEnabled(membership);
  requireWorkOrdersReadPermission(membership);
  requireAmenitiesEnabled(membership);
  requireAmenitiesReadPermission(membership);

  const legacyNotice = from === 'maintenance'
    ? 'You were redirected from a legacy maintenance page. Operations now holds requests, work orders, and reservations.'
    : null;

  return <OperationsHub communityId={communityId} legacyNotice={legacyNotice} />;
}

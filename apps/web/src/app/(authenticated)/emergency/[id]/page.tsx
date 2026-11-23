// breadcrumbs:exempt — delegated to apps/web/src/components/emergency/emergency-detail-page.tsx
// page-template: delegated to apps/web/src/components/emergency/emergency-detail-page.tsx
/**
 * Emergency Broadcast detail page.
 *
 * Route: /emergency/[id]?communityId=X
 * Auth: any community member with emergency_broadcasts read permission; the
 * API decides what the viewer gets (managers the delivery report, everyone
 * else the message alone, and only for an alert sent to them).
 *
 * A missing or malformed communityId or id is a 404, as on the other detail
 * pages (announcements/[id], documents/[id]).
 */
import { notFound } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { requirePermission } from '@/lib/db/access-control';
import { describeAccess } from '@/lib/access/describe-access';
import { EmergencyDetailPage } from '@/components/emergency/emergency-detail-page';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BroadcastDetailPage({ params, searchParams }: PageProps) {
  const userId = await requireAuthenticatedUserId();

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const communityId = Number(query['communityId']);
  const broadcastId = Number(id);
  if (
    !Number.isInteger(communityId) ||
    communityId <= 0 ||
    !Number.isInteger(broadcastId) ||
    broadcastId <= 0
  ) {
    notFound();
  }

  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'emergency_broadcasts', 'read');

  return (
    <EmergencyDetailPage
      communityId={communityId}
      broadcastId={broadcastId}
      isAdmin={membership.isAdmin}
      timeZone={membership.timezone}
      about={describeAccess(membership.communityType, 'emergency_broadcasts', 'sent-to-them')}
    />
  );
}

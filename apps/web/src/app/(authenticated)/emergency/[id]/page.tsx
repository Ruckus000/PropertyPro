// breadcrumbs:exempt — delegated to apps/web/src/app/(authenticated)/emergency/[id]/broadcast-detail-client.tsx (with the design preview on, the title comes from components/emergency/emergency-detail-page.tsx)
/**
 * Emergency Broadcast detail page.
 *
 * Route: /emergency/[id]?communityId=X
 * Auth: any community member with emergency_broadcasts read permission; the
 * API decides what the viewer gets (managers the delivery report, everyone
 * else the message alone, and only for an alert sent to them).
 *
 * The page body is a client component. With the design preview off this page
 * does exactly what it always did: it renders that component and nothing else,
 * so no membership or permission is resolved here (middleware and the API
 * enforce access, as before).
 */
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { requirePermission } from '@/lib/db/access-control';
import { describeAccess } from '@/lib/access/describe-access';
import { isDesignPreviewOn } from '@/lib/design-preview';
import { EmergencyDetailPage } from '@/components/emergency/emergency-detail-page';
import { BroadcastDetailClient } from './broadcast-detail-client';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BroadcastDetailPage({ params, searchParams }: PageProps) {
  const userId = await requireAuthenticatedUserId();

  // ponytail: two views of this page while the pilot is judged. Trigger: the owner
  // approves or rejects the pilot (plan Task 19), or 30 days after the pilot merges.
  if (!(await isDesignPreviewOn(userId))) return <BroadcastDetailClient />;

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const communityId = Number(query['communityId']);
  const broadcastId = Number(id);
  if (
    !Number.isInteger(communityId) ||
    communityId <= 0 ||
    !Number.isInteger(broadcastId) ||
    broadcastId <= 0
  ) {
    return <BroadcastDetailClient />;
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

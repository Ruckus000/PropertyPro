// breadcrumbs:exempt — delegated to apps/web/src/components/announcements/announcement-detail-page.tsx
// page-template: delegated to apps/web/src/components/announcements/announcement-detail-page.tsx
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import {
  formatAnnouncementAudienceLabel,
  getVisibleAnnouncementById,
} from '@/lib/announcements/read-visibility';
import { checkPermissionV2, requirePermission } from '@/lib/db/access-control';
import { resolvePageCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { describeAccess } from '@/lib/access/describe-access';
import { AnnouncementDetailPage as AnnouncementDetailView } from '@/components/announcements/announcement-detail-page';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AnnouncementDetailPage({ params, searchParams }: PageProps) {
  const [{ id }, resolvedSearchParams, requestHeaders] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);

  const context = resolvePageCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    headers: requestHeaders,
  });

  if (!context.communityId) {
    notFound();
  }
  const communityId = context.communityId;

  const announcementId = Number(id);
  if (!Number.isInteger(announcementId) || announcementId <= 0) {
    notFound();
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'announcements', 'read');
  const announcement = await getVisibleAnnouncementById(
    communityId,
    membership,
    announcementId,
    { includeDeleted: membership.isAdmin },
  );

  if (!announcement) {
    notFound();
  }

  const isAuthor = announcement.publishedBy === userId;
  const canWriteAnnouncements = checkPermissionV2(
    membership.role,
    membership.communityType,
    'announcements',
    'write',
    {
      isUnitOwner: membership.isUnitOwner,
    },
  );
  const canManage = isAuthor || (membership.isAdmin && canWriteAnnouncements);
  // Managers see every audience; a board seat sees that a post is board-only.
  const audienceLabel =
    membership.isAdmin || announcement.audience === 'board_only'
      ? formatAnnouncementAudienceLabel(
          announcement.audience as 'all' | 'owners_only' | 'board_only' | 'tenants_only',
        )
      : undefined;
  const record = {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    isPinned: announcement.isPinned,
    publishedAt: announcement.publishedAt,
    deletedAt: announcement.deletedAt ?? null,
  };

  if (!membership.isAdmin) {
    return (
      <AnnouncementDetailView
        view="resident"
        communityId={communityId}
        announcement={record}
        audienceLabel={audienceLabel}
        canManage={canManage}
      />
    );
  }

  return (
    <AnnouncementDetailView
      view="staff"
      communityId={communityId}
      announcement={record}
      audienceLabel={audienceLabel}
      canManage={canManage}
      about={describeAccess(membership.communityType, 'announcements', 'sent-to-them')}
    />
  );
}

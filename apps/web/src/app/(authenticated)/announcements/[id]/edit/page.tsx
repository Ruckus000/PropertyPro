// breadcrumbs:exempt — delegated to apps/web/src/components/announcements/announcement-form-page.tsx
// page-template: delegated to apps/web/src/components/announcements/announcement-form-page.tsx
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { resolvePageCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { requirePermission } from '@/lib/db/access-control';
import { getVisibleAnnouncementById } from '@/lib/announcements/read-visibility';
import { AnnouncementFormPage } from '@/components/announcements/announcement-form-page';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EditAnnouncementPage({ params, searchParams }: PageProps) {
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
    redirect('/announcements');
  }

  const announcementId = Number(id);
  if (!Number.isInteger(announcementId) || announcementId <= 0) {
    notFound();
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);
  requirePermission(membership, 'announcements', 'write');

  const announcement = await getVisibleAnnouncementById(
    context.communityId,
    membership,
    announcementId,
    { includeArchived: true, includeDeleted: membership.isAdmin },
  );

  if (!announcement) {
    notFound();
  }

  // Deleted announcements don't have an editable state — the detail page is
  // where admins can see the deleted badge and restore the row.
  if (announcement.deletedAt != null) {
    redirect(`/announcements/${announcementId}?communityId=${context.communityId}`);
  }

  return (
    <AnnouncementFormPage
      communityId={context.communityId}
      communityType={membership.communityType}
      announcement={{
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        audience: announcement.audience as 'all' | 'owners_only' | 'board_only' | 'tenants_only',
        isPinned: announcement.isPinned,
        expiresAt: announcement.expiresAt ? new Date(announcement.expiresAt).toISOString() : null,
      }}
    />
  );
}

import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { requirePermission } from '@/lib/db/access-control';
import { getVisibleAnnouncementById } from '@/lib/announcements/read-visibility';
import { AnnouncementAuthoringForm } from '@/components/announcements/announcement-authoring-form';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';

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

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
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
    { includeArchived: true },
  );

  if (!announcement) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Edit Announcement"
        description="Update the announcement residents see in the community feed."
        actions={
          <Button asChild variant="outline">
            <Link href={`/announcements/${announcementId}?communityId=${context.communityId}`}>
              Cancel
            </Link>
          </Button>
        }
      />

      <AnnouncementAuthoringForm
        communityId={context.communityId}
        announcement={{
          id: announcement.id,
          title: announcement.title,
          body: announcement.body,
          audience: announcement.audience as 'all' | 'owners_only' | 'board_only' | 'tenants_only',
          isPinned: announcement.isPinned,
        }}
      />
    </div>
  );
}

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { requirePermission } from '@/lib/db/access-control';
import { AnnouncementAuthoringForm } from '@/components/announcements/announcement-authoring-form';
import { PageHeader } from '@/components/shared/page-header';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewAnnouncementPage({ searchParams }: PageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
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

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);
  requirePermission(membership, 'announcements', 'write');

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="New Announcement"
        description="Share a community update with the right audience."
      />

      <AnnouncementAuthoringForm communityId={context.communityId} />
    </div>
  );
}

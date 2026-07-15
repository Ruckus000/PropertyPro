/**
 * Announcements Page — full community announcements list.
 *
 * Route: /announcements?communityId=X
 * Auth: any community member.
 */
import { headers } from 'next/headers';
import Link from 'next/link';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { checkPermissionV2, requirePermission } from '@/lib/db/access-control';
import { listVisibleAnnouncements } from '@/lib/announcements/read-visibility';
import { AnnouncementListContainer } from '@/components/announcements/announcement-list-container';
import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { Button } from '@/components/ui/button';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AnnouncementsPage({ searchParams }: PageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (!context.communityId) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-content">Announcements</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Add a valid <code>communityId</code> query parameter to view announcements.
        </p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);
  requirePermission(membership, 'announcements', 'read');
  const canWriteAnnouncements = checkPermissionV2(
    membership.role,
    membership.communityType,
    'announcements',
    'write',
    {
      isUnitOwner: membership.isUnitOwner,
    },
  );
  const query =
    typeof resolvedSearchParams['q'] === 'string' ? resolvedSearchParams['q'] : undefined;
  const showDeleted =
    membership.isAdmin && resolvedSearchParams['includeDeleted'] === 'true';
  const { rows: items } = await listVisibleAnnouncements(context.communityId, membership, {
    query,
    includeDeleted: showDeleted,
  });

  const serializedItems = items.map((item) => ({
    id: item.id,
    communityId: item.communityId,
    title: item.title,
    body: item.body,
    audience: item.audience,
    isPinned: item.isPinned,
    publishedAt: item.publishedAt.toISOString(),
    publishedBy: item.publishedBy,
    deletedAt: item.deletedAt ? item.deletedAt.toISOString() : null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={<Breadcrumbs items={[]} currentLabel="Announcements" />}
        title="Announcements"
        description="Community updates, notices, and reminders."
        actions={
          canWriteAnnouncements ? (
            <Button asChild>
              <Link href={`/announcements/new?communityId=${context.communityId}`}>
                New announcement
              </Link>
            </Button>
          ) : undefined
        }
      />

      <AnnouncementListContainer
        items={serializedItems}
        communityId={context.communityId}
        currentUserId={userId}
        isAdmin={membership.isAdmin}
        canWriteAnnouncements={canWriteAnnouncements}
        showDeleted={showDeleted}
      />
    </div>
  );
}

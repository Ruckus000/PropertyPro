/**
 * Announcements Page — full community announcements list.
 *
 * Route: /announcements?communityId=X
 * Auth: any community member.
 */
import { Suspense } from 'react';
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
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { CommunityMembership } from '@/lib/api/community-membership';

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
        <PageHeader title="Announcements" />
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

  return (
    <div className="space-y-6">
      <PageHeader
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

      {/* The list query resolves inside the boundary so the header flushes
          immediately and the rows stream in. */}
      <Suspense fallback={<AnnouncementListSkeleton />}>
        <AnnouncementList
          communityId={context.communityId}
          membership={membership}
          userId={userId}
          query={query}
          showDeleted={showDeleted}
          canWriteAnnouncements={canWriteAnnouncements}
        />
      </Suspense>
    </div>
  );
}

function AnnouncementListSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading announcements">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-28 w-full rounded-md" />
      ))}
    </div>
  );
}

interface AnnouncementListProps {
  communityId: number;
  membership: CommunityMembership;
  userId: string;
  query: string | undefined;
  showDeleted: boolean;
  canWriteAnnouncements: boolean;
}

async function AnnouncementList({
  communityId,
  membership,
  userId,
  query,
  showDeleted,
  canWriteAnnouncements,
}: AnnouncementListProps) {
  const { rows: items } = await listVisibleAnnouncements(communityId, membership, {
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
    <AnnouncementListContainer
      items={serializedItems}
      communityId={communityId}
      currentUserId={userId}
      isAdmin={membership.isAdmin}
      canWriteAnnouncements={canWriteAnnouncements}
      showDeleted={showDeleted}
    />
  );
}

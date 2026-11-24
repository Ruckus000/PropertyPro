// page-template: delegated to apps/web/src/components/announcements/announcements-list-page.tsx
/**
 * Announcements Page — full community announcements list.
 *
 * Route: /announcements?communityId=X[&q=<search>][&includeDeleted=true]
 * Auth: any community member. `includeDeleted` is honoured for admins only.
 */
import { Suspense } from 'react';
import { headers } from 'next/headers';
import { resolvePageCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { checkPermissionV2, requirePermission } from '@/lib/db/access-control';
import { describeAccess } from '@/lib/access/describe-access';
import { listVisibleAnnouncements } from '@/lib/announcements/read-visibility';
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';
import { AnnouncementList } from '@/components/announcements/announcement-list';
import {
  AnnouncementsListPage,
  announcementsListHref,
} from '@/components/announcements/announcements-list-page';
import { PageHeader } from '@/components/shared/page-header';
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

  const context = resolvePageCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    headers: requestHeaders,
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
  // Opening the list completes "Review an announcement" on the onboarding
  // checklist, as the list API does. Fire-and-forget: it never throws, and it
  // is a no-op for anyone whose checklist lacks the key.
  void tryAutoComplete(context.communityId, userId, 'review_announcement');
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

  /* The list query resolves inside the boundary so the header flushes
     immediately and the rows stream in. */
  const records = (
    <Suspense fallback={<AnnouncementListSkeleton />}>
      <AnnouncementRecords
        communityId={context.communityId}
        membership={membership}
        query={query}
        showDeleted={showDeleted}
        canWriteAnnouncements={canWriteAnnouncements}
      />
    </Suspense>
  );

  // Anyone who can post or manage gets the staff page; everyone else the
  // resident one, which has no actions and no panel.
  if (!membership.isAdmin && !canWriteAnnouncements) {
    return (
      <AnnouncementsListPage view="resident" communityId={context.communityId}>
        {records}
      </AnnouncementsListPage>
    );
  }

  return (
    <AnnouncementsListPage
      view="staff"
      communityId={context.communityId}
      canWrite={canWriteAnnouncements}
      deletedToggle={
        membership.isAdmin
          ? {
              showing: showDeleted,
              href: announcementsListHref(context.communityId, {
                query,
                includeDeleted: !showDeleted,
              }),
            }
          : undefined
      }
      about={describeAccess(membership.communityType, 'announcements', 'sent-to-them')}
    >
      {records}
    </AnnouncementsListPage>
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

interface AnnouncementRecordsProps {
  communityId: number;
  membership: CommunityMembership;
  query: string | undefined;
  showDeleted: boolean;
  canWriteAnnouncements: boolean;
}

async function AnnouncementRecords({
  communityId,
  membership,
  query,
  showDeleted,
  canWriteAnnouncements,
}: AnnouncementRecordsProps) {
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
    deletedAt: item.deletedAt ? item.deletedAt.toISOString() : null,
  }));

  return (
    <AnnouncementList
      items={serializedItems}
      communityId={communityId}
      showDeleted={showDeleted}
      canWrite={canWriteAnnouncements}
      // A blank search is no search.
      searchQuery={query?.trim() || undefined}
      clearSearchHref={announcementsListHref(communityId, { includeDeleted: showDeleted })}
    />
  );
}

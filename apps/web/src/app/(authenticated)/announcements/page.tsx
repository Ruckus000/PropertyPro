/**
 * Announcements Page — full community announcements list.
 *
 * Route: /announcements?communityId=X
 * Auth: any community member.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { and, desc, isNull, sql } from '@propertypro/db/filters';
import { createScopedClient, announcements } from '@propertypro/db';
import type { Announcement } from '@propertypro/db';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { AnnouncementList } from '@/components/announcements/announcement-list';

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

  const scoped = createScopedClient(context.communityId);
  const items = await scoped
    .selectFrom<Announcement>(
      announcements,
      {},
      and(isNull(announcements.archivedAt)),
    )
    .orderBy(desc(sql`${announcements.isPinned}`), desc(announcements.publishedAt));

  return <AnnouncementList items={items} isAdmin={membership.isAdmin} />;
}

/**
 * Announcements Page — full community announcements list.
 *
 * Route: /announcements?communityId=X
 * Auth: any community member.
 */
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { requirePermission } from '@/lib/db/access-control';
import { listVisibleAnnouncements } from '@/lib/announcements/read-visibility';
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
  requirePermission(membership, 'announcements', 'read');
  const query =
    typeof resolvedSearchParams['q'] === 'string' ? resolvedSearchParams['q'] : undefined;
  const { rows: items } = await listVisibleAnnouncements(context.communityId, membership, {
    query,
  });

  return <AnnouncementList items={items} isAdmin={membership.isAdmin} />;
}

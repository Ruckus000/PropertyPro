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
import { AnnouncementList } from '@/components/announcements/announcement-list';
import { PageHeader } from '@/components/shared/page-header';
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
      permissions: membership.permissions,
    },
  );
  const query =
    typeof resolvedSearchParams['q'] === 'string' ? resolvedSearchParams['q'] : undefined;
  const { rows: items } = await listVisibleAnnouncements(context.communityId, membership, {
    query,
  });

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

      <AnnouncementList
        items={items}
        communityId={context.communityId}
        canWriteAnnouncements={canWriteAnnouncements}
      />
    </div>
  );
}

import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Pin } from 'lucide-react';
import DOMPurify from 'isomorphic-dompurify';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import {
  formatAnnouncementAudienceLabel,
  getVisibleAnnouncementById,
} from '@/lib/announcements/read-visibility';
import { checkPermissionV2, requirePermission } from '@/lib/db/access-control';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { AnnouncementDetailActions } from '@/components/announcements/announcement-detail-actions';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function formatDate(value: Date): string {
  return value.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function AnnouncementDetailPage({ params, searchParams }: PageProps) {
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
  const isDeleted = announcement.deletedAt != null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={announcement.title}
        actions={
          canManage ? (
            <AnnouncementDetailActions
              communityId={communityId}
              announcementId={announcement.id}
              isDeleted={isDeleted}
              canEdit={!isDeleted}
            />
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {isDeleted && <StatusBadge status="closed" label="Deleted" subtle />}
          {announcement.isPinned && (
            <span className="inline-flex items-center gap-1 rounded-full bg-interactive-subtle px-2.5 py-1 text-xs font-semibold text-interactive">
              <Pin size={12} aria-hidden="true" />
              Pinned
            </span>
          )}
          {membership.isAdmin && (
            <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-content-secondary">
              {formatAnnouncementAudienceLabel(
                announcement.audience as
                  | 'all'
                  | 'owners_only'
                  | 'board_only'
                  | 'tenants_only',
              )}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-content-tertiary">
          Published {formatDate(announcement.publishedAt)}
        </p>
      </PageHeader>

      <article
        className={`rounded-2xl border border-edge bg-surface-card p-6 shadow-sm ${
          isDeleted ? 'opacity-60' : ''
        }`}
      >
        <div
          className="prose prose-neutral max-w-none text-content-secondary"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(announcement.body) }}
        />
      </article>
    </div>
  );
}

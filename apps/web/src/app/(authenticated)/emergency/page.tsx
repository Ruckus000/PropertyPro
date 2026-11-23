// page-template: delegated to apps/web/src/components/emergency/emergency-list-page.tsx
/**
 * Emergency Broadcasts list page.
 *
 * Route: /emergency?communityId=X
 * Auth: `emergency_broadcasts:read` (owners and managers; NOT tenants — the
 * same gate the list API applies), admin for write. Managers see every
 * broadcast with delivery counts; owners see only the alerts sent to them.
 */
import { headers } from 'next/headers';
import { createScopedClient, emergencyBroadcasts } from '@propertypro/db';
import { resolvePageCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { checkPermissionV2, requirePermission } from '@/lib/db/access-control';
import { listBroadcastsForRecipient } from '@/lib/services/emergency-broadcast-service';
import { PageHeader } from '@/components/shared/page-header';
import { EmergencyListPage } from '@/components/emergency/emergency-list-page';
import { describeAccess } from '@/lib/access/describe-access';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EmergencyPage({ searchParams }: PageProps) {
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
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Emergency Alerts" />
        <p className="mt-2 text-sm text-content-secondary">
          Add a valid <code>communityId</code> query parameter.
        </p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);
  // The page used to read every broadcast for ANY member, while
  // GET /api/v1/emergency-broadcasts refuses tenants (matrix: read=false).
  requirePermission(membership, 'emergency_broadcasts', 'read');

  const canWrite = checkPermissionV2(
    membership.role,
    membership.communityType,
    'emergency_broadcasts',
    'write',
    { isUnitOwner: membership.isUnitOwner },
  );

  // Non-managers (owners, board seats included) see only the alerts sent to
  // them, dated when sent — never drafts, canceled alerts or delivery counts.
  if (!membership.isAdmin) {
    const received = await listBroadcastsForRecipient(context.communityId, userId);
    return (
      <EmergencyListPage
        view="recipient"
        broadcasts={received.map((b) => ({
          id: b.id,
          title: b.title,
          severity: b.severity,
          initiatedAt: b.completedAt.toISOString(),
          completedAt: b.completedAt.toISOString(),
          canceledAt: null,
        }))}
        communityId={context.communityId}
        timeZone={membership.timezone}
      />
    );
  }

  const scoped = createScopedClient(context.communityId);
  const rows = await scoped.query(emergencyBroadcasts);

  const sorted = [...rows].sort((a, b) => {
    const aDate = a['initiatedAt'] instanceof Date ? a['initiatedAt'].getTime() : 0;
    const bDate = b['initiatedAt'] instanceof Date ? b['initiatedAt'].getTime() : 0;
    return bDate - aDate;
  });

  const broadcasts = sorted.map((r) => ({
    id: Number(r['id']),
    title: r['title'] as string,
    severity: r['severity'] as string,
    recipientCount: Number(r['recipientCount']),
    sentCount: Number(r['sentCount']),
    deliveredCount: Number(r['deliveredCount']),
    failedCount: Number(r['failedCount']),
    initiatedAt: (r['initiatedAt'] as Date).toISOString(),
    completedAt: r['completedAt'] instanceof Date ? (r['completedAt'] as Date).toISOString() : null,
    canceledAt: r['canceledAt'] instanceof Date ? (r['canceledAt'] as Date).toISOString() : null,
    // "Send later" alerts: when it goes, and what the scheduled-send job made of it.
    scheduledFor: r['scheduledFor'] instanceof Date ? (r['scheduledFor'] as Date).toISOString() : null,
    sendClaimedAt:
      r['sendClaimedAt'] instanceof Date ? (r['sendClaimedAt'] as Date).toISOString() : null,
    sendOutcome: typeof r['sendOutcome'] === 'string' ? r['sendOutcome'] : null,
    sendOutcomeReason: typeof r['sendOutcomeReason'] === 'string' ? r['sendOutcomeReason'] : null,
  }));

  return (
    <EmergencyListPage
      view="manager"
      broadcasts={broadcasts}
      canWrite={canWrite}
      communityId={context.communityId}
      timeZone={membership.timezone}
      about={describeAccess(membership.communityType, 'emergency_broadcasts', 'sent-to-them')}
    />
  );
}

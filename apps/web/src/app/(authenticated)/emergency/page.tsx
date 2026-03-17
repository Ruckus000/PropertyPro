/**
 * Emergency Broadcasts list page.
 *
 * Route: /emergency?communityId=X
 * Auth: any community member (read), admin for write.
 */
import Link from 'next/link';
import { headers } from 'next/headers';
import { createScopedClient, emergencyBroadcasts } from '@propertypro/db';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { checkPermission } from '@propertypro/shared';
import { BroadcastHistoryTable } from '@/components/emergency/BroadcastHistoryTable';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EmergencyPage({ searchParams }: PageProps) {
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
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold text-gray-900">Emergency Alerts</h1>
        <p className="mt-2 text-sm text-gray-600">
          Add a valid <code>communityId</code> query parameter.
        </p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);

  const canWrite = checkPermission(
    membership.role,
    membership.communityType,
    'emergency_broadcasts',
    'write',
    { isUnitOwner: membership.isUnitOwner, permissions: membership.permissions },
  );

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
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Emergency Alerts</h1>
        {canWrite && (
          <Link
            href={`/emergency/new?communityId=${context.communityId}`}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Send Emergency Alert
          </Link>
        )}
      </div>

      <BroadcastHistoryTable
        broadcasts={broadcasts}
        communityId={context.communityId}
      />
    </div>
  );
}

/**
 * New Emergency Broadcast composer page.
 *
 * Route: /emergency/new?communityId=X
 * Auth: admin with emergency_broadcasts write permission.
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { communities, createScopedClient } from '@propertypro/db';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { requirePermission } from '@/lib/db/access-control';
import { BroadcastComposer } from '@/components/emergency/BroadcastComposer';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewBroadcastPage({ searchParams }: PageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (!context.communityId) {
    redirect('/emergency');
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);
  requirePermission(membership, 'emergency_broadcasts', 'write');

  // Load community name for template placeholders
  const scoped = createScopedClient(context.communityId);
  const communityRows = await scoped.query(communities);
  const community = communityRows.find((r) => r['id'] === context.communityId);
  const communityName = typeof community?.['name'] === 'string' ? community['name'] : 'PropertyPro';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold text-content">Send Emergency Alert</h1>
      <BroadcastComposer
        communityId={context.communityId}
        communityName={communityName}
      />
    </div>
  );
}

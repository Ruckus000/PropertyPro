import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { communities, createScopedClient } from '@propertypro/db';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { TransparencyToggle } from '@/components/transparency/transparency-toggle';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { requirePermission } from '@/lib/db/access-control';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TransparencySettingsPage({ searchParams }: Props) {
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
      <>
        <h1 className="mb-2 text-xl font-semibold">Transparency Settings</h1>
        <p className="text-sm text-content-secondary">Provide a communityId to edit transparency settings.</p>
      </>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);

  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasTransparencyPage) {
    notFound();
  }

  requirePermission(membership, 'settings', 'read');

  const scoped = createScopedClient(context.communityId);
  const rows = await scoped.query(communities);
  const community = rows.find((row) => row['id'] === context.communityId);
  const slug = community?.['slug'];
  if (!community || typeof slug !== 'string') {
    notFound();
  }

  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold text-content">Transparency Settings</h1>
      <p className="text-sm text-content-secondary">
        Enable or disable your public compliance transparency page.
      </p>
      <TransparencyToggle communityId={context.communityId} subdomain={slug} />
    </div>
  );
}

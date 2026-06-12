import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership } from '@/lib/request/page-community-context';
import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { RolesAccessClient } from '@/components/settings/RolesAccessClient';

/**
 * Settings → Roles & Access (role-v3 Phase 2c).
 *
 * Root-only screen where the community's root manager promotes/removes
 * property managers, sets board designations, and transfers the root role.
 * Gated on `membership.role === 'root_manager'`; everyone else is bounced to
 * the dashboard. The interactive surface lives in `<RolesAccessClient>`; this
 * server page owns auth + chrome.
 */
export default async function RolesAccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (!context.communityId) {
    redirect('/select-community');
  }

  const userId = await requirePageAuthenticatedUserId();
  const membership = await requirePageCommunityMembership(
    context.communityId,
    userId,
  );

  // Root-only screen — only the root manager can manage roles.
  if (membership.role !== 'root_manager') {
    redirect(`/dashboard?communityId=${context.communityId}`);
  }

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Breadcrumbs
            items={[{ label: 'Settings', href: '/settings' }]}
            currentLabel="Roles & Access"
          />
        }
        title="Roles & Access"
        description="Promote or remove property managers, set board designations, and transfer the root manager role."
      />

      <RolesAccessClient
        communityId={context.communityId}
        communityType={membership.communityType}
        currentRootUserId={userId}
        communityName={membership.communityName}
      />
    </div>
  );
}

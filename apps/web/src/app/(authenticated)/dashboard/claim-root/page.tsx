import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { ClaimRootClient } from '@/components/dashboard/ClaimRootClient';

/**
 * Dashboard → Claim root manager (role-v3 Phase 2b).
 *
 * Admin-tier members of a rootless community claim the root manager role here
 * (per-community or all at once). The same page renders a dispute confirm card
 * when reached via `?dispute=<communityId>` (the `RootClaimedEmail` link
 * target) — closing the dispute loop. The interactive list + dispute card live
 * in `<ClaimRootClient>`; this server page owns auth + chrome.
 */
export default async function ClaimRootPage({
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

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);

  // Claiming root is an admin-tier action; residents have nothing to claim.
  if (!membership.isAdmin) {
    redirect(`/dashboard?communityId=${context.communityId}`);
  }

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Breadcrumbs
            items={[
              { label: 'Dashboard', href: `/dashboard?communityId=${context.communityId}` },
            ]}
            currentLabel="Claim root manager"
          />
        }
        title="Claim root manager"
        description="Take ownership of role management for communities that don’t have a root manager yet."
      />

      <ClaimRootClient />
    </div>
  );
}

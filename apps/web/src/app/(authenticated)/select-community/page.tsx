// page-header:exempt — orientation page rendered without the rail or breadcrumb trail (shell-breadcrumbs HIDE_PATHS); its title is the only wayfinding on screen.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { PageBody } from '@/components/shared/page-body';
import { Button } from '@/components/ui/button';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { UNKNOWN_SUBDOMAIN_REASON } from '@/lib/middleware/unknown-subdomain-reason';
import { listCommunitiesForUser } from '@/lib/api/user-communities';
import { CommunityPickerGrid } from '@/components/community-picker/community-picker-grid';
import { resolveSafeReturnTo, applyCommunityIdToReturnTo } from '@/lib/utils/return-to';

export const metadata = {
  title: 'Select Community | PropertyPro',
};

interface SelectCommunityPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Community picker page.
 *
 * Tenants belong to exactly one community and are always auto-redirected —
 * they never see the picker. Users with management roles (owner, board member,
 * CAM, PM, etc.) who belong to multiple communities see the picker grid.
 *
 * If the URL carries a `?returnTo=…` (set by middleware when redirecting an
 * authenticated user with no tenant context), the auto-redirect honors it
 * and the picker cards forward it. Unsafe values are silently dropped.
 */
export default async function SelectCommunityPage({ searchParams }: SelectCommunityPageProps) {
  const userId = await requireAuthenticatedUserId();
  const params = await searchParams;
  const rawReturnTo = typeof params.returnTo === 'string' ? params.returnTo : null;
  const safeReturnTo = resolveSafeReturnTo(rawReturnTo);
  const rawReason = params.reason;
  const unknownSubdomain =
    typeof rawReason === 'string'
      ? rawReason === UNKNOWN_SUBDOMAIN_REASON
      : Array.isArray(rawReason) && rawReason.includes(UNKNOWN_SUBDOMAIN_REASON);

  const communities = await listCommunitiesForUser(userId);

  // Single community — auto-redirect regardless of role.
  if (communities.length === 1) {
    redirect(applyCommunityIdToReturnTo(safeReturnTo ?? '/dashboard', communities[0]!.communityId));
  }

  // Tenants belong to exactly one community. If a tenant somehow has
  // multiple memberships (data anomaly), route them to the first one
  // rather than showing the picker.
  const allTenant = communities.length > 0 && communities.every((c) => c.role === 'resident' && !c.isUnitOwner);
  if (allTenant) {
    redirect(applyCommunityIdToReturnTo(safeReturnTo ?? '/dashboard', communities[0]!.communityId));
  }

  return (
    <PageBody width="content">
      {unknownSubdomain && (
        <div className="mb-6">
          <AlertBanner
            status="warning"
            title="Community link not recognized"
            description="That web address does not match an active community. Pick a community below, or confirm the link your board or manager sent you."
          />
        </div>
      )}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-content dark:text-gray-100">Select a Community</h1>
        <p className="mt-2 text-sm text-content-secondary dark:text-gray-300">
          Choose which community you would like to access.
        </p>
      </div>

      {communities.length === 0 ? (
        /* A user reaches this branch with NO live community — either they have
           never been added to one, or every membership they had points at a
           soft-deleted community. Both look identical from here, and both used
           to dead-end: the old copy said "contact your manager" and offered
           nothing to click, which reads as a broken login. The join path is the
           one self-service route out, so it has to be an action, not advice.
           /account/join-community is in middleware's TENANT_OPTIONAL_PATHS so
           this button cannot land back on this page — on ANY host. Listing it
           in the missing-tenant bounce alone was not enough: a subdomain still
           stamped a tenant, and the authenticated layout bounced it right back.

           The dark: variants are deliberate, not leftovers. The token layer is
           single-theme light, so without them this box renders as a light
           island on a dark page. They are frozen in
           scripts/design-token-baseline.json — see CLAUDE.md's design-token
           section before removing them. */
        <div className="rounded-md border border-dashed border-edge-strong bg-surface-hover dark:border-gray-600 dark:bg-gray-800">
          <EmptyState
            icon="building"
            title="Let's get you connected"
            description="You are not a member of any community yet. Search for yours to request access, or ask your community manager or board to add you."
            action={
              <Button asChild>
                <Link href="/account/join-community">Join a community</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <CommunityPickerGrid communities={communities} returnTo={safeReturnTo} />
      )}
    </PageBody>
  );
}

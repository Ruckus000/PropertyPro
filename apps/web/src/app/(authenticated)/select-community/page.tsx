import { redirect } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
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
    <main id="main-content" className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-content dark:text-gray-100">Select a Community</h1>
        <p className="mt-2 text-sm text-content-secondary dark:text-gray-300">
          Choose which community you would like to access.
        </p>
      </div>

      {communities.length === 0 ? (
        <div className="rounded-md border border-dashed border-edge-strong bg-surface-hover px-8 py-16 text-center dark:border-gray-600 dark:bg-gray-800">
          <p className="text-sm font-medium text-content-secondary dark:text-gray-300">
            You are not a member of any community yet.
          </p>
          <p className="mt-1 text-sm text-content-disabled dark:text-gray-500">
            Contact your community manager or board to request access.
          </p>
        </div>
      ) : (
        <CommunityPickerGrid communities={communities} returnTo={safeReturnTo} />
      )}
    </main>
  );
}

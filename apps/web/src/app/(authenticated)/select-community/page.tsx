import { redirect } from 'next/navigation';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { listCommunitiesForUser } from '@/lib/api/user-communities';
import { CommunityPickerGrid } from '@/components/community-picker/community-picker-grid';

export const metadata = {
  title: 'Select Community | PropertyPro',
};

/**
 * Community picker page.
 *
 * Tenants belong to exactly one community and are always auto-redirected —
 * they never see the picker. Users with management roles (owner, board member,
 * CAM, PM, etc.) who belong to multiple communities see the picker grid.
 */
export default async function SelectCommunityPage() {
  const userId = await requireAuthenticatedUserId();
  const communities = await listCommunitiesForUser(userId);

  // Single community — auto-redirect regardless of role.
  if (communities.length === 1) {
    redirect(`/dashboard?communityId=${communities[0]!.communityId}`);
  }

  // Tenants belong to exactly one community. If a tenant somehow has
  // multiple memberships (data anomaly), route them to the first one
  // rather than showing the picker.
  const allTenant = communities.length > 0 && communities.every((c) => c.role === 'tenant');
  if (allTenant) {
    redirect(`/dashboard?communityId=${communities[0]!.communityId}`);
  }

  return (
    <main id="main-content" className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Select a Community</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Choose which community you would like to access.
        </p>
      </div>

      {communities.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-8 py-16 text-center dark:border-gray-600 dark:bg-gray-800">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
            You are not a member of any community yet.
          </p>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Contact your community manager or board to request access.
          </p>
        </div>
      ) : (
        <CommunityPickerGrid communities={communities} />
      )}
    </main>
  );
}

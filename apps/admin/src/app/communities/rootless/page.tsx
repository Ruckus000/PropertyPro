/**
 * Rootless Communities page — non-deleted communities with NO root_manager.
 *
 * Until the claim-root flow (role-v3 Phase 2b) runs, every backfilled
 * community is rootless; this report is how platform admins track convergence.
 */
import { AdminLayout } from '@/components/AdminLayout';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
// AUTHZ: platform-admin report — cross-community read, gated by the requireAdminPageSession() platform-admin check at the top of this page.
import { findRootlessCommunities } from '@propertypro/db/unsafe';

export const dynamic = 'force-dynamic';

export default async function RootlessCommunitiesPage() {
  await requireAdminPageSession();
  const communities = await findRootlessCommunities();

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Rootless Communities</h1>
          <p className="mt-1 text-sm text-gray-500">
            {communities.length === 0
              ? 'Every community has a root manager.'
              : `${communities.length} ${communities.length === 1 ? 'community has' : 'communities have'} no root manager.`}
          </p>
        </div>

        {communities.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            No rootless communities.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Slug</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {communities.map((community) => (
                  <tr key={community.id}>
                    <td className="px-4 py-3 text-gray-900">{community.name}</td>
                    <td className="px-4 py-3 font-mono text-gray-600">{community.slug}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

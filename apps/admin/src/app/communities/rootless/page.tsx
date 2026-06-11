/**
 * Rootless Communities page — non-deleted communities with NO root_manager,
 * plus the open root-claim disputes queue (role-v3 Phase 2b).
 *
 * Until the claim-root flow runs, every backfilled community is rootless; this
 * report is how platform admins track convergence. Open disputes surface here
 * with an inline reassign-root control.
 */
import { AdminLayout } from '@/components/AdminLayout';
import { ReassignRootControl } from '@/components/communities/ReassignRootControl';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
// AUTHZ: platform-admin report — cross-community read, gated by the requireAdminPageSession() platform-admin check at the top of this page.
import { findRootlessCommunities } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db/supabase/admin';

export const dynamic = 'force-dynamic';

interface OpenDisputeRow {
  id: number;
  community_id: number;
  claimed_user_id: string;
  disputed_by_user_id: string;
  created_at: string;
  communityName: string;
}

async function fetchOpenDisputes(): Promise<OpenDisputeRow[]> {
  const db = createAdminClient();
  const { data: disputes } = await db
    .from('root_claim_disputes')
    .select('id, community_id, claimed_user_id, disputed_by_user_id, created_at')
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  const rows = (disputes ?? []) as Array<Omit<OpenDisputeRow, 'communityName'>>;
  if (rows.length === 0) return [];

  const communityIds = Array.from(new Set(rows.map((r) => r.community_id)));
  const { data: communities } = await db
    .from('communities')
    .select('id, name')
    .in('id', communityIds);
  const nameById = new Map(
    ((communities ?? []) as Array<{ id: number; name: string }>).map((c) => [c.id, c.name]),
  );

  return rows.map((r) => ({ ...r, communityName: nameById.get(r.community_id) ?? `#${r.community_id}` }));
}

export default async function RootlessCommunitiesPage() {
  await requireAdminPageSession();
  const [communities, openDisputes] = await Promise.all([
    findRootlessCommunities(),
    fetchOpenDisputes(),
  ]);

  return (
    <AdminLayout>
      <div className="space-y-10 p-6">
        <section>
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-gray-900">Open Root-Claim Disputes</h1>
            <p className="mt-1 text-sm text-gray-500">
              {openDisputes.length === 0
                ? 'No open disputes.'
                : `${openDisputes.length} open ${openDisputes.length === 1 ? 'dispute' : 'disputes'}. Reassign root to an existing property manager to resolve.`}
            </p>
          </div>

          {openDisputes.length === 0 ? (
            <div className="rounded-md border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              No open root-claim disputes.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Community</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Claimed by</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Disputed by</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Reassign root</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {openDisputes.map((dispute) => (
                    <tr key={dispute.id}>
                      <td className="px-4 py-3 text-gray-900">{dispute.communityName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{dispute.claimed_user_id}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{dispute.disputed_by_user_id}</td>
                      <td className="px-4 py-3">
                        <ReassignRootControl communityId={dispute.community_id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Rootless Communities</h2>
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
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Reassign root</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {communities.map((community) => (
                    <tr key={community.id}>
                      <td className="px-4 py-3 text-gray-900">{community.name}</td>
                      <td className="px-4 py-3 font-mono text-gray-600">{community.slug}</td>
                      <td className="px-4 py-3">
                        <ReassignRootControl communityId={community.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}

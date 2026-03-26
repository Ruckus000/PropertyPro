/**
 * Deletion Requests page — shows all account/community deletion requests.
 */
import { AdminLayout } from '@/components/AdminLayout';
import { DeletionRequestsDashboard } from '@/components/deletion-requests/DeletionRequestsDashboard';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getDeletionRequestsData } from '@/lib/server/deletion-requests';

export const dynamic = 'force-dynamic';

export default async function DeletionRequestsPage() {
  await requireAdminPageSession();
  const { requests } = await getDeletionRequestsData();
  const coolingCount = requests.filter((request) => request.status === 'cooling').length;

  return (
    <AdminLayout coolingCount={coolingCount}>
      <div className="p-6">
        <h1 className="mb-6 text-xl font-semibold text-gray-900">Deletion Requests</h1>
        <DeletionRequestsDashboard
          initialRequests={requests}
          initialStatusFilter="all"
          initialTypeFilter="all"
        />
      </div>
    </AdminLayout>
  );
}

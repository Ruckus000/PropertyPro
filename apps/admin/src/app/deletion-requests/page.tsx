/**
 * Deletion Requests page — shows all account/community deletion requests.
 */
import { AdminLayout } from '@/components/AdminLayout';
import { DeletionRequestsDashboard } from '@/components/deletion-requests/DeletionRequestsDashboard';

export const dynamic = 'force-dynamic';

export default function DeletionRequestsPage() {
  return (
    <AdminLayout>
      <div className="p-6">
        <h1 className="mb-6 text-xl font-semibold text-gray-900">Deletion Requests</h1>
        <DeletionRequestsDashboard />
      </div>
    </AdminLayout>
  );
}

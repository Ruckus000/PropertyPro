/**
 * Deletion Requests page — shows all account/community deletion requests.
 */
import { PageBody } from '@propertypro/ui';
import { DeletionRequestsDashboard } from '@/components/deletion-requests/DeletionRequestsDashboard';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getDeletionRequestsData } from '@/lib/server/deletion-requests';

export const dynamic = 'force-dynamic';

export default async function DeletionRequestsPage() {
  await requireAdminPageSession();
  const { requests } = await getDeletionRequestsData();

  return (
    <PageBody>
      <AdminPageHeader title="Deletion Requests" />
      <DeletionRequestsDashboard
        initialRequests={requests}
        initialStatusFilter="all"
        initialTypeFilter="all"
      />
    </PageBody>
  );
}

/**
 * Deletion Requests page — shows all account/community deletion requests.
 */
import { PageBody } from '@propertypro/ui';
import { DeletionRequestsDashboard } from '@/components/deletion-requests/DeletionRequestsDashboard';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getDeletionRequestsData } from '@/lib/server/deletion-requests';

export const dynamic = 'force-dynamic';

interface DeletionRequestsPageProps {
  /** `?q=` — the inbox privacy strip links here to check whether a
   * participant already has a deletion request open. */
  searchParams: Promise<{ q?: string }>;
}

export default async function DeletionRequestsPage({ searchParams }: DeletionRequestsPageProps) {
  await requireAdminPageSession();
  const [{ requests }, params] = await Promise.all([getDeletionRequestsData(), searchParams]);

  return (
    <PageBody>
      <AdminPageHeader title="Deletion Requests" />
      <DeletionRequestsDashboard
        initialRequests={requests}
        initialStatusFilter="all"
        initialTypeFilter="all"
        initialEmailFilter={params.q}
      />
    </PageBody>
  );
}

/**
 * Demo List Page — shows all demo instances with age badges and actions.
 */
import { AdminLayout } from '@/components/AdminLayout';
import { DemoListClient } from '@/components/demo/DemoListClient';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getCoolingDeletionRequestCount } from '@/lib/server/deletion-requests';
import { getDemoListData } from '@/lib/server/demos';

export default async function DemoListPage() {
  await requireAdminPageSession();
  const [demos, coolingCount] = await Promise.all([
    getDemoListData(),
    getCoolingDeletionRequestCount(),
  ]);

  return (
    <AdminLayout coolingCount={coolingCount}>
      <DemoListClient initialDemos={demos} />
    </AdminLayout>
  );
}

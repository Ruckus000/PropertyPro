/**
 * Demo List Page — shows all demo instances with age badges and actions.
 */
import { AdminLayout } from '@/components/AdminLayout';
import { DemoListClient } from '@/components/demo/DemoListClient';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getDemoListData } from '@/lib/server/demos';

export default async function DemoListPage() {
  await requireAdminPageSession();
  const demos = await getDemoListData();

  return (
    <AdminLayout>
      <DemoListClient initialDemos={demos} />
    </AdminLayout>
  );
}

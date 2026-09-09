/**
 * Platform Dashboard — landing page for the admin console.
 *
 * Shows platform-wide metrics: community count, member count,
 * billing summary, and compliance health.
 */
import { PageBody } from '@propertypro/ui';
import { PlatformDashboard } from '@/components/dashboard/PlatformDashboard';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getPlatformDashboardStats } from '@/lib/server/dashboard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  await requireAdminPageSession();
  const stats = await getPlatformDashboardStats();

  return (
    <PageBody>
      <AdminPageHeader title="Dashboard" />
      <PlatformDashboard stats={stats} />
    </PageBody>
  );
}

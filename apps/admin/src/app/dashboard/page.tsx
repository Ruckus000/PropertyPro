/**
 * Platform Dashboard — landing page for the admin console.
 *
 * Shows platform-wide metrics: community count, member count,
 * billing summary, and compliance health.
 */
import { AdminLayout } from '@/components/AdminLayout';
import { PlatformDashboard } from '@/components/dashboard/PlatformDashboard';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getPlatformDashboardStats } from '@/lib/server/dashboard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  await requireAdminPageSession();
  const stats = await getPlatformDashboardStats();

  return (
    <AdminLayout>
      <div className="p-6">
        <h1 className="mb-6 text-xl font-semibold text-gray-900">Dashboard</h1>
        <PlatformDashboard stats={stats} />
      </div>
    </AdminLayout>
  );
}

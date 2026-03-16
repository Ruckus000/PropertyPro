/**
 * Platform Dashboard — landing page for the admin console.
 *
 * Shows platform-wide metrics: community count, member count,
 * billing summary, and compliance health.
 */
import { AdminLayout } from '@/components/AdminLayout';
import { PlatformDashboard } from '@/components/dashboard/PlatformDashboard';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  return (
    <AdminLayout>
      <div className="p-6">
        <h1 className="mb-6 text-xl font-semibold text-gray-900">Dashboard</h1>
        <PlatformDashboard />
      </div>
    </AdminLayout>
  );
}

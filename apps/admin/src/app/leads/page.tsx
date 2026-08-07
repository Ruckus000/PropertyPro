/**
 * Leads page — inbound marketing leads from the public compliance checker.
 *
 * See docs/gtm/03-LAUNCH-READINESS.md item B1.
 */
import { AdminLayout } from '@/components/AdminLayout';
import { LeadsDashboard } from '@/components/leads/LeadsDashboard';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getLeadsData } from '@/lib/server/leads';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  await requireAdminPageSession();
  const { leads, stats } = await getLeadsData();

  return (
    <AdminLayout>
      <div className="p-6">
        <h1 className="mb-1 text-xl font-semibold text-content">Leads</h1>
        <p className="mb-6 text-sm text-content-tertiary">
          Inbound from the §718 compliance checker on the marketing site.
        </p>
        <LeadsDashboard
          initialLeads={leads}
          initialStats={stats}
          initialStatusFilter="all"
        />
      </div>
    </AdminLayout>
  );
}

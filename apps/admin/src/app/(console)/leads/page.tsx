/**
 * Leads page — inbound marketing leads from the public compliance checker.
 *
 * See docs/gtm/03-LAUNCH-READINESS.md item B1.
 */
import { PageBody } from '@propertypro/ui';
import { LeadsDashboard } from '@/components/leads/LeadsDashboard';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getLeadsData } from '@/lib/server/leads';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  await requireAdminPageSession();
  const { leads, stats } = await getLeadsData();

  return (
    <PageBody>
      <AdminPageHeader
        title="Leads"
        description="Inbound from the §718 compliance checker on the marketing site."
      />
      <LeadsDashboard initialLeads={leads} initialStats={stats} initialStatusFilter="all" />
    </PageBody>
  );
}

/**
 * P1-5: Client Portfolio view.
 *
 * Lists all non-demo communities with search, filter, and sort controls.
 * Also shows a "Stale Demos" card when demos are older than 10 days.
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { AdminLayout } from '@/components/AdminLayout';
import { ClientPortfolio } from '@/components/clients/ClientPortfolio';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const db = createAdminClient();

  // Fetch all non-demo, non-deleted communities
  const { data: communities } = await db
    .from('communities')
    .select('id, name, slug, community_type, city, state, subscription_status, created_at')
    .eq('is_demo', false)
    .is('deleted_at', null)
    .order('name');

  // Fetch stale demos (created > 10 days ago).
  // NOTE: The `demo_instances` table is created in Phase 2. Before that migration
  // runs, the query will resolve with { data: null, error } — the `?? []` fallback
  // below keeps the page functional until the table exists.
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const staleDemosResult = await db
    .from('demo_instances')
    .select('id, prospect_name, template_type, created_at')
    .lt('created_at', tenDaysAgo)
    .order('created_at');
  const staleDemos = staleDemosResult.error ? [] : (staleDemosResult.data ?? []);

  return (
    <AdminLayout>
      <ClientPortfolio
        communities={communities ?? []}
        staleDemos={staleDemos}
      />
    </AdminLayout>
  );
}

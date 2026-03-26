/**
 * Client Portfolio view.
 *
 * Lists all non-demo communities with search, filter, sort, and compliance filtering.
 * Also shows a "Stale Demos" card when demos are older than 10 days.
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { AdminLayout } from '@/components/AdminLayout';
import { ClientPortfolio } from '@/components/clients/ClientPortfolio';
import { getCoolingDeletionRequestCount } from '@/lib/server/deletion-requests';

export const dynamic = 'force-dynamic';

const COMPLIANCE_PAGE_SIZE = 1000;

/** Fetch all compliance rows for given community IDs, paginating past Supabase default limit. */
async function fetchAllComplianceRows(
  db: ReturnType<typeof createAdminClient>,
  communityIds: number[],
) {
  if (communityIds.length === 0) return [];
  const allRows: { community_id: number; document_id: number | null; is_applicable: boolean }[] = [];
  let from = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await db
      .from('compliance_checklist_items')
      .select('community_id, document_id, is_applicable')
      .is('deleted_at', null)
      .in('community_id', communityIds)
      .range(from, from + COMPLIANCE_PAGE_SIZE - 1);

    const rows = (data ?? []) as typeof allRows;
    allRows.push(...rows);
    if (rows.length < COMPLIANCE_PAGE_SIZE) break;
    from += COMPLIANCE_PAGE_SIZE;
  }
  return allRows;
}

export default async function ClientsPage() {
  const db = createAdminClient();

  // Fetch communities and stale demos in parallel
  const [communitiesResult, staleDemosResult, coolingCount] = await Promise.all([
    db.from('communities')
      .select('id, name, slug, community_type, city, state, subscription_status, created_at')
      .eq('is_demo', false)
      .is('deleted_at', null)
      .order('name'),
    db.from('demo_instances')
      .select('id, prospect_name, template_type, created_at')
      .lt('created_at', new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at'),
    getCoolingDeletionRequestCount(),
  ]);

  interface CommunityRow {
    id: number;
    name: string;
    slug: string;
    community_type: 'condo_718' | 'hoa_720' | 'apartment';
    city: string | null;
    state: string | null;
    subscription_status: string | null;
    created_at: string;
  }

  const communities = (communitiesResult.data ?? []) as unknown as CommunityRow[];
  const staleDemos = staleDemosResult.error ? [] : (staleDemosResult.data ?? []);

  // Fetch compliance data scoped to real communities, paginated
  const realIds = communities.map((c) => c.id);
  const complianceRows = await fetchAllComplianceRows(db, realIds);
  const scoreMap = new Map<number, number>();

  const byCommunity = new Map<number, { applicable: number; met: number }>();
  for (const row of complianceRows) {
    if (!row.is_applicable) continue;
    const entry = byCommunity.get(row.community_id) ?? { applicable: 0, met: 0 };
    entry.applicable++;
    if (row.document_id !== null) entry.met++;
    byCommunity.set(row.community_id, entry);
  }
  for (const [id, { applicable, met }] of byCommunity) {
    scoreMap.set(id, applicable > 0 ? Math.round((met / applicable) * 100) : 100);
  }

  // Attach compliance scores to communities
  const communitiesWithScores = communities.map((c) => ({
    ...c,
    complianceScore: scoreMap.get(c.id) ?? null,
  }));

  return (
    <AdminLayout coolingCount={coolingCount}>
      <ClientPortfolio
        communities={communitiesWithScores}
        staleDemos={staleDemos}
      />
    </AdminLayout>
  );
}

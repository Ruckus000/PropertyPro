/**
 * Platform stats aggregation API for the admin dashboard.
 *
 * GET /api/admin/stats — returns platform-wide metrics
 */
import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';

const PAGE_SIZE = 1000;

/** Fetch all compliance checklist rows, paginating past the Supabase default limit. */
async function fetchAllRows(
  db: ReturnType<typeof createAdminClient>,
  communityIds: number[],
) {
  const allRows: Record<string, unknown>[] = [];
  let from = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await db
      .from('compliance_checklist_items')
      .select('community_id, document_id, is_applicable')
      .is('deleted_at', null)
      .in('community_id', communityIds)
      .range(from, from + PAGE_SIZE - 1);

    if (error) return { data: allRows, error };

    const rows = data ?? [];
    allRows.push(...rows);

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { data: allRows, error: null };
}

export async function GET() {
  await requirePlatformAdmin();

  const db = createAdminClient();

  // First, get the IDs of all real (non-demo, non-deleted) communities.
  // This is used to scope members, documents, and compliance to real clients only.
  const { data: realCommunities } = await db
    .from('communities')
    .select('id')
    .eq('is_demo', false)
    .is('deleted_at', null);

  const realIds = (realCommunities ?? []).map((c) => (c as { id: number }).id);
  const communityCount = realIds.length;

  // Run remaining aggregation queries in parallel
  const [
    demosResult,
    membersResult,
    documentsResult,
    subscriptionResult,
    complianceResult,
    activeAccessResult,
    coolingDeletionsResult,
  ] = await Promise.all([
    // Total demo instances
    db.from('demo_instances')
      .select('*', { count: 'exact', head: true }),
    // Total users across real communities only
    realIds.length > 0
      ? db.from('user_roles')
          .select('*', { count: 'exact', head: true })
          .in('community_id', realIds)
      : Promise.resolve({ count: 0, data: null, error: null }),
    // Total documents across real communities only
    realIds.length > 0
      ? db.from('documents')
          .select('*', { count: 'exact', head: true })
          .is('deleted_at', null)
          .in('community_id', realIds)
      : Promise.resolve({ count: 0, data: null, error: null }),
    // Subscription status breakdown (already scoped to non-demo)
    db.from('communities')
      .select('subscription_status')
      .eq('is_demo', false)
      .is('deleted_at', null),
    // Compliance checklist items — paginate to avoid Supabase 1000-row default limit
    realIds.length > 0
      ? fetchAllRows(db, realIds)
      : Promise.resolve({ data: [], error: null }),
    // Active free access plans (not revoked/converted and not expired)
    (db.from('access_plans')
      .select('*', { count: 'exact', head: true })
      .is('revoked_at', null)
      .is('converted_at', null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .gte('grace_ends_at', new Date().toISOString()) as any),
    // Deletion requests in cooling status
    (db.from('account_deletion_requests')
      .select('*', { count: 'exact', head: true })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq('status', 'cooling') as any),
  ]);

  const demoCount = demosResult.count ?? 0;
  const memberCount = membersResult.count ?? 0;
  const documentCount = documentsResult.count ?? 0;

  // Subscription breakdown
  const subscriptions = (subscriptionResult.data ?? []) as { subscription_status: string | null }[];
  const billing = {
    active: subscriptions.filter((s) => s.subscription_status === 'active').length,
    trialing: subscriptions.filter((s) => s.subscription_status === 'trialing').length,
    past_due: subscriptions.filter((s) => s.subscription_status === 'past_due').length,
    canceled: subscriptions.filter((s) => s.subscription_status === 'canceled').length,
    none: subscriptions.filter((s) => !s.subscription_status).length,
  };

  // Compliance scores per community
  const complianceRows = (complianceResult.data ?? []) as { community_id: number; document_id: number | null; is_applicable: boolean }[];
  const byCommunity = new Map<number, { applicable: number; met: number }>();
  for (const row of complianceRows) {
    if (!row.is_applicable) continue;
    const entry = byCommunity.get(row.community_id) ?? { applicable: 0, met: 0 };
    entry.applicable++;
    if (row.document_id !== null) entry.met++;
    byCommunity.set(row.community_id, entry);
  }

  const complianceScores = [...byCommunity.entries()].map(([communityId, { applicable, met }]) => ({
    communityId,
    score: applicable > 0 ? Math.round((met / applicable) * 100) : 100,
    met,
    total: applicable,
  }));

  const avgCompliance = complianceScores.length > 0
    ? Math.round(complianceScores.reduce((sum, c) => sum + c.score, 0) / complianceScores.length)
    : null;

  const atRisk = complianceScores.filter((c) => c.score < 70).length;

  const activeFreeAccessCount = activeAccessResult.count ?? 0;
  const pendingDeletionsCount = coolingDeletionsResult.count ?? 0;

  return NextResponse.json({
    overview: {
      communities: communityCount,
      demos: demoCount,
      members: memberCount,
      documents: documentCount,
    },
    billing,
    compliance: {
      averageScore: avgCompliance,
      atRiskCount: atRisk,
      totalTracked: complianceScores.length,
    },
    lifecycle: {
      activeFreeAccess: activeFreeAccessCount,
      pendingDeletions: pendingDeletionsCount,
    },
  });
}

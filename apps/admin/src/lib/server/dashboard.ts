import { createAdminClient } from '@propertypro/db/supabase/admin';
import {
  COMMUNITY_SCAN_PAGE_SIZE,
  COMMUNITY_SCAN_ROW_BOUND,
  fetchAllRowsInPages,
} from '@/lib/api/list-limits';

const PAGE_SIZE = 1000;

type AdminDb = ReturnType<typeof createAdminClient>;

interface SubscriptionRow {
  subscription_status: string | null;
}

interface ComplianceChecklistRow {
  community_id: number;
  document_id: number | null;
  is_applicable: boolean;
}

export interface PlatformDashboardStats {
  overview: {
    communities: number;
    demos: number;
    members: number;
    documents: number;
  };
  billing: {
    active: number;
    trialing: number;
    past_due: number;
    canceled: number;
    none: number;
  };
  compliance: {
    averageScore: number | null;
    atRiskCount: number;
    totalTracked: number;
    /** Communities bucketed by compliance score: >=90 / 80-89 / 70-79 / <70. */
    distribution: {
      top: number;
      high: number;
      mid: number;
      low: number;
    };
  };
  lifecycle: {
    activeFreeAccess: number;
    pendingDeletions: number;
  };
  /** Count of rows created in the trailing 30 days, for the KPI grid's delta chips. */
  deltas: {
    communities30d: number;
    members30d: number;
  };
}

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

function buildBillingSummary(subscriptions: SubscriptionRow[]): PlatformDashboardStats['billing'] {
  return {
    active: subscriptions.filter((s) => s.subscription_status === 'active').length,
    trialing: subscriptions.filter((s) => s.subscription_status === 'trialing').length,
    past_due: subscriptions.filter((s) => s.subscription_status === 'past_due').length,
    canceled: subscriptions.filter((s) => s.subscription_status === 'canceled').length,
    none: subscriptions.filter((s) => !s.subscription_status).length,
  };
}

function buildComplianceSummary(
  complianceRows: ComplianceChecklistRow[],
): PlatformDashboardStats['compliance'] {
  const byCommunity = new Map<number, { applicable: number; met: number }>();

  for (const row of complianceRows) {
    if (!row.is_applicable) {
      continue;
    }

    const entry = byCommunity.get(row.community_id) ?? { applicable: 0, met: 0 };
    entry.applicable += 1;
    if (row.document_id !== null) {
      entry.met += 1;
    }
    byCommunity.set(row.community_id, entry);
  }

  const complianceScores = [...byCommunity.values()].map(({ applicable, met }) => (
    applicable > 0 ? Math.round((met / applicable) * 100) : 100
  ));

  const distribution = { top: 0, high: 0, mid: 0, low: 0 };
  for (const score of complianceScores) {
    if (score >= 90) distribution.top += 1;
    else if (score >= 80) distribution.high += 1;
    else if (score >= 70) distribution.mid += 1;
    else distribution.low += 1;
  }

  return {
    averageScore: complianceScores.length > 0
      ? Math.round(complianceScores.reduce((sum, score) => sum + score, 0) / complianceScores.length)
      : null,
    atRiskCount: complianceScores.filter((score) => score < 70).length,
    totalTracked: complianceScores.length,
    distribution,
  };
}

async function fetchAllComplianceRows(
  db: AdminDb,
  communityIds: number[],
): Promise<ComplianceChecklistRow[]> {
  if (communityIds.length === 0) {
    return [];
  }

  const allRows: ComplianceChecklistRow[] = [];
  let from = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await db
      .from('compliance_checklist_items')
      .select('community_id, document_id, is_applicable')
      .is('deleted_at', null)
      .in('community_id', communityIds)
      .range(from, from + PAGE_SIZE - 1);

    throwIfError(error, 'Failed to load compliance checklist items');

    const rows = (data ?? []) as ComplianceChecklistRow[];
    allRows.push(...rows);

    if (rows.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return allRows;
}

export async function getPlatformDashboardStats(): Promise<PlatformDashboardStats> {
  const db = createAdminClient();

  // Paged, and completed-or-thrown. An unpaged `.select()` is truncated at
  // PostgREST's `db-max-rows` (1000) with no error, and `realIds` is the set
  // every other number below is scoped to — members, documents, compliance.
  // Worse, `dashboard-series.ts` builds the SAME set for the Members chart:
  // two unordered 1000-row pages of one query need not be the same 1000 rows,
  // which is exactly the headline-vs-chart divergence
  // `guard:admin-community-scope` exists for, with both reads carrying the
  // predicate and the guard green.
  const realCommunities = await fetchAllRowsInPages<{ id: number }>(
    'the real-community id set',
    (from, to) =>
      db
        .from('communities')
        .select('id')
        .eq('is_demo', false)
        .is('deleted_at', null)
        .order('id')
        .range(from, to),
    COMMUNITY_SCAN_PAGE_SIZE,
    COMMUNITY_SCAN_ROW_BOUND,
  );

  const realIds = realCommunities.map((community) => community.id);

  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    demosResult,
    membersResult,
    documentsResult,
    subscriptionRows,
    complianceRows,
    activeAccessResult,
    coolingDeletionsResult,
    communities30dResult,
    members30dResult,
  ] = await Promise.all([
    db.from('demo_instances').select('*', { count: 'exact', head: true }),
    realIds.length > 0
      ? db.from('user_roles').select('*', { count: 'exact', head: true }).in('community_id', realIds)
      : Promise.resolve({ count: 0, error: null }),
    realIds.length > 0
      ? db.from('documents').select('*', { count: 'exact', head: true }).is('deleted_at', null).in('community_id', realIds)
      : Promise.resolve({ count: 0, error: null }),
    // Paged for the same reason as the id scan above: the billing breakdown is
    // folded in memory over every real community's row, so a silent 1000-row
    // cut would under-report every status at once.
    fetchAllRowsInPages<SubscriptionRow>(
      'the subscription-status breakdown',
      (from, to) =>
        db
          .from('communities')
          .select('subscription_status')
          .eq('is_demo', false)
          .is('deleted_at', null)
          .order('id')
          .range(from, to),
      COMMUNITY_SCAN_PAGE_SIZE,
      COMMUNITY_SCAN_ROW_BOUND,
    ),
    fetchAllComplianceRows(db, realIds),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.from('access_plans')
      .select('*', { count: 'exact', head: true })
      .is('revoked_at', null)
      .is('converted_at', null)
      .gte('grace_ends_at', new Date().toISOString()) as any),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.from('account_deletion_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'cooling') as any),
    db.from('communities')
      .select('*', { count: 'exact', head: true })
      .eq('is_demo', false)
      .is('deleted_at', null)
      .gte('created_at', thirtyDaysAgoIso),
    realIds.length > 0
      ? db.from('user_roles')
        .select('*', { count: 'exact', head: true })
        .in('community_id', realIds)
        .gte('created_at', thirtyDaysAgoIso)
      : Promise.resolve({ count: 0, error: null }),
  ]);

  throwIfError(demosResult.error, 'Failed to load demo count');
  throwIfError(membersResult.error, 'Failed to load member count');
  throwIfError(documentsResult.error, 'Failed to load document count');
  throwIfError(activeAccessResult.error, 'Failed to load active access plan count');
  throwIfError(coolingDeletionsResult.error, 'Failed to load pending deletion count');
  throwIfError(communities30dResult.error, 'Failed to load new-community count');
  throwIfError(members30dResult.error, 'Failed to load new-member count');

  return {
    overview: {
      communities: realIds.length,
      demos: demosResult.count ?? 0,
      members: membersResult.count ?? 0,
      documents: documentsResult.count ?? 0,
    },
    billing: buildBillingSummary(subscriptionRows),
    compliance: buildComplianceSummary(complianceRows),
    lifecycle: {
      activeFreeAccess: activeAccessResult.count ?? 0,
      pendingDeletions: coolingDeletionsResult.count ?? 0,
    },
    deltas: {
      communities30d: communities30dResult.count ?? 0,
      members30d: members30dResult.count ?? 0,
    },
  };
}

export const platformDashboardTestUtils = {
  buildBillingSummary,
  buildComplianceSummary,
};

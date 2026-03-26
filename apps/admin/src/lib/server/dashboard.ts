import { createAdminClient } from '@propertypro/db/supabase/admin';

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
  };
  lifecycle: {
    activeFreeAccess: number;
    pendingDeletions: number;
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

  return {
    averageScore: complianceScores.length > 0
      ? Math.round(complianceScores.reduce((sum, score) => sum + score, 0) / complianceScores.length)
      : null,
    atRiskCount: complianceScores.filter((score) => score < 70).length,
    totalTracked: complianceScores.length,
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

  const { data: realCommunities, error: realCommunitiesError } = await db
    .from('communities')
    .select('id')
    .eq('is_demo', false)
    .is('deleted_at', null);

  throwIfError(realCommunitiesError, 'Failed to load communities');

  const realIds = (realCommunities ?? []).map((community) => (
    community as { id: number }
  ).id);

  const [
    demosResult,
    membersResult,
    documentsResult,
    subscriptionResult,
    complianceRows,
    activeAccessResult,
    coolingDeletionsResult,
  ] = await Promise.all([
    db.from('demo_instances').select('*', { count: 'exact', head: true }),
    realIds.length > 0
      ? db.from('user_roles').select('*', { count: 'exact', head: true }).in('community_id', realIds)
      : Promise.resolve({ count: 0, error: null }),
    realIds.length > 0
      ? db.from('documents').select('*', { count: 'exact', head: true }).is('deleted_at', null).in('community_id', realIds)
      : Promise.resolve({ count: 0, error: null }),
    db.from('communities')
      .select('subscription_status')
      .eq('is_demo', false)
      .is('deleted_at', null),
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
  ]);

  throwIfError(demosResult.error, 'Failed to load demo count');
  throwIfError(membersResult.error, 'Failed to load member count');
  throwIfError(documentsResult.error, 'Failed to load document count');
  throwIfError(subscriptionResult.error, 'Failed to load subscription summary');
  throwIfError(activeAccessResult.error, 'Failed to load active access plan count');
  throwIfError(coolingDeletionsResult.error, 'Failed to load pending deletion count');

  return {
    overview: {
      communities: realIds.length,
      demos: demosResult.count ?? 0,
      members: membersResult.count ?? 0,
      documents: documentsResult.count ?? 0,
    },
    billing: buildBillingSummary((subscriptionResult.data ?? []) as SubscriptionRow[]),
    compliance: buildComplianceSummary(complianceRows),
    lifecycle: {
      activeFreeAccess: activeAccessResult.count ?? 0,
      pendingDeletions: coolingDeletionsResult.count ?? 0,
    },
  };
}

export const platformDashboardTestUtils = {
  buildBillingSummary,
  buildComplianceSummary,
};

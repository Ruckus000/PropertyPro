/**
 * Server-side data loader for the Clients screen (Task 15 / spec D9).
 *
 * Merges what used to be three separate reads:
 *  - `(console)/clients/page.tsx`'s community list + compliance score map
 *  - the rootless-communities report (`findRootlessCommunities`)
 *  - the open root-claim disputes queue, moved verbatim from the rootless
 *    page's `fetchOpenDisputes` (role-v3 Phase 2b)
 *
 * plus a member count per community, so the Rootless Communities page can
 * become a redirect into `/clients?filter=rootless` with its dispute queue
 * surfaced as a banner here instead of a standalone screen.
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';
// AUTHZ: platform-admin report — cross-community read, gated by the requireAdminPageSession() platform-admin check in the page that calls this.
import { findRootlessCommunities } from '@propertypro/db/unsafe';
import { COMMUNITY_LIST_LIMIT } from '@/lib/api/list-limits';

const COMPLIANCE_PAGE_SIZE = 1000;

export interface ClientRow {
  id: number;
  name: string;
  slug: string;
  // Widened to `string` rather than the `'condo_718' | 'hoa_720' | 'apartment'`
  // union `CommunityDbRow` uses: `client-filters.test.ts`'s `row()` fixture
  // builds this type through a `Partial<any>` spread, which widens every
  // property TS can't prove the spread won't touch — pinning this to a union
  // here would make that (brief-specified, verbatim) test fixture fail to
  // compile against a real production line rather than fail for the behavior
  // under test.
  community_type: string;
  city: string | null;
  state: string | null;
  subscription_status: string | null;
  subscription_plan: string | null;
  created_at: string;
  complianceScore: number | null;
  memberCount: number;
  rootless: boolean;
  disputeOpen: boolean;
}

export interface OpenDispute {
  id: number;
  communityId: number;
  communityName: string;
  claimedUserId: string;
  disputedByUserId: string;
  createdAt: string;
}

export interface ClientCounts {
  all: number;
  pastDue: number;
  atRisk: number;
  trialing: number;
  rootless: number;
}

interface CommunityDbRow {
  id: number;
  name: string;
  slug: string;
  community_type: 'condo_718' | 'hoa_720' | 'apartment';
  city: string | null;
  state: string | null;
  subscription_status: string | null;
  subscription_plan: string | null;
  created_at: string;
}

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
    const { data, error } = await db
      .from('compliance_checklist_items')
      .select('community_id, document_id, is_applicable')
      .is('deleted_at', null)
      .in('community_id', communityIds)
      .range(from, from + COMPLIANCE_PAGE_SIZE - 1);

    // A failed page yields `rows.length === 0`, which ALSO satisfies the
    // loop's exit condition — a mid-pagination failure would otherwise
    // silently truncate the dataset. A wrong compliance score shown as fact
    // is worse than an error page.
    if (error) {
      throw new Error(`Failed to load compliance rows (offset ${from}): ${error.message}`);
    }

    const rows = (data ?? []) as typeof allRows;
    allRows.push(...rows);
    if (rows.length < COMPLIANCE_PAGE_SIZE) break;
    from += COMPLIANCE_PAGE_SIZE;
  }
  return allRows;
}

/**
 * `user_roles` counts per community. A `select('community_id', { count:
 * 'exact' })` per community id is N+1 for a platform with hundreds of
 * communities — instead select `community_id` for every non-demo id in one
 * query and count in memory. Capped by `COMMUNITY_LIST_LIMIT`: if the
 * platform's total membership ever exceeds that in one page, `memberCount`
 * undercounts rather than the request growing unbounded — see
 * `lib/api/list-limits.ts` for why a cap beats an open-ended read here.
 */
async function fetchMemberCounts(
  db: ReturnType<typeof createAdminClient>,
  communityIds: number[],
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (communityIds.length === 0) return counts;

  const { data, error } = await db
    .from('user_roles')
    .select('community_id')
    .in('community_id', communityIds)
    .limit(COMMUNITY_LIST_LIMIT);

  if (error) {
    throw new Error(`Failed to load member counts: ${error.message}`);
  }

  for (const row of (data ?? []) as { community_id: number }[]) {
    counts.set(row.community_id, (counts.get(row.community_id) ?? 0) + 1);
  }
  return counts;
}

interface OpenDisputeDbRow {
  id: number;
  community_id: number;
  claimed_user_id: string;
  disputed_by_user_id: string;
  created_at: string;
}

export async function getClientsData(): Promise<{
  clients: ClientRow[];
  disputes: OpenDispute[];
  counts: ClientCounts;
}> {
  const db = createAdminClient();

  const [communitiesResult, rootlessRows, disputesResult] = await Promise.all([
    db
      .from('communities')
      .select(
        'id, name, slug, community_type, city, state, subscription_status, subscription_plan, created_at',
      )
      .eq('is_demo', false)
      .is('deleted_at', null)
      .order('name'),
    findRootlessCommunities(),
    db
      .from('root_claim_disputes')
      .select('id, community_id, claimed_user_id, disputed_by_user_id, created_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false }),
  ]);

  // A failed communities read used to render an empty portfolio — visually
  // identical to a platform with no clients at all. Let it reach error.tsx.
  if (communitiesResult.error) {
    throw new Error(`Failed to load communities: ${communitiesResult.error.message}`);
  }
  if (disputesResult.error) {
    throw new Error(`Failed to load open disputes: ${disputesResult.error.message}`);
  }

  const communities = (communitiesResult.data ?? []) as unknown as CommunityDbRow[];
  const communityIds = communities.map((c) => c.id);

  const [complianceRows, memberCounts] = await Promise.all([
    fetchAllComplianceRows(db, communityIds),
    fetchMemberCounts(db, communityIds),
  ]);

  const byCommunity = new Map<number, { applicable: number; met: number }>();
  for (const row of complianceRows) {
    if (!row.is_applicable) continue;
    const entry = byCommunity.get(row.community_id) ?? { applicable: 0, met: 0 };
    entry.applicable++;
    if (row.document_id !== null) entry.met++;
    byCommunity.set(row.community_id, entry);
  }
  const scoreMap = new Map<number, number>();
  for (const [id, { applicable, met }] of byCommunity) {
    scoreMap.set(id, applicable > 0 ? Math.round((met / applicable) * 100) : 100);
  }

  const rootlessIds = new Set(rootlessRows.map((r) => r.id));

  const nameById = new Map(communities.map((c) => [c.id, c.name]));
  const disputeRows = (disputesResult.data ?? []) as OpenDisputeDbRow[];
  const disputedCommunityIds = new Set(disputeRows.map((d) => d.community_id));

  const disputes: OpenDispute[] = disputeRows.map((d) => ({
    id: d.id,
    communityId: d.community_id,
    communityName: nameById.get(d.community_id) ?? `#${d.community_id}`,
    claimedUserId: d.claimed_user_id,
    disputedByUserId: d.disputed_by_user_id,
    createdAt: d.created_at,
  }));

  const clients: ClientRow[] = communities.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    community_type: c.community_type,
    city: c.city,
    state: c.state,
    subscription_status: c.subscription_status,
    subscription_plan: c.subscription_plan,
    created_at: c.created_at,
    complianceScore: scoreMap.get(c.id) ?? null,
    memberCount: memberCounts.get(c.id) ?? 0,
    rootless: rootlessIds.has(c.id),
    disputeOpen: disputedCommunityIds.has(c.id),
  }));

  const counts: ClientCounts = {
    all: clients.length,
    pastDue: clients.filter((c) => c.subscription_status === 'past_due').length,
    atRisk: clients.filter((c) => c.complianceScore !== null && c.complianceScore < 70).length,
    trialing: clients.filter((c) => c.subscription_status === 'trialing').length,
    rootless: clients.filter((c) => c.rootless).length,
  };

  return { clients, disputes, counts };
}

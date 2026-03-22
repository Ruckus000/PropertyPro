/**
 * Demo instances database query helpers.
 *
 * Follows the same pattern as site-blocks-queries.ts — wraps Supabase REST
 * queries with typed results since demo_instances is not in the auto-generated
 * TypeScript definitions.
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface DemoInstanceRow {
  id: number;
  template_type: string;
  prospect_name: string;
  slug: string;
  theme: Record<string, unknown>;
  seeded_community_id: number | null;
  demo_resident_user_id: string | null;
  demo_board_user_id: string | null;
  demo_resident_email: string;
  demo_board_email: string;
  auth_token_secret: string;
  external_crm_url: string | null;
  prospect_notes: string | null;
  created_at: string;
  customized_at: string | null;
  /** True when the community's is_demo flag has been cleared (converted to customer). */
  is_converted?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function from(table: string): any {
  return createAdminClient().from(table);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all demo instances with community conversion status, ordered by created_at DESC. */
export async function listDemos(): Promise<{
  data: DemoInstanceRow[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await from('demo_instances')
    .select('*, communities:seeded_community_id(is_demo)')
    .order('created_at', { ascending: false });

  if (error || !data) return { data: null, error };

  // Flatten the join: extract is_demo from the nested communities object
  const rows = (data as (DemoInstanceRow & { communities: { is_demo: boolean } | null })[]).map(
    (row) => ({
      ...row,
      is_converted: row.communities ? !row.communities.is_demo : false,
      communities: undefined,
    }),
  );

  return { data: rows as DemoInstanceRow[], error: null };
}

/** Fetch a single demo instance by ID. */
export async function getDemoById(id: number): Promise<{
  data: DemoInstanceRow | null;
  error: { message: string } | null;
}> {
  return from('demo_instances')
    .select('*')
    .eq('id', id)
    .single();
}

/** Insert a new demo instance row. */
export async function insertDemo(row: {
  template_type: string;
  prospect_name: string;
  slug: string;
  theme: Record<string, unknown>;
  seeded_community_id: number;
  demo_resident_user_id: string;
  demo_board_user_id: string;
  demo_resident_email: string;
  demo_board_email: string;
  auth_token_secret: string;
  external_crm_url?: string;
  prospect_notes?: string;
}): Promise<{ data: DemoInstanceRow | null; error: { message: string } | null }> {
  return from('demo_instances').insert(row).select().single();
}

/** Hard-delete a demo instance by ID. */
export async function deleteDemo(id: number): Promise<{
  data: DemoInstanceRow | null;
  error: { message: string } | null;
}> {
  return from('demo_instances')
    .delete()
    .eq('id', id)
    .select()
    .single();
}

/**
 * Set `customized_at` to now if not already set.
 * Called on the first edit to mark a demo as customized.
 */
export async function markDemoCustomized(id: number): Promise<{
  error: { message: string } | null;
}> {
  return from('demo_instances')
    .update({ customized_at: new Date().toISOString() })
    .eq('id', id)
    .is('customized_at', null);
}

/**
 * Get the seeded community ID for a demo instance.
 * Returns null if the demo doesn't exist or has no community.
 */
export async function getDemoCommunityId(demoId: number): Promise<number | null> {
  const { data } = await from('demo_instances')
    .select('seeded_community_id')
    .eq('id', demoId)
    .single();
  return (data as { seeded_community_id: number | null } | null)?.seeded_community_id ?? null;
}

/** Delete a community by ID (cascades demo data). */
export async function deleteCommunity(communityId: number): Promise<{
  error: { message: string } | null;
}> {
  return from('communities')
    .delete()
    .eq('id', communityId);
}

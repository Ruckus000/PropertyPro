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

/** List all demo instances, ordered by created_at DESC. */
export async function listDemos(): Promise<{
  data: DemoInstanceRow[] | null;
  error: { message: string } | null;
}> {
  return from('demo_instances')
    .select('*')
    .order('created_at', { ascending: false });
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

/** Delete a community by ID (cascades demo data). */
export async function deleteCommunity(communityId: number): Promise<{
  error: { message: string } | null;
}> {
  return from('communities')
    .delete()
    .eq('id', communityId);
}

/**
 * Site blocks database query helpers.
 *
 * The site_blocks table is not yet in the auto-generated Supabase TypeScript
 * definitions, so Supabase's `.from('site_blocks')` resolves its row/insert/update
 * generics to `never`. This module wraps the queries and casts through `unknown`
 * at the boundary so that callers get properly typed results.
 *
 * Each function matches a single REST operation and returns typed data.
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface SiteBlockRow {
  id: number;
  community_id: number;
  block_type: string;
  block_order: number;
  content: Record<string, unknown>;
  is_draft: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
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

/** Fetch all non-deleted blocks for a community, ordered by block_order ASC. */
export async function listBlocks(communityId: number): Promise<{
  data: SiteBlockRow[] | null;
  error: { message: string } | null;
}> {
  return from('site_blocks')
    .select('*')
    .eq('community_id', communityId)
    .is('deleted_at', null)
    .order('block_order', { ascending: true });
}

/** Insert a new site block row. */
export async function insertBlock(row: {
  community_id: number;
  block_type: string;
  block_order: number;
  content: Record<string, unknown>;
  is_draft: boolean;
}): Promise<{ data: SiteBlockRow | null; error: { message: string } | null }> {
  return from('site_blocks').insert(row).select().single();
}

/** Fetch a single block by ID (non-deleted). */
export async function getBlock(id: number): Promise<{
  data: SiteBlockRow | null;
  error: { message: string } | null;
}> {
  return from('site_blocks')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();
}

/** Update a block by ID. */
export async function updateBlock(
  id: number,
  data: Record<string, unknown>,
): Promise<{ data: SiteBlockRow | null; error: { message: string } | null }> {
  return from('site_blocks').update(data).eq('id', id).select().single();
}

/** Soft-delete a block by ID. */
export async function softDeleteBlock(id: number): Promise<{
  data: SiteBlockRow | null;
  error: { message: string } | null;
}> {
  return from('site_blocks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();
}

/** Publish all draft blocks for a community. */
export async function publishDrafts(communityId: number): Promise<{
  data: SiteBlockRow[] | null;
  error: { message: string } | null;
}> {
  const now = new Date().toISOString();
  return from('site_blocks')
    .update({
      is_draft: false,
      published_at: now,
      updated_at: now,
    })
    .eq('community_id', communityId)
    .eq('is_draft', true)
    .is('deleted_at', null)
    .select();
}

/** Hard-delete all draft blocks for a community. */
export async function discardDrafts(communityId: number): Promise<{
  data: SiteBlockRow[] | null;
  error: { message: string } | null;
}> {
  return from('site_blocks')
    .delete()
    .eq('community_id', communityId)
    .eq('is_draft', true)
    .is('deleted_at', null)
    .select();
}

/** Get max block_order for a community (for appending new blocks). */
export async function getMaxBlockOrder(communityId: number): Promise<number> {
  const result = await from('site_blocks')
    .select('block_order')
    .eq('community_id', communityId)
    .is('deleted_at', null)
    .order('block_order', { ascending: false })
    .limit(1)
    .single();

  const row = result.data as Record<string, unknown> | null;
  return row ? (Number(row['block_order']) + 1) : 0;
}

/** Update community site_published_at timestamp. */
export async function updateCommunityPublishTimestamp(
  communityId: number,
): Promise<{ error: { message: string } | null }> {
  return from('communities')
    .update({ site_published_at: new Date().toISOString() })
    .eq('id', communityId);
}

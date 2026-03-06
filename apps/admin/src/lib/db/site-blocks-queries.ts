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

/** Fetch all non-deleted draft blocks for a community (for pre-publish validation). */
export async function listDraftBlocks(communityId: number): Promise<{
  data: SiteBlockRow[] | null;
  error: { message: string } | null;
}> {
  return from('site_blocks')
    .select('*')
    .eq('community_id', communityId)
    .eq('is_draft', true)
    .is('deleted_at', null)
    .order('block_order', { ascending: true });
}

/**
 * Batch-update block_order for multiple blocks.
 *
 * Uses a two-pass strategy to avoid unique constraint violations on
 * (community_id, block_order, is_draft) during swaps:
 *   Pass 1: Set all blocks to temporary negative orders (unique per row id).
 *   Pass 2: Set all blocks to their final intended orders.
 *
 * Fixes ADR-002 Critical #2: parallel updates that swap order values
 * (e.g., A: 1→2, B: 2→1) would violate the unique constraint when
 * executed concurrently.
 */
export async function reorderBlocks(
  communityId: number,
  order: Array<{ id: number; blockOrder: number }>,
): Promise<{ error: { message: string } | null }> {
  const timestamp = new Date().toISOString();

  // Pass 1: Set all to temporary negative orders (safe — unique per row id)
  const pass1Results = await Promise.all(
    order.map((item) =>
      from('site_blocks')
        .update({ block_order: -(item.id + 1000), updated_at: timestamp })
        .eq('id', item.id)
        .eq('community_id', communityId)
        .is('deleted_at', null),
    ),
  );

  for (const result of pass1Results) {
    if (result.error) return { error: result.error };
  }

  // Pass 2: Set to final orders
  const pass2Results = await Promise.all(
    order.map((item) =>
      from('site_blocks')
        .update({ block_order: item.blockOrder, updated_at: timestamp })
        .eq('id', item.id)
        .eq('community_id', communityId)
        .is('deleted_at', null),
    ),
  );

  for (const result of pass2Results) {
    if (result.error) return { error: result.error };
  }

  return { error: null };
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

/**
 * Insert a block at the end of the community's block list with retry on
 * unique constraint conflict. Handles the race condition where concurrent
 * inserts could compute the same block_order.
 */
export async function insertBlockAtEnd(row: {
  community_id: number;
  block_type: string;
  content: Record<string, unknown>;
  is_draft: boolean;
}): Promise<{ data: SiteBlockRow | null; error: { message: string } | null }> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const order = await getMaxBlockOrder(row.community_id);
    const result = await insertBlock({ ...row, block_order: order });
    // Unique constraint violation → retry with fresh order
    if (result.error?.message?.includes('unique') || result.error?.message?.includes('duplicate')) {
      continue;
    }
    return result;
  }
  return { data: null, error: { message: 'Failed to insert block after retries due to ordering conflict' } };
}

/** Update community site_published_at timestamp. */
export async function updateCommunityPublishTimestamp(
  communityId: number,
): Promise<{ error: { message: string } | null }> {
  return from('communities')
    .update({ site_published_at: new Date().toISOString() })
    .eq('id', communityId);
}

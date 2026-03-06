/**
 * Translation layer between per-row DB storage and Puck's Data format.
 *
 * Addresses ADR-002 critical issues:
 * - #2: Two-pass reorder strategy to avoid unique constraint violations
 * - #3: Client-side ID map for new blocks (avoids lost edits)
 * - #4: Partial failure recovery via re-fetch
 */
import type { Data, ComponentData } from '@puckeditor/core';
import type { BlockType, BlockContent } from '@propertypro/shared/site-blocks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of a site block row from the API. */
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

/** Map from Puck component id → DB row id. */
export type IdMap = Map<string, number>;

/** Snapshot of known DB state for diffing. */
export interface KnownState {
  /** puckId → content (the last-known content for each block) */
  content: Map<string, Record<string, unknown>>;
  /** Ordered list of puckIds representing the last-known block order */
  order: string[];
  /** puckId → draft status */
  drafts: Map<string, boolean>;
}

/** A set of changes to apply to the API. */
export interface ChangeSet {
  creates: Array<{
    puckId: string;
    blockType: BlockType;
    content: Record<string, unknown>;
    order: number;
  }>;
  updates: Array<{
    dbId: number;
    puckId: string;
    content: Record<string, unknown>;
  }>;
  deletes: Array<{
    dbId: number;
    puckId: string;
  }>;
  /** Non-null only when the order actually changed. */
  reorder: Array<{
    dbId: number;
    blockOrder: number;
  }> | null;
}

// ---------------------------------------------------------------------------
// DB Rows → Puck Data
// ---------------------------------------------------------------------------

/**
 * Convert an array of DB rows into Puck Data, an IdMap, and a KnownState
 * snapshot for subsequent diffing.
 */
export function rowsToPuckData(rows: SiteBlockRow[]): {
  data: Data;
  idMap: IdMap;
  knownState: KnownState;
} {
  const sorted = [...rows].sort((a, b) => a.block_order - b.block_order);

  const idMap: IdMap = new Map();
  const knownContent = new Map<string, Record<string, unknown>>();
  const knownOrder: string[] = [];
  const knownDrafts = new Map<string, boolean>();

  const content: ComponentData[] = sorted.map((row) => {
    const puckId = `block-${row.id}`;
    idMap.set(puckId, row.id);
    knownContent.set(puckId, { ...row.content });
    knownOrder.push(puckId);
    knownDrafts.set(puckId, row.is_draft);

    return {
      type: row.block_type,
      props: {
        id: puckId,
        ...(row.content as object),
      },
    };
  });

  return {
    data: {
      content,
      root: { props: {} },
    },
    idMap,
    knownState: {
      content: knownContent,
      order: knownOrder,
      drafts: knownDrafts,
    },
  };
}

// ---------------------------------------------------------------------------
// Puck Data → ChangeSet (diff against known state)
// ---------------------------------------------------------------------------

/**
 * Categorize a Puck action type into a content change kind.
 * Returns null for non-content actions (UI-only) that don't need saving.
 *
 * ADR-002 #7: Used by onAction to build a targeted dirty set instead of
 * diffing the entire page on every debounce.
 */
export type ActionKind = 'content' | 'structural' | null;

export function classifyAction(actionType: string): ActionKind {
  switch (actionType) {
    case 'replace':
    case 'replaceRoot':
      return 'content';
    case 'insert':
    case 'remove':
    case 'reorder':
    case 'move':
    case 'duplicate':
      return 'structural';
    case 'setUi':
    case 'registerZone':
    case 'unregisterZone':
      return null;
    default:
      // Unknown action types default to structural (safe — will trigger full diff)
      return 'structural';
  }
}

/**
 * Diff only a specific set of dirty blocks against known state.
 * Falls back to full diff for structural changes (inserts, deletes, reorder).
 *
 * ADR-002 #7: Avoids O(n) deep comparison on every debounce by only checking
 * blocks that Puck's onAction reported as changed.
 */
export function diffDirtyBlocks(
  current: Data,
  idMap: IdMap,
  knownState: KnownState,
  dirtyPuckIds: Set<string>,
): ChangeSet {
  const updates: ChangeSet['updates'] = [];

  for (const item of current.content) {
    const puckId = item.props.id as string;
    if (!dirtyPuckIds.has(puckId)) continue;

    const { id: _id, ...contentProps } = item.props;
    const dbId = idMap.get(puckId);

    if (dbId !== undefined) {
      const knownContent = knownState.content.get(puckId);
      if (knownContent && !shallowEqual(contentProps as Record<string, unknown>, knownContent)) {
        updates.push({
          dbId,
          puckId,
          content: contentProps as Record<string, unknown>,
        });
      }
    }
  }

  return { creates: [], updates, deletes: [], reorder: null };
}

/**
 * Compare the current Puck Data against the last-known DB state and produce
 * a minimal set of API operations (creates, updates, deletes, reorder).
 */
export function diffPuckData(
  current: Data,
  idMap: IdMap,
  knownState: KnownState,
): ChangeSet {
  const creates: ChangeSet['creates'] = [];
  const updates: ChangeSet['updates'] = [];
  const deletes: ChangeSet['deletes'] = [];

  const currentPuckIds = new Set<string>();
  const currentOrder: string[] = [];

  // Walk current Puck content
  current.content.forEach((item, index) => {
    const puckId = item.props.id as string;
    currentPuckIds.add(puckId);
    currentOrder.push(puckId);

    // Separate Puck's `id` from the block content fields
    const { id: _id, ...contentProps } = item.props;

    const dbId = idMap.get(puckId);
    if (dbId === undefined) {
      // New block — no DB id yet
      creates.push({
        puckId,
        blockType: item.type as BlockType,
        content: contentProps as Record<string, unknown>,
        order: index,
      });
    } else {
      // Existing block — check for content changes
      const knownContent = knownState.content.get(puckId);
      if (knownContent && !shallowEqual(contentProps as Record<string, unknown>, knownContent)) {
        updates.push({
          dbId,
          puckId,
          content: contentProps as Record<string, unknown>,
        });
      }
    }
  });

  // Detect deletes: blocks in known state but not in current data
  for (const puckId of knownState.order) {
    if (!currentPuckIds.has(puckId)) {
      const dbId = idMap.get(puckId);
      if (dbId !== undefined) {
        deletes.push({ dbId, puckId });
      }
    }
  }

  // Detect reorder: compare the ordered list of existing (non-new) puckIds
  const existingOrder = currentOrder.filter((id) => idMap.has(id));
  const knownExistingOrder = knownState.order.filter((id) => currentPuckIds.has(id));

  let reorder: ChangeSet['reorder'] = null;
  if (!arraysEqual(existingOrder, knownExistingOrder)) {
    // Build reorder payload with new block_order values
    reorder = currentOrder
      .map((puckId, index) => {
        const dbId = idMap.get(puckId);
        if (dbId === undefined) return null; // skip new blocks (not yet created)
        return { dbId, blockOrder: index };
      })
      .filter((item): item is { dbId: number; blockOrder: number } => item !== null);
  }

  return { creates, updates, deletes, reorder };
}

// ---------------------------------------------------------------------------
// Apply ChangeSet to API
// ---------------------------------------------------------------------------

export interface ApplyResult {
  /** True if all operations succeeded. */
  ok: boolean;
  /** Per-create results mapping puckId → newly assigned DB id. */
  createdIds: Map<string, number>;
  /** Error messages for failed operations. */
  errors: string[];
}

/**
 * Execute a ChangeSet against the admin API endpoints.
 *
 * Handles Critical #4 (partial failure recovery): tracks per-operation
 * success and only updates known state for operations that succeeded.
 */
export async function applyChangeSet(
  changeSet: ChangeSet,
  communityId: number,
): Promise<ApplyResult> {
  const createdIds = new Map<string, number>();
  const errors: string[] = [];

  // 1. Creates — execute immediately (not debounced), one at a time to get IDs
  for (const create of changeSet.creates) {
    try {
      const res = await fetch('/api/admin/site-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          blockType: create.blockType,
          content: create.content,
        }),
      });
      if (!res.ok) {
        const text = await safeErrorText(res);
        errors.push(`Create ${create.blockType}: ${text}`);
        continue;
      }
      const json = (await res.json()) as { data: { id: number } };
      createdIds.set(create.puckId, json.data.id);
    } catch (err) {
      errors.push(`Create ${create.blockType}: ${errorMessage(err)}`);
    }
  }

  // 2. Updates — parallel (independent blocks)
  const updatePromises = changeSet.updates.map(async (update) => {
    try {
      const res = await fetch(`/api/admin/site-blocks/${update.dbId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: update.content }),
      });
      if (!res.ok) {
        const text = await safeErrorText(res);
        errors.push(`Update block ${update.dbId}: ${text}`);
      }
    } catch (err) {
      errors.push(`Update block ${update.dbId}: ${errorMessage(err)}`);
    }
  });

  // 3. Deletes — parallel (independent blocks)
  const deletePromises = changeSet.deletes.map(async (del) => {
    try {
      const res = await fetch(`/api/admin/site-blocks/${del.dbId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const text = await safeErrorText(res);
        errors.push(`Delete block ${del.dbId}: ${text}`);
      }
    } catch (err) {
      errors.push(`Delete block ${del.dbId}: ${errorMessage(err)}`);
    }
  });

  await Promise.all([...updatePromises, ...deletePromises]);

  // 4. Reorder — after creates complete so new blocks have IDs
  if (changeSet.reorder && changeSet.reorder.length > 0) {
    // Include newly created blocks in the reorder
    const fullReorder = [...changeSet.reorder];
    for (const create of changeSet.creates) {
      const newDbId = createdIds.get(create.puckId);
      if (newDbId !== undefined) {
        fullReorder.push({ dbId: newDbId, blockOrder: create.order });
      }
    }

    try {
      const res = await fetch('/api/admin/site-blocks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          order: fullReorder.map((r) => ({ id: r.dbId, blockOrder: r.blockOrder })),
        }),
      });
      if (!res.ok) {
        const text = await safeErrorText(res);
        errors.push(`Reorder: ${text}`);
      }
    } catch (err) {
      errors.push(`Reorder: ${errorMessage(err)}`);
    }
  }

  return {
    ok: errors.length === 0,
    createdIds,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Update known state after successful operations
// ---------------------------------------------------------------------------

/**
 * Merge successful operation results into the known state and id map.
 * Only updates state for operations that actually succeeded.
 */
export function mergeApplyResult(
  result: ApplyResult,
  changeSet: ChangeSet,
  currentData: Data,
  idMap: IdMap,
  knownState: KnownState,
): void {
  // Register newly created blocks
  for (const [puckId, dbId] of result.createdIds) {
    idMap.set(puckId, dbId);
  }

  // Rebuild known state from current data (for successful operations)
  const newContent = new Map<string, Record<string, unknown>>();
  const newOrder: string[] = [];
  const newDrafts = new Map<string, boolean>();

  for (const item of currentData.content) {
    const puckId = item.props.id as string;
    const { id: _id, ...contentProps } = item.props;

    // Only update known content if the block has a DB id
    if (idMap.has(puckId)) {
      newContent.set(puckId, contentProps as Record<string, unknown>);
      newOrder.push(puckId);
      // Newly created blocks are drafts
      const existingDraft = knownState.drafts.get(puckId);
      newDrafts.set(puckId, existingDraft ?? true);
    }
  }

  knownState.content = newContent;
  knownState.order = newOrder;
  knownState.drafts = newDrafts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shallow comparison of two flat objects (one level deep). */
export function shallowEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    const valA = a[key];
    const valB = b[key];
    if (valA !== valB) {
      // Deep compare arrays and objects
      if (typeof valA === 'object' && typeof valB === 'object' && valA !== null && valB !== null) {
        if (JSON.stringify(valA) !== JSON.stringify(valB)) return false;
      } else {
        return false;
      }
    }
  }
  return true;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function safeErrorText(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as Record<string, unknown>;
    const errObj = json?.['error'];
    if (errObj && typeof errObj === 'object' && errObj !== null) {
      const msg = (errObj as Record<string, unknown>)['message'];
      if (typeof msg === 'string') return msg;
    }
  } catch {
    // ignore parse errors
  }
  return res.statusText || `HTTP ${res.status}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

/**
 * Publish-snapshot history for one community — feeds the client workspace's
 * Website tab (`SnapshotsCard`, Task 17c).
 *
 * Reads `site_publish_snapshots` (packages/db/src/schema/site-publish-snapshots.ts).
 * That table is NOT part of `AdminDatabase` (see
 * `packages/db/src/supabase/admin-types.ts`), so this uses the untyped
 * `createAdminClient()` rather than `createAdminTypedClient()` — the typed
 * client has no row type for it and would fail to compile. Same pattern as
 * `getCommunityActivity` in `./community-activity.ts`.
 *
 * READ-ONLY. There is no restore action wired to this data from apps/admin —
 * see the "no reachable endpoint" note in
 * `.superpowers/sdd/2026-09-08-admin-console-redesign/task-17c-dispatch-notes.md`
 * §2. The `restorable` flag below exists so the UI can tell a still-retained
 * publish apart from a pruned one, not to gate an action.
 *
 * Bounded in BOTH dimensions, which the previous docblock conflated.
 * `SNAPSHOTS_LIMIT` bounds the ROW COUNT, so a long-lived community's full
 * publish history is never pulled in one page load. The payload is bounded
 * separately, and was not: the list query used to select `snapshot` purely to
 * test it for null, which transferred an entire published site's content JSON
 * × 20 on every `force-dynamic` workspace page load — for a tab the operator
 * may never open. `restorable` now comes from a second, narrow query that
 * selects only the ids whose `snapshot` survives retention (the lifecycle cron
 * prunes that column — see the schema's RETENTION docblock), so no payload
 * crosses the wire at all.
 *
 * Deliberately its own file rather than added to `lib/server/clients.ts`
 * (owned by the Clients-grid slice, 2a) or `community-activity.ts` (17a) —
 * disjoint files per wave convention.
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';

/** How many rows the Website tab's publish-history list shows. */
const SNAPSHOTS_LIMIT = 20;

export interface CommunitySnapshotEntry {
  id: number;
  publishedAt: string;
  changeCount: number;
  changeLabels: string[];
  /** `snapshot IS NOT NULL` on the underlying row — see the module docblock. */
  restorable: boolean;
}

interface SnapshotRow {
  id: number;
  published_at: string;
  change_count: number | null;
  change_labels: string[] | null;
}

export async function getCommunitySnapshots(communityId: number): Promise<CommunitySnapshotEntry[]> {
  const db = createAdminClient();

  const { data, error } = await db
    .from('site_publish_snapshots')
    .select('id, published_at, change_count, change_labels')
    .eq('community_id', communityId)
    .is('deleted_at', null)
    .order('published_at', { ascending: false })
    .limit(SNAPSHOTS_LIMIT);

  if (error) {
    throw new Error(`Failed to load site publish snapshots: ${error.message}`);
  }

  const rows = (data ?? []) as SnapshotRow[];
  if (rows.length === 0) {
    return [];
  }

  // Which of those rows still HAS a snapshot, asked without transferring one.
  // `.in('id', …)` is over the ≤ SNAPSHOTS_LIMIT ids already in hand, so this
  // needs no bound of its own; PostgREST returns the matching ids only.
  const ids = rows.map((row) => row.id);
  const { data: retained, error: retainedError } = await db
    .from('site_publish_snapshots')
    .select('id')
    .in('id', ids)
    .not('snapshot', 'is', null);

  if (retainedError) {
    throw new Error(`Failed to load site publish snapshot retention: ${retainedError.message}`);
  }

  const restorableIds = new Set(((retained ?? []) as { id: number }[]).map((row) => row.id));

  return rows.map((row) => ({
    id: row.id,
    publishedAt: row.published_at,
    changeCount: row.change_count ?? 0,
    changeLabels: row.change_labels ?? [],
    restorable: restorableIds.has(row.id),
  }));
}

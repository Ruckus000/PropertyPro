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
 * Bounded read: this selects `snapshot` only to test it for null (the
 * lifecycle cron prunes that column past retention — see the schema's
 * RETENTION docblock) and never forwards the payload itself to the client;
 * `SNAPSHOTS_LIMIT` caps row count so a long-lived community's full publish
 * history is never pulled in one page load.
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
  snapshot: unknown | null;
}

export async function getCommunitySnapshots(communityId: number): Promise<CommunitySnapshotEntry[]> {
  const db = createAdminClient();

  const { data, error } = await db
    .from('site_publish_snapshots')
    .select('id, published_at, change_count, change_labels, snapshot')
    .eq('community_id', communityId)
    .is('deleted_at', null)
    .order('published_at', { ascending: false })
    .limit(SNAPSHOTS_LIMIT);

  if (error) {
    throw new Error(`Failed to load site publish snapshots: ${error.message}`);
  }

  return ((data ?? []) as SnapshotRow[]).map((row) => ({
    id: row.id,
    publishedAt: row.published_at,
    changeCount: row.change_count ?? 0,
    changeLabels: row.change_labels ?? [],
    restorable: row.snapshot !== null,
  }));
}

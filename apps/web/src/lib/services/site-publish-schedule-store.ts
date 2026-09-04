/**
 * Table-level operations on `site_publish_schedules` that more than one service
 * needs.
 *
 * This module exists to break a cycle, not to be a layer: the schedule service
 * imports `publishCommunitySite`, so the publish service cannot import back
 * from it without the two forming a circular import — which in ESM surfaces as
 * a TDZ error at module init, far from its cause. Anything both services touch
 * lives here instead, and this file imports neither of them.
 */
import { sql } from '@propertypro/db/filters';

/** The subset of a drizzle transaction handle these helpers need. */
export interface ScheduleTx {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
}

/**
 * `db.execute` returns a bare array on this driver, but a `{ rows }` object on
 * others. Normalised once here rather than at each call site.
 */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []);
}

/**
 * Disarm the community's pending schedule as part of an in-flight publish.
 *
 * Takes the caller's transaction handle rather than opening its own, because it
 * must be ATOMIC with the publish. Cancelling after the publish transaction
 * commits leaves a window in which the cron claims the row and republishes —
 * with the original summary, describing changes that are already live.
 *
 * Lives here rather than in `site-blocks-service` so that knowledge of this
 * table, and of which statuses are cancellable, stays in one module.
 *
 * `pending` only. A `running` row is mid-publish in another tick; cancelling it
 * would race that tick's `finishSchedule`. It needs no lock: that tick will find
 * the drafts already promoted, finish as `nothing_to_publish`, and NOT notify,
 * because notification is gated on `result.published`.
 */
export async function cancelPendingScheduleInTx(
  tx: ScheduleTx,
  communityId: number,
): Promise<{ id: number; scheduledFor: string } | null> {
  const result = (await tx.execute(sql`
    UPDATE site_publish_schedules
       SET status = 'canceled', updated_at = now()
     WHERE community_id = ${communityId}
       AND status = 'pending'
       AND deleted_at IS NULL
    RETURNING id, scheduled_for
  `)) as unknown as Array<{ id: number; scheduled_for: Date }>;

  const row = rowsOf<{ id: number; scheduled_for: Date }>(result)[0];
  return row ? { id: row.id, scheduledFor: new Date(row.scheduled_for).toISOString() } : null;
}

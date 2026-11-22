/**
 * What a deletion request's row means right now, for the Deletion Requests
 * Dashboard. The stored `status` alone hides three in-between states that the
 * lifecycle can leave behind, each of which needs a different operator action.
 */
import type { AdminDeletionRequest, DeletionStatus } from '@/lib/server/deletion-requests';

export type DeletionRequestDisplayState =
  | DeletionStatus
  /** `soft_deleted`, but the target is not deleted: nothing to recover. */
  | 'stale'
  /** `purged` with a null `purged_at`: a purge claimed it and has not finished (retried nightly). */
  | 'purging'
  /** `recovered` with a null `recovered_at`: a recovery claimed it and did not finish. Recover resumes it. */
  | 'recovery_unfinished';

export function deletionRequestDisplayState(
  request: Pick<AdminDeletionRequest, 'status' | 'purgedAt' | 'recoveredAt' | 'targetDeleted'>,
): DeletionRequestDisplayState {
  if (request.status === 'purged' && request.purgedAt === null) return 'purging';
  if (request.status === 'recovered' && request.recoveredAt === null) return 'recovery_unfinished';
  // Only a known "not deleted" makes a row stale; an unknown target keeps the
  // Recover button, and the route refuses a stale row anyway.
  if (request.status === 'soft_deleted' && request.targetDeleted === false) return 'stale';
  return request.status;
}

/** Whether the Dashboard offers Recover (or Resume recovery) on this row. */
export function canRecover(state: DeletionRequestDisplayState): boolean {
  return state === 'soft_deleted' || state === 'recovery_unfinished';
}

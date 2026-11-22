/**
 * The account-deletion timeline, in one place.
 *
 * `account-lifecycle-service.ts` computes the dates from these, and the
 * deletion emails quote dates computed from the same numbers, so the email can
 * never promise a different schedule from the one the cron runs. The help
 * articles (`content/help/{resident,manager}/account/delete-account.mdx`)
 * state the same two numbers in prose.
 *
 *   request ──30 days (cooling, account still works, user can cancel)──▶
 *   soft delete (sign-in banned; support can restore) ──6 months──▶
 *   purge (name, email, phone, avatar erased)
 */
import { addDays, addMonths, subMonths } from 'date-fns';

export const DELETION_COOLING_DAYS = 30;
export const DELETION_PURGE_DELAY_MONTHS = 6;

/** When a request made at `requestedAt` leaves its cooling period. */
export function deletionCoolingEndsAt(requestedAt: Date): Date {
  return addDays(requestedAt, DELETION_COOLING_DAYS);
}

/** When an account soft-deleted at `softDeletedAt` is purged. */
export function deletionPurgeAt(softDeletedAt: Date): Date {
  return addMonths(softDeletedAt, DELETION_PURGE_DELAY_MONTHS);
}

/**
 * The latest soft-delete time whose purge is due at `now`: an account deleted
 * at or before this has had its full recovery window. At a month end this can
 * be a few days later than `deletionPurgeAt` would give, never earlier.
 */
export function deletionPurgeCutoff(now: Date): Date {
  return subMonths(now, DELETION_PURGE_DELAY_MONTHS);
}

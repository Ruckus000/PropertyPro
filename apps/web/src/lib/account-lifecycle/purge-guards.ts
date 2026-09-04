/**
 * Guards for the irreversible phase of the account-lifecycle cron.
 *
 * These live outside `route.ts` for two reasons. A Next.js App Router route
 * module may only export its HTTP verbs and a fixed set of config symbols, so a
 * `PURGE_SAFETY_CAP` export there is not a thing the framework allows. And
 * keeping them here makes them directly unit-testable without constructing a
 * request — `readPurgeDryRun` takes `URLSearchParams`, not a `NextRequest`, so
 * nothing in this file imports the framework at all.
 */
import { ValidationError } from '@/lib/api/errors';

/**
 * Refuse to purge at all when the candidate set is larger than this.
 *
 * Sized against reality rather than guessed: production holds ONE
 * `soft_deleted` deletion request. A purge lands six months after a soft-delete
 * that is itself thirty days after the request, so the daily candidate set is a
 * trickle. 50 is ~50x any plausible day, and still trips instantly on the
 * failure it exists to catch — a predicate regression in
 * `findPurgeReadyDeletionRequests` (drop its `scheduledPurgeAt < now` clause and
 * EVERY soft-deleted row becomes a candidate).
 *
 * Not env-overridable, deliberately. If it ever trips legitimately, raising it
 * is a decision that deserves a reviewer, not a dashboard toggle.
 */
export const PURGE_SAFETY_CAP = 50;

/** Keys that mean `purgeDryRun`, once case and separators are normalised. */
const DRY_RUN_KEY = 'purgedryrun';

/**
 * Read the `purgeDryRun` flag from a query string.
 *
 * The key match is TOLERANT and the value match is STRICT, and that asymmetry
 * is the entire point. If `?purgedryrun=1` silently meant "live", an operator
 * who believed they were dry-running would trigger an irreversible purge on a
 * typo — so every plausible misspelling of the key lands on the SAFE mode,
 * while an unrecognised VALUE is rejected rather than defaulted.
 *
 * Absent or empty means live, which is what the scheduled cron sends.
 */
export function readPurgeDryRun(params: URLSearchParams): boolean {
  let raw: string | null = null;
  for (const [key, value] of params) {
    if (key.toLowerCase().replace(/[-_]/g, '') === DRY_RUN_KEY) raw = value;
  }

  if (raw === null || raw === '') return false;

  const normalized = raw.toLowerCase();
  if (normalized === '1' || normalized === 'true') return true;
  if (normalized === '0' || normalized === 'false') return false;

  throw new ValidationError(
    `purgeDryRun must be one of 1, 0, true, false — got "${raw}". ` +
      'Refusing rather than defaulting to a live purge.',
  );
}

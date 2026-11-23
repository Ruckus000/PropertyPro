/**
 * The compliance clock: one checklist row's status and time-left state,
 * decided by exact elapsed milliseconds.
 *
 * Lives in packages/shared so the web app (Compliance page, PM portfolio) and
 * the admin console score a community with the same rule. Keep it pure: no
 * I/O, no app imports.
 */
import { addMonths, isAfter, isBefore } from 'date-fns';
import { calculatePostingDeadline } from '../posting-deadline';

export type ComplianceStatus = 'satisfied' | 'unsatisfied' | 'overdue' | 'not_applicable';

export interface ComplianceStatusInput {
  isApplicable?: boolean;
  documentId?: number | null;
  /**
   * When the checklist row recorded its file as posted. Only a fallback now:
   * the linked document's own `posted_at` (`documentPublishedAt`) is what owners
   * saw, and a manual link used to stamp "now" here even for an old file
   * (audit 2026-11-05, H-2).
   */
  documentPostedAt?: Date | null;
  /** The linked document's own `posted_at`: when owners could first open it. */
  documentPublishedAt?: Date | null;
  /**
   * The linked document's `received_at`: when the association received or
   * created the record. The 30-day posting clock runs from here
   * (§718.111(12)(g)1.). Null = not recorded, and no lateness is claimed.
   */
  documentReceivedAt?: Date | null;
  /**
   * If the linked document was soft-deleted, this is the document's
   * `deleted_at` timestamp. The calculator treats a deleted document as
   * if the item were unlinked (defense-in-depth — the canonical fix is
   * to null out the FK on document soft-delete, but a race during read
   * is still possible).
   */
  documentDeletedAt?: Date | null;
  /**
   * The linked document is a DRAFT (`posted_at` NULL): owners cannot see it,
   * so it is not posted and cannot satisfy the item. Same read-time treatment
   * as a soft-deleted document.
   */
  documentIsDraft?: boolean;
  /**
   * The row's setup clock: when a record still missing should be posted by.
   * Generated with the checklist; it measures getting a file up at all, not
   * when a particular record was received.
   */
  deadline?: Date | null;
  rollingWindowMonths?: number | null;
  /**
   * A record replaced every year (budget, financial report, insurance). One
   * more than `YEARLY_RECORD_CYCLE_MONTHS` old is out of its window.
   */
  yearlyCycle?: boolean;
  /** Whether the clock is the statute's or a product default (HOA rows). */
  basis?: ClockBasis;
  now?: Date;
}

/**
 * The state of an item's clock, in the closed set of the design direction's
 * time-left chip (page-anatomy spec §12). Decided here, by exact elapsed
 * milliseconds against the deadline, so a formatter can never disagree:
 *
 * - `open`: the deadline is ahead. Whether that reads "N days left" or "due
 *   today" is the shared formatter's calendar arithmetic, not this module's.
 * - `overdue`: the deadline passed and nothing was posted.
 * - `met`: posted on time, or posted with no known clock. Shows no chip.
 * - `met_late`: posted after its deadline. Fixed: `deadline` and `postedAt`
 *   say by how much, and it does not keep counting.
 * - `out_of_window`: the record has aged out (a yearly record over a year old,
 *   or a rolling-window record older than its window). A newer one is needed.
 * - `no_clock`: something is owed but no statutory deadline can be computed
 *   (minutes of a held meeting, or a row with no setup clock).
 * - `not_applicable`: the manager marked it "does not apply".
 */
export type ChecklistClockState =
  | 'open'
  | 'overdue'
  | 'met'
  | 'met_late'
  | 'out_of_window'
  | 'no_clock'
  | 'not_applicable';

/**
 * `statute`: the deadline is the statute's (§718 rows, meeting notices).
 * `product_default`: the product applies it, the statute does not (§720 has no
 * general 30-day posting rule and no minutes-posting item). Never shown with a
 * statute citation.
 */
export type ClockBasis = 'statute' | 'product_default';

export interface ChecklistClock {
  state: ChecklistClockState;
  /** The instant that decides the state, never a rounded day count. */
  deadline: string | null;
  /** When the record was posted, for `met` / `met_late` / `out_of_window`. */
  postedAt: string | null;
  basis: ClockBasis;
}

export interface ComplianceStatusResult {
  status: ComplianceStatus;
  clock: ChecklistClock;
}

/** How long a yearly record stays current. */
export const YEARLY_RECORD_CYCLE_MONTHS = 12;

/**
 * How long a record posted late keeps the item overdue: the same 12 months a
 * missed meeting notice counts (meeting-notice-status.ts). After that it is
 * still `met_late` as a fact, but no longer lowers the score.
 */
export const LATE_POSTING_COUNTS_MONTHS = 12;

/**
 * Rolling window start boundary for compliance checks.
 */
export function calculateRollingWindowStart(referenceDate: Date, months: number = 12): Date {
  return addMonths(referenceDate, -months);
}

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

/**
 * Compute an item's status and clock at query time.
 *
 * A linked record is judged against ITS OWN clock: posted (the document's
 * `posted_at`) within 30 days of when it was received or created. The row's
 * setup deadline only measures a record that is still missing. Before H-2 the
 * row's deadline — generation time + 30 days, set once — judged every file, so
 * next year's budget never had a deadline and a late link read as overdue
 * forever.
 */
export function calculateComplianceClock(input: ComplianceStatusInput): ComplianceStatusResult {
  const now = input.now ?? new Date();
  const basis = input.basis ?? 'statute';
  const clock = (
    state: ChecklistClockState,
    deadline: Date | null = null,
    postedAt: Date | null = null,
  ): ChecklistClock => ({ state, deadline: iso(deadline), postedAt: iso(postedAt), basis });

  if (input.isApplicable === false) {
    return { status: 'not_applicable', clock: clock('not_applicable') };
  }

  // A soft-deleted document cannot satisfy a checklist item. Treat as if
  // the FK had been cleared (the canonical fix is to null out the FK in
  // the same transaction as the document soft-delete; this branch is the
  // read-time defense-in-depth check).
  const documentEffectivelyLinked =
    input.documentId != null && input.documentDeletedAt == null && input.documentIsDraft !== true;

  if (documentEffectivelyLinked) {
    const postedAt = input.documentPublishedAt ?? input.documentPostedAt ?? null;
    const receivedAt = input.documentReceivedAt ?? null;

    // Late first: a posting that missed its own deadline stays overdue for a
    // year whatever else is true of the record. Checked before the yearly
    // cycle, so moving a received date EARLIER (the only direction it may
    // move) can never turn "posted late" into a quieter "out of date".
    const recordDeadline = receivedAt ? calculatePostingDeadline(receivedAt) : null;
    // Exact milliseconds: posting AT the deadline is on time.
    const postedLate = recordDeadline !== null && postedAt !== null && isAfter(postedAt, recordDeadline);
    const lateStillCounts =
      postedLate && !isBefore(postedAt!, calculateRollingWindowStart(now, LATE_POSTING_COUNTS_MONTHS));
    if (lateStillCounts) {
      // A late posting does not retroactively satisfy the item.
      return { status: 'overdue', clock: clock('met_late', recordDeadline, postedAt) };
    }

    // A yearly record over a year old: next year's is owed. No deadline is
    // invented for it — when next year's was adopted is unknown until it is
    // uploaded — so it is unsatisfied, not "N days overdue".
    const cycleStart = calculateRollingWindowStart(now, YEARLY_RECORD_CYCLE_MONTHS);
    // The EARLIER of the two dates: a record cannot be posted before the
    // association had it, so a received date later than the posting (typed or
    // mistaken) must not make a year-old record read as this year's.
    const recordedAt =
      receivedAt && postedAt
        ? new Date(Math.min(receivedAt.getTime(), postedAt.getTime()))
        : (receivedAt ?? postedAt);
    if (input.yearlyCycle && recordedAt && isBefore(recordedAt, cycleStart)) {
      return { status: 'unsatisfied', clock: clock('out_of_window', null, postedAt) };
    }

    if (input.rollingWindowMonths && postedAt) {
      const windowStart = calculateRollingWindowStart(now, input.rollingWindowMonths);
      if (isBefore(postedAt, windowStart)) {
        return { status: 'overdue', clock: clock('out_of_window', null, postedAt) };
      }
    }

    if (recordDeadline !== null && postedAt !== null) {
      // Late more than a year ago: still a fact, no longer in the score.
      return {
        status: 'satisfied',
        clock: clock(postedLate ? 'met_late' : 'met', recordDeadline, postedAt),
      };
    }

    // No received date: the record is on the website, and nothing says when
    // it was received, so no lateness is claimed.
    return { status: 'satisfied', clock: clock('met', null, postedAt) };
  }

  if (input.deadline && isAfter(now, input.deadline)) {
    return { status: 'overdue', clock: clock('overdue', input.deadline) };
  }
  if (input.deadline) {
    return { status: 'unsatisfied', clock: clock('open', input.deadline) };
  }
  return { status: 'unsatisfied', clock: clock('no_clock') };
}

/**
 * The status alone; see `calculateComplianceClock`.
 */
export function calculateComplianceStatus(input: ComplianceStatusInput): ComplianceStatus {
  return calculateComplianceClock(input).status;
}

/** The "due soon" horizon: an unsatisfied item due within 7 days needs attention. */
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

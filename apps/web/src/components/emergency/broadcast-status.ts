import type { StatusGlyphKind } from '@propertypro/ui/components/shared/status-glyph';

/**
 * Pure helpers shared by the Emergency Alerts list and detail pages.
 */

/** The scheduling fields a manager's row or report carries; absent for a resident. */
export interface BroadcastStatusInput {
  canceledAt: string | null;
  completedAt: string | null;
  scheduledFor?: string | null;
  sendClaimedAt?: string | null;
  sendOutcome?: string | null;
}

/**
 * One status for a broadcast, shared by the list and detail pages.
 * Precedence: Canceled, Sent, Missed, Did not send, Sending (claimed by the
 * job, no result yet), Scheduled, then Draft.
 * The detail page words an unsent immediate alert "Pending" (its banner says
 * "pending confirmation"); pass `unsentWord` there. The list keeps "Draft".
 *
 * Missed and Did not send take the filled problem mark, Scheduled the dashed
 * "not started" ring; the word is always shown beside or instead of the glyph.
 */
export function broadcastStatus(
  b: BroadcastStatusInput,
  opts: { unsentWord?: string } = {},
): {
  kind: StatusGlyphKind;
  word: string;
} {
  if (b.canceledAt) return { kind: 'not-started', word: 'Canceled' };
  if (b.completedAt) return { kind: 'done', word: 'Sent' };
  if (b.sendOutcome === 'missed') return { kind: 'overdue', word: 'Missed' };
  if (b.sendOutcome === 'failed') return { kind: 'overdue', word: 'Did not send' };
  if (b.sendClaimedAt) return { kind: 'in-progress', word: 'Sending' };
  if (b.scheduledFor) return { kind: 'not-started', word: 'Scheduled' };
  return { kind: 'in-progress', word: opts.unsentWord ?? 'Draft' };
}

/**
 * Why a scheduled alert was missed or did not send, in plain words. The stored
 * reason is a machine word or an error class name; a class name is never shown.
 */
export function sendOutcomeReasonText(reason: string | null | undefined): string {
  switch (reason) {
    case 'late':
      return 'The send time passed while the system was unavailable.';
    case 'community_deleted':
      return 'The community was deleted before the send time.';
    case 'interrupted':
      return 'Sending was interrupted before it finished.';
    default:
      return 'Something went wrong while sending.';
  }
}

export const capitalise = (s: string) => (s === '' ? s : s.charAt(0).toUpperCase() + s.slice(1));

/** "Mar 1, 2026, 9:30 PM" in the community time zone. */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}

/** "Mar 1, 2026" in the community time zone. */
export function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone }).format(new Date(iso));
}

/** "Mon, Mar 9, 2026, 9:00 AM EDT" in the community time zone. */
export function formatDateTimeWithZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  }).format(new Date(iso));
}

/** "Eastern Time (America/New_York)": the zone's everyday name and its identifier. */
export function timeZoneLabel(timeZone: string): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longGeneric' })
    .formatToParts(new Date())
    .find((part) => part.type === 'timeZoneName')?.value;
  return name ? `${name} (${timeZone})` : timeZone;
}

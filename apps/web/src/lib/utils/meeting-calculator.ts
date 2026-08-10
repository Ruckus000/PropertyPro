import { isWeekend, previousFriday, startOfDay } from 'date-fns';
import type { CommunityType } from '@propertypro/shared';

export type MeetingType = 'board' | 'annual' | 'special' | 'budget' | 'committee';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Weekend policy: every deadline this module produces is a "post this BY"
 * deadline, so the only safe direction to move one is EARLIER.
 *
 * This used to roll forward to Monday. For a notice lead time that is
 * catastrophic: a Monday 00:00 board meeting has its 48-hour deadline land on
 * Saturday, and rolling that forward to Monday 00:00 produced *zero hours* of
 * notice while the UI reported the association as on track. Owner meetings lost
 * two of their fourteen statutory days the same way.
 *
 * Rolling backward can only ever give the association more margin than the
 * statute demands, which also makes the (server-local) weekday evaluation below
 * a presentation nicety rather than a compliance risk — see the timezone note
 * in `calculateNoticePostBy`.
 */
function adjustWeekendBackward(deadline: Date): Date {
  const dayStart = startOfDay(deadline);
  if (!isWeekend(dayStart)) return deadline;
  return previousFriday(dayStart);
}

/**
 * Subtract an exact elapsed duration.
 *
 * Deliberately NOT `date-fns` `subDays`/`addDays`: those move the local
 * calendar day and therefore return 23- or 25-hour "days" across a DST
 * transition. §718.112(2)(c) speaks in *continuous hours*, and a 30-day
 * posting window that silently shrinks to 719 hours every March is an
 * off-by-one against a paying customer.
 */
function shiftDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * Lead days required for meeting notice by meeting type and community type.
 * - Board/committee: 48 hours (2 days)
 * - Annual/special/budget: 14 days (owner meetings)
 */
export function getNoticeLeadDays(
  meetingType: MeetingType,
  _communityType: CommunityType,
): number {
  if (meetingType === 'board' || meetingType === 'committee') return 2;
  return 14; // annual, special, budget
}

/**
 * Calculate the latest post-by timestamp to satisfy notice lead time.
 * Stored/displayed as UTC; presentation converts to community timezone.
 *
 * KNOWN LIMITATION (documented, not fixed here): the weekend check runs in the
 * *server's* local timezone, not the community's `timezone` column, so a
 * deadline within a few hours of local midnight can roll on one host and not on
 * another. Since the roll now only ever moves the deadline earlier, the worst
 * case is up to two extra days of margin — never a statutory shortfall.
 * Threading the community timezone through every caller is the real fix and is
 * a product decision (it also has to settle whether the weekend rule should
 * survive at all, since neither §718 nor §720 grants a weekend exception).
 */
export function calculateNoticePostBy(
  meetingStartsAt: Date,
  meetingType: MeetingType,
  communityType: CommunityType,
): Date {
  const leadDays = getNoticeLeadDays(meetingType, communityType);
  const raw = shiftDays(meetingStartsAt, -leadDays);
  return adjustWeekendBackward(raw);
}

/**
 * Deadline for owner vote documents — 7 days before the meeting.
 */
export function calculateOwnerVoteDocsDeadline(meetingStartsAt: Date): Date {
  const raw = shiftDays(meetingStartsAt, -7);
  return adjustWeekendBackward(raw);
}

/**
 * Convenience: minutes posting deadline — align with compliance 30-day rule.
 *
 * 30 days is a statutory MAXIMUM with no weekend exception, so — unlike the
 * lead-time deadlines above — no weekend adjustment is applied. Rolling forward
 * (the pre-audit behaviour) advertised day 32; rolling backward would advertise
 * day 28. Both misstate the statute, so the deadline is simply the statute.
 * Mirrors `calculatePostingDeadline` in `compliance-calculator.ts`.
 */
export function calculateMinutesPostingDeadline(meetingStartsAt: Date): Date {
  return shiftDays(meetingStartsAt, 30);
}


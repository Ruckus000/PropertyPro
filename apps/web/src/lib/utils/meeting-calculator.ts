import type { CommunityType } from '@propertypro/shared';

export type MeetingType = 'board' | 'annual' | 'special' | 'budget' | 'committee';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * There is no weekend rule. Every deadline here is exactly the statute.
 *
 * A weekend adjustment used to live in this module. It arrived with the initial
 * scaffolding rather than as a decision, and **neither §718 nor §720 grants a
 * weekend exception** — so any roll misstates the statute in one direction or
 * the other. The 2026-08-09 audit removed it from the 30-day maximums for that
 * reason (rolling forward advertised day 32 as compliant); this module's
 * lead-time deadlines are now consistent with them.
 *
 * Deleting it also removed the last timezone dependency in the deadline math.
 * The rule ran `startOfDay`/`isWeekend`/`previousFriday`, all of which evaluate
 * in the **process's** local zone — Eastern on a dev Mac, UTC on Vercel — so the
 * same Miami meeting could yield different deadlines on different hosts
 * (issue #931). Everything below is exact elapsed milliseconds and therefore
 * host-independent, which is why threading `communities.timezone` through the
 * calculators turned out to be unnecessary.
 *
 * One further quiet bug went with it: `previousFriday` returns local midnight,
 * so a rolled deadline silently lost its time-of-day.
 *
 * A deadline may now land on a Saturday. That is the statute. An association
 * that posts notices by mail rather than to the website should schedule with its
 * own margin; the product must not invent one and call it law.
 */

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
 * Latest post-by timestamp that still satisfies the notice lead time — exactly
 * the statutory minimum before the meeting, to the millisecond.
 *
 * Stored/displayed as UTC; presentation converts to the community timezone. The
 * value itself is timezone-independent (see the note at the top of this file).
 */
export function calculateNoticePostBy(
  meetingStartsAt: Date,
  meetingType: MeetingType,
  communityType: CommunityType,
): Date {
  const leadDays = getNoticeLeadDays(meetingType, communityType);
  return shiftDays(meetingStartsAt, -leadDays);
}

/**
 * Deadline for owner vote documents — exactly 7 days before the meeting.
 */
export function calculateOwnerVoteDocsDeadline(meetingStartsAt: Date): Date {
  return shiftDays(meetingStartsAt, -7);
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


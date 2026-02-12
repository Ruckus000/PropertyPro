import { addDays, isWeekend, nextMonday, startOfDay, subDays } from 'date-fns';
import type { CommunityType } from '@propertypro/shared';

export type MeetingType = 'board' | 'annual' | 'special' | 'budget' | 'committee';

/** Weekend policy: deadlines landing on weekends roll forward to Monday. */
function adjustWeekendForward(deadline: Date): Date {
  const dayStart = startOfDay(deadline);
  if (!isWeekend(dayStart)) return deadline;
  return nextMonday(dayStart);
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
 */
export function calculateNoticePostBy(
  meetingStartsAt: Date,
  meetingType: MeetingType,
  communityType: CommunityType,
): Date {
  const leadDays = getNoticeLeadDays(meetingType, communityType);
  const raw = subDays(meetingStartsAt, leadDays);
  return adjustWeekendForward(raw);
}

/**
 * Deadline for owner vote documents — 7 days before the meeting.
 */
export function calculateOwnerVoteDocsDeadline(meetingStartsAt: Date): Date {
  const raw = subDays(meetingStartsAt, 7);
  return adjustWeekendForward(raw);
}

/**
 * Convenience: minutes posting deadline — align with compliance 30-day rule.
 */
export function calculateMinutesPostingDeadline(meetingStartsAt: Date): Date {
  const raw = addDays(meetingStartsAt, 30);
  return adjustWeekendForward(raw);
}


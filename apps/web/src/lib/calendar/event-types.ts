import type { AssessmentLineItemStatus } from '@/lib/services/finance-service';
import type { MeetingType } from '@/lib/utils/meeting-calculator';
import { utcDateToWallClockValue } from '@/lib/utils/zoned-datetime';

export interface CalendarMeetingEvent {
  type: 'meeting';
  id: number;
  title: string;
  meetingType: MeetingType;
  startsAt: string;
  endsAt: string | null;
  location: string;
}

export interface CalendarAssessmentEvent {
  type: 'assessment_due';
  dueDate: string;
  assessmentTitle: string;
  assessmentId: number;
  unitCount: number;
  pendingCount: number;
  totalAmountCents: number;
}

export interface CalendarMyAssessmentEvent {
  type: 'my_assessment_due';
  dueDate: string;
  assessmentTitle: string;
  assessmentId: number;
  amountCents: number;
  status: AssessmentLineItemStatus;
  unitLabel: string;
}

export type CalendarEvent =
  | CalendarMeetingEvent
  | CalendarAssessmentEvent
  | CalendarMyAssessmentEvent;

export const MEETING_TYPE_TOKENS: Record<
  MeetingType,
  { badgeVariant: 'info' | 'success' | 'warning' | 'neutral'; label: string }
> = {
  board: { badgeVariant: 'info', label: 'Board' },
  annual: { badgeVariant: 'success', label: 'Annual' },
  special: { badgeVariant: 'warning', label: 'Special' },
  budget: { badgeVariant: 'neutral', label: 'Budget' },
  committee: { badgeVariant: 'info', label: 'Committee' },
};

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Resolve meeting end time, falling back to startsAt + 1 hour when null. */
export function resolveEndsAt(startsAt: Date, endsAt?: Date | string | null): Date {
  if (endsAt instanceof Date) return endsAt;
  if (typeof endsAt === 'string') return new Date(endsAt);
  return new Date(startsAt.getTime() + ONE_HOUR_MS);
}

const BADGE_VARIANT_TO_DOT_CLASS: Record<string, string> = {
  info: 'bg-[var(--status-info)]',
  success: 'bg-[var(--status-success)]',
  warning: 'bg-[var(--status-warning)]',
  neutral: 'bg-[var(--status-neutral)]',
};

/** CSS class for the colored dot indicator on the calendar grid. */
export function meetingTypeDotClass(meetingType: string): string {
  const token = MEETING_TYPE_TOKENS[meetingType as MeetingType];
  return token
    ? BADGE_VARIANT_TO_DOT_CLASS[token.badgeVariant] ?? 'bg-[var(--status-info)]'
    : 'bg-[var(--status-info)]';
}

export function getCalendarEventDateKey(
  event: CalendarEvent,
  timeZone: string,
): string {
  if (event.type === 'meeting') {
    return utcDateToWallClockValue(new Date(event.startsAt), timeZone).slice(0, 10);
  }

  return event.dueDate;
}

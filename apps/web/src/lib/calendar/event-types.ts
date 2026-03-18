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

export function getCalendarEventDateKey(
  event: CalendarEvent,
  timeZone: string,
): string {
  if (event.type === 'meeting') {
    return utcDateToWallClockValue(new Date(event.startsAt), timeZone).slice(0, 10);
  }

  return event.dueDate;
}

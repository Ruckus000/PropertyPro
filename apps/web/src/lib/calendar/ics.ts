import { resolveEndsAt } from '@/lib/calendar/event-types';

export interface IcsMeetingInput {
  id: number;
  title: string;
  meetingType: string;
  startsAt: Date;
  endsAt?: Date | null;
  location: string;
  description?: string;
}

export interface IcsAssessmentInput {
  assessmentId: number;
  dueDate: string;
  title: string;
  description?: string;
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function toIcsTimestamp(date: Date): string {
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  const hour = pad2(date.getUTCHours());
  const minute = pad2(date.getUTCMinutes());
  const second = pad2(date.getUTCSeconds());
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

function toIcsDate(dateOnly: string): string {
  return dateOnly.replaceAll('-', '');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * Fold a content line per RFC 5545 §3.1: lines SHOULD NOT exceed 75 octets.
 * Long lines are split with CRLF followed by a single space continuation.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let offset = 0;
  while (offset < line.length) {
    const chunkSize = offset === 0 ? 75 : 74; // continuation lines lose 1 char to leading space
    parts.push(line.slice(offset, offset + chunkSize));
    offset += chunkSize;
  }
  return parts.join('\r\n ');
}

export function buildCalendarIcs(
  meetings: readonly IcsMeetingInput[],
  assessments: readonly IcsAssessmentInput[],
  options?: {
    calendarName?: string;
    productId?: string;
    generatedAt?: Date;
  },
): string {
  const generatedAt = options?.generatedAt ?? new Date();
  const calendarName = options?.calendarName ?? 'PropertyPro Calendar';
  const productId = options?.productId ?? '-//PropertyPro//Calendar//EN';

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${productId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];

  for (const meeting of meetings) {
    const endsAt = resolveEndsAt(meeting.startsAt, meeting.endsAt);

    lines.push(
      'BEGIN:VEVENT',
      `UID:meeting-${meeting.id}@getpropertypro.com`,
      `DTSTAMP:${toIcsTimestamp(generatedAt)}`,
      `DTSTART:${toIcsTimestamp(meeting.startsAt)}`,
      `DTEND:${toIcsTimestamp(endsAt)}`,
      `SUMMARY:${escapeIcsText(meeting.title)}`,
      `DESCRIPTION:${escapeIcsText(meeting.description ?? `Meeting type: ${meeting.meetingType}`)}`,
      `LOCATION:${escapeIcsText(meeting.location)}`,
      'END:VEVENT',
    );
  }

  for (const assessment of assessments) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:assessment-${assessment.assessmentId}-${assessment.dueDate}@getpropertypro.com`,
      `DTSTAMP:${toIcsTimestamp(generatedAt)}`,
      `DTSTART;VALUE=DATE:${toIcsDate(assessment.dueDate)}`,
      `SUMMARY:${escapeIcsText(assessment.title)}`,
      ...(assessment.description
        ? [`DESCRIPTION:${escapeIcsText(assessment.description)}`]
        : []),
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

export function buildMeetingsIcs(
  meetings: readonly IcsMeetingInput[],
  options?: {
    calendarName?: string;
    productId?: string;
    generatedAt?: Date;
  },
): string {
  return buildCalendarIcs(meetings, [], options);
}

export interface IcsMeetingInput {
  id: number;
  title: string;
  meetingType: string;
  startsAt: Date;
  location: string;
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

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function buildMeetingsIcs(
  meetings: readonly IcsMeetingInput[],
  options?: {
    calendarName?: string;
    productId?: string;
    generatedAt?: Date;
  },
): string {
  const generatedAt = options?.generatedAt ?? new Date();
  const calendarName = options?.calendarName ?? 'PropertyPro Meetings';
  const productId = options?.productId ?? '-//PropertyPro//Meetings//EN';

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${productId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];

  for (const meeting of meetings) {
    const startsAt = meeting.startsAt;
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    const uid = `meeting-${meeting.id}@propertyprofl.com`;
    const summary = escapeIcsText(meeting.title);
    const location = escapeIcsText(meeting.location);
    const description = escapeIcsText(`Meeting type: ${meeting.meetingType}`);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${toIcsTimestamp(generatedAt)}`,
      `DTSTART:${toIcsTimestamp(startsAt)}`,
      `DTEND:${toIcsTimestamp(endsAt)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

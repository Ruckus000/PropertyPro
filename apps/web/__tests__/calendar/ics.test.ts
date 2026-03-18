import { describe, expect, it } from 'vitest';
import { buildCalendarIcs, buildMeetingsIcs } from '../../src/lib/calendar/ics';

describe('calendar ICS builder', () => {
  it('builds a mixed meeting and assessment feed with DTSTART;VALUE=DATE assessment entries', () => {
    const ics = buildCalendarIcs(
      [
        {
          id: 1,
          title: 'Board Meeting',
          meetingType: 'board',
          startsAt: new Date('2026-04-18T14:00:00.000Z'),
          endsAt: new Date('2026-04-18T15:30:00.000Z'),
          location: 'Clubhouse',
        },
      ],
      [
        {
          assessmentId: 12,
          dueDate: '2026-04-20',
          title: 'Spring Assessment Due',
        },
      ],
      {
        generatedAt: new Date('2026-03-18T12:00:00.000Z'),
      },
    );

    expect(ics).toContain('UID:meeting-1@propertyprofl.com');
    expect(ics).toContain('DTEND:20260418T153000Z');
    expect(ics).toContain('UID:assessment-12-2026-04-20@propertyprofl.com');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260420');
  });

  it('falls back to a one-hour DTEND when a meeting has no explicit end time', () => {
    const ics = buildMeetingsIcs(
      [
        {
          id: 2,
          title: 'Special Meeting',
          meetingType: 'special',
          startsAt: new Date('2026-05-01T16:00:00.000Z'),
          location: 'Lobby',
        },
      ],
      {
        generatedAt: new Date('2026-03-18T12:00:00.000Z'),
      },
    );

    expect(ics).toContain('DTSTART:20260501T160000Z');
    expect(ics).toContain('DTEND:20260501T170000Z');
  });

  it('escapes commas, semicolons, backslashes, and newlines in text fields', () => {
    const ics = buildCalendarIcs(
      [
        {
          id: 3,
          title: 'Budget, Review; Session',
          meetingType: 'budget',
          startsAt: new Date('2026-06-10T14:00:00.000Z'),
          location: 'Room \\A\nSecond Floor',
          description: 'Line 1,\nLine 2; ready',
        },
      ],
      [],
      {
        generatedAt: new Date('2026-03-18T12:00:00.000Z'),
      },
    );

    expect(ics).toContain('SUMMARY:Budget\\, Review\\; Session');
    expect(ics).toContain('LOCATION:Room \\\\A\\nSecond Floor');
    expect(ics).toContain('DESCRIPTION:Line 1\\,\\nLine 2\\; ready');
  });
});

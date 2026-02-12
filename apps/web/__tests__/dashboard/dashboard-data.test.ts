import { describe, expect, it } from 'vitest';
import {
  selectRecentAnnouncements,
  selectUpcomingMeetings,
  toFirstName,
} from '../../src/lib/dashboard/dashboard-selectors';

describe('dashboard data helpers', () => {
  it('extracts first name safely', () => {
    expect(toFirstName('Jane Resident')).toBe('Jane');
    expect(toFirstName('')).toBe('Resident');
    expect(toFirstName(null)).toBe('Resident');
  });

  it('sorts announcements pinned first then newest', () => {
    const rows = [
      {
        id: 1,
        title: 'Old',
        body: 'body',
        isPinned: false,
        archivedAt: null,
        publishedAt: '2026-02-10T00:00:00.000Z',
      },
      {
        id: 2,
        title: 'Pinned',
        body: 'body',
        isPinned: true,
        archivedAt: null,
        publishedAt: '2026-02-09T00:00:00.000Z',
      },
    ] as never;

    const selected = selectRecentAnnouncements(rows);
    expect(selected[0]?.id).toBe(2);
  });

  it('keeps only upcoming meetings sorted ascending', () => {
    const now = Date.now();
    const rows = [
      {
        id: 1,
        title: 'Past',
        meetingType: 'board',
        startsAt: new Date(now - 60_000).toISOString(),
        location: 'A',
      },
      {
        id: 2,
        title: 'Soon',
        meetingType: 'board',
        startsAt: new Date(now + 60_000).toISOString(),
        location: 'B',
      },
      {
        id: 3,
        title: 'Later',
        meetingType: 'annual',
        startsAt: new Date(now + 120_000).toISOString(),
        location: 'C',
      },
    ] as never;

    const selected = selectUpcomingMeetings(rows);
    expect(selected.map((item) => item.id)).toEqual([2, 3]);
  });
});

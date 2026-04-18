import { describe, expect, it } from 'vitest';
import {
  buildViolationSummary,
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

  it('normalizes seeded meeting title artifacts on dashboard output', () => {
    const now = Date.now();
    const rows = [
      {
        id: 9,
        title: 'sunset-condos Board Meeting (48-hour notice)',
        meetingType: 'board',
        startsAt: new Date(now + 120_000).toISOString(),
        location: 'Clubhouse',
      },
    ] as never;

    const selected = selectUpcomingMeetings(rows);
    expect(selected[0]?.title).toBe('Board Meeting');
  });

  it('builds violation summaries from targeted aggregate rows', () => {
    const summary = buildViolationSummary(
      [
        { status: 'reported', count: 2 },
        { status: 'resolved', count: 1 },
      ],
      [
        {
          id: 7,
          unitId: 101,
          category: 'parking',
          status: 'reported',
          severity: 'moderate',
          createdAt: new Date('2026-02-10T00:00:00.000Z'),
        },
      ],
    );

    expect(summary.total).toBe(3);
    expect(summary.byStatus).toEqual({
      reported: 2,
      resolved: 1,
    });
    expect(summary.recentViolations[0]).toMatchObject({
      id: 7,
      unitId: 101,
      category: 'parking',
      status: 'reported',
      severity: 'moderate',
      createdAt: '2026-02-10T00:00:00.000Z',
    });
  });
});

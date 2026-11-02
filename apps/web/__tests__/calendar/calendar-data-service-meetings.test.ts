import { describe, expect, it, vi } from 'vitest';

const { selectFromMock } = vi.hoisted(() => ({ selectFromMock: vi.fn() }));

vi.mock('@propertypro/db', () => ({
  assessmentLineItems: {},
  assessments: {},
  units: {},
  meetings: {
    id: 'meetings.id',
    title: 'meetings.title',
    meetingType: 'meetings.meeting_type',
    startsAt: 'meetings.starts_at',
    endsAt: 'meetings.ends_at',
    location: 'meetings.location',
    noticePostedAt: 'meetings.notice_posted_at',
  },
  createScopedClient: () => ({ selectFrom: selectFromMock }),
}));
vi.mock('@propertypro/db/filters', () => ({
  and: (...c: unknown[]) => ({ __and: c }),
  asc: (c: unknown) => ({ __asc: c }),
  gte: (c: unknown, v: unknown) => ({ __gte: [c, v] }),
  lt: (c: unknown, v: unknown) => ({ __lt: [c, v] }),
  lte: vi.fn(),
  inArray: vi.fn(),
}));
vi.mock('@/lib/units/actor-units', () => ({ listActorUnitIds: vi.fn() }));

import { listCommunityCalendarMeetings } from '@/lib/services/calendar-data-service';

describe('listCommunityCalendarMeetings', () => {
  it('selects noticePostedAt', async () => {
    const noticePostedAt = new Date('2026-11-01T12:00:00.000Z');
    selectFromMock.mockReturnValue({
      orderBy: async () => [
        {
          id: 1,
          title: 'Board meeting',
          meetingType: 'board',
          startsAt: new Date('2026-11-10T23:00:00.000Z'),
          endsAt: null,
          location: 'Clubhouse',
          noticePostedAt,
        },
      ],
    });

    const rows = await listCommunityCalendarMeetings(7, {
      startUtc: new Date('2026-11-01T00:00:00.000Z'),
      endUtcExclusive: new Date('2026-12-01T00:00:00.000Z'),
    });

    const [, columns] = selectFromMock.mock.calls[0]!;
    expect(columns).toMatchObject({ noticePostedAt: 'meetings.notice_posted_at' });
    expect(rows[0]!.noticePostedAt).toBe(noticePostedAt);
  });
});

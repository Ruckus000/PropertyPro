/**
 * buildWeekAgenda (D16): seven community-timezone days. Pure: no DB, no mocks.
 */
import { describe, expect, it } from 'vitest';
import type { AttentionItem } from '@/lib/dashboard/attention-queue';
import type { DashboardHearing } from '@/lib/dashboard/load-dashboard-overview';
import type { CalendarMeetingRecord } from '@/lib/services/calendar-data-service';
import { buildWeekAgenda } from '@/lib/dashboard/week-agenda';

const TZ = 'America/New_York';
const NOW = new Date('2026-11-01T12:00:00.000Z'); // Sun 1 Nov, 07:00 in New York

function meeting(id: number, startsAtIso: string): CalendarMeetingRecord {
  return {
    id,
    title: `Meeting ${id}`,
    meetingType: 'board',
    startsAt: new Date(startsAtIso),
    endsAt: null,
    location: 'Clubhouse',
    noticePostedAt: null,
  };
}

function item(over: Partial<AttentionItem> & { id: string; kind: AttentionItem['kind'] }): AttentionItem {
  return {
    tier: 'urgent',
    title: over.id,
    detail: '',
    dueAt: null,
    action: { label: 'View', href: '/x' },
    ...over,
  };
}

const run = (over: Partial<Parameters<typeof buildWeekAgenda>[0]> = {}) =>
  buildWeekAgenda({ meetings30d: [], attention: [], hearings: null, now: NOW, timeZone: TZ, ...over });

describe('buildWeekAgenda', () => {
  it('always 7 days, today first and only today marked', () => {
    const days = run();
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.dateKey)).toEqual([
      '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07',
    ]);
    expect(days.map((d) => d.isToday)).toEqual([true, false, false, false, false, false, false]);
    expect(days[0]?.weekdayLabel).toBe('Sun 1');
  });

  it('buckets by community timezone, not UTC', () => {
    // 04:30Z on the 3rd is 23:30 on Mon the 2nd in New York.
    const days = run({ meetings30d: [meeting(1, '2026-11-03T04:30:00.000Z')] });
    expect(days[1]?.weekdayLabel).toBe('Mon 2');
    expect(days[1]?.entries.map((e) => e.id)).toEqual(['meeting:1']);
    expect(days[2]?.entries).toEqual([]);
  });

  it('the day count survives the DST fall-back (Nov 1 2026 has 25 hours)', () => {
    expect(run().map((d) => d.weekdayLabel)).toEqual(['Sun 1', 'Mon 2', 'Tue 3', 'Wed 4', 'Thu 5', 'Fri 6', 'Sat 7']);
  });

  it('drops meetings outside the 7 days', () => {
    const days = run({ meetings30d: [meeting(1, '2026-11-08T17:00:00.000Z'), meeting(2, '2026-10-31T17:00:00.000Z')] });
    expect(days.flatMap((d) => d.entries)).toEqual([]);
  });

  it('meetings are events, notice and hearing-notice items are deadlines, compliance rows are absent', () => {
    const days = run({
      meetings30d: [meeting(1, '2026-11-04T23:00:00.000Z')],
      attention: [
        item({ id: 'meeting_notice:1', kind: 'meeting_notice', title: 'Post notice for Meeting 1', dueAt: '2026-11-03T15:00:00.000Z' }),
        item({ id: 'hearing_notice:9', kind: 'hearing_notice', title: 'Send hearing notice', dueAt: '2026-11-05T15:00:00.000Z' }),
        item({ id: 'compliance:3', kind: 'compliance', title: 'Budget', dueAt: '2026-11-03T15:00:00.000Z' }),
        item({ id: 'meeting_notice:2', kind: 'meeting_notice', title: 'No date', dueAt: null }),
      ],
    });
    expect(days[2]?.entries).toEqual([
      { id: 'meeting_notice:1', label: 'Post notice for Meeting 1', kind: 'deadline', at: '2026-11-03T15:00:00.000Z' },
    ]);
    expect(days[3]?.entries).toEqual([
      { id: 'meeting:1', label: 'Meeting 1', kind: 'event', at: '2026-11-04T23:00:00.000Z' },
    ]);
    expect(days[4]?.entries.map((e) => e.kind)).toEqual(['deadline']);
    expect(days.flatMap((d) => d.entries).some((e) => e.id.startsWith('compliance'))).toBe(false);
  });

  it('hearing dates become Hearing events, and null hearings add nothing', () => {
    const hearings: DashboardHearing[] = [{ violationId: 5, unitLabel: 'Unit 4B', hearingDate: '2026-11-06T18:00:00.000Z' }];
    expect(run({ hearings })[5]?.entries).toEqual([
      { id: 'hearing:5', label: 'Hearing — Unit 4B', kind: 'event', at: '2026-11-06T18:00:00.000Z' },
    ]);
    expect(run({ hearings: null }).flatMap((d) => d.entries)).toEqual([]);
  });

  it('orders a day by time', () => {
    const days = run({ meetings30d: [meeting(2, '2026-11-02T22:00:00.000Z'), meeting(1, '2026-11-02T15:00:00.000Z')] });
    expect(days[1]?.entries.map((e) => e.id)).toEqual(['meeting:1', 'meeting:2']);
  });
});

/**
 * buildAttentionQueue: one ordered list from compliance, meeting-notice and
 * hearing-notice deadlines (D5-D10). Pure: no DB, no clock, no mocks.
 */
import { describe, expect, it } from 'vitest';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';
import type { DashboardHearing } from '@/lib/dashboard/load-dashboard-overview';
import type { CalendarMeetingRecord } from '@/lib/services/calendar-data-service';
import { needsAttention } from '@/lib/utils/compliance-calculator';
import { formatDeadlineStamp } from '@/lib/meetings/meeting-status';
import {
  buildAttentionQueue,
  countByTier,
  type AttentionItem,
} from '@/lib/dashboard/attention-queue';

const NOW = new Date('2026-11-02T15:00:00.000Z');
const TZ = 'America/New_York';
const DAY_MS = 86_400_000;
const COMMUNITY_ID = 7;

const inDays = (days: number): Date => new Date(NOW.getTime() + days * DAY_MS);

function checklistItem(over: Partial<ChecklistItemData> & { id: number }): ChecklistItemData {
  return {
    templateKey: `718_item_${over.id}`,
    title: `Item ${over.id}`,
    category: 'governing_documents',
    status: 'unsatisfied',
    deadline: null,
    ...over,
  };
}

function meeting(over: Partial<CalendarMeetingRecord> & { id: number }): CalendarMeetingRecord {
  return {
    title: `Meeting ${over.id}`,
    meetingType: 'board',
    startsAt: inDays(10),
    endsAt: null,
    location: 'Clubhouse',
    noticePostedAt: null,
    ...over,
  };
}

function hearing(over: Partial<DashboardHearing> & { violationId: number }): DashboardHearing {
  return { unitLabel: 'Unit 4B', hearingDate: inDays(30).toISOString(), ...over };
}

function build(
  over: Partial<Parameters<typeof buildAttentionQueue>[0]> = {},
): AttentionItem[] {
  return buildAttentionQueue({
    audience: 'manager',
    communityId: COMMUNITY_ID,
    communityType: 'condo_718',
    designation: null,
    checklist: [],
    meetings30d: [],
    hearings: [],
    now: NOW,
    timeZone: TZ,
    ...over,
  });
}

describe('buildAttentionQueue', () => {
  it('orders critical, urgent, aware, then dueAt, nulls last', () => {
    const items = build({
      checklist: [
        // aware, no deadline (board-action whitelist)
        checklistItem({ id: 5, templateKey: '718_affidavits' }),
        // urgent: due in 3 days
        checklistItem({ id: 2, deadline: inDays(3).toISOString() }),
        // critical, but its stored deadline is missing: tier rank, not null-last, decides
        checklistItem({ id: 9, status: 'overdue', deadline: null }),
        // critical: overdue since 3 days ago
        checklistItem({ id: 1, status: 'overdue', deadline: inDays(-3).toISOString() }),
      ],
      meetings30d: [
        // annual meeting in 25 days: post-by in 11 days -> aware
        meeting({ id: 20, meetingType: 'annual', startsAt: inDays(25) }),
        // board meeting tomorrow: post-by was yesterday -> critical
        meeting({ id: 10, meetingType: 'board', startsAt: inDays(1) }),
      ],
    });

    expect(items.map((i) => i.id)).toEqual([
      'compliance:1', // critical, earliest dueAt
      'meeting_notice:10', // critical, later dueAt
      'compliance:9', // critical, no dueAt: last of its tier
      'compliance:2', // urgent
      'meeting_notice:20', // aware, dated
      'compliance:5', // aware, no dueAt: last
    ]);
    expect(items.map((i) => i.tier)).toEqual([
      'critical',
      'critical',
      'critical',
      'urgent',
      'aware',
      'aware',
    ]);
  });

  it('compliance rows equal needsAttention', () => {
    const checklist = [
      checklistItem({ id: 1, status: 'overdue', deadline: inDays(-1).toISOString() }),
      checklistItem({ id: 2, deadline: inDays(5).toISOString() }),
      checklistItem({ id: 3, deadline: inDays(60).toISOString() }),
      checklistItem({ id: 4, status: 'satisfied', deadline: inDays(2).toISOString() }),
      checklistItem({ id: 5, templateKey: '718_affidavits' }),
      checklistItem({ id: 6, status: 'not_applicable' }),
    ];
    const items = build({ checklist });

    const expected = checklist.filter((i) => needsAttention(i, NOW)).map((i) => `compliance:${i.id}`);
    expect(items.map((i) => i.id).sort()).toEqual(expected.sort());

    const boardAction = items.find((i) => i.id === 'compliance:5');
    expect(boardAction).toMatchObject({
      tier: 'aware',
      dueAt: null,
      detail: 'Needs a board action',
    });
    const overdue = items.find((i) => i.id === 'compliance:1');
    expect(overdue?.detail).toBe(`Was due ${formatDeadlineStamp(inDays(-1), TZ)}`);
    const dueSoon = items.find((i) => i.id === 'compliance:2');
    expect(dueSoon?.detail).toBe(`Due ${formatDeadlineStamp(inDays(5), TZ)}`);
  });

  it('below-threshold checklist yields no deadline rows', () => {
    // Below the posting threshold the loader sends no deadlines: every item is
    // unsatisfied with deadline null, and only board-action items still count.
    const items = build({
      checklist: [
        checklistItem({ id: 1 }),
        checklistItem({ id: 2, templateKey: '718_minutes_rolling_12m' }),
        checklistItem({ id: 3 }),
      ],
    });
    expect(items.map((i) => i.id)).toEqual(['compliance:2']);
    expect(items.every((i) => i.dueAt === null)).toBe(true);
  });

  it('a null checklist or hearing source adds no rows', () => {
    expect(build({ checklist: null, hearings: null })).toEqual([]);
  });

  it('links go to /communities/{id}/compliance', () => {
    const items = build({
      checklist: [checklistItem({ id: 1, status: 'overdue', deadline: inDays(-1).toISOString() })],
    });
    expect(items[0]?.action.href).toBe(`/communities/${COMMUNITY_ID}/compliance`);
  });

  it('compliance action label comes from the CTA resolver, View when it returns none', () => {
    const checklist = [
      checklistItem({ id: 1, status: 'overdue', deadline: inDays(-1).toISOString() }),
    ];
    expect(build({ audience: 'manager', checklist })[0]?.action.label).toBe('Upload document');
    expect(
      build({ audience: 'manager', designation: 'board_member', checklist })[0]?.action.label,
    ).toBe('Link existing document');
    // read-only board seat with no document: resolver returns null
    expect(build({ audience: 'board', checklist })[0]?.action.label).toBe('View');
  });

  it('board audience gets View on notice and hearing rows', () => {
    const args = {
      meetings30d: [meeting({ id: 1, startsAt: inDays(4) })],
      hearings: [hearing({ violationId: 3, hearingDate: inDays(20).toISOString() })],
    };
    const manager = build({ audience: 'manager', ...args });
    const board = build({ audience: 'board', ...args });

    expect(manager.find((i) => i.kind === 'meeting_notice')?.action.label).toBe('Post notice');
    expect(manager.find((i) => i.kind === 'hearing_notice')?.action.label).toBe('Open case');
    expect(board.find((i) => i.kind === 'meeting_notice')?.action.label).toBe('View');
    expect(board.find((i) => i.kind === 'hearing_notice')?.action.label).toBe('View');
    expect(manager.find((i) => i.kind === 'meeting_notice')?.action.href).toBe(
      `/meetings/1?communityId=${COMMUNITY_ID}`,
    );
    expect(manager.find((i) => i.kind === 'hearing_notice')?.action.href).toBe(
      `/violations/3?communityId=${COMMUNITY_ID}`,
    );
  });

  it('board meeting window reads 48 hours, annual reads 14 days', () => {
    const items = build({
      meetings30d: [
        meeting({ id: 1, meetingType: 'board', startsAt: inDays(4) }),
        meeting({ id: 2, meetingType: 'annual', startsAt: inDays(20) }),
      ],
    });
    const board = items.find((i) => i.id === 'meeting_notice:1');
    const annual = items.find((i) => i.id === 'meeting_notice:2');

    expect(board?.title).toBe('Post notice for Meeting 1');
    expect(board?.detail).toBe(
      `48 hours before the meeting · post by ${formatDeadlineStamp(inDays(2), TZ)}`,
    );
    expect(annual?.detail).toBe(
      `14 days before the meeting · post by ${formatDeadlineStamp(inDays(6), TZ)}`,
    );
  });

  it('missed notice window is critical', () => {
    const [row] = build({ meetings30d: [meeting({ id: 1, startsAt: inDays(1) })] });
    expect(row).toMatchObject({ kind: 'meeting_notice', tier: 'critical' });
    expect(row?.dueAt).toBe(inDays(-1).toISOString());
  });

  it('noticed meeting is excluded', () => {
    expect(
      build({ meetings30d: [meeting({ id: 1, startsAt: inDays(1), noticePostedAt: inDays(-5) })] }),
    ).toEqual([]);
  });

  it('a notice with a calm post-by date is excluded', () => {
    // annual meeting in 46 days: post-by is 32 days out, past the aware band.
    expect(
      build({ meetings30d: [meeting({ id: 1, meetingType: 'annual', startsAt: inDays(46) })] }),
    ).toEqual([]);
  });

  it('hearing whose post-by passed is dropped', () => {
    const rows = build({
      hearings: [
        // 10 days out: the 14-day notice date was 4 days ago
        hearing({ violationId: 1, hearingDate: inDays(10).toISOString() }),
        // 20 days out: send by in 6 days -> urgent
        hearing({ violationId: 2, hearingDate: inDays(20).toISOString(), unitLabel: 'Unit 9' }),
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(['hearing_notice:2']);
    expect(rows[0]).toMatchObject({
      tier: 'urgent',
      title: 'Send hearing notice — Unit 9',
      detail: `14-day hearing notice · send by ${formatDeadlineStamp(inDays(6), TZ)}`,
      dueAt: inDays(6).toISOString(),
    });
  });

  it('a hearing whose send-by date is more than 30 days out is excluded', () => {
    expect(build({ hearings: [hearing({ violationId: 1, hearingDate: inDays(46).toISOString() })] })).toEqual([]);
  });
});

describe('countByTier', () => {
  it('counts each tier', () => {
    const items = build({
      checklist: [
        checklistItem({ id: 1, status: 'overdue', deadline: inDays(-1).toISOString() }),
        checklistItem({ id: 2, status: 'overdue', deadline: inDays(-2).toISOString() }),
        checklistItem({ id: 3, deadline: inDays(3).toISOString() }),
        checklistItem({ id: 4, templateKey: '718_affidavits' }),
      ],
    });
    expect(countByTier(items)).toEqual({ critical: 2, urgent: 1, aware: 1 });
    expect(countByTier([])).toEqual({ critical: 0, urgent: 0, aware: 0 });
  });
});

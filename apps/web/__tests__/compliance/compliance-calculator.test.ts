import { describe, expect, it } from 'vitest';
import {
  BOARD_ACTION_TEMPLATE_KEYS,
  needsAttention,
  buildComplianceSummary,
  sortByPriority,
  calculateComplianceStatus,
  calculatePostingDeadline,
  calculateRollingWindowStart,
} from '../../src/lib/utils/compliance-calculator';
import type { ChecklistItemData } from '../../src/components/compliance/compliance-checklist-item';

function makeItem(overrides: Partial<ChecklistItemData> = {}): ChecklistItemData {
  return {
    id: 1,
    templateKey: '718_declaration',
    title: 'Declaration',
    category: 'governing_documents',
    status: 'unsatisfied',
    documentId: null,
    documentPostedAt: null,
    deadline: null,
    rollingWindow: null,
    isConditional: false,
    isApplicable: true,
    ...overrides,
  };
}

describe('p1-09 compliance calculator', () => {
  it('marks checklist item satisfied when linked document exists', () => {
    const status = calculateComplianceStatus({
      documentId: 42,
      deadline: new Date('2026-03-01T00:00:00.000Z'),
      now: new Date('2026-02-20T00:00:00.000Z'),
    });

    expect(status).toBe('satisfied');
  });

  it('marks checklist item overdue when no document and deadline has passed', () => {
    const status = calculateComplianceStatus({
      documentId: null,
      deadline: new Date('2026-02-01T00:00:00.000Z'),
      now: new Date('2026-02-20T00:00:00.000Z'),
    });

    expect(status).toBe('overdue');
  });

  it('handles DST spring-forward deadline calculations without invalid timestamps', () => {
    const source = new Date('2026-03-08T01:30:00-05:00');
    const deadline = calculatePostingDeadline(source, 14);

    expect(Number.isNaN(deadline.getTime())).toBe(false);
    expect(deadline.toISOString().startsWith('2026-03-23')).toBe(true);
  });

  it('handles DST fall-back deadlines without duplicate/missing-hour errors', () => {
    const source = new Date('2026-11-01T01:30:00-04:00');
    const deadline = calculatePostingDeadline(source, 30);

    expect(Number.isNaN(deadline.getTime())).toBe(false);
    expect(deadline.toISOString().startsWith('2026-12-01')).toBe(true);
  });

  it('keeps leap-year and non-leap-year Jan 30 + 30 days consistent', () => {
    const leap = calculatePostingDeadline(new Date('2024-01-30T12:00:00.000Z'), 30);
    const nonLeap = calculatePostingDeadline(new Date('2025-01-30T12:00:00.000Z'), 30);

    expect(leap.toISOString().startsWith('2024-02-29')).toBe(true);
    expect(nonLeap.toISOString().startsWith('2025-03-03')).toBe(true);
  });

  it('applies weekend rollover policy to next Monday', () => {
    const deadline = calculatePostingDeadline(new Date('2026-01-08T12:00:00.000Z'), 30);

    expect(deadline.toISOString().startsWith('2026-02-09')).toBe(true);
  });

  it('reflects Florida timezone split as one-hour UTC difference', () => {
    const miamiDeadline = calculatePostingDeadline(new Date('2026-02-11T09:00:00-05:00'), 30);
    const pensacolaDeadline = calculatePostingDeadline(new Date('2026-02-11T09:00:00-06:00'), 30);

    expect(Math.abs(miamiDeadline.getTime() - pensacolaDeadline.getTime())).toBe(60 * 60 * 1000);
  });

  it('supports year-boundary deadline crossing', () => {
    const deadline = calculatePostingDeadline(new Date('2026-12-15T10:00:00.000Z'), 30);
    expect(deadline.toISOString().startsWith('2027-01-14')).toBe(true);
  });

  it('uses rolling 12-month window boundaries correctly', () => {
    const now = new Date('2026-12-01T00:00:00.000Z');
    const rollingStart = calculateRollingWindowStart(now, 12);

    const recentStatus = calculateComplianceStatus({
      documentId: 100,
      documentPostedAt: new Date('2026-08-01T00:00:00.000Z'),
      rollingWindowMonths: 12,
      now,
    });

    const staleStatus = calculateComplianceStatus({
      documentId: 100,
      documentPostedAt: new Date('2025-01-01T00:00:00.000Z'),
      rollingWindowMonths: 12,
      now,
    });

    expect(rollingStart.toISOString()).toBe('2025-12-01T00:00:00.000Z');
    expect(recentStatus).toBe('satisfied');
    expect(staleStatus).toBe('overdue');
  });
});

describe('BOARD_ACTION_TEMPLATE_KEYS', () => {
  it('contains 718_minutes_rolling_12m and 718_affidavits', () => {
    expect(BOARD_ACTION_TEMPLATE_KEYS.has('718_minutes_rolling_12m')).toBe(true);
    expect(BOARD_ACTION_TEMPLATE_KEYS.has('718_affidavits')).toBe(true);
  });

  it('contains 720_minutes_rolling_12m and 720_bids', () => {
    expect(BOARD_ACTION_TEMPLATE_KEYS.has('720_minutes_rolling_12m')).toBe(true);
    expect(BOARD_ACTION_TEMPLATE_KEYS.has('720_bids')).toBe(true);
  });
});

describe('needsAttention', () => {
  const now = new Date('2026-05-26T00:00:00.000Z');

  it('returns true for overdue items', () => {
    expect(needsAttention(makeItem({ status: 'overdue' }), now)).toBe(true);
  });

  it('returns true for unsatisfied items with deadline within 7 days (inclusive boundary)', () => {
    const boundary = new Date('2026-06-02T00:00:00.000Z'); // exactly +7d
    expect(needsAttention(makeItem({ status: 'unsatisfied', deadline: boundary.toISOString() }), now)).toBe(true);
  });

  it('returns false for unsatisfied items with deadline 8 days out', () => {
    const farther = new Date('2026-06-03T00:00:00.000Z');
    expect(needsAttention(makeItem({ status: 'unsatisfied', deadline: farther.toISOString() }), now)).toBe(false);
  });

  it('returns true for board-action whitelist items that are unsatisfied', () => {
    expect(
      needsAttention(makeItem({ templateKey: '718_minutes_rolling_12m', status: 'unsatisfied' }), now),
    ).toBe(true);
  });

  it('returns false for board-action whitelist items that are satisfied', () => {
    expect(
      needsAttention(makeItem({ templateKey: '718_minutes_rolling_12m', status: 'satisfied' }), now),
    ).toBe(false);
  });

  it('returns false for not_applicable regardless of templateKey', () => {
    expect(
      needsAttention(makeItem({ templateKey: '718_minutes_rolling_12m', status: 'not_applicable' }), now),
    ).toBe(false);
  });

  it('returns false for unsatisfied items with no deadline that are NOT board-action', () => {
    expect(needsAttention(makeItem({ status: 'unsatisfied', deadline: null }), now)).toBe(false);
  });
});

describe('buildComplianceSummary', () => {
  const now = new Date('2026-05-26T00:00:00.000Z');

  it('returns 100% readiness for empty input', () => {
    const s = buildComplianceSummary([], now);
    expect(s.readiness).toEqual({ satisfied: 0, applicableTotal: 0, percentage: 100 });
    expect(s.postingWindowsDueSoonCount).toBe(0);
    expect(s.overdueCount).toBe(0);
    expect(s.needsBoardActionCount).toBe(0);
    expect(s.attentionCount).toBe(0);
  });

  it('returns 100% readiness when all items are not_applicable', () => {
    const items = [
      makeItem({ id: 1, status: 'not_applicable' }),
      makeItem({ id: 2, status: 'not_applicable' }),
    ];
    const s = buildComplianceSummary(items, now);
    expect(s.readiness.applicableTotal).toBe(0);
    expect(s.readiness.percentage).toBe(100);
  });

  it('counts satisfied / applicableTotal correctly with mixed statuses', () => {
    const items = [
      makeItem({ id: 1, status: 'satisfied' }),
      makeItem({ id: 2, status: 'satisfied' }),
      makeItem({ id: 3, status: 'unsatisfied' }),
      makeItem({ id: 4, status: 'not_applicable' }),
    ];
    const s = buildComplianceSummary(items, now);
    expect(s.readiness).toEqual({ satisfied: 2, applicableTotal: 3, percentage: 67 });
  });

  it('does not double-count items that are both overdue and board-action', () => {
    const items = [
      makeItem({
        id: 1,
        templateKey: '718_minutes_rolling_12m',
        status: 'overdue',
        deadline: '2026-05-01T00:00:00.000Z',
      }),
    ];
    const s = buildComplianceSummary(items, now);
    expect(s.attentionCount).toBe(1);
    expect(s.overdueCount).toBe(1);
    expect(s.needsBoardActionCount).toBe(1);
  });
});

describe('sortByPriority', () => {
  const now = new Date('2026-05-26T00:00:00.000Z');

  it('orders overdue first, then unsatisfied-with-deadline by date, then null-deadline, then satisfied, then N/A', () => {
    const items = [
      makeItem({ id: 1, title: 'A', status: 'satisfied' }),
      makeItem({ id: 2, title: 'B', status: 'not_applicable' }),
      makeItem({ id: 3, title: 'C', status: 'overdue' }),
      makeItem({ id: 4, title: 'D', status: 'unsatisfied', deadline: '2026-06-10T00:00:00.000Z' }),
      makeItem({ id: 5, title: 'E', status: 'unsatisfied', deadline: '2026-06-01T00:00:00.000Z' }),
      makeItem({ id: 6, title: 'F', status: 'unsatisfied', deadline: null }),
    ];
    const sorted = sortByPriority(items, now);
    expect(sorted.map((i) => i.id)).toEqual([3, 5, 4, 6, 1, 2]);
  });

  it('uses title ASC as a stable tiebreak within the rolling-window bucket', () => {
    const items = [
      makeItem({ id: 10, title: 'Zebra', status: 'unsatisfied', deadline: null }),
      makeItem({ id: 11, title: 'Apple', status: 'unsatisfied', deadline: null }),
    ];
    const sorted = sortByPriority(items, now);
    expect(sorted.map((i) => i.title)).toEqual(['Apple', 'Zebra']);
  });

  it('uses id ASC as the final tiebreak for items with identical title and bucket', () => {
    const items = [
      makeItem({ id: 22, title: 'Same', status: 'satisfied' }),
      makeItem({ id: 11, title: 'Same', status: 'satisfied' }),
    ];
    const sorted = sortByPriority(items, now);
    expect(sorted.map((i) => i.id)).toEqual([11, 22]);
  });
});

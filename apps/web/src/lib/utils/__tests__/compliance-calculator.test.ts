import { describe, expect, it } from 'vitest';
import {
  calculateComplianceStatus,
  calculatePostingDeadline,
} from '@/lib/utils/compliance-calculator';

const ms = (iso: string) => new Date(iso);

describe('calculateComplianceStatus', () => {
  const now = ms('2026-05-04T12:00:00Z');

  describe('not_applicable', () => {
    it('returns not_applicable when isApplicable is false (regardless of documentId)', () => {
      expect(
        calculateComplianceStatus({
          isApplicable: false,
          documentId: 1,
          documentPostedAt: now,
          deadline: now,
          now,
        }),
      ).toBe('not_applicable');
    });
  });

  describe('unsatisfied / overdue (no document linked)', () => {
    it('returns unsatisfied when no document is linked and no deadline', () => {
      expect(
        calculateComplianceStatus({
          documentId: null,
          deadline: null,
          now,
        }),
      ).toBe('unsatisfied');
    });

    it('returns overdue when no document is linked and deadline has passed', () => {
      expect(
        calculateComplianceStatus({
          documentId: null,
          deadline: ms('2026-04-01T00:00:00Z'),
          now,
        }),
      ).toBe('overdue');
    });

    it('returns unsatisfied when no document is linked and deadline is in the future', () => {
      expect(
        calculateComplianceStatus({
          documentId: null,
          deadline: ms('2026-06-01T00:00:00Z'),
          now,
        }),
      ).toBe('unsatisfied');
    });
  });

  describe('satisfied (document linked, on time)', () => {
    it('returns satisfied when a document is linked before the deadline', () => {
      expect(
        calculateComplianceStatus({
          documentId: 42,
          documentPostedAt: ms('2026-04-15T00:00:00Z'),
          deadline: ms('2026-04-30T00:00:00Z'),
          now,
        }),
      ).toBe('satisfied');
    });

    it('returns satisfied when a document is linked but no deadline / postedAt is given', () => {
      expect(
        calculateComplianceStatus({ documentId: 42, now })).toBe('satisfied');
    });
  });

  describe('late posting demotes to overdue', () => {
    it('returns overdue when a document was posted past the deadline (does not retroactively satisfy)', () => {
      expect(
        calculateComplianceStatus({
          documentId: 42,
          documentPostedAt: ms('2026-05-02T00:00:00Z'),
          deadline: ms('2026-04-30T00:00:00Z'),
          now,
        }),
      ).toBe('overdue');
    });

    it('returns satisfied when posted-at exactly equals deadline (not strictly after)', () => {
      const deadline = ms('2026-04-30T00:00:00Z');
      expect(
        calculateComplianceStatus({
          documentId: 42,
          documentPostedAt: deadline,
          deadline,
          now,
        }),
      ).toBe('satisfied');
    });
  });

  describe('soft-deleted document defense', () => {
    it('treats a soft-deleted document as unlinked and falls back to deadline logic', () => {
      expect(
        calculateComplianceStatus({
          documentId: 42,
          documentDeletedAt: ms('2026-05-01T00:00:00Z'),
          documentPostedAt: ms('2026-04-15T00:00:00Z'),
          deadline: ms('2026-04-30T00:00:00Z'),
          now,
        }),
      ).toBe('overdue');
    });

    it('returns unsatisfied when document is soft-deleted and deadline has not passed', () => {
      expect(
        calculateComplianceStatus({
          documentId: 42,
          documentDeletedAt: ms('2026-05-01T00:00:00Z'),
          documentPostedAt: ms('2026-04-15T00:00:00Z'),
          deadline: ms('2026-06-01T00:00:00Z'),
          now,
        }),
      ).toBe('unsatisfied');
    });
  });

  describe('rolling window', () => {
    it('returns satisfied when posted within the rolling window', () => {
      // 12-month window from now (2026-05-04) → start of window = 2025-05-04.
      expect(
        calculateComplianceStatus({
          documentId: 42,
          documentPostedAt: ms('2025-08-01T00:00:00Z'),
          rollingWindowMonths: 12,
          now,
        }),
      ).toBe('satisfied');
    });

    it('returns overdue when posted before the rolling window starts', () => {
      expect(
        calculateComplianceStatus({
          documentId: 42,
          documentPostedAt: ms('2024-04-01T00:00:00Z'),
          rollingWindowMonths: 12,
          now,
        }),
      ).toBe('overdue');
    });

    it('treats soft-deleted document as unlinked even with a rolling window', () => {
      expect(
        calculateComplianceStatus({
          documentId: 42,
          documentDeletedAt: ms('2026-05-01T00:00:00Z'),
          documentPostedAt: ms('2025-08-01T00:00:00Z'),
          rollingWindowMonths: 12,
          now,
        }),
      ).toBe('unsatisfied');
    });
  });

  describe('Florida timezone boundaries', () => {
    // Florida statutory deadlines are interpreted in local time (Eastern), so
    // the calculator must not surprise callers when `now` straddles midnight
    // in Eastern. We pass UTC instants and rely on date-fns isAfter for
    // strictly-later semantics.
    it('handles a deadline at 04:00 UTC (midnight Eastern) — same instant is not late', () => {
      const easternMidnight = ms('2026-05-01T04:00:00Z');
      expect(
        calculateComplianceStatus({
          documentId: 42,
          documentPostedAt: easternMidnight,
          deadline: easternMidnight,
          now,
        }),
      ).toBe('satisfied');
    });

    it('handles DST spring-forward — a posting one second after the deadline is overdue', () => {
      // 2026 US DST spring-forward: 2026-03-08 02:00 ET → 03:00 ET.
      const deadline = ms('2026-03-08T07:00:00Z'); // 02:00 ET (skipped instant)
      const postedAt = ms('2026-03-08T07:00:01Z');
      expect(
        calculateComplianceStatus({
          documentId: 42,
          documentPostedAt: postedAt,
          deadline,
          now,
        }),
      ).toBe('overdue');
    });
  });
});

describe('calculatePostingDeadline — §718.111(12)(g) 30-day window', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  it('is exactly 30 days out for a mid-week source date', () => {
    const source = new Date('2026-08-12T18:00:00.000Z'); // Wednesday
    expect(calculatePostingDeadline(source).getTime() - source.getTime()).toBe(30 * DAY_MS);
  });

  it('is exactly 30 days for any source date in a year — never 31 or 32', () => {
    // 30 days is a MAXIMUM with no weekend exception. Rolling a weekend landing
    // forward to Monday told managers they could post on day 31 or 32 and let a
    // posting made after the statutory date read as "satisfied".
    const base = Date.UTC(2026, 0, 1, 12, 0, 0);
    for (let day = 0; day < 365; day += 1) {
      const source = new Date(base + day * DAY_MS);
      const elapsed = calculatePostingDeadline(source).getTime() - source.getTime();
      expect(elapsed, `posting deadline for ${source.toISOString()}`).toBe(30 * DAY_MS);
    }
  });

  it('does not lose an hour to a DST transition', () => {
    // Local-calendar addDays() returns a 719-hour "30 days" across
    // spring-forward (2026-03-08), silently shortening the window.
    const source = new Date('2026-02-18T18:00:00.000Z');
    expect(calculatePostingDeadline(source).getTime() - source.getTime()).toBe(30 * DAY_MS);
  });

  it('honours a non-default window length', () => {
    const source = new Date('2026-08-12T18:00:00.000Z');
    expect(calculatePostingDeadline(source, 14).getTime() - source.getTime()).toBe(14 * DAY_MS);
  });
});

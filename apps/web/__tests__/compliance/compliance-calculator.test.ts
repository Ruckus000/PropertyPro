import { describe, expect, it } from 'vitest';
import {
  calculateComplianceStatus,
  calculatePostingDeadline,
  calculateRollingWindowStart,
} from '../../src/lib/utils/compliance-calculator';

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

import { describe, expect, it } from 'vitest';
import {
  GRACE_EXPIRY_WARNING_OFFSET_DAYS,
  PAID_GRACE_DAYS,
  isWithinPaidGrace,
  paidGraceEndsAt,
} from '../billing/paid-grace';

const MS_PER_DAY = 86_400_000;

describe('paid lifecycle constants', () => {
  it('grace period is exactly 7 days for Public GA', () => {
    expect(PAID_GRACE_DAYS).toBe(7);
  });

  it('warning offset leaves at least 1 day before lock', () => {
    expect(GRACE_EXPIRY_WARNING_OFFSET_DAYS).toBeGreaterThanOrEqual(1);
    expect(GRACE_EXPIRY_WARNING_OFFSET_DAYS).toBeLessThan(PAID_GRACE_DAYS);
  });
});

describe('paidGraceEndsAt', () => {
  it('returns canceledAt plus PAID_GRACE_DAYS', () => {
    const canceledAt = new Date('2026-01-01T12:00:00.000Z');
    const endsAt = paidGraceEndsAt(canceledAt);
    expect(endsAt.getTime()).toBe(canceledAt.getTime() + PAID_GRACE_DAYS * MS_PER_DAY);
  });
});

describe('isWithinPaidGrace', () => {
  it('returns true when now is before grace end', () => {
    const canceledAt = new Date(Date.now() - 2 * MS_PER_DAY);
    const now = new Date();
    expect(isWithinPaidGrace(canceledAt, now)).toBe(true);
  });

  it('returns false when grace has expired', () => {
    const canceledAt = new Date(Date.now() - (PAID_GRACE_DAYS + 1) * MS_PER_DAY);
    const now = new Date();
    expect(isWithinPaidGrace(canceledAt, now)).toBe(false);
  });

  it('returns false exactly at grace end (exclusive boundary)', () => {
    const canceledAt = new Date('2026-01-01T00:00:00.000Z');
    const graceEnd = paidGraceEndsAt(canceledAt);
    expect(isWithinPaidGrace(canceledAt, graceEnd)).toBe(false);
  });
});

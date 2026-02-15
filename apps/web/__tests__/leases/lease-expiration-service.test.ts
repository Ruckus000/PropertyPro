/**
 * Unit tests for lease expiration service (P2-37).
 *
 * Tests cover:
 * - Expiration calculation with various edge cases
 * - DST spring-forward/fall-back transitions
 * - Leap year boundary handling
 * - Month-to-month (null endDate) never-expires behavior
 * - Alert window thresholds (29 days vs 91 days)
 * - Renewal chain linkage and traversal
 */
import { describe, expect, it } from 'vitest';
import {
  isLeaseExpiringWithinDays,
  daysUntilExpiration,
  getExpiringLeases,
  getRenewalChain,
  type LeaseRecord,
} from '../../src/lib/services/lease-expiration-service';

// ---------------------------------------------------------------------------
// Helper factory
// ---------------------------------------------------------------------------

function makeLease(overrides: Partial<LeaseRecord> = {}): LeaseRecord {
  return {
    id: 1,
    communityId: 100,
    unitId: 10,
    residentId: 'user-uuid-1',
    startDate: '2025-01-01',
    endDate: '2026-03-15',
    rentAmount: '1500.00',
    status: 'active',
    previousLeaseId: null,
    notes: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isLeaseExpiringWithinDays
// ---------------------------------------------------------------------------

describe('isLeaseExpiringWithinDays', () => {
  it('returns false for month-to-month leases (null endDate)', () => {
    const result = isLeaseExpiringWithinDays(null, new Date('2026-02-01'), 90);
    expect(result).toBe(false);
  });

  it('returns true when lease expires within the window', () => {
    // End date is Feb 28, reference is Feb 1, window is 30 days (check through March 3)
    const result = isLeaseExpiringWithinDays('2026-02-28', new Date('2026-02-01'), 30);
    expect(result).toBe(true);
  });

  it('returns false when lease expires outside the window', () => {
    // End date is June 1, reference is Feb 1, window is 30 days
    const result = isLeaseExpiringWithinDays('2026-06-01', new Date('2026-02-01'), 30);
    expect(result).toBe(false);
  });

  it('returns true when lease is already expired (end date in past)', () => {
    const result = isLeaseExpiringWithinDays('2025-12-31', new Date('2026-02-01'), 30);
    expect(result).toBe(true);
  });

  it('returns true when lease expires exactly on the window boundary', () => {
    // Reference: Feb 1, window: 30 days => boundary = March 3
    const result = isLeaseExpiringWithinDays('2026-03-03', new Date('2026-02-01'), 30);
    expect(result).toBe(true);
  });

  it('returns false for invalid date strings', () => {
    const result = isLeaseExpiringWithinDays('not-a-date', new Date('2026-02-01'), 30);
    expect(result).toBe(false);
  });

  // DST spring-forward (March, US Eastern): 2 AM doesn't exist
  it('handles DST spring-forward correctly (March transition)', () => {
    // March 9, 2025 is spring-forward in US
    const reference = new Date('2025-03-08T00:00:00Z');
    const result = isLeaseExpiringWithinDays('2025-03-15', reference, 10);
    expect(result).toBe(true);
  });

  // DST fall-back (November, US Eastern): 1 AM occurs twice
  it('handles DST fall-back correctly (November transition)', () => {
    const reference = new Date('2025-11-01T00:00:00Z');
    const result = isLeaseExpiringWithinDays('2025-11-05', reference, 7);
    expect(result).toBe(true);
  });

  // Leap year boundary
  it('handles leap year Feb 29 correctly', () => {
    // 2024 is a leap year
    const reference = new Date('2024-02-01T00:00:00Z');
    const result = isLeaseExpiringWithinDays('2024-02-29', reference, 30);
    expect(result).toBe(true);
  });

  it('handles 30 days from Jan 30 across leap year boundary', () => {
    // Jan 30 + 30 days = Feb 29 in leap year 2024
    const reference = new Date('2024-01-30T00:00:00Z');
    const result = isLeaseExpiringWithinDays('2024-02-29', reference, 30);
    expect(result).toBe(true);
  });

  // Year boundary
  it('handles year boundary correctly (Dec 31 + 30 days = Jan 30)', () => {
    const reference = new Date('2025-12-31T00:00:00Z');
    const result = isLeaseExpiringWithinDays('2026-01-15', reference, 30);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// daysUntilExpiration
// ---------------------------------------------------------------------------

describe('daysUntilExpiration', () => {
  it('returns null for month-to-month leases (null endDate)', () => {
    expect(daysUntilExpiration(null, new Date('2026-02-01'))).toBeNull();
  });

  it('returns positive days when lease has not yet expired', () => {
    const days = daysUntilExpiration('2026-03-01', new Date('2026-02-01'));
    expect(days).toBe(28); // Feb 1 to Mar 1 = 28 days in 2026 (non-leap)
  });

  it('returns 0 when lease expires today', () => {
    const days = daysUntilExpiration('2026-02-01', new Date('2026-02-01'));
    expect(days).toBe(0);
  });

  it('returns negative days when lease is already expired', () => {
    const days = daysUntilExpiration('2026-01-15', new Date('2026-02-01'));
    expect(days).toBe(-17);
  });

  it('returns null for invalid date strings', () => {
    expect(daysUntilExpiration('invalid', new Date('2026-02-01'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getExpiringLeases — alert threshold tests
// ---------------------------------------------------------------------------

describe('getExpiringLeases', () => {
  const reference = new Date('2026-02-14T00:00:00Z');

  it('returns leases expiring within 30 days (29 days out => alert)', () => {
    // Lease expires March 15 = 29 days from Feb 14
    const activeLease = makeLease({ id: 1, endDate: '2026-03-15', status: 'active' });
    const result = getExpiringLeases([activeLease], 30, reference);
    expect(result).toHaveLength(1);
    expect(result[0].daysUntilExpiration).toBe(29);
  });

  it('does not return leases expiring in 91 days for 90-day window', () => {
    // Lease expires May 16 = 91 days from Feb 14
    const activeLease = makeLease({ id: 1, endDate: '2026-05-16', status: 'active' });
    const result = getExpiringLeases([activeLease], 90, reference);
    expect(result).toHaveLength(0);
  });

  it('returns leases at exactly the boundary (90 days out => alert at 90-day window)', () => {
    // Lease expires May 15 = 90 days from Feb 14
    const activeLease = makeLease({ id: 1, endDate: '2026-05-15', status: 'active' });
    const result = getExpiringLeases([activeLease], 90, reference);
    expect(result).toHaveLength(1);
    expect(result[0].daysUntilExpiration).toBe(90);
  });

  it('excludes non-active leases', () => {
    const expiredLease = makeLease({ id: 1, endDate: '2026-03-01', status: 'expired' });
    const terminatedLease = makeLease({ id: 2, endDate: '2026-03-01', status: 'terminated' });
    const renewedLease = makeLease({ id: 3, endDate: '2026-03-01', status: 'renewed' });
    const result = getExpiringLeases([expiredLease, terminatedLease, renewedLease], 30, reference);
    expect(result).toHaveLength(0);
  });

  it('excludes month-to-month leases (null endDate)', () => {
    const monthToMonth = makeLease({ id: 1, endDate: null, status: 'active' });
    const result = getExpiringLeases([monthToMonth], 90, reference);
    expect(result).toHaveLength(0);
  });

  it('sorts by soonest expiration first', () => {
    const lease1 = makeLease({ id: 1, endDate: '2026-03-10', status: 'active' });
    const lease2 = makeLease({ id: 2, endDate: '2026-02-20', status: 'active' });
    const lease3 = makeLease({ id: 3, endDate: '2026-03-01', status: 'active' });

    const result = getExpiringLeases([lease1, lease2, lease3], 30, reference);
    expect(result.map((l) => l.id)).toEqual([2, 3, 1]);
  });

  it('includes already-expired leases in the results', () => {
    const pastLease = makeLease({ id: 1, endDate: '2026-02-10', status: 'active' });
    const result = getExpiringLeases([pastLease], 30, reference);
    expect(result).toHaveLength(1);
    expect(result[0].daysUntilExpiration).toBe(-4);
  });
});

// ---------------------------------------------------------------------------
// getRenewalChain
// ---------------------------------------------------------------------------

describe('getRenewalChain', () => {
  it('returns single lease when no previous lease exists', () => {
    const lease = makeLease({ id: 1, previousLeaseId: null });
    const chain = getRenewalChain(1, [lease]);
    expect(chain).toHaveLength(1);
    expect(chain[0].id).toBe(1);
  });

  it('returns chain from oldest to newest', () => {
    const original = makeLease({ id: 1, previousLeaseId: null, status: 'renewed' });
    const renewal1 = makeLease({ id: 2, previousLeaseId: 1, status: 'renewed' });
    const renewal2 = makeLease({ id: 3, previousLeaseId: 2, status: 'active' });

    const chain = getRenewalChain(3, [original, renewal1, renewal2]);
    expect(chain).toHaveLength(3);
    expect(chain.map((l) => l.id)).toEqual([1, 2, 3]);
  });

  it('handles two-link chain correctly', () => {
    const original = makeLease({ id: 10, previousLeaseId: null, status: 'renewed' });
    const renewal = makeLease({ id: 20, previousLeaseId: 10, status: 'active' });

    const chain = getRenewalChain(20, [original, renewal]);
    expect(chain).toHaveLength(2);
    expect(chain[0].id).toBe(10);
    expect(chain[1].id).toBe(20);
  });

  it('returns empty array if lease ID is not found', () => {
    const lease = makeLease({ id: 1 });
    const chain = getRenewalChain(999, [lease]);
    expect(chain).toHaveLength(0);
  });

  it('handles circular reference gracefully (no infinite loop)', () => {
    const lease1 = makeLease({ id: 1, previousLeaseId: 2 });
    const lease2 = makeLease({ id: 2, previousLeaseId: 1 });

    const chain = getRenewalChain(1, [lease1, lease2]);
    // Should stop at some point without infinite loop
    expect(chain.length).toBeLessThanOrEqual(2);
  });

  it('works with unordered input', () => {
    const renewal2 = makeLease({ id: 3, previousLeaseId: 2, status: 'active' });
    const original = makeLease({ id: 1, previousLeaseId: null, status: 'renewed' });
    const renewal1 = makeLease({ id: 2, previousLeaseId: 1, status: 'renewed' });

    const chain = getRenewalChain(3, [renewal2, original, renewal1]);
    expect(chain.map((l) => l.id)).toEqual([1, 2, 3]);
  });
});

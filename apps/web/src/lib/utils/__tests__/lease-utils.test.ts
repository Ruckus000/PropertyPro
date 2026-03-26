import { describe, it, expect } from 'vitest';
import {
  formatRentDisplay,
  parseRentInput,
  formatLeaseDate,
  getLeaseDisplayStatus,
  isExpiringWithinWindow,
  addOneDayUTC,
} from '../lease-utils';
// LeaseApiItem is the Task 2 rename of LeaseListItem — alias here so tests
// are forward-compatible without changing the import after the rename.
import type { LeaseListItem as LeaseApiItem } from '@/hooks/use-leases';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLease(overrides: Partial<LeaseApiItem> = {}): LeaseApiItem {
  return {
    id: 1,
    communityId: 1,
    unitId: 10,
    residentId: 'abc-123',
    startDate: '2025-01-01',
    endDate: null,
    rentAmount: null,
    status: 'active',
    previousLeaseId: null,
    notes: null,
    ...overrides,
  };
}

const REF = new Date('2026-01-15T12:00:00Z'); // fixed reference for deterministic tests

// ---------------------------------------------------------------------------
// formatRentDisplay
// ---------------------------------------------------------------------------

describe('formatRentDisplay', () => {
  it('returns em-dash for null', () => {
    expect(formatRentDisplay(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(formatRentDisplay(undefined as any)).toBe('—');
  });

  it('formats zero as $0.00', () => {
    expect(formatRentDisplay('0.00')).toBe('$0.00');
  });

  it('formats 1500.50 with cents', () => {
    expect(formatRentDisplay('1500.50')).toBe('$1,500.50');
  });

  it('formats 10000.00 with thousand separator', () => {
    expect(formatRentDisplay('10000.00')).toBe('$10,000.00');
  });

  it('returns em-dash for non-numeric string', () => {
    expect(formatRentDisplay('abc')).toBe('—');
  });

  // Negative: toLocaleString produces "−$100.00" — document behaviour, don't suppress
  it('formats negative as negative currency (browser behavior)', () => {
    const result = formatRentDisplay('-100');
    expect(result).toMatch(/100/); // contains the number
    expect(result).not.toBe('—'); // does not degrade to em-dash
  });
});

// ---------------------------------------------------------------------------
// parseRentInput
// ---------------------------------------------------------------------------

describe('parseRentInput', () => {
  it('returns null for empty string', () => {
    expect(parseRentInput('')).toBeNull();
  });

  it('returns null for whitespace only', () => {
    expect(parseRentInput('   ')).toBeNull();
  });

  it('accepts zero — zero rent is valid', () => {
    expect(parseRentInput('0')).toBe('0.00');
  });

  it('accepts 0.00', () => {
    expect(parseRentInput('0.00')).toBe('0.00');
  });

  it('normalises integer to 2dp', () => {
    expect(parseRentInput('1500')).toBe('1500.00');
  });

  it('preserves 2dp', () => {
    expect(parseRentInput('1500.50')).toBe('1500.50');
  });

  it('trims surrounding whitespace', () => {
    expect(parseRentInput(' 1500 ')).toBe('1500.00');
  });

  it('rejects alphanumeric input', () => {
    expect(parseRentInput('1500abc')).toBeNull();
  });

  it('rejects more than 2 decimal places', () => {
    expect(parseRentInput('1500.505')).toBeNull();
  });

  it('rejects negative values', () => {
    expect(parseRentInput('-100')).toBeNull();
  });

  it('handles large numbers without overflow', () => {
    expect(parseRentInput('999999999.99')).toBe('999999999.99');
  });
});

// ---------------------------------------------------------------------------
// formatLeaseDate
// ---------------------------------------------------------------------------

describe('formatLeaseDate', () => {
  it('returns Month-to-month for null', () => {
    expect(formatLeaseDate(null)).toBe('Month-to-month');
  });

  it('formats 2026-01-01 as Jan 1, 2026', () => {
    expect(formatLeaseDate('2026-01-01')).toBe('Jan 1, 2026');
  });

  it('passes through invalid date strings', () => {
    expect(formatLeaseDate('not-a-date')).toBe('not-a-date');
  });

  it('does not throw for 2026-02-29 (invalid date)', () => {
    expect(() => formatLeaseDate('2026-02-29')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getLeaseDisplayStatus
// ---------------------------------------------------------------------------

describe('getLeaseDisplayStatus', () => {
  it('returns terminated for stored terminated status', () => {
    expect(getLeaseDisplayStatus(makeLease({ status: 'terminated' }), REF)).toBe('terminated');
  });

  it('returns expired for stored expired status', () => {
    expect(getLeaseDisplayStatus(makeLease({ status: 'expired' }), REF)).toBe('expired');
  });

  it('returns renewed for stored renewed status', () => {
    expect(getLeaseDisplayStatus(makeLease({ status: 'renewed' }), REF)).toBe('renewed');
  });

  it('returns active for month-to-month (null endDate)', () => {
    expect(getLeaseDisplayStatus(makeLease({ endDate: null }), REF)).toBe('active');
  });

  it('returns active when endDate is 61 days out', () => {
    const d = new Date(REF);
    d.setUTCDate(d.getUTCDate() + 61);
    const endDate = d.toISOString().slice(0, 10);
    expect(getLeaseDisplayStatus(makeLease({ endDate }), REF)).toBe('active');
  });

  it('returns expiring_soon when endDate is exactly 60 days out (inclusive boundary)', () => {
    const d = new Date(REF);
    d.setUTCDate(d.getUTCDate() + 60);
    const endDate = d.toISOString().slice(0, 10);
    expect(getLeaseDisplayStatus(makeLease({ endDate }), REF)).toBe('expiring_soon');
  });

  it('returns expiring_soon when endDate is today (0 days)', () => {
    const endDate = REF.toISOString().slice(0, 10);
    expect(getLeaseDisplayStatus(makeLease({ endDate }), REF)).toBe('expiring_soon');
  });

  it('returns expired when endDate was yesterday (UI-computed, not stored)', () => {
    const d = new Date(REF);
    d.setUTCDate(d.getUTCDate() - 1);
    const endDate = d.toISOString().slice(0, 10);
    expect(getLeaseDisplayStatus(makeLease({ endDate }), REF)).toBe('expired');
  });
});

// ---------------------------------------------------------------------------
// isExpiringWithinWindow
// ---------------------------------------------------------------------------

describe('isExpiringWithinWindow', () => {
  it('returns false for null endDate', () => {
    expect(isExpiringWithinWindow(null, 60, REF)).toBe(false);
  });

  it('returns false for past-due endDate (days < 0)', () => {
    const d = new Date(REF);
    d.setUTCDate(d.getUTCDate() - 1);
    expect(isExpiringWithinWindow(d.toISOString().slice(0, 10), 60, REF)).toBe(false);
  });

  it('returns true for endDate today (days = 0)', () => {
    const endDate = REF.toISOString().slice(0, 10);
    expect(isExpiringWithinWindow(endDate, 60, REF)).toBe(true);
  });

  it('returns true for endDate at window boundary (60 days, inclusive)', () => {
    const d = new Date(REF);
    d.setUTCDate(d.getUTCDate() + 60);
    expect(isExpiringWithinWindow(d.toISOString().slice(0, 10), 60, REF)).toBe(true);
  });

  it('returns false for endDate one day beyond window (61 days)', () => {
    const d = new Date(REF);
    d.setUTCDate(d.getUTCDate() + 61);
    expect(isExpiringWithinWindow(d.toISOString().slice(0, 10), 60, REF)).toBe(false);
  });

  it('returns false for endDate 1 year out', () => {
    expect(isExpiringWithinWindow('2027-01-15', 60, REF)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addOneDayUTC
// ---------------------------------------------------------------------------

describe('addOneDayUTC', () => {
  it('crosses a month boundary', () => {
    expect(addOneDayUTC('2026-01-31')).toBe('2026-02-01');
  });

  it('crosses a year boundary', () => {
    expect(addOneDayUTC('2026-12-31')).toBe('2027-01-01');
  });

  it('handles leap year day', () => {
    expect(addOneDayUTC('2024-02-28')).toBe('2024-02-29');
  });

  it('handles non-leap year boundary', () => {
    expect(addOneDayUTC('2025-02-28')).toBe('2025-03-01');
  });

  it('is unaffected by US Eastern DST spring-forward (2026-03-08)', () => {
    expect(addOneDayUTC('2026-03-08')).toBe('2026-03-09');
  });
});

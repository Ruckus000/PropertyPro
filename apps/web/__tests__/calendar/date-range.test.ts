import { describe, expect, it } from 'vitest';
import {
  parseOptionalCalendarDateRange,
  parseRequiredCalendarDateRange,
} from '../../src/lib/calendar/date-range';

describe('calendar date range parsing', () => {
  it('rejects invalid date formats', () => {
    expect(() =>
      parseRequiredCalendarDateRange(
        new URLSearchParams({ start: '2026/04/01', end: '2026-04-30' }),
        'America/New_York',
      ),
    ).toThrow('YYYY-MM-DD');
  });

  it('rejects reversed date ranges', () => {
    expect(() =>
      parseRequiredCalendarDateRange(
        new URLSearchParams({ start: '2026-05-01', end: '2026-04-30' }),
        'America/New_York',
      ),
    ).toThrow('on or after start');
  });

  it('rejects date ranges longer than 366 days', () => {
    expect(() =>
      parseRequiredCalendarDateRange(
        new URLSearchParams({ start: '2026-01-01', end: '2027-01-03' }),
        'America/New_York',
      ),
    ).toThrow('366 days');
  });

  it('returns null for omitted optional ranges', () => {
    expect(
      parseOptionalCalendarDateRange(new URLSearchParams(), 'America/New_York'),
    ).toBeNull();
  });

  it('parses valid ranges into UTC bounds', () => {
    const range = parseRequiredCalendarDateRange(
      new URLSearchParams({ start: '2026-04-01', end: '2026-04-30' }),
      'America/New_York',
    );

    expect(range.start).toBe('2026-04-01');
    expect(range.end).toBe('2026-04-30');
    expect(range.startUtc.toISOString()).toBe('2026-04-01T04:00:00.000Z');
    expect(range.endUtcExclusive.toISOString()).toBe('2026-05-01T04:00:00.000Z');
  });
});

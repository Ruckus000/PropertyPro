import { describe, expect, it } from 'vitest';
import {
  dateOnlyRangeToUtcBounds,
  utcDateToWallClockValue,
  wallClockValueToUtcDate,
} from '../../src/lib/utils/zoned-datetime';

describe('zoned datetime helpers', () => {
  it('round-trips Eastern wall clock values, including DST transitions', () => {
    for (const value of ['2026-01-15T09:30', '2026-03-08T03:30', '2026-11-01T01:30']) {
      const utcDate = wallClockValueToUtcDate(value, 'America/New_York');
      expect(utcDateToWallClockValue(utcDate, 'America/New_York')).toBe(value);
    }
  });

  it('round-trips Central wall clock values, including DST transitions', () => {
    for (const value of ['2026-01-15T09:30', '2026-03-08T03:15', '2026-11-01T01:30']) {
      const utcDate = wallClockValueToUtcDate(value, 'America/Chicago');
      expect(utcDateToWallClockValue(utcDate, 'America/Chicago')).toBe(value);
    }
  });

  it('builds UTC date-only bounds using the community timezone', () => {
    const bounds = dateOnlyRangeToUtcBounds(
      '2026-03-01',
      '2026-03-31',
      'America/Chicago',
    );

    expect(bounds.startUtc.toISOString()).toBe('2026-03-01T06:00:00.000Z');
    expect(bounds.endUtcExclusive.toISOString()).toBe('2026-04-01T05:00:00.000Z');
  });
});

import { describe, expect, it } from 'vitest';
import { daysOld, formatRelativeTime } from '@/lib/utils/dashboard-time';

describe('dashboard time utilities', () => {
  const now = new Date('2026-03-05T12:00:00Z');

  it('formats sub-minute timestamps as just now', () => {
    expect(formatRelativeTime('2026-03-05T11:59:45Z', now)).toBe('just now');
  });

  it('formats minute-level timestamps with compact minute labels', () => {
    expect(formatRelativeTime('2026-03-05T11:15:00Z', now)).toBe('45m ago');
  });

  it('formats hour-level timestamps with compact hour labels', () => {
    expect(formatRelativeTime('2026-03-05T09:00:00Z', now)).toBe('3h ago');
  });

  it('formats day-level timestamps with compact day labels', () => {
    expect(formatRelativeTime('2026-03-02T12:00:00Z', now)).toBe('3d ago');
  });

  it('falls back to the locale date string after 30 days', () => {
    const value = '2026-01-01T12:00:00Z';

    expect(formatRelativeTime(value, now)).toBe(new Date(value).toLocaleDateString());
  });

  it('calculates whole-day age with date-fns day boundaries', () => {
    expect(daysOld('2026-02-23T12:00:00Z', now)).toBe(10);
  });
});

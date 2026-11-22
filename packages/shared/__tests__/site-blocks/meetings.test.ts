import { describe, it, expect } from 'vitest';
import {
  effectiveMeetingsWindowDays,
  meetingsBlockSchema,
  MEETINGS_NOTICE_FLOOR_DAYS,
  MEETINGS_NOTICE_ROW_CAP,
  selectPublicMeetings,
} from '../../src/site-blocks/meetings';

describe('meetingsBlockSchema', () => {
  it('defaults limit to 10 and timeWindowDays to 30', () => {
    const result = meetingsBlockSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
      expect(result.data.timeWindowDays).toBe(30);
    }
  });

  it('accepts limit 1-20', () => {
    expect(meetingsBlockSchema.safeParse({ limit: 1 }).success).toBe(true);
    expect(meetingsBlockSchema.safeParse({ limit: 20 }).success).toBe(true);
  });

  it('rejects limit > 20', () => {
    expect(meetingsBlockSchema.safeParse({ limit: 21 }).success).toBe(false);
  });

  it('accepts timeWindowDays 1-365', () => {
    expect(meetingsBlockSchema.safeParse({ timeWindowDays: 1 }).success).toBe(true);
    expect(meetingsBlockSchema.safeParse({ timeWindowDays: 365 }).success).toBe(true);
  });

  it('rejects timeWindowDays > 365', () => {
    expect(meetingsBlockSchema.safeParse({ timeWindowDays: 366 }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(meetingsBlockSchema.safeParse({ includeCancelled: true }).success).toBe(false);
  });
});

describe('meetings block — empty text override', () => {
  it('accepts a custom empty-state message', () => {
    expect(meetingsBlockSchema.safeParse({ emptyText: 'Nothing here right now.' }).success).toBe(true);
  });

  it('accepts content with none — the renderer keeps its built-in copy', () => {
    expect(meetingsBlockSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an empty string rather than rendering a blank empty state', () => {
    expect(meetingsBlockSchema.safeParse({ emptyText: '' }).success).toBe(false);
  });

  it('rejects an over-long message', () => {
    expect(meetingsBlockSchema.safeParse({ emptyText: 'a'.repeat(201) }).success).toBe(false);
  });
});

describe('the front page never hides a meeting inside its notice window (H-4)', () => {
  const NOW = Date.parse('2026-11-21T12:00:00Z');
  const DAY = 24 * 60 * 60 * 1000;
  const at = (days: number) => ({ id: days, startsAt: new Date(NOW + days * DAY) });

  it('floors the window at 14 days', () => {
    expect(MEETINGS_NOTICE_FLOOR_DAYS).toBe(14);
    expect(effectiveMeetingsWindowDays(1)).toBe(14);
    expect(effectiveMeetingsWindowDays(13)).toBe(14);
    expect(effectiveMeetingsWindowDays(30)).toBe(30);
  });

  it('shows a meeting 10 days out even when the section looks 3 days ahead', () => {
    const rows = [at(10)];
    expect(selectPublicMeetings(rows, { limit: 10, timeWindowDays: 3 }, NOW)).toEqual(rows);
  });

  it('a limit of 1 does not hide the owner meeting behind tomorrow’s board meeting', () => {
    const rows = [at(1), at(12), at(20)];
    expect(selectPublicMeetings(rows, { limit: 1, timeWindowDays: 30 }, NOW).map((r) => r.id)).toEqual([1, 12]);
  });

  it('beyond the notice window, the limit applies as configured', () => {
    const rows = [at(15), at(16), at(17)];
    expect(selectPublicMeetings(rows, { limit: 2, timeWindowDays: 30 }, NOW).map((r) => r.id)).toEqual([15, 16]);
  });

  it('drops meetings past the configured window', () => {
    const rows = [at(5), at(40)];
    expect(selectPublicMeetings(rows, { limit: 10, timeWindowDays: 30 }, NOW).map((r) => r.id)).toEqual([5]);
  });

  it('caps notice-window rows at MEETINGS_NOTICE_ROW_CAP', () => {
    const rows = Array.from({ length: MEETINGS_NOTICE_ROW_CAP + 5 }, (_, i) => ({
      id: i,
      startsAt: new Date(NOW + DAY + i * 60_000),
    }));
    expect(selectPublicMeetings(rows, { limit: 1, timeWindowDays: 30 }, NOW)).toHaveLength(MEETINGS_NOTICE_ROW_CAP);
  });
});

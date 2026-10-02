/**
 * The §718.111(12)(g) posting deadline is a statutory MAXIMUM. These tests pin
 * the two properties that were wrong in all three of its former copies.
 */
import { describe, expect, it } from 'vitest';
import {
  calculatePostingDeadline,
  DEFAULT_POSTING_WINDOW_DAYS,
  postingClockApplies,
} from '../compliance/posting-deadline';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('calculatePostingDeadline', () => {
  it('defaults to the 30-day statutory window', () => {
    expect(DEFAULT_POSTING_WINDOW_DAYS).toBe(30);
    const source = new Date('2026-08-12T18:00:00.000Z');
    expect(calculatePostingDeadline(source).getTime() - source.getTime()).toBe(30 * DAY_MS);
  });

  it('is exactly N days for every source date in a year — no weekend roll-forward', () => {
    // The old copies pushed a Saturday landing forward two days and a Sunday
    // landing forward one, advertising day 31 or 32 against a 30-day maximum.
    const base = Date.UTC(2026, 0, 1, 12, 0, 0);
    for (let day = 0; day < 365; day += 1) {
      const source = new Date(base + day * DAY_MS);
      expect(
        calculatePostingDeadline(source).getTime() - source.getTime(),
        `posting deadline for ${source.toISOString()}`,
      ).toBe(30 * DAY_MS);
    }
  });

  it('does not lose an hour to a DST transition', () => {
    // A calendar-day shift returns a 719-hour "30 days" across spring-forward.
    const source = new Date('2026-02-18T18:00:00.000Z');
    expect(calculatePostingDeadline(source).getTime() - source.getTime()).toBe(30 * DAY_MS);
  });

  it('honours a non-default window length', () => {
    const source = new Date('2026-08-12T18:00:00.000Z');
    expect(calculatePostingDeadline(source, 14).getTime() - source.getTime()).toBe(14 * DAY_MS);
  });
});

describe('postingClockApplies', () => {
  it('stops the clock below the website rule’s size threshold', () => {
    expect(postingClockApplies({ communityType: 'condo_718', unitCount: 24 })).toBe(false);
    expect(postingClockApplies({ communityType: 'hoa_720', unitCount: 99 })).toBe(false);
  });

  it('runs it at the threshold, above it, and when the size is unknown', () => {
    expect(postingClockApplies({ communityType: 'condo_718', unitCount: 25 })).toBe(true);
    expect(postingClockApplies({ communityType: 'hoa_720', unitCount: 100 })).toBe(true);
    expect(postingClockApplies({ communityType: 'condo_718', unitCount: null })).toBe(true);
    expect(postingClockApplies({ communityType: 'hoa_720', unitCount: null })).toBe(true);
  });
});

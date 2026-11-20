import { describe, expect, it } from 'vitest';
import {
  bookingRuleViolation,
  calendarDateIn,
  describeBookingRules,
  formatMinutes,
} from '@/lib/amenities/booking-rules';

const NY = 'America/New_York';
const NOW = new Date('2026-03-01T15:00:00Z');
const at = (iso: string) => new Date(iso);

describe('bookingRuleViolation', () => {
  it('passes any booking when there are no rules', () => {
    expect(bookingRuleViolation({}, at('2027-01-01T10:00:00Z'), at('2027-01-03T10:00:00Z'), NOW, NY)).toBeNull();
  });

  it('enforces the shortest booking, exactly at the limit passing', () => {
    const rules = { minDurationMinutes: 60 };
    expect(bookingRuleViolation(rules, at('2026-03-02T14:00:00Z'), at('2026-03-02T14:59:00Z'), NOW, NY)).toBe(
      'Bookings for this amenity must be at least 1 hour.',
    );
    expect(bookingRuleViolation(rules, at('2026-03-02T14:00:00Z'), at('2026-03-02T15:00:00Z'), NOW, NY)).toBeNull();
  });

  it('enforces the longest booking, exactly at the limit passing', () => {
    const rules = { maxDurationMinutes: 240 };
    expect(bookingRuleViolation(rules, at('2026-03-02T14:00:00Z'), at('2026-03-02T18:01:00Z'), NOW, NY)).toBe(
      'Bookings for this amenity can be at most 4 hours.',
    );
    expect(bookingRuleViolation(rules, at('2026-03-02T14:00:00Z'), at('2026-03-02T18:00:00Z'), NOW, NY)).toBeNull();
  });

  it('enforces how far ahead a booking may start', () => {
    const rules = { advanceBookingDays: 7 };
    // NOW + 7 days exactly is allowed; one minute later is not.
    expect(bookingRuleViolation(rules, at('2026-03-08T15:00:00Z'), at('2026-03-08T16:00:00Z'), NOW, NY)).toBeNull();
    expect(bookingRuleViolation(rules, at('2026-03-08T15:01:00Z'), at('2026-03-08T16:00:00Z'), NOW, NY)).toBe(
      'This amenity can be booked at most 7 days ahead.',
    );
    expect(
      bookingRuleViolation({ advanceBookingDays: 1 }, at('2026-03-03T15:00:00Z'), at('2026-03-03T16:00:00Z'), NOW, NY),
    ).toBe('This amenity can be booked at most 1 day ahead.');
  });

  it("reads blackout dates on the community's calendar, not UTC", () => {
    const rules = { blackoutDates: ['2026-03-10'] };
    // 2026-03-11T02:00Z is 10 PM on March 10 in New York: closed.
    expect(bookingRuleViolation(rules, at('2026-03-11T02:00:00Z'), at('2026-03-11T03:00:00Z'), NOW, NY)).toBe(
      'This amenity is closed on March 10, 2026.',
    );
    // 2026-03-10T03:00Z is 11 PM on March 9 in New York: open, though it is March 10 in UTC.
    expect(bookingRuleViolation(rules, at('2026-03-10T03:00:00Z'), at('2026-03-10T03:30:00Z'), NOW, NY)).toBeNull();
  });

  it('catches a blackout date that a booking only runs into across midnight', () => {
    const rules = { blackoutDates: ['2026-03-10'] };
    // 11 PM March 9 to 1 AM March 10, New York time (EDT, UTC-4, since March 8).
    expect(bookingRuleViolation(rules, at('2026-03-10T03:00:00Z'), at('2026-03-10T05:00:00Z'), NOW, NY)).toBe(
      'This amenity is closed on March 10, 2026.',
    );
    // Ending exactly at midnight does not touch the next day.
    expect(bookingRuleViolation(rules, at('2026-03-10T03:00:00Z'), at('2026-03-10T04:00:00Z'), NOW, NY)).toBeNull();
  });

  it('catches a blackout date in the middle of a multi-day booking, across a DST change', () => {
    // US DST starts 2026-03-08; March 8 is a 23-hour day in New York.
    const rules = { blackoutDates: ['2026-03-08'] };
    expect(bookingRuleViolation(rules, at('2026-03-07T17:00:00Z'), at('2026-03-09T17:00:00Z'), NOW, NY)).toBe(
      'This amenity is closed on March 8, 2026.',
    );
  });

  it('reports duration before advance and blackout', () => {
    const rules = { minDurationMinutes: 60, advanceBookingDays: 1, blackoutDates: ['2026-04-01'] };
    expect(bookingRuleViolation(rules, at('2026-04-01T14:00:00Z'), at('2026-04-01T14:30:00Z'), NOW, NY)).toBe(
      'Bookings for this amenity must be at least 1 hour.',
    );
  });
});

describe('describeBookingRules', () => {
  it('says nothing when there are no rules', () => {
    expect(describeBookingRules({})).toEqual([]);
  });

  it('describes every rule in plain words', () => {
    expect(
      describeBookingRules({
        minDurationMinutes: 30,
        maxDurationMinutes: 90,
        advanceBookingDays: 14,
        blackoutDates: ['2026-12-25', '2026-07-04'],
      }),
    ).toEqual([
      '30 minutes to 1.5 hours per booking',
      'Book up to 14 days ahead',
      'Closed on July 4, 2026, December 25, 2026',
    ]);
    expect(describeBookingRules({ minDurationMinutes: 60 })).toEqual(['At least 1 hour per booking']);
    expect(describeBookingRules({ maxDurationMinutes: 135 })).toEqual(['Up to 2 hours 15 minutes per booking']);
  });
});

describe('helpers', () => {
  it('formats minutes', () => {
    expect(formatMinutes(1)).toBe('1 minute');
    expect(formatMinutes(45)).toBe('45 minutes');
    expect(formatMinutes(60)).toBe('1 hour');
    expect(formatMinutes(150)).toBe('2.5 hours');
    expect(formatMinutes(61)).toBe('1 hour 1 minute');
  });

  it('reads a calendar date in a zone', () => {
    expect(calendarDateIn(at('2026-03-11T02:00:00Z'), NY)).toBe('2026-03-10');
    expect(calendarDateIn(at('2026-03-11T02:00:00Z'), 'UTC')).toBe('2026-03-11');
  });
});

import { describe, expect, it } from 'vitest';
import {
  billingDaysRemainingUTC,
  formatBillingDateUTC,
} from '../billing/format-billing-date';

describe('formatBillingDateUTC', () => {
  it('formats a date as "Month D, YYYY"', () => {
    expect(formatBillingDateUTC(new Date('2026-01-08T12:00:00.000Z'))).toBe('January 8, 2026');
  });

  it('uses the UTC calendar day for instants near midnight (not the local day)', () => {
    // 02:00 UTC on Jan 8 is still Jan 7 evening in US timezones. UTC formatting
    // must resolve to Jan 8 so the banner never disagrees with the email/guard.
    expect(formatBillingDateUTC(new Date('2026-01-08T02:00:00.000Z'))).toBe('January 8, 2026');
  });

  it('matches the long-form string the dunning emails already send', () => {
    const d = new Date('2026-07-15T00:00:00.000Z');
    const emailFormat = d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
    expect(formatBillingDateUTC(d)).toBe(emailFormat);
  });
});

describe('billingDaysRemainingUTC', () => {
  it('counts UTC calendar days from now to the period end', () => {
    const now = new Date('2026-07-11T12:00:00.000Z');
    const end = new Date('2026-07-25T12:00:00.000Z');
    expect(billingDaysRemainingUTC(end, now)).toBe(14);
  });

  it('uses UTC calendar days near a midnight boundary (not the local day)', () => {
    // 23:00 UTC Jul 24 → 01:00 UTC Jul 25 is one UTC calendar day apart.
    const now = new Date('2026-07-24T23:00:00.000Z');
    const end = new Date('2026-07-25T01:00:00.000Z');
    expect(billingDaysRemainingUTC(end, now)).toBe(1);
  });

  it('floors at 0 once the period end has passed', () => {
    const now = new Date('2026-07-26T12:00:00.000Z');
    const end = new Date('2026-07-25T12:00:00.000Z');
    expect(billingDaysRemainingUTC(end, now)).toBe(0);
  });
});

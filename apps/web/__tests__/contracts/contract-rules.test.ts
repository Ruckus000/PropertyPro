/**
 * The rules and wording the contract form and the contracts API share
 * (`lib/contracts/contract-rules.ts`).
 */
import { describe, expect, it } from 'vitest';
import {
  CONTRACT_AMOUNT_MESSAGE,
  CONTRACT_AMOUNT_TOO_LARGE_MESSAGE,
  contractAmountIssue,
  bidCountLabel,
  contractAmountError,
  contractStatus,
  contractTimeLeft,
  formatContractDate,
  formatContractDateTime,
  isEndBeforeStart,
  todayInTimeZone,
} from '../../src/lib/contracts/contract-rules';
import { formatMoney } from '../../src/lib/utils/format-money';

describe('formatMoney', () => {
  it('prints a stored amount as dollars with separators and cents', () => {
    expect(formatMoney('12500')).toBe('$12,500.00');
    expect(formatMoney('12500.00')).toBe('$12,500.00');
    expect(formatMoney('1234567.5')).toBe('$1,234,567.50');
    expect(formatMoney('0.99')).toBe('$0.99');
  });

  it('prints a dash for no amount', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney('')).toBe('—');
  });
});

describe('contractAmountError', () => {
  it('accepts a plain amount and an empty field', () => {
    expect(contractAmountError('1200')).toBeNull();
    expect(contractAmountError('1200.5')).toBeNull();
    expect(contractAmountError('1200.50')).toBeNull();
    expect(contractAmountError('')).toBeNull();
  });

  it('refuses separators, symbols and a third decimal, with the stated message', () => {
    for (const bad of ['1,200', '$1200', '1200.505', '-5', '12 00', 'abc']) {
      expect(contractAmountError(bad)).toBe(CONTRACT_AMOUNT_MESSAGE);
    }
  });
});

describe('amounts the column cannot hold', () => {
  it('accepts ten digits before the point, the most numeric(12,2) holds', () => {
    expect(contractAmountError('9999999999.99')).toBeNull();
    expect(contractAmountIssue('9999999999')).toBeNull();
  });

  it('refuses an eleventh digit with a message about size, not about commas', () => {
    expect(contractAmountError('10000000000')).toBe(CONTRACT_AMOUNT_TOO_LARGE_MESSAGE);
    expect(contractAmountError('12345678901.50')).toBe(CONTRACT_AMOUNT_TOO_LARGE_MESSAGE);
  });

  it('the strict check (the server\'s) also refuses an empty string', () => {
    expect(contractAmountIssue('')).toBe(CONTRACT_AMOUNT_MESSAGE);
    expect(contractAmountError('')).toBeNull();
  });
});

describe('isEndBeforeStart', () => {
  it('is true only when the end date is earlier than the start date', () => {
    expect(isEndBeforeStart('2026-03-01', '2026-02-28')).toBe(true);
    expect(isEndBeforeStart('2026-03-01', '2026-03-01')).toBe(false);
    expect(isEndBeforeStart('2026-03-01', '2027-03-01')).toBe(false);
  });

  it('has nothing to compare on an open-ended contract', () => {
    expect(isEndBeforeStart('2026-03-01', null)).toBe(false);
    expect(isEndBeforeStart('2026-03-01', '')).toBe(false);
    expect(isEndBeforeStart('2026-03-01', undefined)).toBe(false);
  });
});

describe('dates', () => {
  it('prints a calendar date without shifting it by a time zone', () => {
    expect(formatContractDate('2026-12-12')).toBe('Dec 12, 2026');
    expect(formatContractDate('2026-01-01')).toBe('Jan 1, 2026');
  });

  it('prints a time in the community time zone', () => {
    expect(formatContractDateTime('2026-12-12T22:00:00.000Z', 'America/New_York')).toBe(
      'Dec 12, 2026, 5:00 PM EST',
    );
  });

  it("gives the community's today, not UTC's", () => {
    // 02:30 UTC on the 2nd is still the evening of the 1st in Florida.
    expect(todayInTimeZone('America/New_York', new Date('2026-12-02T02:30:00Z'))).toBe('2026-12-01');
  });

  it('a stored time zone Intl does not know falls back and does not throw', () => {
    // Without the fallback both of these throw RangeError: Invalid time zone.
    expect(formatContractDateTime('2026-12-12T22:00:00.000Z', 'Not/A_Zone')).toBe('Dec 12, 2026, 5:00 PM EST');
    expect(todayInTimeZone('Not/A_Zone', new Date('2026-12-02T02:30:00Z'))).toBe('2026-12-01');
    expect(todayInTimeZone('', new Date('2026-12-02T02:30:00Z'))).toBe('2026-12-01');
  });

  it('counts the time left in calendar days', () => {
    expect(contractTimeLeft('2026-12-31', '2026-12-01')).toBe('30 days left');
    expect(contractTimeLeft('2026-12-02', '2026-12-01')).toBe('1 day left');
    expect(contractTimeLeft('2026-12-01', '2026-12-01')).toBe('Ends today');
    expect(contractTimeLeft('2026-11-30', '2026-12-01')).toBe('Ended 1 day ago');
    expect(contractTimeLeft('2026-11-01', '2026-12-01')).toBe('Ended 30 days ago');
    expect(contractTimeLeft('2027-12-01', '2026-12-01')).toBe('12 months left');
    expect(contractTimeLeft('2029-12-01', '2026-12-01')).toBe('3 years left');
  });
});

describe('labels', () => {
  it('counts bids as sealed while bidding is open, and by number after', () => {
    expect(bidCountLabel(3, true)).toBe('3 sealed');
    expect(bidCountLabel(3, false)).toBe('3 bids');
    expect(bidCountLabel(1, false)).toBe('1 bid');
    expect(bidCountLabel(0, false)).toBe('No bids');
  });

  it('gives every status a word, and prints an unknown one as written', () => {
    expect(contractStatus('active').word).toBe('Active');
    expect(contractStatus('terminated').word).toBe('Terminated');
    expect(contractStatus('archived')).toEqual({ word: 'archived', kind: 'not-started' });
  });
});

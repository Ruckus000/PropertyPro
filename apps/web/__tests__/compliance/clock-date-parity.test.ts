/**
 * The compliance clock in @propertypro/shared carries its own copy of
 * date-fns's `addMonths` (the package keeps no date-fns dependency). This pins
 * it to date-fns itself, which apps/web still depends on, so the move into
 * shared changed no rolling window, yearly cycle or late-posting cutoff.
 *
 * Swept over every day of nine years, at times near midnight and midday, for
 * the month counts the rule uses and a few awkward ones, in UTC (production)
 * and in a time zone with DST.
 */
import { addMonths } from 'date-fns';
import { afterEach, describe, expect, it } from 'vitest';
import { calculateRollingWindowStart } from '@propertypro/shared';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = [0, 1, 6, 11, 12, 13, 24];
const ORIGINAL_TZ = process.env.TZ;

function sweep(): number {
  let compared = 0;
  const start = Date.UTC(2020, 0, 1);
  const end = Date.UTC(2028, 11, 31);
  for (let day = start; day <= end; day += DAY_MS) {
    for (const offsetMs of [0, 30 * 60 * 1000, 12 * 60 * 60 * 1000, 23.5 * 60 * 60 * 1000]) {
      const reference = new Date(day + offsetMs);
      for (const months of MONTHS) {
        const ours = calculateRollingWindowStart(reference, months).getTime();
        const theirs = addMonths(reference, -months).getTime();
        if (ours !== theirs) {
          throw new Error(`${reference.toISOString()} − ${months} months: ${new Date(ours).toISOString()} ≠ ${new Date(theirs).toISOString()}`);
        }
        compared += 1;
      }
    }
  }
  return compared;
}

describe('compliance clock month arithmetic matches date-fns', () => {
  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  it('in UTC, as production runs', () => {
    process.env.TZ = 'UTC';
    expect(sweep()).toBeGreaterThan(90_000);
  });

  it('in a time zone with daylight saving', () => {
    process.env.TZ = 'America/New_York';
    expect(new Date(Date.UTC(2026, 6, 1)).getTimezoneOffset()).toBe(240); // the zone took effect
    expect(sweep()).toBeGreaterThan(90_000);
  });

  it('clamps to the end of a shorter month', () => {
    process.env.TZ = 'UTC';
    expect(calculateRollingWindowStart(new Date('2026-03-31T10:00:00.000Z'), 1).toISOString()).toBe(
      '2026-02-28T10:00:00.000Z',
    );
  });
});

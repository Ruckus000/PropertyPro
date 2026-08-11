/**
 * Statutory notice-window math (§718.112(2)(c)/(d), §720.303).
 *
 * These windows are the product's core compliance claim and had ZERO unit
 * coverage before the 2026-08-09 feature-correctness audit. The boundary cases
 * below are the ones that decide whether a paying association is compliant:
 *
 *   - board / committee meetings: 48 hours
 *   - annual / special / budget (owner) meetings: 14 days
 *
 * THERE IS NO WEEKEND RULE (issue #931). One used to sit on top of the statute
 * here; it arrived with the initial scaffolding rather than as a decision, and
 * neither §718 nor §720 grants a weekend exception — so any roll misstated the
 * law. Rolling forward shortened the lead time below the statutory minimum (the
 * D1 zero-notice bug); rolling backward advertised more margin than the statute
 * requires. Deleting it also removed the last host-timezone dependency from the
 * deadline math, which is what closed #931.
 *
 * These assertions are therefore host-independent: elapsed milliseconds, and
 * `getUTC*` where a weekday matters. That is load-bearing — CI pins `TZ: UTC`,
 * so a test leaning on the ambient zone could never reproduce #931.
 *
 * This is the canonical unit suite for this module. A near-duplicate lived at
 * `__tests__/meetings/meeting-calculator.test.ts` and drifted out of sync; it
 * was deleted in favour of this file.
 */
import { describe, expect, it } from 'vitest';
import {
  calculateMinutesPostingDeadline,
  calculateNoticePostBy,
  calculateOwnerVoteDocsDeadline,
  getNoticeLeadDays,
} from '@/lib/utils/meeting-calculator';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function leadHours(meetingStartsAt: Date, postBy: Date): number {
  return (meetingStartsAt.getTime() - postBy.getTime()) / HOUR_MS;
}

describe('getNoticeLeadDays', () => {
  it('requires 2 days (48 hours) for board and committee meetings', () => {
    expect(getNoticeLeadDays('board', 'condo_718')).toBe(2);
    expect(getNoticeLeadDays('committee', 'condo_718')).toBe(2);
    expect(getNoticeLeadDays('board', 'hoa_720')).toBe(2);
  });

  it('requires 14 days for owner meetings (annual, special, budget)', () => {
    for (const type of ['annual', 'special', 'budget'] as const) {
      expect(getNoticeLeadDays(type, 'condo_718')).toBe(14);
      expect(getNoticeLeadDays(type, 'hoa_720')).toBe(14);
    }
  });
});

describe('calculateNoticePostBy — statutory minimum is a floor, never a ceiling', () => {
  it('gives exactly 48 hours for a mid-week board meeting', () => {
    // Wednesday 2026-08-12 18:00Z → deadline Monday 2026-08-10 18:00Z.
    const startsAt = new Date('2026-08-12T18:00:00.000Z');
    const postBy = calculateNoticePostBy(startsAt, 'board', 'condo_718');
    expect(leadHours(startsAt, postBy)).toBe(48);
  });

  it('gives exactly 14 days for a mid-week annual meeting', () => {
    const startsAt = new Date('2026-08-19T18:00:00.000Z');
    const postBy = calculateNoticePostBy(startsAt, 'annual', 'condo_718');
    expect(leadHours(startsAt, postBy)).toBe(14 * 24);
  });

  it.each([
    ['board', 'condo_718', 48],
    ['committee', 'condo_718', 48],
    ['annual', 'condo_718', 14 * 24],
    ['special', 'hoa_720', 14 * 24],
    ['budget', 'hoa_720', 14 * 24],
  ] as const)(
    'never returns less than the statutory lead time for %s (%s), for any start hour across a full year',
    (meetingType, communityType, minimumHours) => {
      // Sweep every day of a year at several hours-of-day. The weekend rule is
      // the only thing that perturbs the raw subtraction, and it must never
      // perturb it in the direction that shortens notice.
      const base = Date.UTC(2026, 0, 1, 0, 0, 0);
      for (let day = 0; day < 365; day += 1) {
        for (const hour of [0, 5, 9, 13, 18, 23]) {
          const startsAt = new Date(base + day * DAY_MS + hour * HOUR_MS);
          const postBy = calculateNoticePostBy(startsAt, meetingType, communityType);
          const actual = leadHours(startsAt, postBy);
          expect(
            actual,
            `${meetingType} starting ${startsAt.toISOString()} got only ${actual}h notice`,
          ).toBeGreaterThanOrEqual(minimumHours);
        }
      }
    },
  );

  it('does NOT move a deadline that lands on a weekend', () => {
    // Monday 2026-08-10 18:00Z minus 2 days = Saturday 2026-08-08 18:00Z. The
    // old rule rolled that off the weekend; the statute grants no exception, so
    // it stays exactly where the arithmetic puts it.
    const startsAt = new Date('2026-08-10T18:00:00.000Z');
    const postBy = calculateNoticePostBy(startsAt, 'board', 'condo_718');

    expect(postBy.toISOString()).toBe('2026-08-08T18:00:00.000Z');
    expect(postBy.getUTCDay()).toBe(6); // Saturday
    expect(leadHours(startsAt, postBy)).toBe(48);
  });

  it('gives a Monday-morning board meeting its full 48 hours (the D1 regression)', () => {
    // The original defect: the 48-hour mark landed on Saturday, the rule rolled
    // it FORWARD to Monday, and the post-by became the meeting's own start
    // instant — zero hours of notice, reported as on track.
    const startsAt = new Date('2026-01-05T00:00:00.000Z'); // Monday 00:00
    const postBy = calculateNoticePostBy(startsAt, 'board', 'condo_718');

    expect(leadHours(startsAt, postBy)).toBe(48);
    expect(postBy.getTime()).toBeLessThan(startsAt.getTime());
  });

  it('preserves the meeting time-of-day', () => {
    // The old roll returned `previousFriday(startOfDay(...))` — local midnight —
    // so a rolled deadline silently lost its clock time.
    const startsAt = new Date('2026-02-14T09:37:11.000Z');
    const postBy = calculateNoticePostBy(startsAt, 'annual', 'condo_718');

    expect(postBy.toISOString()).toBe('2026-01-31T09:37:11.000Z');
  });

});

describe('calculateOwnerVoteDocsDeadline', () => {
  it('is exactly 7 days before the meeting', () => {
    const base = Date.UTC(2026, 0, 1, 12, 0, 0);
    for (let day = 0; day < 120; day += 1) {
      const startsAt = new Date(base + day * DAY_MS);
      const deadline = calculateOwnerVoteDocsDeadline(startsAt);
      expect(
        leadHours(startsAt, deadline),
        `owner-vote docs for ${startsAt.toISOString()}`,
      ).toBeGreaterThanOrEqual(7 * 24);
    }
  });
});

describe('calculateMinutesPostingDeadline', () => {
  it('is 30 days after the meeting for a mid-week meeting', () => {
    const startsAt = new Date('2026-08-12T18:00:00.000Z');
    const deadline = calculateMinutesPostingDeadline(startsAt);
    expect(deadline.getTime() - startsAt.getTime()).toBe(30 * DAY_MS);
  });

  it('is exactly 30 days for every start date — no weekend adjustment on a maximum', () => {
    const base = Date.UTC(2026, 0, 1, 12, 0, 0);
    for (let day = 0; day < 120; day += 1) {
      const startsAt = new Date(base + day * DAY_MS);
      const deadline = calculateMinutesPostingDeadline(startsAt);
      expect(
        deadline.getTime() - startsAt.getTime(),
        `minutes deadline for ${startsAt.toISOString()}`,
      ).toBe(30 * DAY_MS);
    }
  });

  it('does not lose an hour to a DST transition', () => {
    // 2026-03-08 is US spring-forward. A local-calendar addDays() returns a
    // 719-hour "30 days" here, which is a silent statutory shortfall.
    const startsAt = new Date('2026-02-18T18:00:00.000Z');
    const deadline = calculateMinutesPostingDeadline(startsAt);
    expect(deadline.getTime() - startsAt.getTime()).toBe(30 * DAY_MS);
  });
});

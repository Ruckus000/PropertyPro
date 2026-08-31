/**
 * §718.303(3) / §720.305(2) fine ceilings.
 *
 * The generated hearing notice has cited "$100 per violation, up to $1,000 in
 * aggregate" correctly since it was written, while the API validated
 * `amountCents` only as "a positive integer". The document knew the cap; the
 * code did not. These tests pin the direction that matters: an ABSENT setting
 * means the statutory default, never "uncapped".
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-04.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FINE_AGGREGATE_CAP_CENTS,
  DEFAULT_FINE_CAP_CENTS,
  formatCents,
  resolveFineCaps,
} from '@propertypro/shared';

describe('resolveFineCaps', () => {
  it('uses the statutory defaults when nothing is set', () => {
    // The load-bearing direction. Every community row predating these keys must
    // be CAPPED, not uncapped — the opposite default would leave every existing
    // association shipping unconstrained, which is the bug this closes.
    expect(resolveFineCaps({})).toEqual({
      perFineCents: DEFAULT_FINE_CAP_CENTS,
      aggregateCents: DEFAULT_FINE_AGGREGATE_CAP_CENTS,
    });
  });

  it.each([null, undefined, 'not an object', 42, []])(
    'falls back to the defaults for the malformed settings blob %o',
    (settings) => {
      expect(resolveFineCaps(settings)).toEqual({
        perFineCents: DEFAULT_FINE_CAP_CENTS,
        aggregateCents: DEFAULT_FINE_AGGREGATE_CAP_CENTS,
      });
    },
  );

  it('honours a positive integer override', () => {
    expect(
      resolveFineCaps({
        violationFineCapCents: 250_00,
        violationFineAggregateCapCents: 2_500_00,
      }),
    ).toEqual({ perFineCents: 250_00, aggregateCents: 2_500_00 });
  });

  it.each([0, -1, 1.5, '10000', true, null])(
    'IGNORES the invalid override %o and uses the statutory default',
    (bad) => {
      // `community_settings` is untyped JSONB written by an admin API. A zero
      // would mean "no fine may ever be imposed"; a string would compare
      // strangely against a number. Same defensive posture as the `=== true`
      // gate reads, and for the same reason.
      expect(resolveFineCaps({ violationFineCapCents: bad }).perFineCents).toBe(
        DEFAULT_FINE_CAP_CENTS,
      );
    },
  );

  it('resolves the two caps independently', () => {
    const caps = resolveFineCaps({ violationFineCapCents: 50_00 });
    expect(caps.perFineCents).toBe(50_00);
    expect(caps.aggregateCents).toBe(DEFAULT_FINE_AGGREGATE_CAP_CENTS);
  });

  it('pins the statutory figures themselves', () => {
    // If these ever change, it should be because the statute did — and the
    // change should be visible in a diff rather than buried in a helper.
    expect(DEFAULT_FINE_CAP_CENTS).toBe(10_000);
    expect(DEFAULT_FINE_AGGREGATE_CAP_CENTS).toBe(100_000);
  });
});

describe('formatCents', () => {
  it.each([
    [10_000, '$100.00'],
    [100_000, '$1000.00'],
    [1, '$0.01'],
    [0, '$0.00'],
  ])('formats %i as %s', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });
});

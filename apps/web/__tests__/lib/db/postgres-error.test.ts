import { describe, expect, it } from 'vitest';
import {
  hasPostgresErrorCode,
  isTopLevelUniqueConstraintError,
  isUniqueConstraintError,
} from '@/lib/db/postgres-error';

/**
 * Contract test for SVC-06's two shared Postgres-error predicates.
 *
 * The point of this file is the pair of cases marked DISCRIMINATOR below: the
 * two predicates agree on every shape EXCEPT a 23505 reached through `cause`,
 * and that disagreement is deliberate (see the header of the module under
 * test). Collapsing one onto the other therefore cannot be detected by any
 * single-predicate test — both halves must be asserted, and asserted against
 * each other.
 *
 * Revert-check: delete `hasPostgresErrorCode` from the module and the family-1
 * cases fail to import; replace its body with a top-level-only check (i.e.
 * collapse family 1 into family 2) and exactly the two `cause` cases here go
 * red while every other case stays green.
 */

/** The shape the driver actually throws: a wrapper carrying the real error. */
const WRAPPED_23505 = Object.assign(new Error('transaction aborted'), {
  cause: Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
  }),
});

/** The shape a direct driver error has: the code on the thrown object. */
const TOP_LEVEL_23505 = Object.assign(new Error('duplicate key'), { code: '23505' });

describe('hasPostgresErrorCode', () => {
  it('reads a code on the error itself', () => {
    expect(hasPostgresErrorCode(TOP_LEVEL_23505, '23505')).toBe(true);
  });

  it('walks `cause` to reach a wrapped code', () => {
    expect(hasPostgresErrorCode(WRAPPED_23505, '23505')).toBe(true);
  });

  it('walks several levels of `cause`', () => {
    const deep = Object.assign(new Error('layer 3'), {
      cause: Object.assign(new Error('layer 2'), { cause: TOP_LEVEL_23505 }),
    });
    expect(hasPostgresErrorCode(deep, '23505')).toBe(true);
  });

  it('is code-exact, so a different SQLSTATE does not match', () => {
    expect(hasPostgresErrorCode(TOP_LEVEL_23505, '23P01')).toBe(false);
    expect(
      hasPostgresErrorCode(Object.assign(new Error('x'), { code: '23P01' }), '23P01'),
    ).toBe(true);
  });

  it('refuses non-objects rather than throwing on them', () => {
    for (const value of [null, undefined, '23505', 42, false]) {
      expect(hasPostgresErrorCode(value, '23505')).toBe(false);
    }
  });

  it('refuses an object with no code and no cause', () => {
    expect(hasPostgresErrorCode(new Error('connection reset'), '23505')).toBe(false);
  });

  // NOT covered: a cyclic `cause` chain. The walk lifted here is recursive with
  // no visited-set, exactly as all three source copies had it — SVC-06 asked
  // for a verbatim lift, not a behaviour change, so the cycle limit is
  // inherited rather than introduced. Recorded as a follow-up in the PR.
});

describe('isUniqueConstraintError (family 1: cause-walking)', () => {
  it('matches a top-level 23505', () => {
    expect(isUniqueConstraintError(TOP_LEVEL_23505)).toBe(true);
  });

  it('DISCRIMINATOR — matches a 23505 wrapped in `cause`', () => {
    expect(isUniqueConstraintError(WRAPPED_23505)).toBe(true);
  });

  it('does not match an unrelated error', () => {
    expect(isUniqueConstraintError(new Error('connection reset'))).toBe(false);
  });
});

describe('isTopLevelUniqueConstraintError (family 2: code only)', () => {
  it('matches a top-level 23505', () => {
    expect(isTopLevelUniqueConstraintError(TOP_LEVEL_23505)).toBe(true);
  });

  it('DISCRIMINATOR — refuses a 23505 wrapped in `cause`', () => {
    // The elections duplicate-ballot branch depends on this being false: a
    // wrapped error must re-throw as a 500 rather than be reported to a voter
    // as "this unit has already submitted a ballot".
    expect(isTopLevelUniqueConstraintError(WRAPPED_23505)).toBe(false);
  });

  it('refuses non-objects rather than throwing on them', () => {
    for (const value of [null, undefined, '23505', 0]) {
      expect(isTopLevelUniqueConstraintError(value)).toBe(false);
    }
  });

  it('does not match any other SQLSTATE', () => {
    expect(
      isTopLevelUniqueConstraintError(Object.assign(new Error('x'), { code: '23P01' })),
    ).toBe(false);
  });
});

describe('the two families disagree on exactly one shape', () => {
  const shapes: Array<[string, unknown, boolean]> = [
    ['top-level 23505', TOP_LEVEL_23505, true],
    ['wrapped 23505', WRAPPED_23505, false],
    ['unrelated error', new Error('connection reset'), false],
    ['null', null, false],
    ['a string that looks like a code', '23505', false],
  ];

  for (const [label, value, topLevelResult] of shapes) {
    it(`${label}: family 1 ${
      isUniqueConstraintError(value) ? 'matches' : 'refuses'
    }, family 2 ${topLevelResult ? 'matches' : 'refuses'}`, () => {
      expect(isTopLevelUniqueConstraintError(value)).toBe(topLevelResult);
      // Family 1 is never narrower than family 2 — it is the same check plus a
      // cause walk. If this ever fails, a predicate was edited, not deduped.
      if (topLevelResult) {
        expect(isUniqueConstraintError(value)).toBe(true);
      }
    });
  }
});

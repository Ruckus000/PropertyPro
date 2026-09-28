import { DrizzleQueryError } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  hasPostgresErrorCode,
  isNamedUniqueViolation,
  isUniqueConstraintError,
} from '@/lib/db/postgres-error';

/**
 * Contract test for the shared Postgres-error predicates.
 *
 * The fixtures are built with drizzle's REAL wrapper class, because the shape
 * that matters is the one drizzle throws: a `DrizzleQueryError` with no
 * top-level `code`, carrying the postgres-js error on `.cause`. The integration
 * suite (`postgres-error-shape.integration.test.ts`) pins that this IS the shape
 * a real database produces; this file pins that the predicates read it.
 *
 * Revert-check: make `causeChain` yield only the outer error (a top-level-only
 * check — what `isTopLevelUniqueConstraintError` did) and every DRIZZLE case
 * below goes red while the top-level and negative cases stay green.
 */

/** What postgres-js throws: code + constraint_name on the error itself. */
function pgError(code: string, constraintName?: string) {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    code,
    ...(constraintName ? { constraint_name: constraintName } : {}),
  });
}

/** What the app actually catches on every drizzle path. */
function drizzleWrapped(cause: unknown) {
  return new DrizzleQueryError('insert into "t" values ($1)', [1], cause as Error);
}

const DRIZZLE_23505 = drizzleWrapped(pgError('23505', 'uq_thing'));

describe('the drizzle shape itself', () => {
  it('has no top-level code — which is why a top-level-only check is dead', () => {
    expect((DRIZZLE_23505 as unknown as { code?: unknown }).code).toBeUndefined();
  });
});

describe('hasPostgresErrorCode', () => {
  it('reads a code on the error itself', () => {
    expect(hasPostgresErrorCode(pgError('23505'), '23505')).toBe(true);
  });

  it('DRIZZLE — reaches the code through DrizzleQueryError.cause', () => {
    expect(hasPostgresErrorCode(DRIZZLE_23505, '23505')).toBe(true);
  });

  it('walks several levels of `cause`', () => {
    const deep = Object.assign(new Error('layer 3'), { cause: DRIZZLE_23505 });
    expect(hasPostgresErrorCode(deep, '23505')).toBe(true);
  });

  it('is code-exact, so a different SQLSTATE does not match', () => {
    expect(hasPostgresErrorCode(DRIZZLE_23505, '23P01')).toBe(false);
    expect(hasPostgresErrorCode(drizzleWrapped(pgError('23P01')), '23P01')).toBe(true);
  });

  it('terminates on a cyclic `cause` chain', () => {
    const a: { cause?: unknown } = {};
    const b = { cause: a };
    a.cause = b;
    expect(hasPostgresErrorCode(a, '23505')).toBe(false);
  });

  it('refuses non-objects rather than throwing on them', () => {
    for (const value of [null, undefined, '23505', 42, false]) {
      expect(hasPostgresErrorCode(value, '23505')).toBe(false);
    }
  });

  it('refuses an error with no code anywhere', () => {
    expect(hasPostgresErrorCode(drizzleWrapped(new Error('connection reset')), '23505')).toBe(
      false,
    );
  });
});

describe('isUniqueConstraintError', () => {
  it('DRIZZLE — matches a wrapped 23505', () => {
    expect(isUniqueConstraintError(DRIZZLE_23505)).toBe(true);
  });

  it('does not match a wrapped foreign-key violation', () => {
    expect(isUniqueConstraintError(drizzleWrapped(pgError('23503')))).toBe(false);
  });
});

describe('isNamedUniqueViolation', () => {
  it('DRIZZLE — matches the named constraint through .cause', () => {
    expect(isNamedUniqueViolation(DRIZZLE_23505, 'uq_thing')).toBe(true);
  });

  it('refuses a 23505 raised by a DIFFERENT constraint', () => {
    expect(isNamedUniqueViolation(DRIZZLE_23505, 'uq_other')).toBe(false);
  });

  it('refuses the right name on a non-23505 code', () => {
    expect(isNamedUniqueViolation(drizzleWrapped(pgError('23503', 'uq_thing')), 'uq_thing')).toBe(
      false,
    );
  });

  it('reads node-postgres `constraint` as well as postgres-js `constraint_name`', () => {
    const nodePg = Object.assign(new Error('dup'), { code: '23505', constraint: 'uq_thing' });
    expect(isNamedUniqueViolation(drizzleWrapped(nodePg), 'uq_thing')).toBe(true);
  });
});

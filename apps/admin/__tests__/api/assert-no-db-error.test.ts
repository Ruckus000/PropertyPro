import { describe, expect, it } from 'vitest';
import { AppError } from '@propertypro/shared/http';
import { assertNoDbError } from '@/lib/api/assert-no-db-error';

describe('assertNoDbError', () => {
  it('does nothing when the query succeeded', () => {
    expect(() => assertNoDbError(null, 'ctx')).not.toThrow();
    expect(() => assertNoDbError(undefined, 'ctx')).not.toThrow();
  });

  it('carries the real message and code into the thrown error', () => {
    expect(() =>
      assertNoDbError({ message: 'relation "site_blocks" does not exist', code: '42P01' }, 'Failed to read blocks'),
    ).toThrow('Failed to read blocks: relation "site_blocks" does not exist (code 42P01)');
  });

  it('omits the code fragment when there is no code', () => {
    expect(() => assertNoDbError({ message: 'boom' }, 'Failed')).toThrow('Failed: boom');
  });

  // This is the load-bearing property. `withAdminErrorHandler` echoes an
  // AppError's message to the client and does NOT report it to Sentry — both
  // wrong for a database failure. Throwing a plain Error routes it down the
  // unknown-error branch: opaque 500 to the caller, real message to Sentry.
  it('throws a plain Error, never an AppError', () => {
    let thrown: unknown;
    try {
      assertNoDbError({ message: 'permission denied for table users' }, 'ctx');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(AppError);
  });
});

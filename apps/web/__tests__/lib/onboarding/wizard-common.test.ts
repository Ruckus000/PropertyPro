import { beforeAll, describe, expect, it } from 'vitest';

let isUniqueViolation: typeof import('../../../src/lib/onboarding/wizard-common').isUniqueViolation;
let requireMutationAuthorization: typeof import('../../../src/lib/onboarding/wizard-common').requireMutationAuthorization;

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
  ({ isUniqueViolation, requireMutationAuthorization } = await import('../../../src/lib/onboarding/wizard-common'));
});

describe('requireMutationAuthorization', () => {
  it('allows admin-tier roles including the v3 property_manager / root_manager (lockout regression guard)', () => {
    expect(() => requireMutationAuthorization('property_manager')).not.toThrow();
    expect(() => requireMutationAuthorization('root_manager')).not.toThrow();
  });

  it('rejects resident-tier roles', () => {
    expect(() => requireMutationAuthorization('resident')).toThrow();
  });
});

describe('isUniqueViolation', () => {
  it('returns true for a direct Postgres unique-violation error', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('returns true for a Drizzle-wrapped Postgres unique-violation error', () => {
    expect(
      isUniqueViolation({
        message: 'Failed query',
        cause: { code: '23505' },
      }),
    ).toBe(true);
  });

  it('returns false for non-unique database errors', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
  });
});

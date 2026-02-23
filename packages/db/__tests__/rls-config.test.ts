import { describe, it, expect } from 'vitest';

const {
  RLS_EXPECTED_TENANT_TABLE_COUNT,
  RLS_TENANT_TABLES,
  validateRlsConfigInvariant,
} = await import('../src/schema/rls-config');

describe('rls-config invariant', () => {
  it('RLS_TENANT_TABLES.length matches the hardcoded RLS_EXPECTED_TENANT_TABLE_COUNT', () => {
    // If this fails after adding/removing a table, update the hardcoded constant too.
    // The production code intentionally uses a literal so that shrinking the array
    // is caught at test time rather than silently passing.
    expect(RLS_TENANT_TABLES.length).toBe(RLS_EXPECTED_TENANT_TABLE_COUNT);
  });

  it('validateRlsConfigInvariant() returns no problems', () => {
    const problems = validateRlsConfigInvariant();
    expect(problems).toEqual([]);
  });
});

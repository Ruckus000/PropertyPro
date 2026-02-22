import { describe, expect, it } from 'vitest';
import {
  RLS_EXPECTED_TENANT_TABLE_COUNT,
  RLS_GLOBAL_EXCLUSION_NAMES,
  RLS_TENANT_TABLE_NAMES,
  validateRlsConfigInvariant,
} from '../src/schema/rls-config';

const describeDb = process.env.DATABASE_URL && process.env.DIRECT_URL ? describe : describe.skip;

describe('P4-55 RLS config scaffold', () => {
  it('tracks the current tenant-scoped table inventory', () => {
    expect(RLS_TENANT_TABLE_NAMES).toHaveLength(RLS_EXPECTED_TENANT_TABLE_COUNT);
  });

  it('keeps tenant-scoped and global exclusion lists disjoint', () => {
    const overlap = RLS_TENANT_TABLE_NAMES.filter((name) =>
      RLS_GLOBAL_EXCLUSION_NAMES.includes(name),
    );

    expect(overlap).toEqual([]);
  });

  it('passes local config invariants', () => {
    expect(validateRlsConfigInvariant()).toEqual([]);
  });
});

describeDb('P4-55 RLS policies (integration)', () => {
  it.todo('enables RLS on every table listed in RLS_TENANT_TABLE_NAMES');
  it.todo('denies cross-tenant SELECTs for authenticated community-scoped users');
  it.todo('denies forged cross-tenant INSERT/UPDATE/DELETE attempts');
  it.todo('restricts compliance_audit_log reads to authorized canonical roles');
  it.todo('preserves service-role bypass for background jobs and migrations');
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'migrations/0124_apartment_rent_obligations_and_lease_guards.sql',
);

describe('M2 rent migration contract', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('creates rent obligation/payment tables with tenant RLS hooks', () => {
    expect(sql).toContain('CREATE TABLE rent_obligations');
    expect(sql).toContain('CREATE TABLE rent_payments');
    expect(sql).toContain('ALTER TABLE rent_obligations ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE rent_payments ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('CREATE TRIGGER "pp_rls_enforce_tenant_scope"');
  });

  it('enforces lease validity, overlap, and renewal continuity invariants', () => {
    expect(sql).toContain('leases_start_first_of_month_check');
    expect(sql).toContain('leases_end_after_start_check');
    expect(sql).toContain('leases_no_overlap_per_unit');
    expect(sql).toContain('pp_enforce_lease_renewal_continuity');
    expect(sql).toContain('leases_enforce_renewal_continuity');
  });

  it('contains rent source-of-truth convergence logic', () => {
    expect(sql).toContain('pp_sync_unit_rent_amount_from_lease');
    expect(sql).toContain('pp_leases_sync_unit_rent_amount');
    expect(sql).toContain('pp_block_direct_unit_rent_amount_write');
    expect(sql).toContain('units_block_direct_rent_amount_write');
    expect(sql).toContain('UPDATE units u');
  });
});

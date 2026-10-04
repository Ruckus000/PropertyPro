import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guards on migration 0088 (the lease→unit rent sync advances
 * units.updated_at monotonically, like every scoped write).
 *
 * The integration suite proves the behaviour but is skipped in the unit job;
 * this file pins the two things a later CREATE OR REPLACE of the same function
 * could silently undo: the pinned search_path (0039) and the version stamp.
 */

function normalize(sql: string): string {
  return sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');
}

const MIGRATION = normalize(
  readFileSync(path.resolve(__dirname, '../migrations/0088_sync_unit_rent_monotonic_updated_at.sql'), 'utf8'),
);

describe('migration 0088: rent sync stamps a monotonic updated_at', () => {
  it('replaces pp_sync_unit_rent_amount_from_lease and keeps its pinned search_path', () => {
    expect(MIGRATION).toContain(
      'CREATE OR REPLACE FUNCTION public.pp_sync_unit_rent_amount_from_lease(target_unit_id bigint)',
    );
    expect(MIGRATION).toContain("SET search_path TO 'public', 'pg_catalog'");
  });

  it("stamps the scoped client's expression, and never a bare NOW()", () => {
    expect(MIGRATION).toContain(
      "updated_at = greatest( date_trunc('milliseconds', now()), date_trunc('milliseconds', updated_at) + interval '1 millisecond' )",
    );
    expect(MIGRATION).not.toMatch(/updated_at\s*=\s*now\(\)/i);
  });
});

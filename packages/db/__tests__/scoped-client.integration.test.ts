/**
 * Integration tests for the scoped query builder.
 * These require a real database connection via DATABASE_URL.
 *
 * Run with: pnpm --filter @propertypro/db test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/schema';
import { communities } from '../src/schema/communities';
import { units } from '../src/schema/units';
import { TenantContextMissing } from '../src/errors/TenantContextMissing';

// Skip entirely if no DATABASE_URL is set
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const TEST_HARD_DELETE_CONFLICT_UNIT = '__test_hard_delete_conflict__';
type CreateScopedClient = typeof import('../src/scoped-client').createScopedClient;

describeDb('scoped-client (integration)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let communityAId: number;
  let communityBId: number;
  let createScopedClient: CreateScopedClient;

  beforeAll(async () => {
    // Import lazily so DATABASE_URL-less environments can skip the suite cleanly.
    createScopedClient = (await import('../src/scoped-client')).createScopedClient;

    sql = postgres(process.env.DATABASE_URL!, { prepare: false });
    db = drizzle(sql, { schema });

    // Clean up any existing test data
    await db.delete(units).where(eq(units.unitNumber, '__test_a1__'));
    await db.delete(units).where(eq(units.unitNumber, '__test_a2__'));
    await db.delete(units).where(eq(units.unitNumber, '__test_b1__'));
    await db.delete(units).where(eq(units.unitNumber, '__test_qid_a__'));
    await db.delete(units).where(eq(units.unitNumber, '__test_restore_a__'));
    await db.delete(units).where(eq(units.unitNumber, '__test_qbid_cross__'));
    await db.delete(units).where(eq(units.unitNumber, '__test_qwhere_cross__'));
    await db.delete(units).where(eq(units.unitNumber, TEST_HARD_DELETE_CONFLICT_UNIT));
    await db.delete(communities).where(eq(communities.slug, '__test_community_a__'));
    await db.delete(communities).where(eq(communities.slug, '__test_community_b__'));

    // Seed community A
    const [communityA] = await db
      .insert(communities)
      .values({
        name: 'Test Community A',
        slug: '__test_community_a__',
        communityType: 'condo_718',
        timezone: 'America/New_York',
      })
      .returning();
    communityAId = communityA!.id;

    // Seed community B
    const [communityB] = await db
      .insert(communities)
      .values({
        name: 'Test Community B',
        slug: '__test_community_b__',
        communityType: 'hoa_720',
        timezone: 'America/Chicago',
      })
      .returning();
    communityBId = communityB!.id;

    // Seed units in community A
    await db.insert(units).values([
      { communityId: communityAId, unitNumber: '__test_a1__' },
      { communityId: communityAId, unitNumber: '__test_a2__' },
    ]);

    // Seed units in community B
    await db.insert(units).values([
      { communityId: communityBId, unitNumber: '__test_b1__' },
    ]);
  });

  afterAll(async () => {
    // Clean up test data
    if (db) {
      await db.delete(units).where(eq(units.unitNumber, '__test_a1__'));
      await db.delete(units).where(eq(units.unitNumber, '__test_a2__'));
      await db.delete(units).where(eq(units.unitNumber, '__test_b1__'));
      await db.delete(units).where(eq(units.unitNumber, '__test_qid_a__'));
      await db.delete(units).where(eq(units.unitNumber, '__test_restore_a__'));
      await db.delete(units).where(eq(units.unitNumber, TEST_HARD_DELETE_CONFLICT_UNIT));
      await db.delete(communities).where(eq(communities.slug, '__test_community_a__'));
      await db.delete(communities).where(eq(communities.slug, '__test_community_b__'));
    }
    if (sql) {
      await sql.end();
    }
  });

  it('community A client only sees community A units', async () => {
    const clientA = createScopedClient(communityAId, db);
    const results = await clientA.query(units);

    // Should see community A's units only
    const testUnits = results.filter(
      (u: Record<string, unknown>) =>
        (u['unitNumber'] as string).startsWith('__test_'),
    );
    expect(testUnits.length).toBe(2);
    for (const unit of testUnits) {
      expect(unit['communityId']).toBe(communityAId);
    }
  });

  it('community B client sees zero community A units', async () => {
    const clientB = createScopedClient(communityBId, db);
    const results = await clientB.query(units);

    const communityAUnits = results.filter(
      (u: Record<string, unknown>) => u['communityId'] === communityAId,
    );
    expect(communityAUnits.length).toBe(0);
  });

  it('soft-deleted units disappear from queries', async () => {
    const clientA = createScopedClient(communityAId, db);

    // Soft-delete one unit
    await clientA.softDelete(units, eq(units.unitNumber, '__test_a1__'));

    // Query should no longer return the soft-deleted unit
    const results = await clientA.query(units);
    const testUnits = results.filter(
      (u: Record<string, unknown>) =>
        (u['unitNumber'] as string).startsWith('__test_'),
    );
    expect(testUnits.length).toBe(1);
    expect(testUnits[0]!['unitNumber']).toBe('__test_a2__');

    // Restore: un-soft-delete for cleanup
    await db
      .update(units)
      .set({ deletedAt: null })
      .where(eq(units.unitNumber, '__test_a1__'));
  });

  it('throws TenantContextMissing when communityId is missing', () => {
    expect(() => createScopedClient(undefined, db)).toThrow(TenantContextMissing);
    expect(() => createScopedClient(null, db)).toThrow(TenantContextMissing);
  });

  it('community A client cannot bypass scoping by passing communityB id in insert', async () => {
    const clientA = createScopedClient(communityAId, db);

    // Try to insert a unit with community B's id — should be overridden
    const [inserted] = await clientA.insert(units, {
      communityId: communityBId,
      unitNumber: '__test_bypass__',
    });

    expect(inserted).toBeDefined();
    expect((inserted as Record<string, unknown>)['communityId']).toBe(communityAId);

    // Clean up
    await db.delete(units).where(eq(units.unitNumber, '__test_bypass__'));
  });

  it('community A client cannot bypass scoping with conflicting tenant WHERE in update', async () => {
    const clientA = createScopedClient(communityAId, db);

    const updated = await clientA.update(
      units,
      { building: 'Bypass Attempt' },
      and(
        eq(units.unitNumber, '__test_a2__'),
        eq(units.communityId, communityBId),
      ),
    );

    expect(updated).toHaveLength(0);
  });

  it('community A client cannot bypass scoping with conflicting tenant WHERE in hardDelete', async () => {
    const clientA = createScopedClient(communityAId, db);

    await db.insert(units).values({
      communityId: communityAId,
      unitNumber: TEST_HARD_DELETE_CONFLICT_UNIT,
    });

    const deleted = await clientA.hardDelete(
      units,
      and(
        eq(units.unitNumber, TEST_HARD_DELETE_CONFLICT_UNIT),
        eq(units.communityId, communityBId),
      ),
    );

    expect(deleted).toHaveLength(0);

    const remaining = await clientA.query(units);
    const conflictRow = remaining.find(
      (row: Record<string, unknown>) =>
        row['unitNumber'] === TEST_HARD_DELETE_CONFLICT_UNIT,
    );

    expect(conflictRow).toBeDefined();

    // Clean up
    await db.delete(units).where(eq(units.unitNumber, TEST_HARD_DELETE_CONFLICT_UNIT));
  });

  it('queryIncludingDeleted returns soft-deleted rows while still respecting tenant scope', async () => {
    const clientA = createScopedClient(communityAId, db);
    const clientB = createScopedClient(communityBId, db);
    const unitNumber = '__test_qid_a__';

    await db.insert(units).values({ communityId: communityAId, unitNumber });
    await clientA.softDelete(units, eq(units.unitNumber, unitNumber));

    // Default query hides soft-deleted rows
    const liveRows = await clientA.query(units);
    expect(liveRows.find((u) => (u as Record<string, unknown>)['unitNumber'] === unitNumber)).toBeUndefined();

    // queryIncludingDeleted surfaces them
    const allRows = await clientA.queryIncludingDeleted(units);
    const deletedRow = allRows.find(
      (u) => (u as Record<string, unknown>)['unitNumber'] === unitNumber,
    ) as Record<string, unknown> | undefined;
    expect(deletedRow).toBeDefined();
    expect(deletedRow?.['deletedAt']).not.toBeNull();

    // Tenant scope still applies — community B sees nothing
    const crossTenantRows = await clientB.queryIncludingDeleted(units);
    expect(
      crossTenantRows.find((u) => (u as Record<string, unknown>)['unitNumber'] === unitNumber),
    ).toBeUndefined();

    // Clean up
    await db.delete(units).where(eq(units.unitNumber, unitNumber));
  });

  it('restoreSoftDelete clears deletedAt, bumps updatedAt, and stays tenant-scoped', async () => {
    const clientA = createScopedClient(communityAId, db);
    const clientB = createScopedClient(communityBId, db);
    const unitNumber = '__test_restore_a__';

    await db.insert(units).values({ communityId: communityAId, unitNumber });
    await clientA.softDelete(units, eq(units.unitNumber, unitNumber));

    const deletedRow = (await clientA.queryIncludingDeleted(units)).find(
      (u) => (u as Record<string, unknown>)['unitNumber'] === unitNumber,
    ) as Record<string, unknown>;
    const preRestoreUpdatedAt = deletedRow['updatedAt'] as Date;

    // Cross-tenant restore is a no-op (community B's scope doesn't see community A rows)
    const crossTenantRestore = await clientB.restoreSoftDelete(
      units,
      eq(units.unitNumber, unitNumber),
    );
    expect(crossTenantRestore).toHaveLength(0);

    // Same-tenant restore clears deletedAt
    const restored = await clientA.restoreSoftDelete(units, eq(units.unitNumber, unitNumber));
    expect(restored).toHaveLength(1);

    const afterRestore = (await clientA.query(units)).find(
      (u) => (u as Record<string, unknown>)['unitNumber'] === unitNumber,
    ) as Record<string, unknown>;
    expect(afterRestore).toBeDefined();
    expect(afterRestore['deletedAt']).toBeNull();
    const postRestoreUpdatedAt = afterRestore['updatedAt'] as Date;
    expect(new Date(postRestoreUpdatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(preRestoreUpdatedAt).getTime(),
    );

    // Clean up
    await db.delete(units).where(eq(units.unitNumber, unitNumber));
  });

  it('queryById returns the row for the owning tenant and null across tenants', async () => {
    const clientA = createScopedClient(communityAId, db);
    const clientB = createScopedClient(communityBId, db);
    const unitNumber = '__test_qbid_cross__';

    await db.delete(units).where(eq(units.unitNumber, unitNumber));
    const [inserted] = await db
      .insert(units)
      .values({ communityId: communityAId, unitNumber })
      .returning();
    const unitId = (inserted as { id: number }).id;

    const sameTenant = (await clientA.queryById(units, unitId)) as Record<string, unknown> | null;
    expect(sameTenant).not.toBeNull();
    expect(sameTenant?.['unitNumber']).toBe(unitNumber);

    // Cross-tenant read by primary key must be silent — null, not a thrown row from community A
    const crossTenant = await clientB.queryById(units, unitId);
    expect(crossTenant).toBeNull();

    // Default queryById excludes soft-deleted rows
    await clientA.softDelete(units, eq(units.unitNumber, unitNumber));
    const afterSoftDelete = await clientA.queryById(units, unitId);
    expect(afterSoftDelete).toBeNull();

    // includeSoftDeleted: true surfaces them for the owning tenant only
    const withDeleted = (await clientA.queryById(units, unitId, {
      includeSoftDeleted: true,
    })) as Record<string, unknown> | null;
    expect(withDeleted).not.toBeNull();
    expect(withDeleted?.['deletedAt']).not.toBeNull();

    // And cross-tenant is still null even with includeSoftDeleted
    const crossWithDeleted = await clientB.queryById(units, unitId, { includeSoftDeleted: true });
    expect(crossWithDeleted).toBeNull();

    await db.delete(units).where(eq(units.unitNumber, unitNumber));
  });

  it('queryWhere applies tenant + soft-delete scoping on top of a caller filter', async () => {
    const clientA = createScopedClient(communityAId, db);
    const clientB = createScopedClient(communityBId, db);
    const unitNumber = '__test_qwhere_cross__';

    await db.delete(units).where(eq(units.unitNumber, unitNumber));
    await db.insert(units).values({ communityId: communityAId, unitNumber });

    // Owning tenant sees the row via a non-id filter
    const rowsA = await clientA.queryWhere(units, eq(units.unitNumber, unitNumber));
    expect(rowsA).toHaveLength(1);
    expect((rowsA[0] as Record<string, unknown>)['unitNumber']).toBe(unitNumber);

    // Cross-tenant reads nothing with the same filter
    const rowsB = await clientB.queryWhere(units, eq(units.unitNumber, unitNumber));
    expect(rowsB).toHaveLength(0);

    // queryWhere hides soft-deleted rows by default (matches query())
    await clientA.softDelete(units, eq(units.unitNumber, unitNumber));
    const afterSoftDelete = await clientA.queryWhere(units, eq(units.unitNumber, unitNumber));
    expect(afterSoftDelete).toHaveLength(0);

    await db.delete(units).where(eq(units.unitNumber, unitNumber));
  });
});

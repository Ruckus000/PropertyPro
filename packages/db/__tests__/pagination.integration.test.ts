/**
 * Integration tests for {@link paginate} (Plan A2 / Phase 0.4d).
 *
 * Unit tests cover the pure logic (clamp, encode/decode, mocked builder).
 * These integration tests prove the SQL is valid against the real schema
 * and the cursor predicate works against an actual Postgres bigint id column.
 *
 * Skip cleanly when DATABASE_URL is unset (e.g. in worktrees without env vars);
 * runs in CI against the seeded Postgres via `vitest --config vitest.integration.config.ts`.
 *
 * Cleanup uses `__pgnt_test_*__` filename prefixes so failures don't poison
 * the seed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, like } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../src/schema';
import { communities } from '../src/schema/communities';
import { units } from '../src/schema/units';
import { decodeCursor, paginate } from '../src/pagination';
import type { ScopedClient } from '../src/types/scoped-client';

const PAGE_SIZE = 50;
const TOTAL_ROWS = 250;
const UNIT_PREFIX = '__pgnt_test_';
const COMMUNITY_SLUG = '__pgnt_test_community__';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('paginate (integration)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let communityId: number;
  let createScopedClient: (id: number, dbInstance: ReturnType<typeof drizzle>) => ScopedClient;
  let scoped: ScopedClient;
  // The id of one row we'll soft-delete to prove the scope filter still
  // hides it during pagination.
  let softDeletedRowId: number;

  beforeAll(async () => {
    createScopedClient = (await import('../src/scoped-client')).createScopedClient as never;

    sql = postgres(process.env.DATABASE_URL!, { prepare: false });
    db = drizzle(sql, { schema });

    // Clean up anything left over from a previous failed run.
    await db.delete(units).where(like(units.unitNumber, `${UNIT_PREFIX}%`));
    await db.delete(communities).where(eq(communities.slug, COMMUNITY_SLUG));

    const [community] = await db
      .insert(communities)
      .values({
        name: 'Pagination Test Community',
        slug: COMMUNITY_SLUG,
        communityType: 'condo_718',
        timezone: 'America/New_York',
      })
      .returning();
    communityId = community!.id;

    // 250 rows so we exercise multiple pages and the look-ahead.
    const rows = Array.from({ length: TOTAL_ROWS }, (_, i) => ({
      communityId,
      unitNumber: `${UNIT_PREFIX}${String(i).padStart(4, '0')}__`,
    }));
    await db.insert(units).values(rows);

    // Soft-delete one row in the middle of the range so we can prove the
    // scoped client's automatic filter is honored during pagination.
    const [middleRow] = await db
      .select()
      .from(units)
      .where(eq(units.unitNumber, `${UNIT_PREFIX}0125__`))
      .limit(1);
    softDeletedRowId = middleRow!.id;
    await db
      .update(units)
      .set({ deletedAt: new Date() })
      .where(eq(units.id, softDeletedRowId));

    scoped = createScopedClient(communityId, db);
  });

  afterAll(async () => {
    if (db) {
      await db.delete(units).where(like(units.unitNumber, `${UNIT_PREFIX}%`));
      await db.delete(communities).where(eq(communities.slug, COMMUNITY_SLUG));
    }
    if (sql) {
      await sql.end();
    }
  });

  it('paginates forward through all rows with no gaps or duplicates', async () => {
    const seen = new Set<number>();
    let cursor: string | null | undefined = undefined;
    let pages = 0;
    const maxPages = 10; // safety cap; 250 rows / 50 per page = 5 pages
    while (pages < maxPages) {
      const result = await paginate(scoped, units, { cursor, pageSize: PAGE_SIZE });
      pages += 1;

      // No duplicates across pages.
      for (const row of result.data) {
        const id = row['id'] as number;
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }

      // pageSize is honored on every page except (possibly) the last.
      if (result.pagination.hasMore) {
        expect(result.data.length).toBe(PAGE_SIZE);
      } else {
        expect(result.data.length).toBeGreaterThan(0);
        expect(result.data.length).toBeLessThanOrEqual(PAGE_SIZE);
      }

      // Effective pageSize echoed in metadata.
      expect(result.pagination.pageSize).toBe(PAGE_SIZE);

      cursor = result.pagination.nextCursor;
      if (!cursor) break;
    }

    // 250 rows minus the 1 soft-deleted row = 249 visible rows.
    expect(seen.size).toBe(TOTAL_ROWS - 1);
    // Soft-deleted row never appears.
    expect(seen.has(softDeletedRowId)).toBe(false);
  });

  it('returns rows in descending id order (default direction)', async () => {
    const result = await paginate(scoped, units, { pageSize: PAGE_SIZE });
    const ids = result.data.map((r) => r['id'] as number);
    const sorted = [...ids].sort((a, b) => b - a);
    expect(ids).toEqual(sorted);
  });

  it('emits a cursor that points at the last row of data, not the look-ahead', async () => {
    const result = await paginate(scoped, units, { pageSize: PAGE_SIZE });
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextCursor).not.toBeNull();
    const decoded = decodeCursor(result.pagination.nextCursor);
    expect(decoded).not.toBeNull();
    const lastVisibleId = result.data[result.data.length - 1]!['id'] as number;
    expect(decoded!.id).toBe(lastVisibleId);
  });

  it('returns hasMore=false on the final page', async () => {
    // Walk to the end.
    let cursor: string | null | undefined = undefined;
    let last: Awaited<ReturnType<typeof paginate>> | null = null;
    for (let i = 0; i < 10; i++) {
      const result = await paginate(scoped, units, { cursor, pageSize: PAGE_SIZE });
      last = result;
      cursor = result.pagination.nextCursor;
      if (!cursor) break;
    }
    expect(last).not.toBeNull();
    expect(last!.pagination.hasMore).toBe(false);
    expect(last!.pagination.nextCursor).toBeNull();
  });

  it('returns empty data and hasMore=false when cursor is past the smallest id', async () => {
    // Default direction is desc, so a cursor with id=0 means "give me rows
    // with id < 0" — none exist.
    const { encodeCursor } = await import('../src/pagination');
    const staleCursor = encodeCursor(0);
    const result = await paginate(scoped, units, {
      cursor: staleCursor,
      pageSize: PAGE_SIZE,
    });
    expect(result.data).toEqual([]);
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextCursor).toBeNull();
  });

  it('treats a malformed cursor as "first page" (no error)', async () => {
    const result = await paginate(scoped, units, {
      cursor: 'not-a-real-cursor!!',
      pageSize: PAGE_SIZE,
    });
    expect(result.data.length).toBe(PAGE_SIZE);
    expect(result.pagination.hasMore).toBe(true);
  });

  it('does not return rows from a different community', async () => {
    const result = await paginate(scoped, units, { pageSize: PAGE_SIZE });
    for (const row of result.data) {
      expect(row['communityId']).toBe(communityId);
    }
  });
});

/**
 * Integration tests for assertNoUnrecognizedProductionData.
 *
 * Exercises the DB-side backstop against a real Postgres (DATABASE_URL).
 * Skipped when DATABASE_URL is not set.
 *
 * These tests are differential: they don't assume a clean baseline (the demo
 * DB may have residual non-demo communities from other test runs). They
 * instead verify behaviors that hold regardless of baseline:
 *  - adding a non-demo community causes the assertion to throw
 *  - PROPERTYPRO_SEED_ACK_NONDEMO=1 always suppresses the throw
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { inArray } from 'drizzle-orm';
import * as schema from '../src/schema';
import { communities } from '../src/schema';
import {
  SeedSafetyError,
  assertNoUnrecognizedProductionData,
} from '../../../scripts/lib/seed-safety';

const describeDb = process.env.DATABASE_URL ? describe.sequential : describe.skip;

describeDb('assertNoUnrecognizedProductionData (integration)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  const runTag = `safety-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const createdCommunityIds: number[] = [];
  const originalAck = process.env.PROPERTYPRO_SEED_ACK_NONDEMO;

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });
    db = drizzle(sql, { schema });
  });

  afterEach(() => {
    if (originalAck === undefined) {
      delete process.env.PROPERTYPRO_SEED_ACK_NONDEMO;
    } else {
      process.env.PROPERTYPRO_SEED_ACK_NONDEMO = originalAck;
    }
  });

  afterAll(async () => {
    if (createdCommunityIds.length > 0) {
      await db.delete(communities).where(inArray(communities.id, createdCommunityIds));
    }
    await sql.end();
  });

  async function createNonDemoCommunity(slug: string): Promise<number> {
    const [row] = await db
      .insert(communities)
      .values({
        name: `Safety Test ${slug}`,
        slug,
        communityType: 'condo_718',
        timezone: 'America/New_York',
        isDemo: false,
      })
      .returning({ id: communities.id });
    if (!row) throw new Error(`failed to insert community ${slug}`);
    createdCommunityIds.push(row.id);
    return row.id;
  }

  it('throws with a SeedSafetyError when a non-demo community is present', async () => {
    delete process.env.PROPERTYPRO_SEED_ACK_NONDEMO;
    const slug = `nondemo.${runTag}`;
    await createNonDemoCommunity(slug);

    await expect(assertNoUnrecognizedProductionData(db)).rejects.toThrow(SeedSafetyError);
    try {
      await assertNoUnrecognizedProductionData(db);
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain(slug);
      expect(message).toContain('PROPERTYPRO_SEED_ACK_NONDEMO');
    }
  });

  it('passes when PROPERTYPRO_SEED_ACK_NONDEMO=1 is set (regardless of DB state)', async () => {
    process.env.PROPERTYPRO_SEED_ACK_NONDEMO = '1';
    // The non-demo community from the previous test is still present; that is
    // the scenario we want to cover — ack overrides the backstop.
    await expect(assertNoUnrecognizedProductionData(db)).resolves.toBeUndefined();
  });

  it('parses postgres-js result shape (array) correctly and extracts slug + id', async () => {
    delete process.env.PROPERTYPRO_SEED_ACK_NONDEMO;
    // Add a second non-demo community and verify both surface in the error message
    const slug2 = `nondemo2.${runTag}`;
    const id2 = await createNonDemoCommunity(slug2);

    try {
      await assertNoUnrecognizedProductionData(db);
      throw new Error('expected SeedSafetyError');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain(slug2);
      expect(message).toContain(`id=${String(id2)}`);
    }
  });
});

/**
 * The two overlap EXCLUDE constraints restored by migration 0100, asserted
 * against the LIVE migrated `public` tables.
 *
 * `leases_no_overlap_per_unit` must agree with the app's own rule,
 * `ensureNoUnitLeaseOverlap` (apps/web/src/lib/leases/lease-rules.ts): a
 * cancelled or terminated lease does not hold the unit, and a lease ends at a
 * scheduled move-out when that is earlier than its end date. The archived
 * definition checked neither, so the app's "pre-lease from the day after a
 * move-out" and "re-let a cancelled lease's dates" flows passed the app check
 * and then failed the INSERT with 23P01 (a 500). The control cases pin that a
 * genuine overlap is still refused.
 *
 * Every case runs in a transaction that is always rolled back.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

class Rollback extends Error {}

/** See audit-log-append-only-db.integration.test.ts: postgres.js's TransactionSql type drops the call signature. */
const tagged = (tx: postgres.TransactionSql): postgres.Sql => tx as unknown as postgres.Sql;

describeDb('overlap exclusion constraints (DB integration)', () => {
  let sql: postgres.Sql;

  beforeAll(() => {
    sql = postgres(databaseUrl!, { prepare: false, max: 1 });
  });

  afterAll(async () => {
    await sql.end();
  });

  async function inRolledBackTransaction(fn: (tx: postgres.TransactionSql) => Promise<void>): Promise<void> {
    await expect(
      sql.begin(async (tx) => {
        await fn(tx);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  }

  /** A community and one unit in it; the write-scope trigger needs the session GUC. */
  async function communityWithUnit(tx: postgres.TransactionSql): Promise<{ communityId: string; unitId: string }> {
    const tag = randomUUID().slice(0, 8);
    const [community] = await tagged(tx)<{ id: string }[]>`
      insert into communities (name, slug, community_type, timezone)
      values (${`Overlap ${tag}`}, ${`overlap-constraint-${tag}`}, 'apartment', 'America/New_York')
      returning id`;
    await tagged(tx)`select set_config('app.current_community_id', ${community!.id}, true)`;
    const [unit] = await tagged(tx)<{ id: string }[]>`
      insert into units (community_id, unit_number) values (${community!.id}, ${`U-${tag}`})
      returning id`;
    return { communityId: community!.id, unitId: unit!.id };
  }

  function insertLease(
    tx: postgres.TransactionSql,
    ids: { communityId: string; unitId: string },
    lease: { start: string; end: string | null; moveOutOn?: string; status?: string },
  ) {
    return tx.savepoint((sp) => tagged(sp)`
      insert into leases (community_id, unit_id, start_date, end_date, move_out_on, status)
      values (${ids.communityId}, ${ids.unitId}, ${lease.start}, ${lease.end}, ${lease.moveOutOn ?? null},
              ${lease.status ?? 'active'})
      returning id`);
  }

  it('lets a unit be leased from the day after a scheduled early move-out', async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await communityWithUnit(tx);
      await insertLease(tx, ids, { start: '2026-01-01', end: '2026-12-31', moveOutOn: '2026-09-15' });
      await expect(insertLease(tx, ids, { start: '2026-10-01', end: '2027-09-30' })).resolves.toHaveLength(1);
    });
  });

  it('still refuses a lease that overlaps the days before a scheduled move-out', async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await communityWithUnit(tx);
      await insertLease(tx, ids, { start: '2026-01-01', end: '2026-12-31', moveOutOn: '2026-09-15' });
      await expect(insertLease(tx, ids, { start: '2026-09-01', end: '2026-09-30' })).rejects.toMatchObject({
        code: '23P01',
        constraint_name: 'leases_no_overlap_per_unit',
      });
    });
  });

  it.each(['cancelled', 'terminated'])('lets a %s lease\'s dates be let again', async (status) => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await communityWithUnit(tx);
      await insertLease(tx, ids, { start: '2027-01-01', end: '2027-12-31', status });
      await expect(insertLease(tx, ids, { start: '2027-01-01', end: '2027-12-31' })).resolves.toHaveLength(1);
    });
  });

  it('refuses two live leases of one unit that overlap', async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await communityWithUnit(tx);
      await insertLease(tx, ids, { start: '2027-01-01', end: '2027-12-31' });
      await expect(insertLease(tx, ids, { start: '2027-06-01', end: '2027-08-31' })).rejects.toMatchObject({
        code: '23P01',
        constraint_name: 'leases_no_overlap_per_unit',
      });
    });
  });

  it('lets a renewal start the day after the end date (end date is inclusive)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await communityWithUnit(tx);
      await insertLease(tx, ids, { start: '2027-01-01', end: '2027-12-31' });
      await expect(insertLease(tx, ids, { start: '2028-01-01', end: null })).resolves.toHaveLength(1);
      await expect(insertLease(tx, ids, { start: '2027-12-31', end: '2028-01-31' })).rejects.toMatchObject({
        code: '23P01',
      });
    });
  });

  it('refuses two confirmed bookings of one amenity that overlap, and allows back-to-back ones', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { communityId } = await communityWithUnit(tx);
      const userId = randomUUID();
      await tagged(tx)`
        insert into users (id, email, full_name) values (${userId}, ${`overlap-${userId}@example.com`}, 'Overlap Booker')`;
      const [amenity] = await tagged(tx)<{ id: string }[]>`
        insert into amenities (community_id, name) values (${communityId}, 'Clubhouse') returning id`;
      const book = (start: string, end: string) =>
        tx.savepoint((sp) => tagged(sp)`
          insert into amenity_reservations (community_id, amenity_id, user_id, start_time, end_time, status)
          values (${communityId}, ${amenity!.id}, ${userId}, ${start}, ${end}, 'confirmed')
          returning id`);
      await book('2027-03-01T10:00:00Z', '2027-03-01T12:00:00Z');
      await expect(book('2027-03-01T12:00:00Z', '2027-03-01T13:00:00Z')).resolves.toHaveLength(1);
      await expect(book('2027-03-01T11:00:00Z', '2027-03-01T11:30:00Z')).rejects.toMatchObject({
        code: '23P01',
        constraint_name: 'no_overlapping_reservations',
      });
    });
  });
});

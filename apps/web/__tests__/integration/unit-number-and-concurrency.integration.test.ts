/**
 * Unit-number uniqueness and optimistic concurrency against a real database:
 * the partial unique index (migration `unit_number_unique`) and the
 * millisecond-precision `updatedAt` comparison cannot be proven with mocks.
 */
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { eq, inArray, sql, type SQL } from '@propertypro/db/filters';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import {
  type TestKitState,
  getDescribeDb,
  initTestKit,
  requireCommunity,
  requireDatabaseUrlInCI,
  seedCommunities,
  seedUsers,
  requireUser,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';
import {
  createUnitForCommunity,
  getUnitByNumber,
  updateUnitById,
} from '../../src/lib/services/unit-service';
import { listResidentsForCommunity, updateResidentRole } from '../../src/lib/services/resident-service';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';

requireDatabaseUrlInCI('unit-number-and-concurrency');
const describeDb = getDescribeDb();

describeDb('unit number uniqueness + concurrency (db-backed integration)', () => {
  let state: TestKitState | null = null;
  let communityId: number;
  let otherCommunityId: number;

  beforeAll(async () => {
    state = await initTestKit();
    await seedCommunities(
      state,
      MULTI_TENANT_COMMUNITIES.filter((c) => c.key === 'communityA' || c.key === 'communityB'),
    );
    communityId = requireCommunity(state, 'communityA').id;
    otherCommunityId = requireCommunity(state, 'communityB').id;
    await seedUsers(state, MULTI_TENANT_USERS.filter((u) => u.key === 'actorA'));
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  beforeEach(async () => {
    // Raw handle: soft-deleted rows too, which the scoped client cannot see.
    //
    // Leases first: `leases_unit_id_units_id_fk` is ON DELETE RESTRICT, so a lease
    // left behind makes this units delete throw and the NEXT test fail on stale
    // state rather than on its own subject. (Found exactly that way.)
    const { units, leases } = state!.dbModule;
    await state!.db.delete(leases).where(inArray(leases.communityId, [communityId, otherCommunityId]));
    await state!.db.delete(units).where(inArray(units.communityId, [communityId, otherCommunityId]));
  });

  const scopedFor = (id: number) => state!.dbModule.createScopedClient(id);

  /**
   * Set `updated_at` to an exact value, which now takes disabling the trigger.
   *
   * `pp_advance_updated_at` (migration 0087) ignores whatever a writer supplies —
   * that is the whole point of moving the advance into the database. It also means
   * a plain `UPDATE … SET updated_at = …` can no longer pin anything: the trigger
   * overwrites it on the way in. Three tests here were written before the move and
   * went VACUOUS because of it; a probe that dropped the clock term left them all
   * green. Disabling the trigger for the one statement is the only way to build a
   * row in a state the trigger would never produce.
   */
  const pinUpdatedAt = async (table: 'units' | 'user_roles', where: SQL, value: SQL) => {
    const t = sql.raw(table);
    await state!.db.execute(sql`alter table ${t} disable trigger pp_advance_updated_at`);
    try {
      const rows = (await state!.db.execute(sql`
        update ${t} set updated_at = ${value} where ${where} returning updated_at as v
      `)) as unknown as Record<string, unknown>[];
      return new Date(rows[0]!['v'] as string | Date).getTime();
    } finally {
      await state!.db.execute(sql`alter table ${t} enable trigger pp_advance_updated_at`);
    }
  };


  it('finds a unit by number regardless of letter case', async () => {
    await createUnitForCommunity(scopedFor(communityId), { unitNumber: '4B' });
    expect(await getUnitByNumber(scopedFor(communityId), '4b')).toMatchObject({ unitNumber: '4B' });
  });

  it('the database refuses a second live "4b" next to "4B" — as a 409, even past the pre-check', async () => {
    await createUnitForCommunity(scopedFor(communityId), { unitNumber: '4B' });
    await expect(createUnitForCommunity(scopedFor(communityId), { unitNumber: '4b' })).rejects.toMatchObject({
      statusCode: 409,
      message: 'Unit number "4b" already exists in this community',
    });
  });

  it('allows the number again once the old unit is deleted, and in another community', async () => {
    const [first] = [await createUnitForCommunity(scopedFor(communityId), { unitNumber: '7' })];
    await scopedFor(communityId).softDelete(state!.dbModule.units, eq(state!.dbModule.units.id, first!['id'] as number));
    await expect(createUnitForCommunity(scopedFor(communityId), { unitNumber: '7' })).resolves.toBeTruthy();
    await expect(createUnitForCommunity(scopedFor(otherCommunityId), { unitNumber: '7' })).resolves.toBeTruthy();
  });

  it('renaming onto a taken number is a 409', async () => {
    await createUnitForCommunity(scopedFor(communityId), { unitNumber: '101' });
    const other = await createUnitForCommunity(scopedFor(communityId), { unitNumber: '102' });
    await expect(
      updateUnitById(scopedFor(communityId), other!['id'] as number, { unitNumber: '101' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('applies an update whose token matches what was read (JSON millisecond precision)', async () => {
    const created = await createUnitForCommunity(scopedFor(communityId), { unitNumber: '201' });
    // The token as a client sees it: the row serialized through JSON.
    const token = (JSON.parse(JSON.stringify(created)) as { updatedAt: string }).updatedAt;
    const updated = await updateUnitById(scopedFor(communityId), created!['id'] as number, { floor: 2 }, token);
    expect(updated).toMatchObject({ floor: 2 });
  });

  it('refuses a stale token: the second of two saves from the same read gets null', async () => {
    const created = await createUnitForCommunity(scopedFor(communityId), { unitNumber: '202' });
    const token = (JSON.parse(JSON.stringify(created)) as { updatedAt: string }).updatedAt;
    const id = created!['id'] as number;
    expect(await updateUnitById(scopedFor(communityId), id, { floor: 3 }, token)).not.toBeNull();
    expect(await updateUnitById(scopedFor(communityId), id, { floor: 4 }, token)).toBeNull();
    const [row] = await scopedFor(communityId).selectFrom(state!.dbModule.units, {}, eq(state!.dbModule.units.id, id));
    expect(row!['floor']).toBe(3);
  });

  it('advances the token even when the clock has not moved — the collision, forced', async () => {
    // THE case the trigger exists for, and it cannot be reproduced from outside a
    // transaction: it needs the UPDATE's own `now()` to fall inside the
    // millisecond the row already carries, and every round trip moves the clock
    // on. A loop of rounds hoping to land on it is the original flake pointed the
    // other way — measured at twenty rounds, it hit zero times.
    //
    // `now()` is TRANSACTION-stable. So inside ONE transaction: pin `updated_at`
    // to `date_trunc('milliseconds', now())`, then UPDATE the row. The trigger
    // reads OLD.updated_at equal to its own clock reading — the collision, by
    // construction. Without the `+ 1 millisecond` term the stored value would come
    // back unchanged and a stale token would still match.
    const created = await createUnitForCommunity(scopedFor(communityId), { unitNumber: '404' });
    const id = created!['id'] as number;

    const { pinned, after } = await state!.db.transaction(async (tx) => {
      const p = (await tx.execute(sql`
        update units set updated_at = date_trunc('milliseconds', now())
         where id = ${id}
        returning updated_at as v
      `)) as unknown as Record<string, unknown>[];
      const a = (await tx.execute(sql`
        update units set floor = 8 where id = ${id} returning updated_at as v
      `)) as unknown as Record<string, unknown>[];
      return { pinned: p[0]!['v'], after: a[0]!['v'] };
    });

    expect(new Date(after as string | Date).getTime()).toBeGreaterThan(
      new Date(pinned as string | Date).getTime(),
    );
  });

  it('advances the token for a write that bypasses the scoped client entirely', async () => {
    // The finding that moved the advance into the database. The admin console
    // updates `user_roles` with the supabase-js SERVICE-ROLE client and used to
    // stamp `updated_at` from the admin server's clock — so besides the
    // same-millisecond case, a clock behind the database moved the token
    // BACKWARDS (a stale token matches again) and a clock ahead pinned the row in
    // the future. No application-level rule reached that writer.
    //
    // This models it: a raw UPDATE supplying a stale `updated_at`, the way any
    // non-scoped client would. The trigger must ignore it.
    const userId = requireUser(state!, 'actorA').id;
    const rows = (await state!.db.execute(sql`
      update user_roles
         set display_title = 'Board Liaison',
             updated_at = now() - interval '1 hour'
       where user_id = ${userId} and community_id = ${communityId}
      returning updated_at as v
    `)) as unknown as Record<string, unknown>[];

    // Not merely "changed": the supplied value was an hour in the past, so a
    // writer-owned column would have gone backwards.
    expect(Date.now() - new Date(rows[0]!['v'] as string | Date).getTime()).toBeLessThan(60_000);
  });

  it('never moves the token backwards, even when the row is ahead of the clock', async () => {
    // Covers the `+ 1 millisecond` term through the ordinary service path, rather
    // than inside a hand-rolled transaction. Pinning the row an hour ahead means
    // the clock term cannot win, so the stored value must come from `OLD + 1ms`;
    // drop that term and the save lands an hour in the PAST — a token going
    // backwards, after which a reader still holding the newer value can overwrite
    // other people's changes indefinitely.
    const created = await createUnitForCommunity(scopedFor(communityId), { unitNumber: '505' });
    const id = created!['id'] as number;
    const pinned = await pinUpdatedAt('units', sql`id = ${id}`, sql`now() + interval '1 hour'`);

    const saved = await updateUnitById(scopedFor(communityId), id, { floor: 7 });
    expect(saved).not.toBeNull();
    expect(new Date(saved!['updatedAt'] as unknown as string | Date).getTime()).toBeGreaterThan(
      pinned,
    );
  });

  it('keeps tracking the wall clock, rather than creeping a millisecond per save', async () => {
    // Covers the OTHER half of the advance. `greatest(date_trunc(now()), old +
    // 1ms)` has two terms, and dropping the clock term leaves every test above
    // green while `updated_at` stops meaning "last modified" and merely creeps
    // forward 1 ms per write — monotonic, and useless as a timestamp.
    //
    // Pinning the row an hour into the PAST separates them: the clock term pulls
    // the stored value to roughly now, whereas `old + 1ms` would leave it an
    // hour ago.
    const created = await createUnitForCommunity(scopedFor(communityId), { unitNumber: '606' });
    const id = created!['id'] as number;
    await pinUpdatedAt('units', sql`id = ${id}`, sql`now() - interval '1 hour'`);

    const saved = await updateUnitById(scopedFor(communityId), id, { floor: 5 });
    const stored = new Date(saved!['updatedAt'] as unknown as string | Date).getTime();

    expect(Date.now() - stored).toBeLessThan(60_000);
  });

  it('advances the token on a soft delete too', async () => {
    // A delete changes the row, so it has to move the version as well — else a
    // restore path could resurrect a row whose stale token still matches. Only
    // `scoped.update` filters `deleted_at IS NULL`, so nothing else contains it.
    //
    // Pinned ahead of the clock for the same reason as the case above: asserting
    // that the timestamp merely changed would pass with a plain `new Date()`.
    const created = await createUnitForCommunity(scopedFor(communityId), { unitNumber: '707' });
    const id = created!['id'] as number;
    const before = await pinUpdatedAt('units', sql`id = ${id}`, sql`now() + interval '1 hour'`);

    await scopedFor(communityId).softDelete(state!.dbModule.units, eq(state!.dbModule.units.id, id));

    const [row] = (await state!.db.execute(sql`
      select updated_at as v from units where id = ${id}
    `)) as unknown as Record<string, unknown>[];
    expect(new Date(row!['v'] as string | Date).getTime()).toBeGreaterThan(before);
  });

  it('advances the token when a LEASE edit changes the unit, via the sync trigger', async () => {
    // The writer both app-level attempts were structurally unable to reach.
    // `leases_sync_unit_rent_amount` updates `units.rent_amount` from a lease
    // insert/update/delete, inside the database — so before migration 0087 a rent
    // change moved a unit's data without moving its token, and a manager holding a
    // pre-change token could still save over it.
    //
    // Pinned ahead of the clock so this discriminates: WITHOUT the units trigger
    // the sync leaves `updated_at` exactly as pinned, since nothing in that path
    // stamps it at all.
    const userId = requireUser(state!, 'actorA').id;
    const created = await createUnitForCommunity(scopedFor(communityId), { unitNumber: '808' });
    const id = created!['id'] as number;

    const [lease] = (await state!.db.execute(sql`
      insert into leases (community_id, unit_id, resident_id, start_date, rent_amount)
      values (${communityId}, ${id}, ${userId}, current_date, 1000)
      returning id
    `)) as unknown as Record<string, unknown>[];

    // Pin AFTER the insert: that insert already fires the sync.
    const pinned = await pinUpdatedAt('units', sql`id = ${id}`, sql`now() + interval '1 hour'`);

    await state!.db.execute(sql`
      update leases set rent_amount = 1250 where id = ${lease!['id']}
    `);

    const [row] = (await state!.db.execute(sql`
      select updated_at as v, rent_amount from units where id = ${id}
    `)) as unknown as Record<string, unknown>[];
    expect(Number(row!['rent_amount'])).toBe(1250);
    expect(new Date(row!['v'] as string | Date).getTime()).toBeGreaterThan(pinned);
  });

  it('resident membership version: the list token applies once, the second save from it is refused', async () => {
    const userId = requireUser(state!, 'actorA').id;
    const listed = (await listResidentsForCommunity(communityId)).find((r) => r.userId === userId)!;
    const token = (JSON.parse(JSON.stringify(listed)) as { updatedAt: string }).updatedAt;
    expect(await updateResidentRole(communityId, userId, {}, token)).toBe(true);
    expect(await updateResidentRole(communityId, userId, {}, token)).toBe(false);
  });
});

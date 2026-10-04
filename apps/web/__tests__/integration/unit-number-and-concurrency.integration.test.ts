/**
 * Unit-number uniqueness and optimistic concurrency against a real database:
 * the partial unique index (migration `unit_number_unique`) and the
 * millisecond-precision `updatedAt` comparison cannot be proven with mocks.
 */
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { advanceUpdatedAt } from '@propertypro/db/optimistic-concurrency';
import { eq, inArray, sql } from '@propertypro/db/filters';
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
    const { units } = state!.dbModule;
    await state!.db.delete(units).where(inArray(units.communityId, [communityId, otherCommunityId]));
  });

  const scopedFor = (id: number) => state!.dbModule.createScopedClient(id);

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
    // THE case the whole fence exists for, and it cannot be reproduced from
    // outside the database: it needs the update's own `now()` to fall inside
    // the millisecond the row already carries, and every round trip from a test
    // moves the clock on. A loop of rounds hoping to land on it is just the
    // original flake pointed the other way — measured: twenty rounds hit it
    // zero times, so a probe that reverted the fix left such a loop green.
    //
    // `now()` is TRANSACTION-stable, though. Pinning the row to the current
    // millisecond and applying the real advance expression to it inside ONE
    // statement makes `old` and the clock read identical by construction. That
    // is the collision, deterministically.
    //
    // Under the defect — stamping a plain clock read — `next` comes out EQUAL
    // to `old`, the stored token never moves, and the second save from the same
    // read is silently accepted. The fence must out-rank it by a millisecond.
    const created = await createUnitForCommunity(scopedFor(communityId), { unitNumber: '404' });
    const id = created!['id'] as number;

    const advance = advanceUpdatedAt(sql`pinned.old`);
    const result = await state!.db.execute(sql`
      with pinned as (
        update units set updated_at = date_trunc('milliseconds', now())
         where id = ${id}
        returning updated_at as old
      )
      select old, ${advance} as next from pinned
    `);
    const row = (result as unknown as Record<string, unknown>[])[0]!;
    const old = new Date(row['old'] as string | Date).getTime();
    const next = new Date(row['next'] as string | Date).getTime();

    expect(next).toBeGreaterThan(old);
  });

  it('never moves the token backwards, even when the row is ahead of the clock', async () => {
    // The end-to-end counterpart, and the case that catches the fence being
    // CLOBBERED rather than mis-computed. `scoped-client` used to overwrite any
    // caller-supplied `updatedAt` with its own `new Date()`, which would
    // silently hand the token back to the app server's clock — and the forced
    // collision above cannot see that, because it evaluates the expression in
    // raw SQL rather than through a scoped update. Measured: removing that gate
    // left it green.
    //
    // Pinning the row ahead of the clock separates the two. The fence out-ranks
    // whatever it finds, so the stored value moves FORWARD from the pinned one.
    // A plain `new Date()` lands an hour in the past — a token going backwards,
    // after which a reader still holding the newer value can save over other
    // people's changes indefinitely.
    const created = await createUnitForCommunity(scopedFor(communityId), { unitNumber: '505' });
    const id = created!['id'] as number;

    const pinnedRows = (await state!.db.execute(sql`
      update units set updated_at = now() + interval '1 hour'
       where id = ${id}
      returning updated_at as pinned
    `)) as unknown as Record<string, unknown>[];
    const pinned = new Date(pinnedRows[0]!['pinned'] as string | Date).getTime();

    const saved = await updateUnitById(scopedFor(communityId), id, { floor: 7 });
    expect(saved).not.toBeNull();
    expect(new Date(saved!['updatedAt'] as unknown as string | Date).getTime()).toBeGreaterThan(
      pinned,
    );
  });

  it('advances the token on every save, so a later read mints a usable one', async () => {
    const created = await createUnitForCommunity(scopedFor(communityId), { unitNumber: '303' });
    const id = created!['id'] as number;
    const read = (value: unknown) => new Date(value as string | Date).getTime();

    // No token passed. This goes through `updateUnitById`, which always builds
    // the comparison, so it does NOT prove anything about writers that never
    // compare the token — an earlier version of this comment claimed it did.
    // The `unfenced writer` case below is the one that covers those.
    const t0 = read(created!['updatedAt']);
    const t1 = read((await updateUnitById(scopedFor(communityId), id, { floor: 1 }))!['updatedAt']);
    const t2 = read((await updateUnitById(scopedFor(communityId), id, { floor: 2 }))!['updatedAt']);

    // Strictly greater, not merely different: the token is compared at
    // millisecond precision, so equal-after-truncation is exactly what let a
    // stale token match.
    expect(t1).toBeGreaterThan(t0);
    expect(t2).toBeGreaterThan(t1);
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
    await state!.db.execute(sql`
      update units set updated_at = now() - interval '1 hour' where id = ${id}
    `);

    const saved = await updateUnitById(scopedFor(communityId), id, { floor: 5 });
    const stored = new Date(saved!['updatedAt'] as unknown as string | Date).getTime();

    expect(Date.now() - stored).toBeLessThan(60_000);
  });

  it('advances the token for a writer that never compares it', async () => {
    // The finding that moved this fix into the scoped client. `user_roles` IS the
    // membership token, and eleven writers touch it — role promotions, root
    // claims, root disputes, root ops — of which exactly one compares it. Any of
    // the others could leave the token unmoved inside the collision window, so a
    // manager holding the pre-write token would save over them silently.
    //
    // This is a bare scoped update with no token, the shape all ten of those
    // writers use, and it passes only because `user_roles` is in
    // VERSIONED_TABLES. Pinning the row AHEAD of the clock is what makes it
    // discriminate: a plain `new Date()` would move the token BACKWARDS to now,
    // while the advance has to out-rank whatever it finds. Asserting merely that
    // the value changed proves nothing — the clock moves between two reads on its
    // own, and a first version of this case passed with the fix reverted.
    const userId = requireUser(state!, 'actorA').id;
    const scoped = scopedFor(communityId);

    const pinned = (await state!.db.execute(sql`
      update user_roles set updated_at = now() + interval '1 hour'
       where user_id = ${userId} and community_id = ${communityId}
      returning updated_at as v
    `)) as unknown as Record<string, unknown>[];
    const before = new Date(pinned[0]!['v'] as string | Date).getTime();

    await scoped.update(
      state!.dbModule.userRoles,
      { displayTitle: 'Board Liaison' },
      eq(state!.dbModule.userRoles.userId, userId),
    );

    const [row] = (await scoped.selectFrom(
      state!.dbModule.userRoles,
      {},
      eq(state!.dbModule.userRoles.userId, userId),
    )) as Record<string, unknown>[];
    expect(new Date(row!['updatedAt'] as string | Date).getTime()).toBeGreaterThan(before);
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
    const pinned = (await state!.db.execute(sql`
      update units set updated_at = now() + interval '1 hour' where id = ${id}
      returning updated_at as v
    `)) as unknown as Record<string, unknown>[];
    const before = new Date(pinned[0]!['v'] as string | Date).getTime();

    await scopedFor(communityId).softDelete(state!.dbModule.units, eq(state!.dbModule.units.id, id));

    const [row] = (await state!.db.execute(sql`
      select updated_at as v from units where id = ${id}
    `)) as unknown as Record<string, unknown>[];
    expect(new Date(row!['v'] as string | Date).getTime()).toBeGreaterThan(before);
  });

  it('resident membership version: the list token applies once, the second save from it is refused', async () => {
    const userId = requireUser(state!, 'actorA').id;
    const listed = (await listResidentsForCommunity(communityId)).find((r) => r.userId === userId)!;
    const token = (JSON.parse(JSON.stringify(listed)) as { updatedAt: string }).updatedAt;
    expect(await updateResidentRole(communityId, userId, {}, token)).toBe(true);
    expect(await updateResidentRole(communityId, userId, {}, token)).toBe(false);
  });
});

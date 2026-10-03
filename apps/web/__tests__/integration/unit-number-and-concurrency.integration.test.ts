/**
 * Unit-number uniqueness and optimistic concurrency against a real database:
 * the partial unique index (migration `unit_number_unique`) and the
 * millisecond-precision `updatedAt` comparison cannot be proven with mocks.
 */
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { fence } from '@propertypro/db/optimistic-concurrency';
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

    const advance = fence(sql`pinned.old`, undefined).updatedAt;
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

    // No token passed, deliberately: monotonicity has to hold for UNFENCED
    // writes too. If it did not, a save would leave the row's `updated_at`
    // where it was and the next reader would mint a token that is already
    // stale, which is the same defect arriving by a different door.
    const t0 = read(created!['updatedAt']);
    const t1 = read((await updateUnitById(scopedFor(communityId), id, { floor: 1 }))!['updatedAt']);
    const t2 = read((await updateUnitById(scopedFor(communityId), id, { floor: 2 }))!['updatedAt']);

    // Strictly greater, not merely different: the token is compared at
    // millisecond precision, so equal-after-truncation is exactly what let a
    // stale token match.
    expect(t1).toBeGreaterThan(t0);
    expect(t2).toBeGreaterThan(t1);
  });

  it('resident membership version: the list token applies once, the second save from it is refused', async () => {
    const userId = requireUser(state!, 'actorA').id;
    const listed = (await listResidentsForCommunity(communityId)).find((r) => r.userId === userId)!;
    const token = (JSON.parse(JSON.stringify(listed)) as { updatedAt: string }).updatedAt;
    expect(await updateResidentRole(communityId, userId, {}, token)).toBe(true);
    expect(await updateResidentRole(communityId, userId, {}, token)).toBe(false);
  });
});

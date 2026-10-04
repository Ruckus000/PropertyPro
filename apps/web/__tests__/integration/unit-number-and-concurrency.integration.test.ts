/**
 * Unit-number uniqueness and optimistic concurrency against a real database:
 * the partial unique index (migration `unit_number_unique`) and the
 * millisecond-precision `updatedAt` comparison cannot be proven with mocks.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { eq, inArray } from '@propertypro/db/filters';
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
import { createOccupant, updateOccupant } from '../../src/lib/services/occupant-service';
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
    const { leases, units } = state!.dbModule;
    // Leases first: their unit FK is ON DELETE RESTRICT.
    await state!.db.delete(leases).where(inArray(leases.communityId, [communityId, otherCommunityId]));
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

  it('resident membership version: the list token applies once, the second save from it is refused', async () => {
    const userId = requireUser(state!, 'actorA').id;
    const listed = (await listResidentsForCommunity(communityId)).find((r) => r.userId === userId)!;
    const token = (JSON.parse(JSON.stringify(listed)) as { updatedAt: string }).updatedAt;
    expect(await updateResidentRole(communityId, userId, {}, token)).toBe(true);
    expect(await updateResidentRole(communityId, userId, {}, token)).toBe(false);
  });

  /**
   * The lease→unit rent sync (migration 0088) writes units.updated_at in SQL,
   * outside the scoped client, so it must follow the same rule. Inside one
   * transaction now() is constant, which forces the lease's trigger write into
   * the very millisecond of the token: under the old `updated_at = NOW()` that
   * truncated to the token and the stale save was accepted.
   */
  describe('a lease write moves the unit token like any other write (migration 0088)', () => {
    const seedLease = (tx: Pick<TestKitState['db'], 'insert'>, unitId: number) =>
      tx.insert(state!.dbModule.leases).values({
        communityId,
        unitId,
        residentId: requireUser(state!, 'actorA').id,
        startDate: '2020-01-01',
        rentAmount: '1500.00',
        status: 'active',
      });

    it('a lease written in the same millisecond as the token still invalidates it', async () => {
      const created = await createUnitForCommunity(scopedFor(communityId), { unitNumber: '401' });
      const id = created!['id'] as number;
      const token = await state!.db.transaction(async (tx) => {
        const [row] = (await tx.execute(sql`
          update units set updated_at = date_trunc('milliseconds', now())
          where id = ${id} returning updated_at`)) as unknown as { updated_at: string | Date }[];
        await seedLease(tx, id);
        return new Date(row!.updated_at).toISOString();
      });
      const [unit] = await scopedFor(communityId).selectFrom(state!.dbModule.units, {}, eq(state!.dbModule.units.id, id));
      expect(unit!['rentAmount']).toBe('1500.00'); // the trigger did run
      expect(await updateUnitById(scopedFor(communityId), id, { floor: 9 }, token)).toBeNull();
    });

    it('never moves updated_at backwards', async () => {
      const created = await createUnitForCommunity(scopedFor(communityId), { unitNumber: '402' });
      const id = created!['id'] as number;
      const [ahead] = (await state!.db.execute(sql`
        update units set updated_at = date_trunc('milliseconds', now()) + interval '1 hour'
        where id = ${id} returning updated_at`)) as unknown as { updated_at: string | Date }[];
      await seedLease(state!.db, id);
      const [after] = (await state!.db.execute(sql`
        select updated_at from units where id = ${id}`)) as unknown as { updated_at: string | Date }[];
      expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(new Date(ahead!.updated_at).getTime());
    });
  });

  /**
   * Two writes inside ONE millisecond: what run 37051841242 hit by chance, made
   * certain by freezing the app clock. Each case takes its token AFTER a write
   * (not from the insert, whose `defaultNow()` comes from the database clock),
   * so the stale save is the third write in the same instant. When the app
   * stamped `updatedAt = new Date()`, every write here stored the identical
   * value and the stale token kept matching.
   */
  describe('a stale token is refused even when every write lands in the same millisecond', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date());
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const tokenOf = (row: unknown) => (JSON.parse(JSON.stringify(row)) as { updatedAt: string }).updatedAt;

    it('units', async () => {
      const created = await createUnitForCommunity(scopedFor(communityId), { unitNumber: '301' });
      const id = created!['id'] as number;
      const read = await updateUnitById(scopedFor(communityId), id, { floor: 1 });
      const token = tokenOf(read);
      expect(await updateUnitById(scopedFor(communityId), id, { floor: 2 }, token)).not.toBeNull();
      expect(await updateUnitById(scopedFor(communityId), id, { floor: 3 }, token)).toBeNull();
      const [row] = await scopedFor(communityId).selectFrom(state!.dbModule.units, {}, eq(state!.dbModule.units.id, id));
      expect(row!['floor']).toBe(2);
    });

    it('resident membership', async () => {
      const userId = requireUser(state!, 'actorA').id;
      expect(await updateResidentRole(communityId, userId, {})).toBe(true);
      const listed = (await listResidentsForCommunity(communityId)).find((r) => r.userId === userId)!;
      const token = tokenOf(listed);
      expect(await updateResidentRole(communityId, userId, {}, token)).toBe(true);
      expect(await updateResidentRole(communityId, userId, {}, token)).toBe(false);
    });

    it('household members', async () => {
      const actorId = requireUser(state!, 'actorA').id;
      const unit = await createUnitForCommunity(scopedFor(communityId), { unitNumber: '302' });
      const created = await createOccupant(communityId, actorId, {
        unitId: unit!['id'] as number,
        fullName: 'Kim Kid',
        email: null,
        phone: null,
        isOwnerHousehold: true,
      });
      const read = await updateOccupant(communityId, actorId, created.id, { phone: '555-0100' });
      const token = read.updatedAt;
      await expect(updateOccupant(communityId, actorId, created.id, { phone: '555-0101' }, token)).resolves.toMatchObject({
        phone: '555-0101',
      });
      await expect(updateOccupant(communityId, actorId, created.id, { phone: '555-0102' }, token)).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });
});

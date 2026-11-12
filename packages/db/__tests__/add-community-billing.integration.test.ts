/**
 * The two database halves of "who may add a community, and who pays":
 *
 *   - `findAddCommunityFactsUnscoped` reads the caller's own billing groups and
 *     management roles, skipping deleted ones.
 *   - `moveBillingOwnershipWithRootTx` passes a billing group to a community's
 *     new root when the old root owned it and is root of nothing else in it.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/schema';
import { billingGroups } from '../src/schema/billing-groups';
import { communities } from '../src/schema/communities';
import { userRoles } from '../src/schema/user-roles';
import { users } from '../src/schema/users';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const SLUG_PREFIX = '__test_add_community_billing_';
const CUSTOMER_PREFIX = 'cus_test_add_community_billing_';

describeDb('add community: facts and billing ownership (integration)', () => {
  let sqlClient: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let unsafe: typeof import('../src/unsafe');
  const from = randomUUID();
  const to = randomUUID();
  const other = randomUUID();

  async function clean() {
    await db.delete(communities).where(like(communities.slug, `${SLUG_PREFIX}%`));
    await db.delete(billingGroups).where(like(billingGroups.stripeCustomerId, `${CUSTOMER_PREFIX}%`));
  }

  async function group(owner: string, key: string, deleted = false): Promise<number> {
    const [row] = await db
      .insert(billingGroups)
      .values({
        name: `Group ${key}`,
        stripeCustomerId: `${CUSTOMER_PREFIX}${key}`,
        ownerUserId: owner,
        deletedAt: deleted ? new Date() : null,
      })
      .returning({ id: billingGroups.id });
    return Number(row!.id);
  }

  async function community(key: string, billingGroupId: number | null, opts: { deleted?: boolean; stripe?: boolean } = {}) {
    const [row] = await db
      .insert(communities)
      .values({
        name: `Community ${key}`,
        slug: `${SLUG_PREFIX}${key}`,
        communityType: 'condo_718',
        timezone: 'America/New_York',
        billingGroupId,
        stripeCustomerId: opts.stripe === false ? null : `${CUSTOMER_PREFIX}c_${key}`,
        deletedAt: opts.deleted ? new Date() : null,
      })
      .returning({ id: communities.id });
    return Number(row!.id);
  }

  async function grant(userId: string, communityId: number, role: 'root_manager' | 'property_manager') {
    await db.insert(userRoles).values({ userId, communityId, role, isUnitOwner: false, displayTitle: role });
  }

  async function ownerOf(groupId: number) {
    const [row] = await db.select({ owner: billingGroups.ownerUserId }).from(billingGroups).where(eq(billingGroups.id, groupId));
    return row!.owner;
  }

  async function rootOf(communityId: number) {
    const rows = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(and(eq(userRoles.communityId, communityId), eq(userRoles.role, 'root_manager')));
    return rows.map((r) => r.userId);
  }

  /** What transferRoot does: swap the roles, then move billing, in one transaction. */
  async function transfer(communityId: number, refuseIfTargetOwnsOther = true) {
    return db.transaction(async (tx) => {
      await tx
        .update(userRoles)
        .set({ role: 'property_manager' })
        .where(and(eq(userRoles.communityId, communityId), eq(userRoles.userId, from), eq(userRoles.role, 'root_manager')));
      await tx
        .update(userRoles)
        .set({ role: 'root_manager' })
        .where(and(eq(userRoles.communityId, communityId), eq(userRoles.userId, to), eq(userRoles.role, 'property_manager')));
      const move = await unsafe.moveBillingOwnershipWithRootTx(tx as never, { communityId, fromUserId: from, toUserId: to });
      if (refuseIfTargetOwnsOther && move.outcome === 'target_owns_other_group') throw new Error('refused');
      return move;
    });
  }

  beforeAll(async () => {
    unsafe = await import('../src/unsafe');
    sqlClient = postgres(process.env.DATABASE_URL!, { prepare: false });
    db = drizzle(sqlClient, { schema });
    await clean();
    await db.delete(users).where(inArray(users.id, [from, to, other]));
    await db.insert(users).values([
      { id: from, email: `from+${SLUG_PREFIX}@example.com`, fullName: 'Outgoing Root' },
      { id: to, email: `to+${SLUG_PREFIX}@example.com`, fullName: 'Incoming Root' },
      { id: other, email: `other+${SLUG_PREFIX}@example.com`, fullName: 'Someone Else' },
    ]);
  });

  beforeEach(clean);

  afterAll(async () => {
    await clean();
    await db.delete(users).where(inArray(users.id, [from, to, other]));
    await sqlClient.end();
  });

  describe('findAddCommunityFactsUnscoped', () => {
    it('reads their own live groups and management roles, with billing state', async () => {
      const g = await group(from, 'g');
      await group(from, 'gone', true);
      const a = await community('a', g);
      const b = await community('b', null, { stripe: false });
      const deleted = await community('deleted', g, { deleted: true });
      await grant(from, a, 'root_manager');
      await grant(from, b, 'property_manager');
      await grant(from, deleted, 'root_manager');
      await grant(other, a, 'property_manager');

      const facts = await unsafe.findAddCommunityFactsUnscoped(from);

      expect(facts.ownedBillingGroupIds).toEqual([g]);
      expect(facts.managedRoles).toHaveLength(2);
      expect(facts.managedRoles).toEqual(
        expect.arrayContaining([
          { communityId: a, role: 'root_manager', billingGroupId: g, hasStripeCustomer: true },
          { communityId: b, role: 'property_manager', billingGroupId: null, hasStripeCustomer: false },
        ]),
      );
    });

    it('is empty for someone with no groups or roles', async () => {
      expect(await unsafe.findAddCommunityFactsUnscoped(other)).toEqual({
        ownedBillingGroupIds: [],
        managedRoles: [],
      });
    });
  });

  describe('moveBillingOwnershipWithRootTx', () => {
    it('passes the group to the new root when the old one is root of nothing else in it', async () => {
      const g = await group(from, 'g');
      const a = await community('a', g);
      const b = await community('b', g);
      await grant(from, a, 'root_manager');
      await grant(to, a, 'property_manager');
      await grant(other, b, 'root_manager');

      expect(await transfer(a)).toEqual({ outcome: 'moved', billingGroupId: g });
      expect(await ownerOf(g)).toBe(to);
    });

    it('keeps it while the old root is still root of another community in it', async () => {
      const g = await group(from, 'g');
      const a = await community('a', g);
      const b = await community('b', g);
      await grant(from, a, 'root_manager');
      await grant(from, b, 'root_manager');
      await grant(to, a, 'property_manager');

      expect(await transfer(a)).toEqual({ outcome: 'kept' });
      expect(await ownerOf(g)).toBe(from);
      expect(await rootOf(a)).toEqual([to]);
    });

    it('ignores root of a deleted community when deciding that', async () => {
      const g = await group(from, 'g');
      const a = await community('a', g);
      const gone = await community('gone', g, { deleted: true });
      await grant(from, a, 'root_manager');
      await grant(from, gone, 'root_manager');
      await grant(to, a, 'property_manager');

      expect(await transfer(a)).toEqual({ outcome: 'moved', billingGroupId: g });
    });

    it('leaves a group the old root never owned', async () => {
      const g = await group(other, 'g');
      const a = await community('a', g);
      await grant(from, a, 'root_manager');
      await grant(to, a, 'property_manager');

      expect(await transfer(a)).toEqual({ outcome: 'kept' });
      expect(await ownerOf(g)).toBe(other);
    });

    it('does nothing for a community with no billing group', async () => {
      const a = await community('a', null);
      await grant(from, a, 'root_manager');
      await grant(to, a, 'property_manager');

      expect(await transfer(a)).toEqual({ outcome: 'kept' });
    });

    it('will not give the new root a second group, and the refusal undoes the role swap', async () => {
      const g = await group(from, 'g');
      const theirs = await group(to, 'theirs');
      const a = await community('a', g);
      await grant(from, a, 'root_manager');
      await grant(to, a, 'property_manager');

      expect(await transfer(a, false)).toEqual({ outcome: 'target_owns_other_group', billingGroupId: g });
      expect(await ownerOf(g)).toBe(from);
      expect(await ownerOf(theirs)).toBe(to);

      // Reset, then refuse the way transferRoot does: throw inside the transaction.
      await db.update(userRoles).set({ role: 'property_manager' }).where(eq(userRoles.communityId, a));
      await db
        .update(userRoles)
        .set({ role: 'root_manager' })
        .where(and(eq(userRoles.communityId, a), eq(userRoles.userId, from)));
      await expect(transfer(a)).rejects.toThrow('refused');
      expect(await rootOf(a)).toEqual([from]);
      expect(await ownerOf(g)).toBe(from);
    });
  });
});

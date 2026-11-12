/**
 * The two database halves of "who may add a community, and who pays":
 *
 *   - `findAddCommunityFactsUnscoped` reads the caller's own billing groups and
 *     management roles, skipping deleted ones.
 *   - `moveBillingOwnershipWithRootTx` passes a billing group to a community's
 *     new root when the old root owned it and is root of nothing else in it, or
 *     when the owner manages nothing in the group any more. `claimRootOp` and
 *     `reassignRootOp` run it in their own transactions.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray, like, sql as dsql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/schema';
import { billingGroups } from '../src/schema/billing-groups';
import { communities } from '../src/schema/communities';
import { complianceAuditLog } from '../src/schema/compliance-audit-log';
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
  /** An owner whose account is gone: no users row and no roles. */
  const gone = randomUUID();
  /** An owner who still has an account but has left the group. */
  const leaver = randomUUID();

  /**
   * reassignRootOp writes compliance_audit_log, which is append-only and holds
   * its community with ON DELETE restrict. Remove only this file's rows, under
   * the shared audit-maintenance advisory lock (same as
   * reconcile-auth-user-id.integration.test.ts), then the communities.
   */
  async function clean() {
    await db.transaction(async (tx) => {
      const ids = (
        await tx.select({ id: communities.id }).from(communities).where(like(communities.slug, `${SLUG_PREFIX}%`))
      ).map((r) => Number(r.id));
      if (ids.length > 0) {
        await tx.execute(dsql`SELECT pg_advisory_xact_lock(817, 1)`);
        await tx.execute(dsql`alter table compliance_audit_log disable trigger compliance_audit_log_append_only_guard`);
        await tx.delete(complianceAuditLog).where(inArray(complianceAuditLog.communityId, ids));
        await tx.execute(dsql`alter table compliance_audit_log enable trigger compliance_audit_log_append_only_guard`);
        await tx.delete(communities).where(inArray(communities.id, ids));
      }
      await tx.delete(billingGroups).where(like(billingGroups.stripeCustomerId, `${CUSTOMER_PREFIX}%`));
    });
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
    await db.delete(users).where(inArray(users.id, [from, to, other, leaver]));
    await db.insert(users).values([
      { id: from, email: `from+${SLUG_PREFIX}@example.com`, fullName: 'Outgoing Root' },
      { id: to, email: `to+${SLUG_PREFIX}@example.com`, fullName: 'Incoming Root' },
      { id: other, email: `other+${SLUG_PREFIX}@example.com`, fullName: 'Someone Else' },
      { id: leaver, email: `leaver+${SLUG_PREFIX}@example.com`, fullName: 'Left The Portfolio' },
    ]);
  });

  beforeEach(clean);

  afterAll(async () => {
    await clean();
    await db.delete(users).where(inArray(users.id, [from, to, other, leaver]));
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

      expect(await transfer(a)).toEqual({ outcome: 'moved', billingGroupId: g, previousOwnerUserId: from });
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

      expect(await transfer(a)).toEqual({ outcome: 'moved', billingGroupId: g, previousOwnerUserId: from });
    });

    it('leaves a group the old root never owned while its owner still manages a community in it', async () => {
      const g = await group(other, 'g');
      const a = await community('a', g);
      const b = await community('b', g);
      await grant(from, a, 'root_manager');
      await grant(to, a, 'property_manager');
      await grant(other, b, 'property_manager');

      expect(await transfer(a)).toEqual({ outcome: 'kept' });
      expect(await ownerOf(g)).toBe(other);
    });

    it('passes an orphaned group (its owner manages nothing in it) to the new root', async () => {
      const g = await group(leaver, 'g');
      const a = await community('a', g);
      const b = await community('b', g);
      await grant(from, a, 'root_manager');
      await grant(to, a, 'property_manager');
      // A role outside the group, or in a deleted community of it, does not count.
      await grant(leaver, await community('elsewhere', null), 'root_manager');
      await grant(leaver, await community('deleted', g, { deleted: true }), 'property_manager');
      await grant(other, b, 'root_manager');

      expect(await transfer(a)).toEqual({ outcome: 'moved', billingGroupId: g, previousOwnerUserId: leaver });
      expect(await ownerOf(g)).toBe(to);
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
  describe('claimRootOp', () => {
    it('makes the claimer root and hands them an orphaned group', async () => {
      const g = await group(gone, 'g');
      const a = await community('a', g);
      await grant(to, a, 'property_manager');

      expect(await unsafe.claimRootOp(a, to)).toEqual({ outcome: 'moved', billingGroupId: g, previousOwnerUserId: gone });
      expect(await rootOf(a)).toEqual([to]);
      expect(await ownerOf(g)).toBe(to);
    });

    it('keeps the group with an owner who still manages a community in it', async () => {
      const g = await group(other, 'g');
      const a = await community('a', g);
      const b = await community('b', g);
      await grant(to, a, 'property_manager');
      await grant(other, b, 'property_manager');

      expect(await unsafe.claimRootOp(a, to)).toEqual({ outcome: 'kept' });
      expect(await rootOf(a)).toEqual([to]);
      expect(await ownerOf(g)).toBe(other);
    });

    it('still claims when the claimer owns another group, and leaves billing alone', async () => {
      const g = await group(gone, 'g');
      await group(to, 'theirs');
      const a = await community('a', g);
      await grant(to, a, 'property_manager');

      expect(await unsafe.claimRootOp(a, to)).toEqual({ outcome: 'target_owns_other_group', billingGroupId: g });
      expect(await rootOf(a)).toEqual([to]);
      expect(await ownerOf(g)).toBe(gone);
    });
  });

  describe('reassignRootOp', () => {
    it('moves billing from the demoted root to the new one, and audits both', async () => {
      const g = await group(from, 'g');
      const a = await community('a', g);
      await grant(from, a, 'root_manager');
      await grant(to, a, 'property_manager');

      await unsafe.reassignRootOp({ communityId: a, newUserId: to, actingUserId: other });

      expect(await rootOf(a)).toEqual([to]);
      expect(await ownerOf(g)).toBe(to);
      const [audit] = await db
        .select({ oldValues: complianceAuditLog.oldValues, newValues: complianceAuditLog.newValues })
        .from(complianceAuditLog)
        .where(and(eq(complianceAuditLog.communityId, a), eq(complianceAuditLog.action, 'root_reassigned')));
      expect(audit).toEqual({
        oldValues: { root: from, billingGroupOwner: from },
        newValues: { root: to, billingGroupOwner: to, billingGroupId: g },
      });
    });

    it('hands the orphaned group of a rootless community to the new root', async () => {
      const g = await group(gone, 'g');
      const a = await community('a', g);
      await grant(to, a, 'property_manager');

      await unsafe.reassignRootOp({ communityId: a, newUserId: to, actingUserId: other });

      expect(await rootOf(a)).toEqual([to]);
      expect(await ownerOf(g)).toBe(to);
    });

    it('refuses with RootOpConflictError, changing nothing, when the new root owns another group', async () => {
      const g = await group(from, 'g');
      await group(to, 'theirs');
      const a = await community('a', g);
      await grant(from, a, 'root_manager');
      await grant(to, a, 'property_manager');

      await expect(
        unsafe.reassignRootOp({ communityId: a, newUserId: to, actingUserId: other }),
      ).rejects.toBeInstanceOf(unsafe.RootOpConflictError);
      expect(await rootOf(a)).toEqual([from]);
      expect(await ownerOf(g)).toBe(from);
    });
  });
});

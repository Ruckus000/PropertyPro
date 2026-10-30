/**
 * The community profile save against a real database.
 *
 * `updateCommunityProfile` is what `PATCH /api/v1/community/profile` calls. It
 * runs the rename, the contact columns, the profile columns and BOTH audit rows
 * in one transaction, so a committed change always has its audit row and a failed
 * save leaves nothing behind. A mocked query builder cannot prove either, so this
 * file does, with real rollbacks:
 *
 *   - after a save, the community row and both audit rows carry the SAME Postgres
 *     transaction id (`xmin`). Separate statements would each have their own;
 *   - a profile UPDATE the database refuses (the `short_name` CHECK) undoes the
 *     contact write that came before it, and a retry then audits that write;
 *   - an audit insert the database refuses (a user with no `users` row) undoes the
 *     writes made before it.
 *
 * One fresh community per case; the kit removes them (and their append-only audit
 * rows) afterwards.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { communities, complianceAuditLog, users } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import {
  getCommunityProfile,
  updateCommunityProfile,
} from '../../src/lib/services/community-profile-service';
import {
  getDescribeDb,
  initTestKit,
  requireDatabaseUrlInCI,
  teardownTestKit,
  trackCommunityForCleanup,
  trackUserForCleanup,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('community-profile');
const describeDb = getDescribeDb();

describeDb('community profile save (integration)', () => {
  let state: TestKitState;
  /** A real `users` row: `compliance_audit_log.user_id` has an FK to it. */
  let actorUserId = '';
  let communitySeq = 0;

  beforeAll(async () => {
    state = await initTestKit();
    actorUserId = randomUUID();
    await state.db.insert(users).values({
      id: actorUserId,
      email: `profile-actor+${state.runSuffix}@example.com`,
      fullName: `Profile Actor ${state.runSuffix}`,
    });
    trackUserForCleanup(state, actorUserId);
  });

  afterAll(async () => {
    await teardownTestKit(state);
  });

  /** A fresh community, so each case reads exactly its own rows and audit rows. */
  async function seedCommunity(): Promise<number> {
    communitySeq += 1;
    const [created] = await state.db
      .insert(communities)
      .values({
        name: `Profile Save ${communitySeq} ${state.runSuffix}`,
        // Ends in the run suffix, so the kit's teardown sweep and the reaper find it.
        slug: `p2-43-community-profile-${communitySeq}-${state.runSuffix}`,
        communityType: 'condo_718',
        addressLine1: '100 Ocean Drive',
        city: 'Miami',
        state: 'FL',
        zipCode: '33139',
        unitCount: 60,
      })
      .returning({ id: communities.id });
    trackCommunityForCleanup(state, created!.id);
    return created!.id;
  }

  const rowOf = async (communityId: number) =>
    (await state.db.select().from(communities).where(eq(communities.id, communityId)))[0]!;

  const auditsOf = async (communityId: number) =>
    (await state.db.select().from(complianceAuditLog).where(eq(complianceAuditLog.communityId, communityId))).sort(
      (a, b) => a.id - b.id,
    );

  /** The Postgres transaction id that wrote each row version: equal means the same transaction. */
  async function transactionIds(communityId: number) {
    const community = await state.db.execute(
      sql`select xmin::text as xid from communities where id = ${communityId}`,
    );
    const audits = await state.db.execute(
      sql`select xmin::text as xid from compliance_audit_log where community_id = ${communityId} order by id`,
    );
    return {
      community: (community[0] as { xid: string }).xid,
      audits: (audits as unknown as Array<{ xid: string }>).map((row) => row.xid),
    };
  }

  it('reads the twelve profile fields from the real row', async () => {
    const communityId = await seedCommunity();

    expect(await getCommunityProfile(communityId)).toEqual({
      name: expect.stringContaining('Profile Save'),
      shortName: null,
      addressLine1: '100 Ocean Drive',
      addressLine2: null,
      city: 'Miami',
      state: 'FL',
      zipCode: '33139',
      unitCount: 60,
      officeHours: null,
      contactName: null,
      contactEmail: null,
      contactPhone: null,
    });
  });

  it('writes the columns and exactly the expected audit rows, all in one transaction', async () => {
    const communityId = await seedCommunity();
    const before = await rowOf(communityId);

    const saved = await updateCommunityProfile(
      communityId,
      {
        name: 'Profile Save Renamed',
        shortName: 'Renamed',
        addressLine2: 'Suite 9',
        city: null,
        officeHours: 'Mon–Fri, 9–5',
        contactName: 'Jane Manager',
        contactEmail: 'office@renamed.example',
      },
      { actorUserId },
    );

    // What the caller is handed is what the table now holds.
    expect(saved).toEqual({
      name: 'Profile Save Renamed',
      shortName: 'Renamed',
      addressLine1: '100 Ocean Drive',
      addressLine2: 'Suite 9',
      city: null,
      state: 'FL',
      zipCode: '33139',
      unitCount: 60,
      officeHours: 'Mon–Fri, 9–5',
      contactName: 'Jane Manager',
      contactEmail: 'office@renamed.example',
      contactPhone: null,
    });
    const after = await rowOf(communityId);
    expect(after).toMatchObject({
      name: 'Profile Save Renamed',
      shortName: 'Renamed',
      addressLine2: 'Suite 9',
      city: null,
      officeHours: 'Mon–Fri, 9–5',
      contactName: 'Jane Manager',
      contactEmail: 'office@renamed.example',
      // not the save's to touch
      unitCount: 60,
      slug: before.slug,
      communityType: 'condo_718',
    });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());

    // Exactly two audit rows: the rename, and one for everything else that changed.
    const audits = await auditsOf(communityId);
    expect(audits.map((audit) => `${audit.action}/${audit.resourceType}`)).toEqual([
      'update/community',
      'update/community_profile',
    ]);
    expect(audits[0]).toMatchObject({
      userId: actorUserId,
      resourceId: String(communityId),
      oldValues: { name: before.name },
      newValues: { name: 'Profile Save Renamed' },
    });
    expect(audits[1]).toMatchObject({
      userId: actorUserId,
      resourceId: String(communityId),
      oldValues: {
        shortName: null,
        addressLine2: null,
        city: 'Miami',
        officeHours: null,
        contactName: null,
        contactEmail: null,
      },
      newValues: {
        shortName: 'Renamed',
        addressLine2: 'Suite 9',
        city: null,
        officeHours: 'Mon–Fri, 9–5',
        contactName: 'Jane Manager',
        contactEmail: 'office@renamed.example',
      },
    });

    // One transaction: the row (updated up to three times) and both audit rows
    // were written by the same Postgres transaction id. Three separate statements
    // would show three.
    const xids = await transactionIds(communityId);
    expect(xids.audits).toHaveLength(2);
    expect(new Set([xids.community, ...xids.audits]).size).toBe(1);
  });

  it('saving the same values again writes nothing and audits nothing', async () => {
    const communityId = await seedCommunity();
    const patch = { shortName: 'Same', contactName: 'Jane Manager', city: null };
    await updateCommunityProfile(communityId, patch, { actorUserId });
    const rowAfterFirst = await rowOf(communityId);
    const auditCountAfterFirst = (await auditsOf(communityId)).length;

    await updateCommunityProfile(communityId, patch, { actorUserId });

    expect((await auditsOf(communityId)).length).toBe(auditCountAfterFirst);
    expect((await rowOf(communityId)).updatedAt.getTime()).toBe(rowAfterFirst.updatedAt.getTime());
  });

  it('stores null as SQL NULL and audits the old value to null', async () => {
    const communityId = await seedCommunity();
    await updateCommunityProfile(communityId, { shortName: 'Short', contactName: 'Jane' }, { actorUserId });

    await updateCommunityProfile(communityId, { shortName: null, contactName: null }, { actorUserId });

    expect(await rowOf(communityId)).toMatchObject({ shortName: null, contactName: null });
    expect((await auditsOf(communityId)).at(-1)).toMatchObject({
      resourceType: 'community_profile',
      oldValues: { shortName: 'Short', contactName: 'Jane' },
      newValues: { shortName: null, contactName: null },
    });
  });

  it('accepts a 60-character short name and 200-character office hours: the contract limits sit inside the CHECKs', async () => {
    const communityId = await seedCommunity();

    await updateCommunityProfile(
      communityId,
      { shortName: 'x'.repeat(60), officeHours: 'y'.repeat(200) },
      { actorUserId },
    );

    const row = await rowOf(communityId);
    expect(row.shortName).toHaveLength(60);
    expect(row.officeHours).toHaveLength(200);
  });

  describe('when the save fails part-way', () => {
    // 61 characters: the contract would never let this through, so it is a way
    // to make the database itself refuse the profile UPDATE (CHECK
    // communities_short_name_len) AFTER the contact write has run.
    const TOO_LONG_FOR_THE_TABLE = 'x'.repeat(61);

    it('rolls back the contact write when the profile UPDATE is refused', async () => {
      const communityId = await seedCommunity();

      await expect(
        updateCommunityProfile(
          communityId,
          { contactName: 'Rolled Back', shortName: TOO_LONG_FOR_THE_TABLE },
          { actorUserId },
        ),
      ).rejects.toMatchObject({ cause: { constraint_name: 'communities_short_name_len' } });

      expect(await rowOf(communityId)).toMatchObject({ contactName: null, shortName: null });
      expect(await auditsOf(communityId)).toEqual([]);
    });

    it('lets a retry write and audit what the failed attempt had already written', async () => {
      const communityId = await seedCommunity();
      await expect(
        updateCommunityProfile(
          communityId,
          { contactName: 'Retried', shortName: TOO_LONG_FOR_THE_TABLE },
          { actorUserId },
        ),
      ).rejects.toThrow();

      await updateCommunityProfile(communityId, { contactName: 'Retried', shortName: 'Retried' }, { actorUserId });

      // The contact write of the failed attempt did not stick, so the retry saw
      // it as a change: written, and audited with the ORIGINAL value as its old one.
      expect(await rowOf(communityId)).toMatchObject({ contactName: 'Retried', shortName: 'Retried' });
      const audits = await auditsOf(communityId);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        resourceType: 'community_profile',
        oldValues: { contactName: null, shortName: null },
        newValues: { contactName: 'Retried', shortName: 'Retried' },
      });
    });

    it('rolls back the rename when its own audit insert is refused', async () => {
      const communityId = await seedCommunity();
      const before = await rowOf(communityId);
      const actorWithoutAUsersRow = randomUUID(); // audit user_id FK violation

      await expect(
        updateCommunityProfile(
          communityId,
          { name: 'Never Committed', city: 'Doral' },
          { actorUserId: actorWithoutAUsersRow },
        ),
      ).rejects.toMatchObject({ cause: { constraint_name: 'compliance_audit_log_user_id_users_id_fk' } });

      expect(await rowOf(communityId)).toMatchObject({ name: before.name, city: 'Miami' });
      expect(await auditsOf(communityId)).toEqual([]);
    });

    it('rolls back the contact and profile writes when the profile audit insert is refused', async () => {
      const communityId = await seedCommunity();
      const actorWithoutAUsersRow = randomUUID();

      await expect(
        updateCommunityProfile(
          communityId,
          { contactName: 'Never Committed', officeHours: 'Never Committed' },
          { actorUserId: actorWithoutAUsersRow },
        ),
      ).rejects.toMatchObject({ cause: { constraint_name: 'compliance_audit_log_user_id_users_id_fk' } });

      expect(await rowOf(communityId)).toMatchObject({ contactName: null, officeHours: null });
      expect(await auditsOf(communityId)).toEqual([]);
    });
  });
});

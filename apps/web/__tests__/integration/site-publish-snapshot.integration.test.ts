/**
 * Site publish snapshots — capture, revert, concurrency, retention.
 *
 * Phase 6 of the website-editor-v3 rebuild. These assertions could not be
 * written until migration 0034 created `site_publish_snapshots`; they exercise
 * `apps/web/src/lib/services/site-blocks-service.ts` directly against a real
 * Postgres, because every property under test here is a property of the
 * TRANSACTION (atomicity, the partial unique index, the concurrency token) and
 * none of them survive being mocked.
 *
 * Nothing is mocked — no-mock-guard forbids it under __tests__/integration/,
 * and none of it was needed: the service is called directly, and auth comes
 * from the shared provider that `initTestKit` registers (see setActor below).
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';
import {
  publishCommunitySite,
  pruneSitePublishSnapshots,
  revertToSnapshot,
  removeSiteBlock,
  upsertPublishedBlock,
} from '@/lib/services/site-blocks-service';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS, type MultiTenantUserKey } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  initTestKit,
  seedCommunities,
  seedUsers,
  teardownTestKit,
  trackCommunityForCleanup,
  requireCommunity,
  requireUser,
  setActor,
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Site publish snapshot integration tests');

const describeDb = getDescribeDb();

const TOMBSTONE = 'tombstone';

interface SnapshotRow {
  id: number;
  publishedAt: Date;
  actorUserId: string | null;
  changeCount: number;
  changeLabels: string[] | null;
  snapshot: { blocks: { blockOrder: number; blockType: string; content: unknown }[] } | null;
  /** The publish EVENT's clock — distinct from `publishedAt`, the site VERSION. */
  createdAt: Date;
}

interface BlockRow {
  id: number;
  blockType: string;
  blockOrder: number;
  content: unknown;
  isDraft: boolean;
  publishedAt: Date | null;
}

describeDb('site publish snapshots (db-backed integration)', () => {
  let state: TestKitState | null = null;
  let actorUserId: string;
  /** A second community, used only for the cross-tenant and retention cases. */
  let otherCommunityId: number;

  // -------------------------------------------------------------------------
  // Local helpers
  // -------------------------------------------------------------------------

  /**
   * A throwaway community per test. Each publish/revert case needs its own
   * `site_blocks` universe (the partial unique index is keyed on community_id,
   * and the concurrency token is MAX(published_at) per community), so sharing
   * one community across cases would let them interfere.
   *
   * The slug carries `runSuffix` so the teardown safety-net sweep sees it even
   * if `trackCommunityForCleanup` were ever missed.
   */
  async function createCommunity(label: string): Promise<number> {
    if (!state) throw new Error('Not initialized');
    const [row] = await state.db
      .insert(state.dbModule.communities)
      .values({
        name: `Site publish ${label} ${state.runSuffix}`,
        slug: `site-publish-${label}-${state.runSuffix}`,
        communityType: 'condo_718',
        timezone: 'America/New_York',
      })
      .returning({ id: state.dbModule.communities.id });
    if (!row) throw new Error(`Failed to create community "${label}"`);
    trackCommunityForCleanup(state, row.id);
    return row.id;
  }

  async function liveBlocks(communityId: number): Promise<BlockRow[]> {
    if (!state) throw new Error('Not initialized');
    const rows = await state.db
      .select({
        id: state.dbModule.siteBlocks.id,
        blockType: state.dbModule.siteBlocks.blockType,
        blockOrder: state.dbModule.siteBlocks.blockOrder,
        content: state.dbModule.siteBlocks.content,
        isDraft: state.dbModule.siteBlocks.isDraft,
        publishedAt: state.dbModule.siteBlocks.publishedAt,
      })
      .from(state.dbModule.siteBlocks)
      .where(
        and(
          eq(state.dbModule.siteBlocks.communityId, communityId),
          isNull(state.dbModule.siteBlocks.deletedAt),
        ),
      );
    return [...rows].sort((a, b) => a.blockOrder - b.blockOrder || Number(a.isDraft) - Number(b.isDraft));
  }

  const publishedOf = (rows: BlockRow[]) => rows.filter((r) => !r.isDraft);
  const draftsOf = (rows: BlockRow[]) => rows.filter((r) => r.isDraft);

  async function snapshotRows(communityId: number): Promise<SnapshotRow[]> {
    if (!state) throw new Error('Not initialized');
    const rows = await state.db
      .select({
        id: state.dbModule.sitePublishSnapshots.id,
        publishedAt: state.dbModule.sitePublishSnapshots.publishedAt,
        actorUserId: state.dbModule.sitePublishSnapshots.actorUserId,
        changeCount: state.dbModule.sitePublishSnapshots.changeCount,
        changeLabels: state.dbModule.sitePublishSnapshots.changeLabels,
        snapshot: state.dbModule.sitePublishSnapshots.snapshot,
        // The publish EVENT's clock, as distinct from published_at (the site
        // VERSION stamp). Step 5c relies on these being different questions.
        createdAt: state.dbModule.sitePublishSnapshots.createdAt,
      })
      .from(state.dbModule.sitePublishSnapshots)
      .where(eq(state.dbModule.sitePublishSnapshots.communityId, communityId));
    return [...rows].sort((a, b) => a.id - b.id) as SnapshotRow[];
  }

  /** MAX(published_at) over LIVE published rows — the concurrency token. */
  async function publishToken(communityId: number): Promise<Date | null> {
    const rows = publishedOf(await liveBlocks(communityId))
      .map((r) => r.publishedAt)
      .filter((d): d is Date => d instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime());
    return rows[0] ?? null;
  }

  async function writeBlock(
    communityId: number,
    blockOrder: number,
    blockType: string,
    content: unknown,
    isDraft: boolean,
  ): Promise<void> {
    await upsertPublishedBlock({
      communityId,
      actorUserId,
      blockType,
      blockOrder,
      content,
      isDraft,
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    const communityA = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityA');
    if (!communityA) throw new Error('communityA fixture not found');
    await seedCommunities(state, [communityA]);

    const neededUsers: MultiTenantUserKey[] = ['actorA'];
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((u) => neededUsers.includes(u.key)),
    );
    setActor(state, 'actorA');
    actorUserId = requireUser(state, 'actorA').id;

    // `site_publish_snapshots.actor_user_id` FKs to `auth.users`, which the
    // shared kit does not seed (it only writes `public.users`). Real signups
    // always have both rows; the local test DB starts with an empty auth
    // schema, so the actor is mirrored across for the duration of the run.
    await state.db.execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${actorUserId}::uuid, ${`site-publish-${state.runSuffix}@example.com`}) ON CONFLICT (id) DO NOTHING`,
    );

    otherCommunityId = requireCommunity(state, 'communityA').id;
  });

  beforeEach(() => {
    if (!state) return;
    setActor(state, 'actorA');
  });

  afterAll(async () => {
    if (!state) return;
    // Drop the mirrored auth row before the kit deletes public.users.
    await state.db.execute(sql`DELETE FROM auth.users WHERE id = ${actorUserId}::uuid`);
    await teardownTestKit(state);
  });

  // -------------------------------------------------------------------------
  // Capture
  // -------------------------------------------------------------------------

  it('writes exactly one snapshot row whose published_at IS the promoted rows\' stamp', async () => {
    const communityId = await createCommunity('capture');

    await writeBlock(communityId, 1, 'hero', { headline: 'Live headline' }, false);
    await writeBlock(communityId, 2, 'text', { body: 'Originally published body copy.' }, false);
    // One staged edit at slot 2; slot 1 is untouched and must survive.
    await writeBlock(communityId, 2, 'text', { body: 'Edited body copy for publish.' }, true);

    const result = await publishCommunitySite({
      communityId,
      actorUserId,
      expectedPublishedAt: null,
    });
    expect(result.published).toBe(true);
    if (!result.published) throw new Error('unreachable');

    const snapshots = await snapshotRows(communityId);
    expect(snapshots).toHaveLength(1);
    const snapshot = snapshots[0]!;

    const promoted = publishedOf(await liveBlocks(communityId)).filter((r) => r.blockOrder === 2);
    expect(promoted).toHaveLength(1);

    // Equality, not proximity: `published_at` doubles as the optimistic
    // concurrency token, so a snapshot stamped even a millisecond apart would
    // describe a site state that never existed.
    expect(snapshot.publishedAt.getTime()).toBe(result.publishedAt.getTime());
    expect(promoted[0]!.publishedAt!.getTime()).toBe(result.publishedAt.getTime());

    expect(snapshot.actorUserId).toBe(actorUserId);
    expect(snapshot.changeCount).toBe(1);
    expect(snapshot.changeLabels).toEqual(['Updated Text']);
    // The payload is the POST-publish published set: draft content at slot 2,
    // and the untouched published hero at slot 1.
    expect(snapshot.snapshot?.blocks).toEqual([
      { blockOrder: 1, blockType: 'hero', content: { headline: 'Live headline' } },
      { blockOrder: 2, blockType: 'text', content: { body: 'Edited body copy for publish.' } },
    ]);
  });

  it('a server-side-refused publish leaves NO snapshot row and NO mutation', async () => {
    const communityId = await createCommunity('refused');

    await writeBlock(communityId, 1, 'hero', { headline: 'Established hero' }, false);
    await writeBlock(communityId, 2, 'text', { body: 'A published section that must survive.' }, true);
    const first = await publishCommunitySite({
      communityId,
      actorUserId,
      expectedPublishedAt: null,
    });
    expect(first.published).toBe(true);

    const before = await liveBlocks(communityId);
    const beforeSnapshots = await snapshotRows(communityId);
    expect(beforeSnapshots).toHaveLength(1);

    // A draft whose content violates its own block schema (`text` requires a
    // non-empty `body`). The write path does not validate; the publish
    // transaction does, at step 3b, before any mutation.
    await writeBlock(communityId, 3, 'text', {}, true);
    const withInvalidDraft = await liveBlocks(communityId);

    await expect(
      publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null }),
    ).rejects.toThrow(ValidationError);

    // No history row claiming something shipped.
    expect(await snapshotRows(communityId)).toHaveLength(1);

    // No mutation at all: same rows, same ids, same publish stamps, nothing
    // soft-deleted — including the invalid draft, which is still pending.
    const after = await liveBlocks(communityId);
    expect(after).toEqual(withInvalidDraft);
    expect(publishedOf(after)).toEqual(publishedOf(before));
    expect(draftsOf(after).map((r) => r.blockOrder)).toEqual([3]);
  });

  it('nothing-to-publish writes no snapshot row', async () => {
    const communityId = await createCommunity('nothing');

    await writeBlock(communityId, 1, 'hero', { headline: 'Already live' }, false);

    const result = await publishCommunitySite({
      communityId,
      actorUserId,
      expectedPublishedAt: null,
    });
    expect(result).toEqual({ published: false, reason: 'nothing-to-publish' });
    expect(await snapshotRows(communityId)).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Revert
  // -------------------------------------------------------------------------

  it('reverts into a slot that already holds a live draft without colliding on the partial unique index', async () => {
    const communityId = await createCommunity('revert-collide');

    await writeBlock(communityId, 1, 'hero', { headline: 'V1 hero' }, true);
    await writeBlock(communityId, 2, 'text', { body: 'V1 body copy for the section.' }, true);
    const v1 = await publishCommunitySite({
      communityId,
      actorUserId,
      expectedPublishedAt: null,
    });
    expect(v1.published).toBe(true);
    const [snapshotV1] = await snapshotRows(communityId);
    if (!snapshotV1) throw new Error('no snapshot captured');

    // THE COLLISION CASE: slot 2 now holds a LIVE draft. If revert inserted
    // before soft-deleting, this insert would violate
    // `site_blocks_community_order_draft_partial` and surface as an opaque 500.
    await writeBlock(communityId, 2, 'text', { body: 'V2 pending body copy edit.' }, true);
    expect(draftsOf(await liveBlocks(communityId)).map((r) => r.blockOrder)).toEqual([2]);

    const reverted = await revertToSnapshot({
      communityId,
      actorUserId,
      snapshotId: snapshotV1.id,
    });
    expect(reverted).toEqual({
      snapshotId: snapshotV1.id,
      restoredPublishedAt: snapshotV1.publishedAt,
      restoredCount: 2,
      stagedRemovalCount: 0,
      clearedDraftCount: 1,
    });

    // Exactly one live draft per slot, carrying the snapshot's content.
    const drafts = draftsOf(await liveBlocks(communityId));
    expect(drafts.map((r) => r.blockOrder)).toEqual([1, 2]);
    expect(drafts.map((r) => r.content)).toEqual([
      { headline: 'V1 hero' },
      { body: 'V1 body copy for the section.' },
    ]);
    // And the live site is still whatever was last published.
    expect(publishedOf(await liveBlocks(communityId)).map((r) => r.blockOrder)).toEqual([1, 2]);
  });

  it('does not resurrect a staged deletion: a removed section is absent from the snapshot and from the revert', async () => {
    const communityId = await createCommunity('revert-tombstone');

    await writeBlock(communityId, 1, 'hero', { headline: 'Tombstone case hero' }, true);
    await writeBlock(communityId, 2, 'text', { body: 'Section that will be removed.' }, true);
    await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null });

    // Stage the removal of slot 2, then publish it.
    const removal = await removeSiteBlock({ communityId, actorUserId, blockOrder: 2 });
    expect(removal.staged).toBe(true);
    const v2 = await publishCommunitySite({
      communityId,
      actorUserId,
      expectedPublishedAt: await publishToken(communityId),
    });
    expect(v2.published).toBe(true);

    const snapshots = await snapshotRows(communityId);
    expect(snapshots).toHaveLength(2);
    const snapshotV2 = snapshots[1]!;
    expect(snapshotV2.changeLabels).toEqual(['Removed Text']);
    // The payload records what is LIVE, so neither the removed section nor the
    // tombstone that removed it appears.
    expect(snapshotV2.snapshot?.blocks.map((b) => b.blockOrder)).toEqual([1]);
    expect(snapshotV2.snapshot?.blocks.some((b) => b.blockType === TOMBSTONE)).toBe(false);

    const afterPublish = await liveBlocks(communityId);
    expect(publishedOf(afterPublish).map((r) => r.blockOrder)).toEqual([1]);
    expect(draftsOf(afterPublish)).toEqual([]);

    const reverted = await revertToSnapshot({
      communityId,
      actorUserId,
      snapshotId: snapshotV2.id,
    });
    expect(reverted.restoredCount).toBe(1);
    expect(reverted.stagedRemovalCount).toBe(0);
    const drafts = draftsOf(await liveBlocks(communityId));
    expect(drafts.map((r) => r.blockType)).toEqual(['hero']);
    expect(drafts.some((r) => r.blockType === TOMBSTONE)).toBe(false);
  });

  it('skips tombstone entries in a hand-written snapshot payload rather than restoring them as drafts', async () => {
    if (!state) throw new Error('Not initialized');
    const communityId = await createCommunity('revert-tombstone-payload');

    await writeBlock(communityId, 1, 'hero', { headline: 'Payload guard hero' }, true);
    await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null });

    // A legacy/hand-written payload carrying a tombstone at a slot that has NO
    // published row — so a resurrected tombstone could not be mistaken for
    // step 3's legitimate staging of a removal.
    const [handWritten] = await state.db
      .insert(state.dbModule.sitePublishSnapshots)
      .values({
        communityId,
        publishedAt: new Date(),
        actorUserId,
        changeCount: 2,
        changeLabels: ['Updated Hero', 'Removed Text'],
        snapshot: {
          blocks: [
            { blockOrder: 1, blockType: 'hero', content: { headline: 'Payload guard hero' } },
            { blockOrder: 5, blockType: TOMBSTONE, content: {} },
          ],
        },
      })
      .returning({ id: state.dbModule.sitePublishSnapshots.id });
    if (!handWritten) throw new Error('failed to insert hand-written snapshot');

    const reverted = await revertToSnapshot({
      communityId,
      actorUserId,
      snapshotId: handWritten.id,
    });
    expect(reverted.restoredCount).toBe(1);
    expect(reverted.stagedRemovalCount).toBe(0);

    const drafts = draftsOf(await liveBlocks(communityId));
    expect(drafts.map((r) => r.blockOrder)).toEqual([1]);
    expect(drafts.some((r) => r.blockOrder === 5)).toBe(false);
  });

  it('refuses a pruned snapshot with a clear error instead of crashing', async () => {
    if (!state) throw new Error('Not initialized');
    const communityId = await createCommunity('revert-pruned');

    await writeBlock(communityId, 1, 'hero', { headline: 'Pruned case hero' }, true);
    await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null });
    const [snapshot] = await snapshotRows(communityId);
    if (!snapshot) throw new Error('no snapshot captured');

    await state.db
      .update(state.dbModule.sitePublishSnapshots)
      .set({ snapshot: null })
      .where(eq(state.dbModule.sitePublishSnapshots.id, snapshot.id));

    await expect(
      revertToSnapshot({ communityId, actorUserId, snapshotId: snapshot.id }),
    ).rejects.toThrow(ValidationError);
    await expect(
      revertToSnapshot({ communityId, actorUserId, snapshotId: snapshot.id }),
    ).rejects.toThrow(/too old to restore/i);

    // The log row itself survives its payload.
    const after = await snapshotRows(communityId);
    expect(after).toHaveLength(1);
    expect(after[0]!.snapshot).toBeNull();
    expect(after[0]!.changeLabels).toEqual(['Added Hero']);
  });

  it('cannot revert another community\'s snapshot id (IDOR guard at the DB predicate)', async () => {
    const victimCommunityId = await createCommunity('idor-victim');

    await writeBlock(victimCommunityId, 1, 'hero', { headline: 'Victim hero' }, true);
    await publishCommunitySite({
      communityId: victimCommunityId,
      actorUserId,
      expectedPublishedAt: null,
    });
    const [victimSnapshot] = await snapshotRows(victimCommunityId);
    if (!victimSnapshot) throw new Error('no snapshot captured');

    // `otherCommunityId` is a real community the actor belongs to — the route
    // layer would happily authorize it. The service must still refuse.
    const attackerBefore = await liveBlocks(otherCommunityId);
    await expect(
      revertToSnapshot({
        communityId: otherCommunityId,
        actorUserId,
        snapshotId: victimSnapshot.id,
      }),
    ).rejects.toThrow(NotFoundError);

    expect(await liveBlocks(otherCommunityId)).toEqual(attackerBefore);
    expect(await snapshotRows(otherCommunityId)).toHaveLength(0);
    // And the victim's own state is untouched.
    expect(draftsOf(await liveBlocks(victimCommunityId))).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Concurrency token
  // -------------------------------------------------------------------------

  it('a revert does NOT move the publish token, so the pre-revert token still publishes', async () => {
    const communityId = await createCommunity('token-revert');

    await writeBlock(communityId, 1, 'hero', { headline: 'Token v1 hero' }, true);
    const v1 = await publishCommunitySite({
      communityId,
      actorUserId,
      expectedPublishedAt: null,
    });
    if (!v1.published) throw new Error('v1 publish failed');
    const [snapshotV1] = await snapshotRows(communityId);
    if (!snapshotV1) throw new Error('no snapshot captured');

    await writeBlock(communityId, 1, 'hero', { headline: 'Token v2 hero' }, true);
    const v2 = await publishCommunitySite({
      communityId,
      actorUserId,
      expectedPublishedAt: v1.publishedAt,
    });
    if (!v2.published) throw new Error('v2 publish failed');

    const preRevertToken = await publishToken(communityId);
    expect(preRevertToken?.getTime()).toBe(v2.publishedAt.getTime());

    await revertToSnapshot({ communityId, actorUserId, snapshotId: snapshotV1.id });

    // A revert writes ONLY the draft layer — it soft-deletes live drafts and
    // inserts new ones, and never touches a published row. So MAX(published_at)
    // is unchanged and the pre-revert token is still current. (The brief for
    // this test expected a ConflictError here; the implementation's actual and
    // correct behaviour is the opposite, because the site is still serving what
    // it served before the revert.)
    expect((await publishToken(communityId))?.getTime()).toBe(preRevertToken?.getTime());

    const v3 = await publishCommunitySite({
      communityId,
      actorUserId,
      expectedPublishedAt: preRevertToken,
    });
    expect(v3.published).toBe(true);
    if (!v3.published) throw new Error('unreachable');
    expect(v3.publishedAt.getTime()).toBeGreaterThan(v2.publishedAt.getTime());
    expect(publishedOf(await liveBlocks(communityId))[0]!.content).toEqual({
      headline: 'Token v1 hero',
    });
  });

  it('a publish carrying a stale token raises ConflictError', async () => {
    const communityId = await createCommunity('token-stale');

    await writeBlock(communityId, 1, 'hero', { headline: 'Stale token hero' }, true);
    const v1 = await publishCommunitySite({
      communityId,
      actorUserId,
      expectedPublishedAt: null,
    });
    if (!v1.published) throw new Error('v1 publish failed');

    await writeBlock(communityId, 1, 'hero', { headline: 'Stale token hero v2' }, true);
    await publishCommunitySite({
      communityId,
      actorUserId,
      expectedPublishedAt: v1.publishedAt,
    });

    // A third editor still holding v1's token.
    await writeBlock(communityId, 2, 'text', { body: 'A racing editor writes here.' }, true);
    await expect(
      publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: v1.publishedAt }),
    ).rejects.toThrow(ConflictError);

    // The refused publish left the draft pending, not half-promoted.
    expect(draftsOf(await liveBlocks(communityId)).map((r) => r.blockOrder)).toEqual([2]);
    expect(await snapshotRows(communityId)).toHaveLength(2);
  });

  it(
    'a removal-only publish stamps the history row with a publishedAt that a real ' +
      'site_blocks row carries',
    async () => {
      const communityId = await createCommunity('token-removal-only');

      await writeBlock(communityId, 1, 'hero', { headline: 'Removal-only hero' }, true);
      await writeBlock(communityId, 2, 'text', { body: 'Section staged for removal.' }, true);
      const v1 = await publishCommunitySite({
        communityId,
        actorUserId,
        expectedPublishedAt: null,
      });
      if (!v1.published) throw new Error('v1 publish failed');

      // The ONLY pending change is a staged deletion, so step 5 promotes zero
      // rows: every draft it would have promoted was the tombstone that step 4b
      // just retired.
      await removeSiteBlock({ communityId, actorUserId, blockOrder: 2 });
      const v2 = await publishCommunitySite({
        communityId,
        actorUserId,
        expectedPublishedAt: v1.publishedAt,
      });
      if (!v2.published) throw new Error('v2 publish failed');
      expect(v2.promotedCount).toBe(0);

      // The stamp generated before the promote denotes no site state when the
      // promote matches zero rows, so step 5c falls back to the stamp the
      // surviving published rows actually carry. Everything the publish emits
      // must agree with MAX(published_at).
      const token = await publishToken(communityId);
      expect(token?.getTime()).toBe(v1.publishedAt.getTime());
      expect(v2.publishedAt.getTime()).toBe(v1.publishedAt.getTime());

      // The history row names a version of the site that existed — this is the
      // property that makes "what did this page show in March" answerable.
      const snapshots = await snapshotRows(communityId);
      expect(snapshots[1]!.publishedAt.getTime()).toBe(v1.publishedAt.getTime());

      // …and the removal is still recorded rather than swallowed: the payload
      // no longer contains the removed section, and `created_at` (not
      // `published_at`) is what dates the publish event itself.
      expect(snapshots[1]!.changeLabels).toEqual(['Removed Text']);
      expect(
        (snapshots[1]!.snapshot as { blocks: { blockOrder: number }[] }).blocks.map(
          (b) => b.blockOrder,
        ),
      ).toEqual([1]);
      expect(snapshots[1]!.createdAt.getTime()).toBeGreaterThanOrEqual(
        v1.publishedAt.getTime(),
      );

      // The token the publish handed back is usable: echoing it into the next
      // publish must NOT spuriously conflict.
      await writeBlock(communityId, 3, 'text', { body: 'The next perfectly ordinary edit.' }, true);
      const v3 = await publishCommunitySite({
        communityId,
        actorUserId,
        expectedPublishedAt: v2.publishedAt,
      });
      if (!v3.published) throw new Error('v3 publish failed');
      expect(v3.promotedCount).toBe(1);
      // A publish that DOES promote still advances the token.
      expect(v3.publishedAt.getTime()).toBeGreaterThan(v1.publishedAt.getTime());
      expect((await publishToken(communityId))?.getTime()).toBe(v3.publishedAt.getTime());
    },
  );

  // -------------------------------------------------------------------------
  // Retention
  //
  // Runs LAST on purpose: `pruneSitePublishSnapshots` is cross-tenant by
  // design, so it nulls payloads for every community in the database — including
  // the ones the cases above asserted `restorable` behaviour on.
  // -------------------------------------------------------------------------

  it('prunes per community, keeping the newest N payloads and every log row', async () => {
    const olderCommunityId = await createCommunity('retention-older');
    const newerCommunityId = await createCommunity('retention-newer');

    async function publishTimes(communityId: number, count: number): Promise<void> {
      for (let i = 0; i < count; i += 1) {
        await writeBlock(communityId, 1, 'hero', { headline: `Retention hero v${i}` }, true);
        const result = await publishCommunitySite({
          communityId,
          actorUserId,
          expectedPublishedAt: await publishToken(communityId),
        });
        if (!result.published) throw new Error('retention publish produced no changes');
      }
    }

    // The older community publishes FIRST, so all of its rows are globally
    // older than the newer community's. A global (rather than per-community)
    // keep-1 would clear its newest payload too.
    await publishTimes(olderCommunityId, 2);
    await publishTimes(newerCommunityId, 3);

    const olderBefore = await snapshotRows(olderCommunityId);
    const newerBefore = await snapshotRows(newerCommunityId);
    expect(olderBefore).toHaveLength(2);
    expect(newerBefore).toHaveLength(3);

    const { pruned } = await pruneSitePublishSnapshots(1);
    // Cross-tenant sweep, so `pruned` also covers this file's other
    // communities; the per-community assertions below are the real contract.
    expect(pruned).toBeGreaterThanOrEqual(3);

    const olderAfter = await snapshotRows(olderCommunityId);
    const newerAfter = await snapshotRows(newerCommunityId);

    // Every log ROW survives — retention nulls the payload, it does not delete.
    expect(olderAfter.map((r) => r.id)).toEqual(olderBefore.map((r) => r.id));
    expect(newerAfter.map((r) => r.id)).toEqual(newerBefore.map((r) => r.id));

    // Per community: newest keeps its payload, everything older loses it.
    expect(olderAfter.map((r) => r.snapshot !== null)).toEqual([false, true]);
    expect(newerAfter.map((r) => r.snapshot !== null)).toEqual([false, false, true]);

    // The auditable columns survive pruning.
    for (const row of [...olderAfter, ...newerAfter]) {
      expect(row.publishedAt).toBeInstanceOf(Date);
      expect(row.changeCount).toBe(1);
      // First publish of a community says "Added", subsequent ones "Updated".
      expect(row.changeLabels).toEqual([expect.stringMatching(/^(Added|Updated) Hero$/)]);
      expect(row.actorUserId).toBe(actorUserId);
    }
    // And the just-pruned rows really are the ones revert now refuses.
    await expect(
      revertToSnapshot({
        communityId: olderCommunityId,
        actorUserId,
        snapshotId: olderAfter[0]!.id,
      }),
    ).rejects.toThrow(ValidationError);
  });
});

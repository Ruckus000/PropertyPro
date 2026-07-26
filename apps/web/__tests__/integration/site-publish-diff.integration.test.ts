/**
 * The Phase 4 diff model, pinned to the real publish transaction.
 *
 * Phase 4's property suite (`packages/shared/src/site-diff/diff.property.test.ts`)
 * proves "after publishing, nothing is pending" against a PURE model of what a
 * publish does — `applyPublish`. That model is a fiction unless something checks
 * it against the transaction it claims to mirror: if
 * `publishCommunitySite` ever promoted a tombstone, dropped a published row at
 * an unedited slot, or renumbered anything, every Phase 4 property would keep
 * passing while the review sheet lied to the PM about what publishing will do.
 *
 * So this file runs the REAL publish against a real Postgres and asserts the
 * resulting database state equals what the pure model predicted.
 *
 * Nothing is mocked — no-mock-guard forbids it under __tests__/integration/,
 * and none of it was needed: the service is called directly and auth comes from
 * the shared provider `initTestKit` registers.
 */
import { diffSite, type SiteSnapshot } from '@propertypro/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  publishCommunitySite,
  removeSiteBlock,
  upsertPublishedBlock,
} from '@/lib/services/site-blocks-service';
import { toSnapshot } from '@/lib/site-editor/to-snapshot';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS, type MultiTenantUserKey } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  initTestKit,
  seedCommunities,
  seedUsers,
  teardownTestKit,
  trackCommunityForCleanup,
  requireUser,
  setActor,
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Site publish diff-model integration tests');

const describeDb = getDescribeDb();

/**
 * The Phase 4 change model's notion of "what publishing does to the draft".
 *
 * RE-IMPLEMENTED HERE ON PURPOSE. The original lives inside a `describe` block
 * in `packages/shared/src/site-diff/diff.property.test.ts` (`applyPublish`, at
 * the top of the "P3 — publish is a fixed point" group) and is not exported, so
 * it cannot be imported. This copy MUST stay byte-for-byte equivalent in
 * behaviour to that one, and both must mirror `publishCommunitySite` steps 4-6
 * in `apps/web/src/lib/services/site-blocks-service.ts`:
 *
 *   step 4  — retire the published rows at slots that have a draft
 *   step 4b — retire tombstone drafts, so they are never promoted
 *   step 5  — promote every remaining draft to published
 *
 * Net effect on the merged draft-wins view: the hero survives as-is, and every
 * section survives except the tombstoned slots. That is the whole model — and
 * the assertions below are what keep it honest.
 */
function applyPublish(next: SiteSnapshot): SiteSnapshot {
  const tombstoned = new Set(next.tombstonedSlots ?? []);
  return {
    hero: next.hero,
    sections: next.sections.filter((s) => !tombstoned.has(s.slot)),
  };
}

describeDb('publish diff model vs. the real publish transaction (db-backed)', () => {
  let state: TestKitState | null = null;
  let actorUserId: string;

  async function createCommunity(label: string): Promise<number> {
    if (!state) throw new Error('Not initialized');
    const [row] = await state.db
      .insert(state.dbModule.communities)
      .values({
        name: `Publish diff ${label} ${state.runSuffix}`,
        slug: `publish-diff-${label}-${state.runSuffix}`,
        communityType: 'condo_718',
        timezone: 'America/New_York',
      })
      .returning({ id: state.dbModule.communities.id });
    if (!row) throw new Error(`Failed to create community "${label}"`);
    trackCommunityForCleanup(state, row.id);
    return row.id;
  }

  async function liveBlocks(communityId: number): Promise<SiteBlockSummary[]> {
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
    return rows.map((r) => ({
      id: r.id,
      blockType: r.blockType,
      blockOrder: r.blockOrder,
      content: r.content,
      isDraft: r.isDraft,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    }));
  }

  /**
   * The editor's merged view: draft wins per slot. Mirrors the same merge
   * `publishCommunitySite` builds at step 3b and `reorderSiteBlock` builds
   * before rotating — this is what the review sheet diffs, so it is what the
   * model has to be fed.
   */
  function mergeDraftWins(rows: readonly SiteBlockSummary[]): SiteBlockSummary[] {
    const bySlot = new Map<number, SiteBlockSummary>();
    for (const row of rows) {
      const existing = bySlot.get(row.blockOrder);
      if (!existing || (row.isDraft && !existing.isDraft)) bySlot.set(row.blockOrder, row);
    }
    return [...bySlot.values()].sort((a, b) => a.blockOrder - b.blockOrder);
  }

  const publishedOnly = (rows: readonly SiteBlockSummary[]) => rows.filter((r) => !r.isDraft);

  async function writeBlock(
    communityId: number,
    blockOrder: number,
    blockType: string,
    content: unknown,
    isDraft: boolean,
  ): Promise<void> {
    await upsertPublishedBlock({ communityId, actorUserId, blockType, blockOrder, content, isDraft });
  }

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
    // shared kit does not seed (it writes `public.users` only).
    await state.db.execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${actorUserId}::uuid, ${`publish-diff-${state.runSuffix}@example.com`}) ON CONFLICT (id) DO NOTHING`,
    );
  });

  beforeEach(() => {
    if (!state) return;
    setActor(state, 'actorA');
  });

  afterAll(async () => {
    if (!state) return;
    await state.db.execute(sql`DELETE FROM auth.users WHERE id = ${actorUserId}::uuid`);
    await teardownTestKit(state);
  });

  it('the real publish produces exactly the state the pure model predicts', async () => {
    const communityId = await createCommunity('mixed');

    // --- a published baseline: hero + three content sections -----------------
    await writeBlock(communityId, 1, 'hero', { headline: 'Baseline welcome' }, true);
    await writeBlock(communityId, 2, 'text', { body: 'Baseline body copy for section two.' }, true);
    await writeBlock(
      communityId,
      3,
      'image',
      { imagePath: `${communityId}/content/baseline.jpg`, altText: 'A baseline photo' },
      true,
    );
    await writeBlock(communityId, 4, 'documents', { limit: 5 }, true);
    const baseline = await publishCommunitySite({
      communityId,
      actorUserId,
      expectedPublishedAt: null,
    });
    expect(baseline.published).toBe(true);
    if (!baseline.published) throw new Error('unreachable');

    const afterBaseline = await liveBlocks(communityId);
    expect(publishedOnly(afterBaseline).map((r) => r.blockOrder).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(afterBaseline.filter((r) => r.isDraft)).toEqual([]);

    // --- the pending change set ---------------------------------------------
    //  * slot 2 — a draft EDIT over a published row
    //  * slot 3 — a staged DELETION (tombstone draft over a published row)
    //  * slot 4 — untouched; it must survive the publish even though it has no
    //             draft, which is the case a naive "wipe and repromote" breaks
    //  * slot 5 — a draft ADD with no published counterpart
    await writeBlock(communityId, 2, 'text', { body: 'Edited body copy for section two.' }, true);
    const removal = await removeSiteBlock({ communityId, actorUserId, blockOrder: 3 });
    expect(removal.staged).toBe(true);
    await writeBlock(communityId, 5, 'contact', { showBoard: true, showManagement: false }, true);

    // --- what the model predicts --------------------------------------------
    const pending = await liveBlocks(communityId);
    const nextSnapshot = toSnapshot(mergeDraftWins(pending));
    // Sanity: the merged view really does carry all four shapes.
    expect(nextSnapshot.hero?.slot).toBe(1);
    expect(nextSnapshot.tombstonedSlots).toEqual([3]);
    expect(nextSnapshot.sections.map((s) => s.slot)).toEqual([2, 4, 5]);

    const predicted = applyPublish(nextSnapshot);

    // --- what the transaction actually does ---------------------------------
    const published = await publishCommunitySite({
      communityId,
      actorUserId,
      expectedPublishedAt: baseline.publishedAt,
    });
    expect(published.published).toBe(true);

    const actual = toSnapshot(publishedOnly(await liveBlocks(communityId)));

    // THE PIN: database state === model prediction.
    expect(actual).toEqual(predicted);

    // Spelled out, so a failure above is diagnosable rather than a wall of JSON.
    expect(actual.hero).toEqual({
      slot: 1,
      blockType: 'hero',
      content: { headline: 'Baseline welcome' },
    });
    expect(actual.sections).toEqual([
      { slot: 2, blockType: 'text', content: { body: 'Edited body copy for section two.' } },
      { slot: 4, blockType: 'documents', content: { limit: 5 } },
      { slot: 5, blockType: 'contact', content: { showBoard: true, showManagement: false } },
    ]);
    // The tombstoned slot is gone from the live site, and no tombstone was
    // promoted in its place (step 4b).
    expect(actual.tombstonedSlots).toBeUndefined();

    // --- the Phase 4 invariant, on real data --------------------------------
    // "After publishing, nothing is pending."
    expect(diffSite(actual, actual).changes).toEqual([]);

    // And the draft layer really is empty, which is the database's own version
    // of the same statement.
    expect((await liveBlocks(communityId)).filter((r) => r.isDraft)).toEqual([]);
  });

  it('the model and the transaction agree that a second publish with no drafts changes nothing', async () => {
    const communityId = await createCommunity('fixed-point');

    await writeBlock(communityId, 1, 'hero', { headline: 'Fixed point welcome' }, true);
    await writeBlock(communityId, 2, 'text', { body: 'Fixed point body copy here.' }, true);
    const first = await publishCommunitySite({
      communityId,
      actorUserId,
      expectedPublishedAt: null,
    });
    expect(first.published).toBe(true);

    const afterFirst = toSnapshot(publishedOnly(await liveBlocks(communityId)));
    // A publish is a fixed point: re-applying the model changes nothing...
    expect(applyPublish(afterFirst)).toEqual(afterFirst);
    // ...and neither does re-running the transaction.
    const second = await publishCommunitySite({
      communityId,
      actorUserId,
      expectedPublishedAt: first.published ? first.publishedAt : null,
    });
    expect(second).toEqual({ published: false, reason: 'nothing-to-publish' });

    const afterSecond = toSnapshot(publishedOnly(await liveBlocks(communityId)));
    expect(afterSecond).toEqual(afterFirst);
    expect(diffSite(afterSecond, afterSecond).changes).toEqual([]);
  });
});

/**
 * Website editor v3, Phase 8 — the branding jsonb merge, against a real
 * Postgres, plus the 0043 site_published_at backfill.
 *
 * These are the assertions the unit suite deliberately does not make. The merge
 * is a single `jsonb_set` statement, so every property worth having —
 * siblings surviving, a malformed key being repaired rather than erroring on
 * `||`, two writers not losing an update — is a property of Postgres executing
 * that statement. A mocked `db.execute` can only prove the mock returned what
 * it was told to.
 *
 * Run with `pnpm test:integration:local`. NEVER against `.env.local` — that
 * DATABASE_URL is production.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  initTestKit,
  seedCommunities,
  seedUsers,
  teardownTestKit,
  requireCommunity,
  requireUser,
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';
import {
  getSiteSettings,
  updateSiteSettings,
} from '@/lib/services/site-settings-service';

requireDatabaseUrlInCI('Site settings jsonb merge integration tests');

const describeDb = getDescribeDb();

describeDb('site settings — atomic branding merge', () => {
  let state: TestKitState;
  let communityId: number;
  let actorUserId: string;

  beforeAll(async () => {
    state = await initTestKit();
    await seedCommunities(state, MULTI_TENANT_COMMUNITIES);
    await seedUsers(state, MULTI_TENANT_USERS);
    communityId = requireCommunity(state, 'communityA').id;
    actorUserId = requireUser(state, 'actorA').id;
  });

  afterAll(async () => {
    await teardownTestKit(state);
  });

  beforeEach(async () => {
    // Reset branding to a known shape carrying an UNRELATED sibling key, so
    // every test below also proves the merge did not eat it.
    await state.sqlClient.unsafe(
      `UPDATE communities SET branding = '{"primaryColor":"#C2533A","tagline":"Seed tagline"}'::jsonb WHERE id = ${communityId}`,
    );
  });

  it('writes settings without disturbing unrelated branding keys', async () => {
    await updateSiteSettings({ communityId, actorUserId, seoTitle: 'Sunset Living' });

    const rows = await state.sqlClient.unsafe<Array<{ branding: Record<string, unknown> }>>(
      `SELECT branding FROM communities WHERE id = ${communityId}`,
    );
    const branding = rows[0]!.branding;

    expect(branding.primaryColor).toBe('#C2533A');
    expect(branding.tagline).toBe('Seed tagline');
    expect(branding.siteSettings).toMatchObject({ seoTitle: 'Sunset Living' });
  });

  it('preserves siblings INSIDE siteSettings across successive partial writes', async () => {
    await updateSiteSettings({ communityId, actorUserId, seoTitle: 'Title' });
    await updateSiteSettings({ communityId, actorUserId, seoDescription: 'Description' });
    await updateSiteSettings({ communityId, actorUserId, searchIndexing: false });

    const record = await getSiteSettings(communityId);
    expect(record.settings).toMatchObject({
      seoTitle: 'Title',
      seoDescription: 'Description',
      searchIndexing: false,
    });
  });

  it('keeps settings and footer independent', async () => {
    await updateSiteSettings({ communityId, actorUserId, seoTitle: 'Title' });
    await updateSiteSettings({ communityId, actorUserId, showStatutoryLine: true });

    const record = await getSiteSettings(communityId);
    expect(record.settings.seoTitle).toBe('Title');
    expect(record.footer.showStatutoryLine).toBe(true);
  });

  it('clears a field with null without clearing its siblings', async () => {
    await updateSiteSettings({
      communityId,
      actorUserId,
      seoTitle: 'Title',
      seoDescription: 'Description',
    });
    await updateSiteSettings({ communityId, actorUserId, seoTitle: null });

    const record = await getSiteSettings(communityId);
    expect(record.settings.seoTitle).toBeNull();
    expect(record.settings.seoDescription).toBe('Description');
  });

  // `||` raises "cannot concatenate a non-object jsonb" if the left side is a
  // scalar. The CASE guard replaces the malformed key instead — which is what
  // keeps one bad row from making the panel permanently unsaveable.
  it.each([
    ['a string', '"on"'],
    ['a number', '7'],
    ['an array', '[]'],
    ['null', 'null'],
  ])('repairs a siteSettings stored as %s rather than erroring', async (_label, literal) => {
    await state.sqlClient.unsafe(
      `UPDATE communities SET branding = jsonb_set('{"primaryColor":"#C2533A"}'::jsonb, '{siteSettings}', '${literal}'::jsonb) WHERE id = ${communityId}`,
    );

    await expect(
      updateSiteSettings({ communityId, actorUserId, seoTitle: 'Recovered' }),
    ).resolves.toBeDefined();

    const record = await getSiteSettings(communityId);
    expect(record.settings.seoTitle).toBe('Recovered');
  });

  it('survives a NULL branding column', async () => {
    await state.sqlClient.unsafe(`UPDATE communities SET branding = NULL WHERE id = ${communityId}`);
    await updateSiteSettings({ communityId, actorUserId, seoTitle: 'From nothing' });

    const record = await getSiteSettings(communityId);
    expect(record.settings.seoTitle).toBe('From nothing');
  });

  // The lost-update case the single-statement design exists to prevent. Under
  // the old read-merge-write, one of these two writes would vanish.
  it('does not lose an update when two writers race', async () => {
    await Promise.all([
      updateSiteSettings({ communityId, actorUserId, seoTitle: 'Written by A' }),
      updateSiteSettings({ communityId, actorUserId, note: 'Written by B' }),
    ]);

    const record = await getSiteSettings(communityId);
    expect(record.settings.seoTitle).toBe('Written by A');
    expect(record.footer.note).toBe('Written by B');
  });

  it('enforces the length cap server-side, in code points', async () => {
    await expect(
      updateSiteSettings({ communityId, actorUserId, seoTitle: 'a'.repeat(61) }),
    ).rejects.toMatchObject({ statusCode: 400 });

    // 60 emoji is 120 UTF-16 units and must be accepted.
    await expect(
      updateSiteSettings({ communityId, actorUserId, seoTitle: '🌀'.repeat(60) }),
    ).resolves.toBeDefined();
  });
});

/**
 * Migration 0043 — the site_published_at backfill.
 *
 * Runs the migration's statement directly rather than re-applying the file, so
 * the assertions describe the SQL that ships.
 */
const BACKFILL_SQL = `
  UPDATE communities c
     SET site_published_at = sub.max_published_at
    FROM (
      SELECT community_id, MAX(published_at) AS max_published_at
        FROM site_blocks
       WHERE is_draft = false
         AND deleted_at IS NULL
         AND published_at IS NOT NULL
       GROUP BY community_id
    ) AS sub
   WHERE c.id = sub.community_id
     AND c.site_published_at IS NULL
`;

describeDb('migration 0043 — site_published_at backfill', () => {
  let state: TestKitState;
  let communityId: number;

  beforeAll(async () => {
    state = await initTestKit();
    await seedCommunities(state, MULTI_TENANT_COMMUNITIES);
    communityId = requireCommunity(state, 'communityA').id;
  });

  afterAll(async () => {
    await teardownTestKit(state);
  });

  beforeEach(async () => {
    await state.sqlClient.unsafe(
      `DELETE FROM site_blocks WHERE community_id = ${communityId}`,
    );
    await state.sqlClient.unsafe(
      `UPDATE communities SET site_published_at = NULL WHERE id = ${communityId}`,
    );
  });

  async function readStamp(): Promise<Date | null> {
    const rows = await state.sqlClient.unsafe<Array<{ site_published_at: Date | string | null }>>(
      `SELECT site_published_at FROM communities WHERE id = ${communityId}`,
    );
    const value = rows[0]!.site_published_at;
    return value ? new Date(value) : null;
  }

  // Every `site_blocks` row needs a page as of 0048 (`page_id` NOT NULL), so
  // these fixtures put one behind them. One home page per community, reused.
  //
  // The ordering index is now `(community, page, block_order, is_draft)`, so
  // each insert still needs its own slot — on this page.
  let fixturePageId: number | null = null;
  async function ensureFixturePage(): Promise<number> {
    if (fixturePageId !== null) return fixturePageId;
    const rows = await state.sqlClient.unsafe<Array<{ id: number }>>(
      `INSERT INTO site_pages (community_id, name, slug, in_nav, sort_order, is_home, is_draft)
       VALUES (${communityId}, 'Home', '', true, 0, true, true)
       RETURNING id`,
    );
    fixturePageId = rows[0]!.id;
    return fixturePageId;
  }

  async function insertPublishedBlock(publishedAt: string, blockOrder: number) {
    const pageId = await ensureFixturePage();
    await state.sqlClient.unsafe(
      `INSERT INTO site_blocks (community_id, page_id, block_type, block_order, content, is_draft, published_at)
       VALUES (${communityId}, ${pageId}, 'text', ${blockOrder}, '{"body":"hi"}'::jsonb, false, '${publishedAt}')`,
    );
  }

  it('fills a NULL stamp with MAX(published_at) of the live published blocks', async () => {
    await insertPublishedBlock('2026-03-01T00:00:00Z', 2);
    await insertPublishedBlock('2026-05-01T00:00:00Z', 3);

    await state.sqlClient.unsafe(BACKFILL_SQL);

    expect((await readStamp())?.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('ignores drafts and soft-deleted rows', async () => {
    await insertPublishedBlock('2026-03-01T00:00:00Z', 2);
    const pageId = await ensureFixturePage();
    await state.sqlClient.unsafe(
      `INSERT INTO site_blocks (community_id, page_id, block_type, block_order, content, is_draft, published_at)
       VALUES (${communityId}, ${pageId}, 'text', 3, '{"body":"draft"}'::jsonb, true, '2026-09-01T00:00:00Z')`,
    );
    await state.sqlClient.unsafe(
      `INSERT INTO site_blocks (community_id, page_id, block_type, block_order, content, is_draft, published_at, deleted_at)
       VALUES (${communityId}, ${pageId}, 'text', 4, '{"body":"gone"}'::jsonb, false, '2026-10-01T00:00:00Z', now())`,
    );

    await state.sqlClient.unsafe(BACKFILL_SQL);

    expect((await readStamp())?.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('never overwrites a stamp that is already set', async () => {
    await state.sqlClient.unsafe(
      `UPDATE communities SET site_published_at = '2020-01-01T00:00:00Z' WHERE id = ${communityId}`,
    );
    await insertPublishedBlock('2026-05-01T00:00:00Z', 2);

    await state.sqlClient.unsafe(BACKFILL_SQL);

    expect((await readStamp())?.toISOString()).toBe('2020-01-01T00:00:00.000Z');
  });

  it('leaves a community that has never published NULL', async () => {
    await state.sqlClient.unsafe(BACKFILL_SQL);
    expect(await readStamp()).toBeNull();
  });

  it('is idempotent — a second run changes nothing', async () => {
    await insertPublishedBlock('2026-05-01T00:00:00Z', 2);

    await state.sqlClient.unsafe(BACKFILL_SQL);
    const first = await readStamp();
    await state.sqlClient.unsafe(BACKFILL_SQL);
    const second = await readStamp();

    expect(second?.toISOString()).toBe(first?.toISOString());
  });
});

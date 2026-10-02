/**
 * Website builder v4 — the site's look as a draft, against a real Postgres.
 *
 * The unit suite checks which statements run; these check what they DO: the
 * `jsonb_set` draft merge, publish's `|| … - 'draftLook'` promote, discard's
 * `branding ? 'draftLook'` guard, and that a concurrent site-settings write is
 * not lost to either.
 *
 * Run with `pnpm test:integration:local`. NEVER against `.env.local` — that
 * DATABASE_URL is production.
 */
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
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
import { saveDraftDesign } from '@/lib/services/site-design-service';
import { discardSiteDrafts, publishCommunitySite } from '@/lib/services/site-blocks-service';
import { updateSiteSettings } from '@/lib/services/site-settings-service';

requireDatabaseUrlInCI('Site design draft integration tests');

const describeDb = getDescribeDb();

describeDb('site design — drafted until Publish', () => {
  let state: TestKitState;
  let communityId: number;
  let actorUserId: string;

  async function readBranding(): Promise<Record<string, unknown>> {
    const rows = await state.sqlClient.unsafe<Array<{ branding: Record<string, unknown> }>>(
      `SELECT branding FROM communities WHERE id = ${communityId}`,
    );
    return rows[0]!.branding;
  }

  beforeAll(async () => {
    state = await initTestKit();
    await seedCommunities(state, MULTI_TENANT_COMMUNITIES);
    await seedUsers(state, MULTI_TENANT_USERS);
    communityId = requireCommunity(state, 'communityA').id;
    actorUserId = requireUser(state, 'actorA').id;
    // `site_publish_snapshots.actor_user_id` FKs to `auth.users`, which the
    // kit does not seed — mirrored across exactly as the snapshot test does.
    await state.sqlClient.unsafe(
      `INSERT INTO auth.users (id, email) VALUES ('${actorUserId}'::uuid, 'site-design-${state.runSuffix}@example.com') ON CONFLICT (id) DO NOTHING`,
    );
  });

  afterAll(async () => {
    await state.sqlClient.unsafe(`DELETE FROM auth.users WHERE id = '${actorUserId}'::uuid`);
    await teardownTestKit(state);
  });

  beforeEach(async () => {
    await state.sqlClient.unsafe(
      `UPDATE communities SET branding = '{"primaryColor":"#C2533A","tagline":"Seed tagline"}'::jsonb WHERE id = ${communityId}`,
    );
  });

  it('keeps a chosen colour set off the live site until Publish, then makes it live', async () => {
    const presets = await state.sqlClient.unsafe<Array<{ tokens: { primaryColor: string } }>>(
      `SELECT tokens FROM site_theme_presets WHERE slug = 'gulf-warm'`,
    );
    const presetPrimary = presets[0]!.tokens.primaryColor;

    await saveDraftDesign(communityId, { themePresetSlug: 'gulf-warm' }, { actorUserId });

    let branding = await readBranding();
    expect(branding.primaryColor).toBe('#C2533A');
    expect(branding.draftLook).toMatchObject({ themePresetSlug: 'gulf-warm', primaryColor: presetPrimary });

    const result = await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null });
    expect(result.published).toBe(true);

    branding = await readBranding();
    expect(branding.primaryColor).toBe(presetPrimary);
    expect(branding.themePresetSlug).toBe('gulf-warm');
    expect(branding).not.toHaveProperty('draftLook');
    expect(branding.tagline).toBe('Seed tagline');

    const history = await state.sqlClient.unsafe<Array<{ snapshot: { look?: Record<string, unknown> } }>>(
      `SELECT snapshot FROM site_publish_snapshots WHERE community_id = ${communityId} ORDER BY id DESC LIMIT 1`,
    );
    expect(history[0]!.snapshot.look).toMatchObject({ primaryColor: presetPrimary });
  });

  it('drops the drafted look on discard and leaves the live look alone', async () => {
    await saveDraftDesign(communityId, { primaryColor: '#123456' }, { actorUserId });

    await discardSiteDrafts({ communityId, actorUserId });

    const branding = await readBranding();
    expect(branding).not.toHaveProperty('draftLook');
    expect(branding.primaryColor).toBe('#C2533A');
  });

  it('loses neither write when a draft save and a settings save race', async () => {
    await Promise.all([
      saveDraftDesign(communityId, { accentColor: '#0A0A0A' }, { actorUserId }),
      updateSiteSettings({ communityId, actorUserId, seoTitle: 'Raced title' }),
    ]);

    const branding = await readBranding();
    expect(branding.draftLook).toMatchObject({ accentColor: '#0A0A0A' });
    expect(branding.siteSettings).toMatchObject({ seoTitle: 'Raced title' });
  });
});

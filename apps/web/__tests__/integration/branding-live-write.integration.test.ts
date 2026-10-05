/**
 * A LIVE branding write against a real Postgres: atomic, and it replaces any
 * pending draft of the look fields it writes.
 *
 * `updateBrandingForCommunity` delegates to `applyLiveBrandingPatchUnscoped`
 * (packages/db), one UPDATE whose CASE edits `draftLook`. The unit suite can
 * only see that a statement ran; these check what the SQL does, including
 * the NULL cases where a careless `jsonb_set` returns NULL and wipes a
 * community's whole branding.
 *
 * Run with `pnpm test:integration:local`. NEVER against `.env.local` — that
 * DATABASE_URL is production.
 */
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
// AUTHZ: integration test — calls the live branding op directly against a disposable local DB to assert its before/after return.
import { applyLiveBrandingPatchUnscoped } from '@propertypro/db/unsafe';
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
import { updateBrandingForCommunity } from '@/lib/api/branding';
import { saveDraftDesign } from '@/lib/services/site-design-service';
import { publishCommunitySite } from '@/lib/services/site-blocks-service';

requireDatabaseUrlInCI('Live branding write integration tests');

const describeDb = getDescribeDb();

describeDb('live branding write — atomic, and it replaces the draft of what it writes', () => {
  let state: TestKitState;
  let communityId: number;
  let actorUserId: string;

  async function readBranding(): Promise<Record<string, unknown> | null> {
    const rows = await state.sqlClient.unsafe<Array<{ branding: Record<string, unknown> | null }>>(
      `SELECT branding FROM communities WHERE id = ${communityId}`,
    );
    return rows[0]!.branding;
  }

  async function setBranding(json: string | null): Promise<void> {
    await state.sqlClient.unsafe(
      `UPDATE communities SET branding = ${json === null ? 'NULL' : `'${json}'::jsonb`} WHERE id = ${communityId}`,
    );
  }

  beforeAll(async () => {
    state = await initTestKit();
    await seedCommunities(state, MULTI_TENANT_COMMUNITIES);
    await seedUsers(state, MULTI_TENANT_USERS);
    communityId = requireCommunity(state, 'communityA').id;
    actorUserId = requireUser(state, 'actorA').id;
    // `site_publish_snapshots.actor_user_id` FKs to `auth.users`, which the
    // kit does not seed — mirrored as site-design-draft.integration does.
    await state.sqlClient.unsafe(
      `INSERT INTO auth.users (id, email) VALUES ('${actorUserId}'::uuid, 'live-write-${state.runSuffix}@example.com') ON CONFLICT (id) DO NOTHING`,
    );
  });

  afterAll(async () => {
    await state.sqlClient.unsafe(`DELETE FROM auth.users WHERE id = '${actorUserId}'::uuid`);
    await teardownTestKit(state);
  });

  beforeEach(async () => {
    await setBranding('{"primaryColor":"#C2533A","tagline":"Seed tagline"}');
  });

  it('a stale draft no longer reverts a live write on the next Publish', async () => {
    // The manager drafted a red primary (never published) and a layout.
    await saveDraftDesign(communityId, { primaryColor: '#AA0000', layoutId: 'sable' }, { actorUserId });

    // A template apply / admin fix writes blue live.
    await updateBrandingForCommunity(communityId, { primaryColor: '#0000AA' });

    let branding = await readBranding();
    expect(branding!.primaryColor).toBe('#0000AA');
    expect(branding!.draftLook).toEqual({ layoutId: 'sable' });

    const result = await publishCommunitySite({ communityId, actorUserId, expectedPublishedAt: null });
    expect(result.published).toBe(true);

    branding = await readBranding();
    expect(branding!.primaryColor).toBe('#0000AA'); // not reverted to the stale red
    expect(branding!.layoutId).toBe('sable'); // the unrelated draft still shipped
  });

  it('a live colour write also drops the drafted colour-set slug, but keeps the set\'s other colours', async () => {
    await saveDraftDesign(communityId, { themePresetSlug: 'gulf-warm' }, { actorUserId });
    const drafted = (await readBranding())!.draftLook as Record<string, unknown>;
    expect(drafted).toHaveProperty('themePresetSlug', 'gulf-warm');
    expect(drafted).toHaveProperty('secondaryColor');

    await updateBrandingForCommunity(communityId, { primaryColor: '#0000AA' });

    const draft = (await readBranding())!.draftLook as Record<string, unknown>;
    expect(draft).not.toHaveProperty('themePresetSlug');
    expect(draft).not.toHaveProperty('primaryColor');
    expect(draft.secondaryColor).toBe(drafted.secondaryColor);
  });

  it('drops the draftLook key entirely when the write empties it', async () => {
    await saveDraftDesign(communityId, { primaryColor: '#AA0000' }, { actorUserId });

    await updateBrandingForCommunity(communityId, { primaryColor: '#0000AA' });

    const branding = await readBranding();
    expect(branding).not.toHaveProperty('draftLook');
    expect(branding).toMatchObject({ primaryColor: '#0000AA', tagline: 'Seed tagline' });
  });

  it('leaves the draft byte-identical when no look field is written', async () => {
    await saveDraftDesign(communityId, { primaryColor: '#AA0000', layoutId: 'sable' }, { actorUserId });
    const before = (await readBranding())!.draftLook;

    await updateBrandingForCommunity(communityId, { tagline: 'New tagline', customEmailFooter: 'Hi' });

    const branding = await readBranding();
    expect(branding!.draftLook).toEqual(before);
    expect(branding).toMatchObject({ tagline: 'New tagline', customEmailFooter: 'Hi' });
  });

  it('writes onto a NULL branding column instead of leaving it NULL', async () => {
    await setBranding(null);

    const returned = await updateBrandingForCommunity(communityId, { primaryColor: '#0000AA' });

    expect(await readBranding()).toEqual({ primaryColor: '#0000AA' });
    expect(returned).toEqual({ primaryColor: '#0000AA' });
  });

  it('does not wipe branding when there is no draftLook to strip from', async () => {
    // beforeEach left no draftLook; a look write takes the CASE's first branch.
    await updateBrandingForCommunity(communityId, { primaryColor: '#0000AA' });

    expect(await readBranding()).toEqual({ primaryColor: '#0000AA', tagline: 'Seed tagline' });
  });

  it('leaves a non-object draftLook (JSON null) alone rather than failing or wiping', async () => {
    await setBranding('{"primaryColor":"#C2533A","draftLook":null}');

    await updateBrandingForCommunity(communityId, { primaryColor: '#0000AA' });

    expect(await readBranding()).toEqual({ primaryColor: '#0000AA', draftLook: null });
  });

  it('returns the row before and after this write', async () => {
    await saveDraftDesign(communityId, { primaryColor: '#AA0000' }, { actorUserId });

    const { before, after } = await applyLiveBrandingPatchUnscoped(communityId, {
      primaryColor: '#0000AA',
    });

    expect(before).toMatchObject({ primaryColor: '#C2533A', draftLook: { primaryColor: '#AA0000' } });
    expect(after).toEqual({ primaryColor: '#0000AA', tagline: 'Seed tagline' });
  });

  it('removes a key in the same statement, leaving the draft and the other keys alone', async () => {
    await setBranding(
      '{"logoPath":"communities/1/branding/logo.webp","tagline":"Seed tagline","draftLook":{"layoutId":"sable"}}',
    );

    const after = await updateBrandingForCommunity(communityId, {}, { remove: ['logoPath'] });

    expect(after).toEqual({ tagline: 'Seed tagline', draftLook: { layoutId: 'sable' } });
    expect(await readBranding()).toEqual(after);
  });

  it('removes a key on a NULL branding without wiping it to NULL', async () => {
    await setBranding(null);

    await updateBrandingForCommunity(communityId, { tagline: 'New' }, { remove: ['logoPath'] });

    expect(await readBranding()).toEqual({ tagline: 'New' });
  });

  it('never removes draftLook, even when asked', async () => {
    await saveDraftDesign(communityId, { layoutId: 'sable' }, { actorUserId });

    await applyLiveBrandingPatchUnscoped(communityId, {}, { remove: ['draftLook'] });

    expect(await readBranding()).toMatchObject({ draftLook: { layoutId: 'sable' } });
  });

  it('returns nulls for a community id that does not exist', async () => {
    expect(await applyLiveBrandingPatchUnscoped(2_000_000_000, { tagline: 'x' })).toEqual({
      before: null,
      after: null,
    });
  });

  it('loses neither write when a draft save and a live write race', async () => {
    // The old read → spread → write-back shape lost one of these.
    await Promise.all([
      saveDraftDesign(communityId, { accentColor: '#0A0A0A' }, { actorUserId }),
      updateBrandingForCommunity(communityId, { tagline: 'Raced tagline' }),
    ]);

    const branding = await readBranding();
    expect(branding!.draftLook).toMatchObject({ accentColor: '#0A0A0A' });
    expect(branding!.tagline).toBe('Raced tagline');
  });
});

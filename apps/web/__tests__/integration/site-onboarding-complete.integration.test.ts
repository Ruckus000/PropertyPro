/**
 * `markSiteOnboardingComplete` against a real Postgres.
 *
 * `site_onboarding_completed_at` is the moment a community's manager first chose
 * or kept a look, and "time to choose a look" is measured as that minus
 * `communities.created_at`. So it must be stamped ONCE: the wizard's publish and
 * the look route's `keepCurrent` both call this, and each call after the first
 * used to move the moment.
 *
 * The unit suite checks the WHERE clause the function builds. These check what
 * Postgres does with it: a repeat call leaves the first moment alone, and a call
 * stamps only the community it is given.
 *
 * Nothing is mocked — no-mock-guard forbids it under __tests__/integration/.
 * Run with `pnpm test:integration:local`. NEVER against `.env.local`: that
 * DATABASE_URL is production.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { markSiteOnboardingComplete } from '@/lib/api/branding';
import {
  type TestKitState,
  initTestKit,
  teardownTestKit,
  trackCommunityForCleanup,
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Site onboarding completion integration tests');

const describeDb = getDescribeDb();

describeDb('markSiteOnboardingComplete (db-backed integration)', () => {
  let state: TestKitState;

  async function createCommunity(label: string): Promise<number> {
    const [row] = await state.db
      .insert(state.dbModule.communities)
      .values({
        name: `Onboarding stamp ${label} ${state.runSuffix}`,
        slug: `onboarding-stamp-${label}-${state.runSuffix}`,
        communityType: 'condo_718',
        timezone: 'America/New_York',
      })
      .returning({ id: state.dbModule.communities.id });
    if (!row) throw new Error(`Failed to create community "${label}"`);
    trackCommunityForCleanup(state, row.id);
    return row.id;
  }

  async function completedAt(communityId: number): Promise<Date | null> {
    const { communities } = state.dbModule;
    const [row] = await state.db
      .select({ at: communities.siteOnboardingCompletedAt })
      .from(communities)
      .where(eq(communities.id, communityId));
    if (!row) throw new Error(`Community ${communityId} not found`);
    return row.at;
  }

  beforeAll(async () => {
    state = await initTestKit();
  });

  afterAll(async () => {
    if (!state) return;
    await teardownTestKit(state);
  });

  it('the first call stamps the moment, and a second call leaves the original timestamp', async () => {
    const communityId = await createCommunity('once');
    expect(await completedAt(communityId)).toBeNull();

    const before = Date.now();
    await markSiteOnboardingComplete(communityId);
    const after = Date.now();
    const first = await completedAt(communityId);
    expect(first).toBeInstanceOf(Date);
    expect(first!.getTime()).toBeGreaterThanOrEqual(before);
    expect(first!.getTime()).toBeLessThanOrEqual(after);

    // Put the moment well in the past, so that a re-stamp (which writes "now")
    // is unmistakable, with no sleeping.
    await state.sqlClient.unsafe(
      `UPDATE communities SET site_onboarding_completed_at = '2026-01-15T09:30:00.000Z' WHERE id = ${communityId}`,
    );
    await markSiteOnboardingComplete(communityId);
    await markSiteOnboardingComplete(communityId);

    expect((await completedAt(communityId))?.toISOString()).toBe('2026-01-15T09:30:00.000Z');
  });

  it('stamps only the community it is given', async () => {
    const stamped = await createCommunity('stamped');
    const other = await createCommunity('other');

    await markSiteOnboardingComplete(stamped);

    expect(await completedAt(stamped)).toBeInstanceOf(Date);
    expect(await completedAt(other)).toBeNull();
  });
});

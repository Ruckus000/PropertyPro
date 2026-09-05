/**
 * Scheduled site publishes — the statements, against real Postgres.
 *
 * These exist because of a production outage that a fully green unit suite
 * could not have caught. `site-publish-schedule-service` issues its statements
 * as raw `db.execute(sql\`…\`)`, and the unit suite replaces `execute` with a
 * spy — so every `${jsValue}` in those templates was asserted as a captured
 * argument and never handed to a driver. Four of them interpolate a JS `Date`.
 *
 * postgres-js cannot serialise a bare `Date` as an untyped bind parameter: it
 * throws `ERR_INVALID_ARG_TYPE` ("Received an instance of Date") on the client,
 * before a packet is sent. Drizzle's QUERY BUILDER never hits this, because a
 * column's `timestamp` type tells it to serialise the Date itself — which is
 * why the sibling `claimNextExportJob`, same lease pattern but written through
 * the builder, has run in production the whole time. The difference is the raw
 * template, and only a real connection can see it.
 *
 * So these cases are deliberately shallow on business logic and specific about
 * one thing: every raw statement in the service round-trips through a real
 * driver. That is the property that was missing, and mocking it away is what
 * let `/api/v1/internal/scheduled-site-publish` fail on all ~96 daily runs from
 * the moment it shipped.
 *
 * Nothing is mocked — no-mock-guard forbids it under __tests__/integration/,
 * and none of it is needed: the services are called directly.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cancelSitePublishSchedule,
  failExhaustedSchedules,
  getSitePublishScheduleForEditor,
  processDueSitePublishes,
  scheduleSitePublish,
} from '@/lib/services/site-publish-schedule-service';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';
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

requireDatabaseUrlInCI('Scheduled site publish integration tests');

const describeDb = getDescribeDb();

describeDb('scheduled site publishes (db-backed integration)', () => {
  let state: TestKitState | null = null;
  let actorUserId: string;

  async function createCommunity(label: string): Promise<number> {
    if (!state) throw new Error('Not initialized');
    const [row] = await state.db
      .insert(state.dbModule.communities)
      .values({
        name: `Publish schedule ${label} ${state.runSuffix}`,
        slug: `publish-schedule-${label}-${state.runSuffix}`,
        communityType: 'condo_718',
        timezone: 'America/New_York',
      })
      .returning({ id: state.dbModule.communities.id });
    if (!row) throw new Error(`Failed to create community "${label}"`);
    trackCommunityForCleanup(state, row.id);
    return row.id;
  }

  /** Backdate a schedule so the claim predicate sees it as due. */
  async function makeDue(communityId: number, scheduledFor: Date): Promise<void> {
    if (!state) throw new Error('Not initialized');
    await state.db.execute(
      sql`UPDATE site_publish_schedules
             SET scheduled_for = ${scheduledFor.toISOString()}
           WHERE community_id = ${communityId} AND status = 'pending'`,
    );
  }

  beforeAll(async () => {
    state = await initTestKit();
    await seedCommunities(state, MULTI_TENANT_COMMUNITIES);
    await seedUsers(state, MULTI_TENANT_USERS);
    setActor(state, 'actorA');
    actorUserId = requireUser(state, 'actorA').id;

    // `site_publish_snapshots.actor_user_id` FKs to `auth.users`, which the
    // shared kit does not seed (it writes `public.users` only). Real signups
    // always have both rows; the local test DB starts with an empty auth schema.
    await state.db.execute(
      sql`INSERT INTO auth.users (id, email)
          VALUES (${actorUserId}::uuid, ${`publish-schedule-${state.runSuffix}@example.com`})
          ON CONFLICT (id) DO NOTHING`,
    );
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  // -------------------------------------------------------------------------
  // One case per raw statement that binds a Date
  // -------------------------------------------------------------------------

  it('arms a schedule — the INSERT binds scheduled_for', async () => {
    // `scheduleSitePublish` interpolates `${scheduledFor}`, a Date, into a raw
    // INSERT. Before the fix this threw ERR_INVALID_ARG_TYPE, so no manager
    // could arm a schedule at all.
    const communityId = await createCommunity('arm');
    const scheduledFor = new Date(Date.now() + 60 * 60 * 1000);

    const armed = await scheduleSitePublish({
      communityId,
      actorUserId,
      scheduledFor,
      notifySummary: null,
    });

    expect(armed.status).toBe('pending');
    expect(new Date(armed.scheduledFor).getTime()).toBe(scheduledFor.getTime());
  });

  it('reads the armed schedule back — the SELECT binds the failed-visibility cutoff', async () => {
    // `getSitePublishScheduleForEditor` interpolates `${failedCutoff}`, a Date.
    // Before the fix the editor could not read its own schedule.
    const communityId = await createCommunity('read');
    const scheduledFor = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await scheduleSitePublish({ communityId, actorUserId, scheduledFor, notifySummary: null });

    const found = await getSitePublishScheduleForEditor(communityId);

    expect(found).not.toBeNull();
    expect(found?.status).toBe('pending');
    expect(new Date(found!.scheduledFor).getTime()).toBe(scheduledFor.getTime());
  });

  it('claims a due schedule — the UPDATE binds the lease and the clock', async () => {
    /*
     * The statement from the outage, verbatim through the service. It binds
     * FOUR Dates (`lease_expires_at`, and `now` three times). This is the one
     * that 500s: unlike the exhausted sweep below, the claim is not wrapped in
     * a try/catch, so its failure escapes to the route.
     *
     * The community has nothing staged, so the correct terminal state is
     * `nothing_to_publish` — a distinct outcome from `failed`, and asserting it
     * rather than merely "did not throw" keeps this from passing if the claim
     * were to succeed while the publish underneath it broke.
     */
    const communityId = await createCommunity('claim');
    await scheduleSitePublish({
      communityId,
      actorUserId,
      scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
      notifySummary: null,
    });
    await makeDue(communityId, new Date(Date.now() - 5 * 60 * 1000));

    const summary = await processDueSitePublishes();

    expect(summary.claimed).toBeGreaterThanOrEqual(1);
    expect(summary.nothingToPublish).toBeGreaterThanOrEqual(1);
    expect(summary.failed).toBe(0);

    // And the row reached a terminal state rather than being left in `running`.
    const after = await getSitePublishScheduleForEditor(communityId);
    expect(after).toBeNull();
  });

  it('sweeps exhausted schedules — the UPDATE binds the lease comparison', async () => {
    /*
     * `failExhaustedSchedules` interpolates `${now}`. Its caller swallows the
     * error, so before the fix this failed SILENTLY on every tick — the sweep
     * never ran, and a schedule that burned its attempts would have sat in
     * `running` forever with the PM told nothing. Called directly here so the
     * swallow cannot hide a regression.
     */
    const communityId = await createCommunity('exhausted');
    await scheduleSitePublish({
      communityId,
      actorUserId,
      scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
      notifySummary: null,
    });
    if (!state) throw new Error('Not initialized');
    await state.db.execute(
      sql`UPDATE site_publish_schedules
             SET attempt_count = 3, scheduled_for = now() - interval '5 minutes'
           WHERE community_id = ${communityId} AND status = 'pending'`,
    );

    const sweptIds = await failExhaustedSchedules();

    expect(sweptIds.length).toBeGreaterThanOrEqual(1);
    const after = await getSitePublishScheduleForEditor(communityId);
    expect(after?.status).toBe('failed');
    expect(after?.errorMessage).toContain('ran out of attempts');
  });

  it('cancels a pending schedule', async () => {
    // The cancel path binds no Date, so it is a control: it stays green under
    // the revert, which is what shows the other four failures are about the
    // Date binding and not about the suite being broken generally.
    const communityId = await createCommunity('cancel');
    await scheduleSitePublish({
      communityId,
      actorUserId,
      scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
      notifySummary: null,
    });

    await expect(cancelSitePublishSchedule(communityId, actorUserId)).resolves.toBe(true);
  });
});

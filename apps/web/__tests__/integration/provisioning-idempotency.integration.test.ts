/**
 * Provisioning retry / idempotency characterization — roadmap 3.T3 (TST-03,
 * provisioning half), against a REAL database.
 *
 * Why a real database: every existing provisioning test
 * (`__tests__/billing/provisioning-service.test.ts`,
 * `__tests__/billing/stripe-webhook.test.ts`) replaces the query builder with a
 * mock, so `onConflictDoNothing()` there is a function that returns `[]` — it
 * cannot tell whether a UNIQUE constraint actually exists behind the insert. The
 * idempotency of a retry lives in those constraints (`communities.slug`,
 * `user_roles_user_community_unique`, `compliance_checklist_community_template_key_active`,
 * `notification_preferences_user_community_unique`, `provisioning_jobs` unique
 * `signup_request_id`, the `stripe_webhook_events` primary key), so only a real
 * database can pin it.
 *
 * What is REAL here: the Stripe webhook route handler, `stripe-webhook-service`,
 * the whole provisioning state machine and its watchdog, and every table.
 * What is faked, and only because it leaves the process:
 *   - Stripe (`retrieveCheckoutSession`, signature verification, key mode)
 *   - Supabase Auth admin (`createUser`)
 *   - email delivery (`sendEmail`) — wrapped to count sends and fail on demand
 *   - two pure template lookups in `@propertypro/shared`, wrapped ONLY so a test
 *     can make a step throw once (failure injection); they otherwise delegate.
 *
 * "Lost checkpoint" scenarios: a step can commit its rows and then the process
 * can die before `runProvisioning` persists `last_successful_status`. That
 * window is simulated by letting a run fail at a LATER step and then rewinding
 * the job's checkpoint, which leaves exactly the state such a crash leaves.
 *
 * These are characterization tests: they pin what the code does today so the
 * provisioning decomposition (roadmap 3.11 / SVC-08) cannot change it silently.
 * Two retry paths that are NOT idempotent today (document categories re-inserted
 * on a lost `categories_created` checkpoint; no mutual exclusion between two
 * concurrent runs of one job) are deliberately NOT pinned here — see the 3.T3
 * row in docs/audits/2026-09-22-refactor-audit-and-cleanup-roadmap.md.
 *
 * Every row is keyed by a run-unique slug / email / Stripe id and deleted in
 * afterAll. Slugs match the reaper's `^p2-43-.*-[0-9a-f]{8}$` pattern so a
 * crashed run's communities are swept by the next run's global setup.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import {
  communities,
  complianceChecklistItems,
  documentCategories,
  notificationPreferences,
  pendingSignups,
  provisioningJobs,
  stripeWebhookEvents,
  userRoles,
  users,
} from '@propertypro/db';
import { and, eq, inArray, like } from '@propertypro/db/filters';
// AUTHZ: Integration test for the platform-level provisioning pipeline; signups and jobs precede any community.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { getDescribeDb, requireDatabaseUrlInCI } from './helpers/multi-tenant-test-kit';

// ---------------------------------------------------------------------------
// Edge fakes
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  retrieveCheckoutSession: vi.fn(),
  createUser: vi.fn(),
  /** Every sendEmail attempt, by recipient. */
  emailAttempts: [] as string[],
  /** Only the sends that succeeded, by recipient. */
  emailsDelivered: [] as string[],
  /** Recipients whose NEXT send throws once. */
  failNextEmailTo: new Set<string>(),
  /** Community types whose next checklist / categories template lookup throws once. */
  failChecklistOnce: false,
  failCategoriesOnce: false,
}));

vi.mock('@/lib/services/stripe-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/stripe-service')>();
  return {
    ...actual,
    retrieveCheckoutSession: h.retrieveCheckoutSession,
    // Signature verification is Stripe's; the body is trusted as-is here.
    getStripeClient: () => ({
      webhooks: { constructEvent: (raw: string) => JSON.parse(raw) as unknown },
    }),
    getExpectedLivemode: () => null,
  };
});

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { createUser: h.createUser } } }),
}));

vi.mock('@propertypro/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@propertypro/email')>();
  return {
    ...actual,
    sendEmail: async (options: { to: string | string[] }) => {
      const to = Array.isArray(options.to) ? options.to.join(',') : options.to;
      h.emailAttempts.push(to);
      if (h.failNextEmailTo.delete(to)) {
        throw new Error('injected: email provider unavailable');
      }
      h.emailsDelivered.push(to);
      return { id: `test_${h.emailsDelivered.length}` };
    },
  };
});

vi.mock('@propertypro/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@propertypro/shared')>();
  return {
    ...actual,
    getComplianceTemplate: (...args: Parameters<typeof actual.getComplianceTemplate>) => {
      if (h.failChecklistOnce) {
        h.failChecklistOnce = false;
        throw new Error('injected: checklist_generated failed');
      }
      return actual.getComplianceTemplate(...args);
    },
    getDefaultDocumentCategories: (
      ...args: Parameters<typeof actual.getDefaultDocumentCategories>
    ) => {
      if (h.failCategoriesOnce) {
        h.failCategoriesOnce = false;
        throw new Error('injected: categories_created failed');
      }
      return actual.getDefaultDocumentCategories(...args);
    },
  };
});

// Imports under test come after the mocks.
import { POST as stripeWebhookPOST } from '../../src/app/api/v1/webhooks/stripe/route';
import {
  recoverStuckProvisioningJobs,
  runProvisioning,
} from '../../src/lib/services/provisioning-service';
import {
  insertProvisioningJobFence,
  markPendingSignupPaymentCompleted,
} from '../../src/lib/services/stripe-webhook-service';

requireDatabaseUrlInCI('provisioning-idempotency');
const describeDb = getDescribeDb();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RUN = randomBytes(4).toString('hex');
const EMAIL_DOMAIN = 'provisioning-idempotency.invalid';
let seq = 0;

type Signup = {
  signupRequestId: string;
  slug: string;
  email: string;
  sessionId: string;
};

const created = {
  signupRequestIds: [] as string[],
  eventIds: [] as string[],
  slugs: [] as string[],
  emails: [] as string[],
};

describeDb('provisioning retry / idempotency (integration, 3.T3)', () => {
  const db = createUnscopedClient();

  let CHECKLIST_COUNT = 0;
  let CATEGORY_COUNT = 0;

  async function newSignup(opts: { authUserId?: string | null } = {}): Promise<Signup> {
    seq += 1;
    const signup: Signup = {
      signupRequestId: `prov-idem-${RUN}-${seq}-${randomUUID()}`,
      slug: `p2-43-prov-idem-${seq}-${RUN}`,
      email: `prov-idem-${seq}-${RUN}@${EMAIL_DOMAIN}`,
      sessionId: `cs_test_providem_${RUN}_${seq}`,
    };
    created.signupRequestIds.push(signup.signupRequestId);
    created.slugs.push(signup.slug);
    created.emails.push(signup.email);

    await db.insert(pendingSignups).values({
      signupRequestId: signup.signupRequestId,
      authUserId: opts.authUserId === undefined ? randomUUID() : opts.authUserId,
      primaryContactName: 'Pat Provision',
      email: signup.email,
      emailNormalized: signup.email,
      communityName: `Provision Idempotency ${seq}`,
      address: '101 Coastal Dr, Naples, FL 34102',
      addressLine1: '101 Coastal Dr',
      city: 'Naples',
      state: 'FL',
      zipCode: '34102',
      county: 'Collier',
      unitCount: 40,
      communityType: 'condo_718',
      planKey: 'professional',
      candidateSlug: signup.slug,
      termsAcceptedAt: new Date('2026-08-01T10:00:00Z'),
      termsVersion: '2026-08-09.1',
      status: 'checkout_started',
      payload: { stripeCheckoutSessionId: signup.sessionId },
    });
    return signup;
  }

  function checkoutEvent(signup: Signup, eventId: string) {
    created.eventIds.push(eventId);
    return {
      id: eventId,
      object: 'event',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: {
        object: {
          id: signup.sessionId,
          object: 'checkout.session',
          status: 'complete',
          metadata: { signupRequestId: signup.signupRequestId },
        },
      },
    };
  }

  async function deliver(event: unknown): Promise<Response> {
    return stripeWebhookPOST(
      new NextRequest('http://localhost:3000/api/v1/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: { 'stripe-signature': 't=1,v1=test' },
      }),
    );
  }

  /** What a webhook leaves behind when it dies after the fence, before runProvisioning. */
  async function fenceOnly(signup: Signup): Promise<number> {
    await markPendingSignupPaymentCompleted({
      signupRequestId: signup.signupRequestId,
      stripeCustomerId: `cus_${signup.sessionId}`,
      stripeSubscriptionId: `sub_${signup.sessionId}`,
    });
    const eventId = `evt_providem_fence_${RUN}_${seq}`;
    created.eventIds.push(eventId);
    await insertProvisioningJobFence({ signupRequestId: signup.signupRequestId, stripeEventId: eventId });
    return (await jobFor(signup)).id;
  }

  async function jobsFor(signup: Signup) {
    return db
      .select()
      .from(provisioningJobs)
      .where(eq(provisioningJobs.signupRequestId, signup.signupRequestId));
  }

  async function jobFor(signup: Signup) {
    const rows = await jobsFor(signup);
    expect(rows).toHaveLength(1);
    return rows[0]!;
  }

  async function communitiesFor(signup: Signup) {
    return db
      .select({ id: communities.id })
      .from(communities)
      .where(eq(communities.slug, signup.slug));
  }

  async function communityIdFor(signup: Signup): Promise<number> {
    const rows = await communitiesFor(signup);
    expect(rows).toHaveLength(1);
    return rows[0]!.id;
  }

  const countRows = async (
    table: typeof userRoles | typeof documentCategories | typeof complianceChecklistItems | typeof notificationPreferences,
    communityId: number,
  ) => (await db.select().from(table).where(eq(table.communityId, communityId))).length;

  const delivered = (signup: Signup) => h.emailsDelivered.filter((to) => to === signup.email).length;

  /**
   * Leave the job exactly as a process that died right after committing the
   * step AFTER `lastSuccessfulStatus` (but before recording it) would leave it.
   */
  async function rewindCheckpoint(
    jobId: number,
    lastSuccessfulStatus: string | null,
    opts: { clearCommunityId?: boolean } = {},
  ) {
    await db
      .update(provisioningJobs)
      .set({
        status: 'failed',
        lastSuccessfulStatus,
        completedAt: null,
        ...(opts.clearCommunityId ? { communityId: null } : {}),
      })
      .where(eq(provisioningJobs.id, jobId));
  }

  /** Run the watchdog and return what it did to THIS job (other suites' rows are ignored). */
  async function watchdogTick(jobId: number, now = new Date()) {
    const summary = await recoverStuckProvisioningJobs({ now, maxJobs: 50 });
    return { summary, failure: summary.failures.find((f) => f.jobId === jobId) };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    h.failNextEmailTo.clear();
    h.failChecklistOnce = false;
    h.failCategoriesOnce = false;
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_provisioning_idempotency';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    h.retrieveCheckoutSession.mockImplementation(async (id: string) => ({
      id,
      object: 'checkout.session',
      status: 'complete',
      customer: `cus_${id}`,
      subscription: {
        id: `sub_${id}`,
        object: 'subscription',
        status: 'trialing',
        trial_end: Math.floor(Date.now() / 1000) + 14 * 86_400,
        items: { data: [] },
      },
    }));
    h.createUser.mockImplementation(async () => ({
      data: { user: { id: randomUUID() } },
      error: null,
    }));

    if (CHECKLIST_COUNT === 0) {
      const shared = await vi.importActual<typeof import('@propertypro/shared')>('@propertypro/shared');
      CHECKLIST_COUNT = shared.getComplianceTemplate('condo_718').length;
      CATEGORY_COUNT = shared.getDefaultDocumentCategories('condo_718').length;
      // A zero template would make every "no duplicate" assertion below vacuous.
      expect(CHECKLIST_COUNT).toBeGreaterThan(0);
      expect(CATEGORY_COUNT).toBeGreaterThan(0);
    }
  });

  afterAll(async () => {
    const signupIds = created.signupRequestIds;
    if (signupIds.length > 0) {
      await db.delete(provisioningJobs).where(inArray(provisioningJobs.signupRequestId, signupIds));
    }
    if (created.slugs.length > 0) {
      // user_roles, categories, checklist items and preferences cascade.
      await db.delete(communities).where(inArray(communities.slug, created.slugs));
    }
    if (created.eventIds.length > 0) {
      await db.delete(stripeWebhookEvents).where(inArray(stripeWebhookEvents.eventId, created.eventIds));
    }
    if (signupIds.length > 0) {
      await db.delete(pendingSignups).where(inArray(pendingSignups.signupRequestId, signupIds));
    }
    await db.delete(users).where(like(users.email, `%-${RUN}@${EMAIL_DOMAIN}`));
  });

  // -------------------------------------------------------------------------
  // Stripe webhook re-delivery (real route, real idempotency fence)
  // -------------------------------------------------------------------------

  it('1. the same event delivered twice provisions once, and the duplicate does no work at all', async () => {
    const signup = await newSignup();
    const event = checkoutEvent(signup, `evt_providem_dup_${RUN}_${seq}`);

    const first = await deliver(event);
    expect(first.status).toBe(200);
    const second = await deliver(event);
    expect(second.status).toBe(200);

    // The duplicate is skipped at the stripe_webhook_events precheck, BEFORE any
    // Stripe call or DB write — not merely absorbed by downstream idempotency.
    expect(h.retrieveCheckoutSession).toHaveBeenCalledTimes(1);

    const communityId = await communityIdFor(signup);
    const job = await jobFor(signup);
    expect(job).toMatchObject({ status: 'completed', communityId, stripeEventId: event.id });
    expect(await countRows(userRoles, communityId)).toBe(1);
    expect(delivered(signup)).toBe(1);

    const [fence] = await db
      .select()
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.eventId, event.id));
    expect(fence?.processedAt).not.toBeNull();
  });

  it('2. a Stripe retry of an event whose first attempt failed mid-provisioning resumes and finishes once', async () => {
    const signup = await newSignup();
    const event = checkoutEvent(signup, `evt_providem_retry_${RUN}_${seq}`);

    h.failNextEmailTo.add(signup.email);
    const first = await deliver(event);
    expect(first.status).toBe(500);

    const failedJob = await jobFor(signup);
    expect(failedJob).toMatchObject({
      status: 'failed',
      lastSuccessfulStatus: 'preferences_set',
      retryCount: 1,
    });
    const [unprocessed] = await db
      .select()
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.eventId, event.id));
    expect(unprocessed?.processedAt).toBeNull();

    const retry = await deliver(event);
    expect(retry.status).toBe(200);

    const communityId = await communityIdFor(signup);
    expect(await jobFor(signup)).toMatchObject({ status: 'completed', id: failedJob.id, communityId });
    expect(await countRows(userRoles, communityId)).toBe(1);
    expect(await countRows(documentCategories, communityId)).toBe(CATEGORY_COUNT);
    expect(await countRows(complianceChecklistItems, communityId)).toBe(CHECKLIST_COUNT);
    expect(await countRows(notificationPreferences, communityId)).toBe(1);
    expect(h.emailAttempts.filter((to) => to === signup.email)).toHaveLength(2);
    expect(delivered(signup)).toBe(1);
  });

  it('3. a second, different event for an already-provisioned signup reuses the one job and creates nothing', async () => {
    const signup = await newSignup();
    const firstEvent = checkoutEvent(signup, `evt_providem_a_${RUN}_${seq}`);
    const secondEvent = checkoutEvent(signup, `evt_providem_b_${RUN}_${seq}`);

    expect((await deliver(firstEvent)).status).toBe(200);
    const communityId = await communityIdFor(signup);

    expect((await deliver(secondEvent)).status).toBe(200);

    const jobs = await jobsFor(signup);
    expect(jobs).toHaveLength(1);
    // The job keeps the event that created it; the second event id is never recorded on a job.
    expect(jobs[0]).toMatchObject({ stripeEventId: firstEvent.id, status: 'completed', communityId });
    expect(await communitiesFor(signup)).toHaveLength(1);
    expect(await countRows(userRoles, communityId)).toBe(1);
    expect(delivered(signup)).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Watchdog / manual re-entry (real state machine, real constraints)
  // -------------------------------------------------------------------------

  it('4. a job whose webhook died after the fence is finished by the watchdog; later ticks and a manual re-run are no-ops', async () => {
    const signup = await newSignup();
    const jobId = await fenceOnly(signup);
    // The watchdog only takes an un-started `initiated` job once its signup is stale.
    await db
      .update(pendingSignups)
      .set({ updatedAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(pendingSignups.signupRequestId, signup.signupRequestId));

    const tick = await watchdogTick(jobId);
    expect(tick.failure?.errorMessage).toBeUndefined();
    expect(await jobFor(signup)).toMatchObject({ status: 'completed' });
    const communityId = await communityIdFor(signup);

    // A later tick (made stale on every time arm) and the manual retry endpoint's
    // runProvisioning() both leave a completed job alone.
    const later = await watchdogTick(jobId, new Date(Date.now() + 24 * 60 * 60 * 1000));
    expect(later.failure?.errorMessage).toBeUndefined();
    await runProvisioning(jobId);

    expect(await communitiesFor(signup)).toHaveLength(1);
    expect(await countRows(userRoles, communityId)).toBe(1);
    expect(await countRows(documentCategories, communityId)).toBe(CATEGORY_COUNT);
    expect(delivered(signup)).toBe(1);
    expect(await jobFor(signup)).toMatchObject({ status: 'completed', retryCount: 0 });
  });

  it('5. re-entry after the community_created checkpoint (user_linked failed) reuses the recorded community', async () => {
    const signup = await newSignup({ authUserId: null });
    const jobId = await fenceOnly(signup);

    h.createUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'injected: auth down' } });
    await expect(runProvisioning(jobId)).rejects.toThrow('injected: auth down');
    const failed = await jobFor(signup);
    expect(failed).toMatchObject({ status: 'failed', lastSuccessfulStatus: 'community_created' });
    const communityId = await communityIdFor(signup);
    expect(failed.communityId).toBe(communityId);

    const tick = await watchdogTick(jobId);
    expect(tick.failure?.errorMessage).toBeUndefined();

    expect(await jobFor(signup)).toMatchObject({ status: 'completed', communityId });
    expect(await communitiesFor(signup)).toHaveLength(1);
    expect(await countRows(userRoles, communityId)).toBe(1);
    expect(h.createUser).toHaveBeenCalledTimes(2);
    expect(delivered(signup)).toBe(1);
  });

  it('6. re-running a committed community_created step (checkpoint lost) adopts the existing community by slug', async () => {
    const signup = await newSignup({ authUserId: null });
    const jobId = await fenceOnly(signup);

    h.createUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'injected: auth down' } });
    await expect(runProvisioning(jobId)).rejects.toThrow('injected: auth down');
    const communityId = await communityIdFor(signup);

    // The community row exists, but the job never recorded it.
    await rewindCheckpoint(jobId, null, { clearCommunityId: true });

    const tick = await watchdogTick(jobId);
    expect(tick.failure?.errorMessage).toBeUndefined();

    expect(await communitiesFor(signup)).toHaveLength(1);
    expect(await jobFor(signup)).toMatchObject({ status: 'completed', communityId });
    expect(await countRows(userRoles, communityId)).toBe(1);
    expect(delivered(signup)).toBe(1);
  });

  it('7. re-running a committed user_linked step (checkpoint lost) does not create a second auth user or role', async () => {
    const signup = await newSignup({ authUserId: null });
    const jobId = await fenceOnly(signup);

    h.failChecklistOnce = true;
    await expect(runProvisioning(jobId)).rejects.toThrow('injected: checklist_generated failed');
    expect(await jobFor(signup)).toMatchObject({ status: 'failed', lastSuccessfulStatus: 'user_linked' });
    expect(h.createUser).toHaveBeenCalledTimes(1);

    await rewindCheckpoint(jobId, 'community_created');

    const tick = await watchdogTick(jobId);
    expect(tick.failure?.errorMessage).toBeUndefined();

    const communityId = await communityIdFor(signup);
    expect(await jobFor(signup)).toMatchObject({ status: 'completed' });
    // The auth id was stored on the signup, so the re-run takes the existing-user branch.
    expect(h.createUser).toHaveBeenCalledTimes(1);
    const [signupRow] = await db
      .select({ authUserId: pendingSignups.authUserId })
      .from(pendingSignups)
      .where(eq(pendingSignups.signupRequestId, signup.signupRequestId));
    const roles = await db.select().from(userRoles).where(eq(userRoles.communityId, communityId));
    expect(roles).toHaveLength(1);
    expect(roles[0]).toMatchObject({ userId: signupRow?.authUserId, role: 'root_manager' });
    expect(await db.select().from(users).where(eq(users.email, signup.email))).toHaveLength(1);
  });

  it('8. re-running a committed checklist_generated step (checkpoint lost) inserts no duplicate checklist items', async () => {
    const signup = await newSignup();
    const jobId = await fenceOnly(signup);

    h.failCategoriesOnce = true;
    await expect(runProvisioning(jobId)).rejects.toThrow('injected: categories_created failed');
    expect(await jobFor(signup)).toMatchObject({ status: 'failed', lastSuccessfulStatus: 'checklist_generated' });
    const communityId = await communityIdFor(signup);
    expect(await countRows(complianceChecklistItems, communityId)).toBe(CHECKLIST_COUNT);

    await rewindCheckpoint(jobId, 'user_linked');

    const tick = await watchdogTick(jobId);
    expect(tick.failure?.errorMessage).toBeUndefined();

    expect(await jobFor(signup)).toMatchObject({ status: 'completed' });
    expect(await countRows(complianceChecklistItems, communityId)).toBe(CHECKLIST_COUNT);
    expect(await countRows(documentCategories, communityId)).toBe(CATEGORY_COUNT);
  });

  it('9. re-running a committed preferences_set step (checkpoint lost) inserts no duplicate preference row', async () => {
    const signup = await newSignup();
    const jobId = await fenceOnly(signup);

    h.failNextEmailTo.add(signup.email);
    await expect(runProvisioning(jobId)).rejects.toThrow('injected: email provider unavailable');
    expect(await jobFor(signup)).toMatchObject({ status: 'failed', lastSuccessfulStatus: 'preferences_set' });
    const communityId = await communityIdFor(signup);
    expect(await countRows(notificationPreferences, communityId)).toBe(1);

    await rewindCheckpoint(jobId, 'categories_created');

    const tick = await watchdogTick(jobId);
    expect(tick.failure?.errorMessage).toBeUndefined();

    expect(await jobFor(signup)).toMatchObject({ status: 'completed' });
    expect(await countRows(notificationPreferences, communityId)).toBe(1);
    expect(await countRows(documentCategories, communityId)).toBe(CATEGORY_COUNT);
    expect(delivered(signup)).toBe(1);
  });

  it('10. re-entry after the email_sent checkpoint finishes the job without re-sending the welcome email', async () => {
    const signup = await newSignup();
    const jobId = await fenceOnly(signup);
    await runProvisioning(jobId);
    expect(delivered(signup)).toBe(1);

    // Died after email_sent was recorded, before `completed` was. Two layers
    // keep the email from going out again: resuming AFTER the checkpoint (the
    // step is never reached), and stepEmailSent's own lastSuccessfulStatus
    // guard (which catches a full restart). Breaking either alone stays green.
    await rewindCheckpoint(jobId, 'email_sent');
    await db
      .update(pendingSignups)
      .set({ status: 'provisioning' })
      .where(eq(pendingSignups.signupRequestId, signup.signupRequestId));

    const tick = await watchdogTick(jobId);
    expect(tick.failure?.errorMessage).toBeUndefined();

    expect(await jobFor(signup)).toMatchObject({ status: 'completed', lastSuccessfulStatus: 'completed' });
    expect(delivered(signup)).toBe(1);
    const [signupRow] = await db
      .select({ status: pendingSignups.status })
      .from(pendingSignups)
      .where(eq(pendingSignups.signupRequestId, signup.signupRequestId));
    expect(signupRow?.status).toBe('completed');
  });

  it('11. a failed job that has exhausted its retries is left alone by the watchdog', async () => {
    const signup = await newSignup();
    const jobId = await fenceOnly(signup);
    await db
      .update(provisioningJobs)
      .set({ status: 'failed', retryCount: 5, errorMessage: 'exhausted' })
      .where(eq(provisioningJobs.id, jobId));

    const tick = await watchdogTick(jobId);
    expect(tick.failure?.errorMessage).toBeUndefined();

    expect(await jobFor(signup)).toMatchObject({
      status: 'failed',
      retryCount: 5,
      lastSuccessfulStatus: null,
      startedAt: null,
      communityId: null,
    });
    expect(await communitiesFor(signup)).toHaveLength(0);
    expect(h.emailAttempts.filter((to) => to === signup.email)).toHaveLength(0);
    // Sanity: this signup is otherwise exactly what the watchdog recovers.
    const [row] = await db
      .select({ status: pendingSignups.status })
      .from(pendingSignups)
      .where(and(eq(pendingSignups.signupRequestId, signup.signupRequestId)));
    expect(row?.status).toBe('payment_completed');
  });
});

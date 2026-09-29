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
 * No module is mocked in this file (the no-mock guard,
 * scripts/verify-no-mocks-in-integration.ts, applies to it); the suite-wide
 * setup-integration.ts doubles Supabase Auth admin, as it does for every
 * integration file. Everything else runs for real — the Stripe webhook route
 * with genuine signature verification, `stripe-webhook-service`, the whole
 * provisioning state machine and its watchdog, every table — and the three
 * things that leave the process are pointed at local stand-ins instead:
 *   - Stripe API: the real SDK client, re-targeted at an in-process HTTP double
 *     (host/port/protocol set on the `getStripeClient()` instance). Webhook
 *     bodies are signed with `generateTestHeaderString` and the real secret.
 *   - Supabase Auth admin: the suite-wide provider every integration file gets
 *     from setup-integration.ts (providers/test-auth-admin-provider.ts), which
 *     logs each `createUser` and can fail the next one for an email.
 *   - Email: `RESEND_API_KEY` is unset, so `sendEmail` collects into the
 *     package's own `testInbox`.
 *
 * The watchdog is GLOBAL: `recoverStuckProvisioningJobs` picks every recoverable
 * job in whatever database this suite points at. Before every tick,
 * `watchdogTick` re-runs the watchdog's selection itself and FAILS, without
 * ticking, if any job it would pick was not created by this run — so pointed at
 * a shared database (e.g. through scripts/with-env-local.sh) it refuses rather
 * than provisioning someone else's signup under these stand-ins. It then asserts
 * the tick attempted exactly that set.
 *
 * Failure injection uses no seam in the code under test:
 *   - the email step fails because `NEXT_PUBLIC_APP_URL` is unset for that run;
 *   - `createUser` fails via the auth-admin provider's fail-once hook;
 *   - checklist / categories inserts fail on a temporary BEFORE INSERT trigger
 *     that raises only for this test's own community slug, dropped in `finally`.
 *
 * "Lost checkpoint" scenarios: a step can commit its rows and then the process
 * can die before `runProvisioning` persists `last_successful_status`. That
 * window is simulated by letting a run fail at a LATER step and then rewinding
 * the job's checkpoint, which leaves exactly the state such a crash leaves.
 *
 * These are characterization tests: they pin what the code does today so the
 * provisioning decomposition (roadmap 3.11 / SVC-08) cannot change it silently.
 * Cases 12-15 (and the tail of case 3) pin the four retry paths this file
 * originally found NOT idempotent, fixed together (see the 3.T3 row in
 * docs/audits/2026-09-22-refactor-audit-and-cleanup-roadmap.md): document
 * categories re-inserted on a lost `categories_created` checkpoint (12); no
 * mutual exclusion between two concurrent runs of one job (13, 14); a slug
 * conflict adopting a community that is not this signup's (15); and a
 * re-delivered event moving a `completed` signup back to `payment_completed`
 * (3). Cases 16-18 pin the claim's edges: a pre-step failure releases it, null
 * Stripe ids never prove ownership, and a taken-over run stops cleanly.
 *
 * Safety: the file refuses to run unless DATABASE_URL points at a loopback host
 * (localhost / 127.0.0.1 / ::1, as scripts/local-test-db.sh requires) or CI is
 * set — it creates triggers and runs a global watchdog, neither of which belongs
 * near a shared database.
 *
 * Every row is keyed by a run-unique slug / email / Stripe id and deleted in
 * afterAll. A hard-killed run skips afterAll, and the global reaper sweeps only
 * communities — not signups, jobs, webhook events, users or triggers — so its
 * leftovers would look "foreign" to the next run's watchdog check. beforeAll
 * therefore first deletes every row carrying this file's markers
 * (`prov-idem-%` signups and their jobs, `p2-43-prov-idem-%` communities,
 * `evt_providem_%` events, `@provisioning-idempotency.invalid` users) and drops
 * any `pp_test_fault_%` trigger / function. Two concurrent runs of this file
 * against one database would clobber each other; that is not supported.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
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
import { and, eq, inArray, isNull, like, lt, or, sql } from '@propertypro/db/filters';
// AUTHZ: Integration test for the platform-level provisioning pipeline; signups and jobs precede any community.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { testInbox } from '@propertypro/email';
import { getComplianceTemplate, getDefaultDocumentCategories } from '@propertypro/shared';
import { POST as stripeWebhookPOST } from '../../src/app/api/v1/webhooks/stripe/route';
import {
  recoverStuckProvisioningJobs,
  runProvisioning,
} from '../../src/lib/services/provisioning-service';
import { getStripeClient } from '../../src/lib/services/stripe-service';
import {
  insertProvisioningJobFence,
  markPendingSignupPaymentCompleted,
} from '../../src/lib/services/stripe-webhook-service';
import { getDescribeDb, requireDatabaseUrlInCI } from './helpers/multi-tenant-test-kit';
import {
  failNextAuthCreateUserFor,
  getCapturedAuthCreateUsers,
  INJECTED_AUTH_CREATE_USER_ERROR,
} from './providers/test-auth-admin-provider';

requireDatabaseUrlInCI('provisioning-idempotency');
const describeDb = getDescribeDb();

// ---------------------------------------------------------------------------
// In-process HTTP double for the Stripe API
// ---------------------------------------------------------------------------

type Doubles = {
  server: Server;
  url: string;
  /** `GET /v1/checkout/sessions/<id>` requests, by session id. */
  stripeSessionReads: string[];
  unexpected: string[];
};

function startDoubles(): Promise<Doubles> {
  const state = {
    stripeSessionReads: [] as string[],
    unexpected: [] as string[],
  };
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://double');
      const json = (status: number, payload: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };

      const session = url.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)$/);
      if (req.method === 'GET' && session) {
        const id = decodeURIComponent(session[1]!);
        state.stripeSessionReads.push(id);
        return json(200, {
          id,
          object: 'checkout.session',
          status: 'complete',
          customer: `cus_${id}`,
          subscription: {
            id: `sub_${id}`,
            object: 'subscription',
            status: 'trialing',
            trial_end: Math.floor(Date.now() / 1000) + 14 * 86_400,
            items: { object: 'list', data: [] },
          },
          metadata: {},
        });
      }

      state.unexpected.push(`${req.method ?? '?'} ${url.pathname}`);
      return json(404, { message: 'not in the double' });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${String(port)}`, ...state });
    });
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Refuse any database that is not on this machine, unless CI is set (CI's is an
 * ephemeral service container). Mirrors scripts/local-test-db.sh's host check.
 */
function assertLoopbackDatabaseOrCI(): void {
  if (process.env.CI) return;
  const raw = process.env.DATABASE_URL ?? '';
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    throw new Error('provisioning-idempotency: DATABASE_URL is not a parseable URL; refusing to run');
  }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(
      `provisioning-idempotency: refusing to run against non-local database host '${host}'. `
        + 'It creates triggers and runs a global watchdog; use pnpm test:integration:local.',
    );
  }
}

const RUN = randomBytes(4).toString('hex');
const EMAIL_DOMAIN = 'provisioning-idempotency.invalid';
const WEBHOOK_SECRET = 'whsec_test_provisioning_idempotency';
const APP_URL = 'http://localhost:3000';
const CHECKLIST_COUNT = getComplianceTemplate('condo_718').length;
const CATEGORY_COUNT = getDefaultDocumentCategories('condo_718').length;
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
};

// Mirrors provisioning-service.ts (RECOVERABLE_*_STATUSES, DEFAULT_STALE_AFTER_MS,
// DEFAULT_MAX_RETRY_COUNT). If these drift from the service, the tick's
// `attempted` assertion in watchdogTick goes red.
const RECOVERABLE_JOB_STATUSES = [
  'initiated', 'community_created', 'user_linked', 'checklist_generated',
  'categories_created', 'preferences_set', 'email_sent', 'failed',
];
const RECOVERABLE_SIGNUP_STATUSES = ['payment_completed', 'provisioning'];
const WATCHDOG_STALE_AFTER_MS = 5 * 60 * 1000;
const WATCHDOG_MAX_RETRY_COUNT = 5;

describeDb('provisioning retry / idempotency (integration, 3.T3)', () => {
  assertLoopbackDatabaseOrCI();
  const db = createUnscopedClient();
  let doubles: Doubles;
  let savedStripeApi: Record<string, unknown> | null = null;

  beforeAll(async () => {
    // A zero-length template would make every "no duplicate" assertion vacuous.
    expect(CHECKLIST_COUNT).toBeGreaterThan(0);
    expect(CATEGORY_COUNT).toBeGreaterThan(0);

    await sweepLeftoversFromEarlierRuns();
    doubles = await startDoubles();

    // The Stripe client is a lazy singleton: the key must be in place before first use.
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_provisioning_idempotency');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET);
    vi.stubEnv('NEXT_PUBLIC_APP_URL', APP_URL);
    vi.stubEnv('RESEND_API_KEY', undefined); // sendEmail → testInbox, never Resend

    // The real SDK client, re-targeted at the double (constructor-level config
    // that production never overrides; set here on the one shared instance).
    const { port } = new URL(doubles.url);
    const stripe = getStripeClient() as unknown as {
      _setApiField(key: string, value: unknown): void;
      getApiField(key: string): unknown;
    };
    savedStripeApi = Object.fromEntries(
      ['host', 'port', 'protocol', 'maxNetworkRetries'].map((key) => [key, stripe.getApiField(key)]),
    );
    stripe._setApiField('host', '127.0.0.1');
    stripe._setApiField('port', port);
    stripe._setApiField('protocol', 'http');
    stripe._setApiField('maxNetworkRetries', 0);
  });

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', APP_URL);
  });

  afterAll(async () => {
    const signupIds = created.signupRequestIds;
    try {
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
    } finally {
      await new Promise<void>((resolve) => doubles.server.close(() => resolve()));
      if (savedStripeApi) {
        const stripe = getStripeClient() as unknown as {
          _setApiField(key: string, value: unknown): void;
        };
        for (const [key, value] of Object.entries(savedStripeApi)) stripe._setApiField(key, value);
      }
      vi.unstubAllEnvs();
    }
    // Anything the code under test asked the doubles for that they don't serve.
    expect(doubles.unexpected).toEqual([]);
  });

  /** Remove everything a hard-killed earlier run of this file may have left. */
  async function sweepLeftoversFromEarlierRuns() {
    const stale = await db
      .select({ signupRequestId: pendingSignups.signupRequestId })
      .from(pendingSignups)
      .where(like(pendingSignups.signupRequestId, 'prov-idem-%'));
    const staleIds = stale.map((r) => r.signupRequestId);
    if (staleIds.length > 0) {
      await db.delete(provisioningJobs).where(inArray(provisioningJobs.signupRequestId, staleIds));
    }
    await db.delete(communities).where(like(communities.slug, 'p2-43-prov-idem-%'));
    await db.delete(stripeWebhookEvents).where(like(stripeWebhookEvents.eventId, 'evt_providem_%'));
    if (staleIds.length > 0) {
      await db.delete(pendingSignups).where(inArray(pendingSignups.signupRequestId, staleIds));
    }
    await db.delete(users).where(like(users.email, `%@${EMAIL_DOMAIN}`));

    const triggers = (await db.execute(sql`
      SELECT t.tgname AS name, c.relname AS "table"
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND t.tgname LIKE 'pp\_test\_fault\_%'
    `)) as unknown as Array<{ name: string; table: string }>;
    for (const t of triggers) {
      await db.execute(sql.raw(`DROP TRIGGER IF EXISTS "${t.name}" ON "${t.table}"`));
    }
    const fns = (await db.execute(sql`
      SELECT proname AS name FROM pg_proc WHERE proname LIKE 'pp\_test\_fault\_%'
    `)) as unknown as Array<{ name: string }>;
    for (const f of fns) {
      await db.execute(sql.raw(`DROP FUNCTION IF EXISTS "${f.name}"()`));
    }
  }

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

  /** POST a genuinely signed event to the real webhook route. */
  async function deliver(event: unknown): Promise<Response> {
    const payload = JSON.stringify(event);
    const signature = getStripeClient().webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
    return stripeWebhookPOST(
      new NextRequest('http://localhost:3000/api/v1/webhooks/stripe', {
        method: 'POST',
        body: payload,
        headers: { 'stripe-signature': signature },
      }),
    );
  }

  /** Run `fn` with the welcome-email step unable to run (`NEXT_PUBLIC_APP_URL` unset). */
  async function withEmailStepFailing<T>(fn: () => Promise<T>): Promise<T> {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', undefined);
    try {
      return await fn();
    } finally {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', APP_URL);
    }
  }

  /**
   * Run `fn` with every INSERT into `table` for THIS signup's community raising.
   * A temporary trigger keyed to the test's own slug; other rows are untouched.
   */
  async function withInsertFault<T>(
    table: 'compliance_checklist_items' | 'document_categories',
    signup: Signup,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!/^[a-z0-9-]+$/.test(signup.slug)) throw new Error(`unsafe slug ${signup.slug}`);
    const name = `pp_test_fault_${RUN}_${seq}_${table === 'document_categories' ? 'cat' : 'chk'}`;
    await db.execute(
      sql.raw(`
        CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF EXISTS (SELECT 1 FROM communities c WHERE c.id = NEW.community_id AND c.slug = '${signup.slug}') THEN
            RAISE EXCEPTION 'injected fault: insert into ${table}';
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}();
      `),
    );
    try {
      return await fn();
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${name} ON ${table}; DROP FUNCTION IF EXISTS ${name}();`));
    }
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

  async function signupStatus(signup: Signup): Promise<string | undefined> {
    const [row] = await db
      .select({ status: pendingSignups.status })
      .from(pendingSignups)
      .where(eq(pendingSignups.signupRequestId, signup.signupRequestId));
    return row?.status;
  }

  /** Welcome emails actually handed to the mailer for this signup. */
  const delivered = (signup: Signup) => testInbox.filter((m) => m.to === signup.email).length;
  const sessionReads = (signup: Signup) =>
    doubles.stripeSessionReads.filter((id) => id === signup.sessionId).length;
  const createUserCalls = (signup: Signup) =>
    getCapturedAuthCreateUsers().filter((call) => call.email === signup.email).length;

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

  /**
   * Run one watchdog tick, but only if everything it would pick belongs to this
   * run. Re-runs the service's selection predicate (provisioning-service.ts,
   * `recoverStuckProvisioningJobs`) and refuses to tick on any foreign job.
   */
  async function watchdogTick(
    jobId: number,
    opts: { expectAttempt: boolean; now?: Date; maxRetryCount?: number },
  ) {
    const now = opts.now ?? new Date();
    const maxRetryCount = opts.maxRetryCount ?? WATCHDOG_MAX_RETRY_COUNT;
    const staleBefore = new Date(now.getTime() - WATCHDOG_STALE_AFTER_MS);
    const wouldPick = await db
      .select({ id: provisioningJobs.id, signupRequestId: provisioningJobs.signupRequestId })
      .from(provisioningJobs)
      .innerJoin(pendingSignups, eq(provisioningJobs.signupRequestId, pendingSignups.signupRequestId))
      .where(
        and(
          inArray(provisioningJobs.status, RECOVERABLE_JOB_STATUSES),
          inArray(pendingSignups.status, RECOVERABLE_SIGNUP_STATUSES),
          sql`coalesce(${provisioningJobs.retryCount}, 0) < ${maxRetryCount}`,
          or(
            and(
              eq(provisioningJobs.status, 'initiated'),
              isNull(provisioningJobs.startedAt),
              lt(pendingSignups.updatedAt, staleBefore),
            ),
            and(lt(provisioningJobs.startedAt, staleBefore), sql`${provisioningJobs.status} <> 'completed'`),
            eq(provisioningJobs.status, 'failed'),
          ),
        ),
      );
    const foreign = wouldPick.filter((r) => !created.signupRequestIds.includes(r.signupRequestId ?? ''));
    if (foreign.length > 0) {
      throw new Error(
        `refusing to run the watchdog: it would pick ${foreign.length} job(s) this run did not create `
          + `(ids ${foreign.map((r) => r.id).join(', ')}). Is DATABASE_URL a shared database?`,
      );
    }
    expect(wouldPick.some((r) => r.id === jobId)).toBe(opts.expectAttempt);

    const summary = await recoverStuckProvisioningJobs({ now, maxRetryCount });
    expect(summary.attempted).toBe(wouldPick.length);
    const pickedIds = new Set(wouldPick.map((r) => r.id));
    expect(summary.failures.filter((f) => !pickedIds.has(f.jobId))).toEqual([]);
    return { summary, failure: summary.failures.find((f) => f.jobId === jobId) };
  }

  // -------------------------------------------------------------------------
  // Stripe webhook re-delivery (real route, real idempotency fence)
  // -------------------------------------------------------------------------

  it('1. the same event delivered twice provisions once: no second Stripe call, job, role or email', async () => {
    const signup = await newSignup();
    const event = checkoutEvent(signup, `evt_providem_dup_${RUN}_${seq}`);

    const first = await deliver(event);
    expect(first.status).toBe(200);
    const second = await deliver(event);
    expect(second.status).toBe(200);

    // The duplicate never reaches the handler, so Stripe is not asked again.
    // Two route mechanisms each give this: the processed-event precheck
    // (route.ts, `priorAttempt.processedAt !== null`) and, if that were deleted,
    // the fence insert's unique violation whose race branch also returns 200
    // for a processed event. What reddens it is treating a processed event as
    // a retry.
    expect(sessionReads(signup)).toBe(1);

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

    const first = await withEmailStepFailing(() => deliver(event));
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
    expect(delivered(signup)).toBe(0);

    const retry = await deliver(event);
    expect(retry.status).toBe(200);

    const communityId = await communityIdFor(signup);
    expect(await jobFor(signup)).toMatchObject({ status: 'completed', id: failedJob.id, communityId });
    expect(await countRows(userRoles, communityId)).toBe(1);
    expect(await countRows(documentCategories, communityId)).toBe(CATEGORY_COUNT);
    expect(await countRows(complianceChecklistItems, communityId)).toBe(CHECKLIST_COUNT);
    expect(await countRows(notificationPreferences, communityId)).toBe(1);
    expect(delivered(signup)).toBe(1);
  });

  it('3. a second, different event for an already-provisioned signup reuses the one job: no second job, community, role or email', async () => {
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

    // The second event re-runs markPendingSignupPaymentCompleted; it must not
    // move the finished signup back to `payment_completed`.
    expect(await signupStatus(signup)).toBe('completed');
  });

  // -------------------------------------------------------------------------
  // Watchdog / manual re-entry (real state machine, real constraints)
  // -------------------------------------------------------------------------

  it('4. a job whose webhook died after the fence is finished by the watchdog; a later tick and a direct runProvisioning re-run are no-ops', async () => {
    const signup = await newSignup();
    const jobId = await fenceOnly(signup);
    // The watchdog only takes an un-started `initiated` job once its signup is stale.
    await db
      .update(pendingSignups)
      .set({ updatedAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(pendingSignups.signupRequestId, signup.signupRequestId));

    const tick = await watchdogTick(jobId, { expectAttempt: true });
    expect(tick.failure?.errorMessage).toBeUndefined();
    expect(await jobFor(signup)).toMatchObject({ status: 'completed' });
    const communityId = await communityIdFor(signup);

    // A later tick (past the 5-minute stale window of every time arm) does not
    // select the completed job, and calling runProvisioning() on it directly —
    // what the /internal/provision retry endpoint does — leaves it alone.
    const later = await watchdogTick(jobId, {
      expectAttempt: false,
      now: new Date(Date.now() + 10 * 60 * 1000),
    });
    expect(later.failure?.errorMessage).toBeUndefined();
    await runProvisioning(jobId);

    expect(await communitiesFor(signup)).toHaveLength(1);
    expect(await countRows(userRoles, communityId)).toBe(1);
    expect(await countRows(documentCategories, communityId)).toBe(CATEGORY_COUNT);
    expect(delivered(signup)).toBe(1);
    expect(await jobFor(signup)).toMatchObject({ status: 'completed', retryCount: 0 });
  });

  it('5. re-entry after the community_created checkpoint (user_linked failed) carries the recorded job.communityId into the resumed run', async () => {
    const signup = await newSignup({ authUserId: null });
    const jobId = await fenceOnly(signup);

    failNextAuthCreateUserFor(signup.email);
    await expect(runProvisioning(jobId)).rejects.toThrow(INJECTED_AUTH_CREATE_USER_ERROR);
    const failed = await jobFor(signup);
    expect(failed).toMatchObject({ status: 'failed', lastSuccessfulStatus: 'community_created' });
    const communityId = await communityIdFor(signup);
    expect(failed.communityId).toBe(communityId);

    const tick = await watchdogTick(jobId, { expectAttempt: true });
    expect(tick.failure?.errorMessage).toBeUndefined();

    expect(await jobFor(signup)).toMatchObject({ status: 'completed', communityId });
    expect(await communitiesFor(signup)).toHaveLength(1);
    expect(await countRows(userRoles, communityId)).toBe(1);
    expect(createUserCalls(signup)).toBe(2);
    expect(delivered(signup)).toBe(1);
  });

  it('6. re-running a committed community_created step (checkpoint lost) adopts the existing community by slug', async () => {
    const signup = await newSignup({ authUserId: null });
    const jobId = await fenceOnly(signup);

    failNextAuthCreateUserFor(signup.email);
    await expect(runProvisioning(jobId)).rejects.toThrow(INJECTED_AUTH_CREATE_USER_ERROR);
    const communityId = await communityIdFor(signup);

    // The community row exists, but the job never recorded it.
    await rewindCheckpoint(jobId, null, { clearCommunityId: true });

    const tick = await watchdogTick(jobId, { expectAttempt: true });
    expect(tick.failure?.errorMessage).toBeUndefined();

    expect(await communitiesFor(signup)).toHaveLength(1);
    expect(await jobFor(signup)).toMatchObject({ status: 'completed', communityId });
    expect(await countRows(userRoles, communityId)).toBe(1);
    expect(delivered(signup)).toBe(1);
  });

  it('7. re-running a committed user_linked step (checkpoint lost) does not create a second auth user or role', async () => {
    const signup = await newSignup({ authUserId: null });
    const jobId = await fenceOnly(signup);

    await withInsertFault('compliance_checklist_items', signup, () =>
      expect(runProvisioning(jobId)).rejects.toThrow(/compliance_checklist_items/),
    );
    expect(await jobFor(signup)).toMatchObject({ status: 'failed', lastSuccessfulStatus: 'user_linked' });
    expect(createUserCalls(signup)).toBe(1);

    await rewindCheckpoint(jobId, 'community_created');

    const tick = await watchdogTick(jobId, { expectAttempt: true });
    expect(tick.failure?.errorMessage).toBeUndefined();

    const communityId = await communityIdFor(signup);
    expect(await jobFor(signup)).toMatchObject({ status: 'completed' });
    // The auth id was stored on the signup, so the re-run takes the existing-user branch.
    expect(createUserCalls(signup)).toBe(1);
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

    await withInsertFault('document_categories', signup, () =>
      expect(runProvisioning(jobId)).rejects.toThrow(/document_categories/),
    );
    expect(await jobFor(signup)).toMatchObject({ status: 'failed', lastSuccessfulStatus: 'checklist_generated' });
    const communityId = await communityIdFor(signup);
    expect(await countRows(complianceChecklistItems, communityId)).toBe(CHECKLIST_COUNT);

    await rewindCheckpoint(jobId, 'user_linked');

    const tick = await watchdogTick(jobId, { expectAttempt: true });
    expect(tick.failure?.errorMessage).toBeUndefined();

    expect(await jobFor(signup)).toMatchObject({ status: 'completed' });
    expect(await countRows(complianceChecklistItems, communityId)).toBe(CHECKLIST_COUNT);
    expect(await countRows(documentCategories, communityId)).toBe(CATEGORY_COUNT);
  });

  it('9. re-running a committed preferences_set step (checkpoint lost) inserts no duplicate preference row', async () => {
    const signup = await newSignup();
    const jobId = await fenceOnly(signup);

    await withEmailStepFailing(() =>
      expect(runProvisioning(jobId)).rejects.toThrow('NEXT_PUBLIC_APP_URL env var not set'),
    );
    expect(await jobFor(signup)).toMatchObject({ status: 'failed', lastSuccessfulStatus: 'preferences_set' });
    const communityId = await communityIdFor(signup);
    expect(await countRows(notificationPreferences, communityId)).toBe(1);

    await rewindCheckpoint(jobId, 'categories_created');

    const tick = await watchdogTick(jobId, { expectAttempt: true });
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

    const tick = await watchdogTick(jobId, { expectAttempt: true });
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

    const tick = await watchdogTick(jobId, { expectAttempt: false });
    expect(tick.failure?.errorMessage).toBeUndefined();

    expect(await jobFor(signup)).toMatchObject({
      status: 'failed',
      retryCount: 5,
      lastSuccessfulStatus: null,
      startedAt: null,
      communityId: null,
    });
    expect(await communitiesFor(signup)).toHaveLength(0);
    expect(delivered(signup)).toBe(0);

    // Positive control: the retry ceiling is the ONLY thing holding it back —
    // with the ceiling raised by one, the same tick picks it up and finishes it.
    const control = await watchdogTick(jobId, { expectAttempt: true, maxRetryCount: 6 });
    expect(control.failure?.errorMessage).toBeUndefined();
    expect(await jobFor(signup)).toMatchObject({ status: 'completed', retryCount: 5 });
    expect(await communitiesFor(signup)).toHaveLength(1);
    expect(delivered(signup)).toBe(1);
  });

  // -------------------------------------------------------------------------
  // The four paths that were not idempotent (3.T3 follow-up)
  // -------------------------------------------------------------------------

  it('12. re-running a committed categories_created step (checkpoint lost) inserts no duplicate categories', async () => {
    const signup = await newSignup();
    const jobId = await fenceOnly(signup);

    await withEmailStepFailing(() =>
      expect(runProvisioning(jobId)).rejects.toThrow('NEXT_PUBLIC_APP_URL env var not set'),
    );
    const communityId = await communityIdFor(signup);
    expect(await countRows(documentCategories, communityId)).toBe(CATEGORY_COUNT);

    // Categories are committed, but the job only remembers checklist_generated.
    await rewindCheckpoint(jobId, 'checklist_generated');

    const tick = await watchdogTick(jobId, { expectAttempt: true });
    expect(tick.failure?.errorMessage).toBeUndefined();

    expect(await jobFor(signup)).toMatchObject({ status: 'completed' });
    // document_categories has no UNIQUE (community_id, name): only the step's
    // own read-then-insert-missing keeps this at one set.
    expect(await countRows(documentCategories, communityId)).toBe(CATEGORY_COUNT);
    expect(delivered(signup)).toBe(1);
  });

  it('13. two concurrent runProvisioning calls on one freshly fenced job: exactly one runs', async () => {
    const signup = await newSignup();
    const jobId = await fenceOnly(signup);

    const results = await Promise.allSettled([runProvisioning(jobId), runProvisioning(jobId)]);

    // The defect this pins: without a claim, both runs sent the welcome email
    // and both inserted a category set.
    const communityId = await communityIdFor(signup);
    expect(delivered(signup)).toBe(1);
    expect(await countRows(documentCategories, communityId)).toBe(CATEGORY_COUNT);
    expect(await countRows(complianceChecklistItems, communityId)).toBe(CHECKLIST_COUNT);
    expect(await countRows(userRoles, communityId)).toBe(1);

    // Neither call fails: the loser of the claim returns without doing work.
    expect(results.map((r) => (r.status === 'rejected' ? String(r.reason) : r.status))).toEqual([
      'fulfilled',
      'fulfilled',
    ]);
    const outcomes = results
      .map((r) => (r.status === 'fulfilled' ? r.value : null))
      .sort();
    expect(outcomes).toEqual(['completed', 'in_flight']);
    expect(await jobFor(signup)).toMatchObject({ status: 'completed', retryCount: 0 });
  });

  it('14. a live claim makes other runs and the webhook stand aside; once it goes stale the watchdog takes over', async () => {
    const signup = await newSignup();
    const jobId = await fenceOnly(signup);

    // Another run (say the watchdog) claimed the job a minute ago and has not
    // checkpointed yet — exactly the row a claim leaves behind.
    const claimedAt = new Date(Date.now() - 60 * 1000);
    await db
      .update(provisioningJobs)
      .set({ startedAt: claimedAt })
      .where(eq(provisioningJobs.id, jobId));

    // A direct re-run stands aside without touching anything.
    await expect(runProvisioning(jobId)).resolves.toBe('in_flight');
    expect(await communitiesFor(signup)).toHaveLength(0);

    // So does the webhook — and it answers non-2xx WITHOUT marking the event
    // processed, because nothing guarantees the claim holder will.
    const event = checkoutEvent(signup, `evt_providem_inflight_${RUN}_${seq}`);
    const deferred = await deliver(event);
    expect(deferred.status).toBe(409);
    const [fence] = await db
      .select()
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.eventId, event.id));
    expect(fence?.processedAt).toBeNull();
    expect(await communitiesFor(signup)).toHaveLength(0);
    expect(delivered(signup)).toBe(0);
    expect(await jobFor(signup)).toMatchObject({ status: 'initiated', startedAt: claimedAt });

    // The watchdog does not select a job whose claim is live...
    const live = await watchdogTick(jobId, { expectAttempt: false });
    expect(live.failure?.errorMessage).toBeUndefined();

    // ...but a claim holder that died stops renewing, and past the 5-minute
    // window its claim expires: the watchdog selects the job AND wins the claim.
    await db
      .update(provisioningJobs)
      .set({ startedAt: new Date(Date.now() - WATCHDOG_STALE_AFTER_MS - 60 * 1000) })
      .where(eq(provisioningJobs.id, jobId));
    const stale = await watchdogTick(jobId, { expectAttempt: true });
    expect(stale.failure?.errorMessage).toBeUndefined();
    expect(stale.summary.skippedInFlight).toBe(0);
    expect(await jobFor(signup)).toMatchObject({ status: 'completed', retryCount: 0 });
    expect(delivered(signup)).toBe(1);

    // Stripe's redelivery of the deferred event now finds the job done and
    // marks the event processed.
    const redelivered = await deliver(event);
    expect(redelivered.status).toBe(200);
    const [processed] = await db
      .select()
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.eventId, event.id));
    expect(processed?.processedAt).not.toBeNull();
    expect(delivered(signup)).toBe(1);
  });

  it("15. a slug held by a community that is not this signup's is refused, not adopted", async () => {
    const signup = await newSignup();
    // Somebody else's community already holds the slug (different Stripe ids,
    // never recorded on this job).
    const [foreign] = await db
      .insert(communities)
      .values({
        name: 'Someone Else',
        slug: signup.slug,
        communityType: 'condo_718',
        stripeCustomerId: `cus_foreign_${RUN}_${seq}`,
        stripeSubscriptionId: `sub_foreign_${RUN}_${seq}`,
      })
      .returning({ id: communities.id });
    const jobId = await fenceOnly(signup);

    await expect(runProvisioning(jobId)).rejects.toThrow(/refusing to adopt it/);

    // The job fails visibly (watchdog-retryable, surfaced after the ceiling)...
    expect(await jobFor(signup)).toMatchObject({
      status: 'failed',
      lastSuccessfulStatus: null,
      communityId: null,
      retryCount: 1,
    });
    // ...and the foreign community gains no root_manager, categories or checklist.
    expect(await countRows(userRoles, foreign!.id)).toBe(0);
    expect(await countRows(documentCategories, foreign!.id)).toBe(0);
    expect(await countRows(complianceChecklistItems, foreign!.id)).toBe(0);
    expect(delivered(signup)).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Claim lifecycle edges (review follow-up)
  // -------------------------------------------------------------------------

  it('16. a failure before the first step releases the claim at once instead of holding it for the stale window', async () => {
    const signup = await newSignup();
    const jobId = await fenceOnly(signup);
    if (!/^[a-z0-9-]+$/.test(signup.signupRequestId)) throw new Error('unsafe signupRequestId');

    // Fail runProvisioning's pre-loop write (pending_signups -> 'provisioning')
    // for this signup only.
    const name = `pp_test_fault_${RUN}_${seq}_sig`;
    await db.execute(
      sql.raw(`
        CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.signup_request_id = '${signup.signupRequestId}' AND NEW.status = 'provisioning' THEN
            RAISE EXCEPTION 'injected fault: pending_signups provisioning update';
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER ${name} BEFORE UPDATE ON pending_signups FOR EACH ROW EXECUTE FUNCTION ${name}();
      `),
    );
    try {
      await expect(runProvisioning(jobId)).rejects.toThrow(/update "pending_signups"/);
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${name} ON pending_signups; DROP FUNCTION IF EXISTS ${name}();`));
    }

    // Recorded as a failure — which is also the claim's release...
    expect(await jobFor(signup)).toMatchObject({ status: 'failed', retryCount: 1, lastSuccessfulStatus: null });
    // ...so the very next caller runs it, rather than being told `in_flight`
    // for five minutes by a claim nobody holds.
    await expect(runProvisioning(jobId)).resolves.toBe('completed');
    expect(await jobFor(signup)).toMatchObject({ status: 'completed' });
    expect(delivered(signup)).toBe(1);
  });

  it('17. with no Stripe ids on either side, a slug-holding community is refused (null never matches null)', async () => {
    const signup = await newSignup();
    // A foreign community with NULL Stripe ids holds the slug...
    const [foreign] = await db
      .insert(communities)
      .values({ name: 'Someone Else, unbilled', slug: signup.slug, communityType: 'condo_718' })
      .returning({ id: communities.id });
    // ...and this signup's payload carries null ids too.
    await markPendingSignupPaymentCompleted({
      signupRequestId: signup.signupRequestId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    const eventId = `evt_providem_nullids_${RUN}_${seq}`;
    created.eventIds.push(eventId);
    await insertProvisioningJobFence({ signupRequestId: signup.signupRequestId, stripeEventId: eventId });
    const jobId = (await jobFor(signup)).id;

    await expect(runProvisioning(jobId)).rejects.toThrow(/refusing to adopt it/);

    expect(await jobFor(signup)).toMatchObject({ status: 'failed', communityId: null });
    expect(await countRows(userRoles, foreign!.id)).toBe(0);
    expect(delivered(signup)).toBe(0);
  });

  it('18. a run whose claim was taken over stops at its next checkpoint and records no failure', async () => {
    const signup = await newSignup();
    const jobId = await fenceOnly(signup);
    if (!/^[a-z0-9-]+$/.test(signup.slug)) throw new Error(`unsafe slug ${signup.slug}`);

    // Hold every run inside the preferences_set step for a moment (a slow
    // step), so a second run can take the claim over while the first is alive.
    const name = `pp_test_fault_${RUN}_${seq}_slow`;
    await db.execute(
      sql.raw(`
        CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF EXISTS (SELECT 1 FROM communities c WHERE c.id = NEW.community_id AND c.slug = '${signup.slug}') THEN
            PERFORM pg_sleep(1.5);
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER ${name} BEFORE INSERT ON notification_preferences FOR EACH ROW EXECUTE FUNCTION ${name}();
      `),
    );
    let first: Promise<unknown> | undefined;
    try {
      first = runProvisioning(jobId);
      first.catch(() => {}); // settled below

      // Wait until the first run has checkpointed categories_created: it is now
      // inside preferences_set, sleeping on the insert.
      // Bounded by wall-clock time, not iterations: the steps before
      // preferences_set can take well over 2s on a loaded CI runner.
      const reachDeadline = Date.now() + 20_000; // under the 30s testTimeout
      for (;;) {
        const job = await jobFor(signup);
        if (job.lastSuccessfulStatus === 'categories_created') break;
        if (Date.now() > reachDeadline) throw new Error('first run never reached preferences_set');
        await new Promise((r) => setTimeout(r, 10));
      }

      // Its lease goes stale (as if the step had outlasted the window), and a
      // second run takes the claim over.
      await db
        .update(provisioningJobs)
        .set({ startedAt: new Date(Date.now() - WATCHDOG_STALE_AFTER_MS - 60 * 1000) })
        .where(eq(provisioningJobs.id, jobId));
      const second = runProvisioning(jobId);

      const [firstResult, secondResult] = await Promise.allSettled([first, second]);

      // The defect a missing fence allows: the taken-over run carries on and
      // sends a second welcome email.
      expect(delivered(signup)).toBe(1);
      expect(firstResult.status).toBe('rejected');
      expect(String((firstResult as PromiseRejectedResult).reason)).toMatch(
        /ProvisioningLeaseLostError: .*lost its claim during preferences_set/,
      );
      expect(secondResult).toEqual({ status: 'fulfilled', value: 'completed' });
    } finally {
      // Let the first run settle before cleanup, even on the timeout path.
      if (first) await Promise.allSettled([first]);
      await db.execute(
        sql.raw(`DROP TRIGGER IF EXISTS ${name} ON notification_preferences; DROP FUNCTION IF EXISTS ${name}();`),
      );
    }

    // No `failed` write from the taken-over run.
    expect(await jobFor(signup)).toMatchObject({ status: 'completed', retryCount: 0, errorMessage: null });
    const communityId = await communityIdFor(signup);
    expect(await countRows(notificationPreferences, communityId)).toBe(1);
  });
});

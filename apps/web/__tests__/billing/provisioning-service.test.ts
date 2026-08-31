/**
 * Tests for the provisioning service state machine — P2-35
 *
 * Service: apps/web/src/lib/services/provisioning-service.ts
 *
 * Coverage:
 * - Full happy path: condo_718 — all 7 steps complete
 * - Full happy path: apartment — checklist step is a no-op, apartment categories
 * - Resume from lastSuccessfulStatus: skips completed steps
 * - Failure at step: job transitions to failed, lastSuccessfulStatus preserved
 * - Failure before first step (null): retry starts at community_created
 * - Business idempotency: completed job is a no-op
 * - user_linked with existing authUserId: skips Supabase createUser
 * - user_linked with null authUserId: calls createAdminClient().auth.admin.createUser;
 *   Supabase failure transitions job to failed
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks — must precede all imports
// ---------------------------------------------------------------------------

const {
  createUnscopedClientMock,
  createAdminClientMock,
  sendEmailMock,
  captureExceptionMock,
  retrieveCheckoutSessionMock,
  markPendingSignupPaymentCompletedMock,
  insertProvisioningJobFenceMock,
  getProvisioningJobIdBySignupRequestIdMock,
  andMock,
  ascMock,
  eqMock,
  inArrayMock,
  isNullMock,
  ltMock,
  orMock,
  sqlMock,
  provisioningJobsTable,
  pendingSignupsTable,
  communitiesTable,
  usersTable,
  userRolesTable,
  complianceChecklistItemsTable,
  documentCategoriesTable,
  notificationPreferencesTable,
} = vi.hoisted(() => {
  return {
    createUnscopedClientMock: vi.fn(),
    createAdminClientMock: vi.fn(),
    sendEmailMock: vi.fn().mockResolvedValue({ id: 'email_test_001' }),
    captureExceptionMock: vi.fn(),
    retrieveCheckoutSessionMock: vi.fn(),
    markPendingSignupPaymentCompletedMock: vi.fn().mockResolvedValue(undefined),
    insertProvisioningJobFenceMock: vi.fn().mockResolvedValue(undefined),
    getProvisioningJobIdBySignupRequestIdMock: vi.fn().mockResolvedValue(null),
    andMock: vi.fn((...conditions: unknown[]) => ({ _and: conditions })),
    ascMock: vi.fn((col: unknown) => ({ _asc: col })),
    eqMock: vi.fn((col: unknown, val: unknown) => ({ _eq: [col, val] })),
    inArrayMock: vi.fn((col: unknown, vals: unknown[]) => ({ _inArray: [col, vals] })),
    isNullMock: vi.fn((col: unknown) => ({ _isNull: col })),
    ltMock: vi.fn((col: unknown, val: unknown) => ({ _lt: [col, val] })),
    orMock: vi.fn((...conditions: unknown[]) => ({ _or: conditions })),
    sqlMock: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      _sql: { strings, values },
    })),
    provisioningJobsTable: {
      id: 'provisioning_jobs.id',
      status: 'provisioning_jobs.status',
      lastSuccessfulStatus: 'provisioning_jobs.last_successful_status',
      signupRequestId: 'provisioning_jobs.signup_request_id',
      communityId: 'provisioning_jobs.community_id',
      startedAt: 'provisioning_jobs.started_at',
      completedAt: 'provisioning_jobs.completed_at',
      retryCount: 'provisioning_jobs.retry_count',
      errorMessage: 'provisioning_jobs.error_message',
    },
    pendingSignupsTable: {
      signupRequestId: 'pending_signups.signup_request_id',
      authUserId: 'pending_signups.auth_user_id',
      primaryContactName: 'pending_signups.primary_contact_name',
      email: 'pending_signups.email',
      communityName: 'pending_signups.community_name',
      communityType: 'pending_signups.community_type',
      address: 'pending_signups.address',
      candidateSlug: 'pending_signups.candidate_slug',
      status: 'pending_signups.status',
      updatedAt: 'pending_signups.updated_at',
      payload: 'pending_signups.payload',
    },
    communitiesTable: { id: 'communities.id', slug: 'communities.slug' },
    usersTable: { id: 'users.id', email: 'users.email', fullName: 'users.full_name' },
    userRolesTable: {
      userId: 'user_roles.user_id',
      communityId: 'user_roles.community_id',
      role: 'user_roles.role',
    },
    complianceChecklistItemsTable: { id: 'compliance_checklist_items.id' },
    documentCategoriesTable: { id: 'document_categories.id' },
    notificationPreferencesTable: { id: 'notification_preferences.id' },
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@propertypro/db', () => ({
  communities: communitiesTable,
  // Reached transitively: provisioning applies the starter pack, which since
  // Phase 11b resolves the community's home page. Every export the chain touches
  // has to be here or the module throws at load and the failure reads as this
  // file breaking rather than a missing stub.
  sitePages: Symbol('sitePages'),
  sitePageRedirects: Symbol('sitePageRedirects'),
  siteBlocks: Symbol('siteBlocks'),
  siteStarterPacks: Symbol('siteStarterPacks'),
  complianceAuditLog: Symbol('complianceAuditLog'),
  createScopedClient: vi.fn(),
  complianceChecklistItems: complianceChecklistItemsTable,
  documentCategories: documentCategoriesTable,
  notificationPreferences: notificationPreferencesTable,
  pendingSignups: pendingSignupsTable,
  provisioningJobs: provisioningJobsTable,
  userRoles: userRolesTable,
  users: usersTable,
}));

vi.mock('@propertypro/db/filters', () => ({
  and: andMock,
  asc: ascMock,
  eq: eqMock,
  inArray: inArrayMock,
  isNull: isNullMock,
  lt: ltMock,
  or: orMock,
  sql: sqlMock,
}));

vi.mock('@propertypro/email', () => ({
  WelcomeEmail: vi.fn(),
  sendEmail: sendEmailMock,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

vi.mock('@/lib/services/stripe-service', () => ({
  retrieveCheckoutSession: retrieveCheckoutSessionMock,
  resolveSubscriptionPeriodEndAt: (sub: { trial_end?: number | null }) =>
    typeof sub?.trial_end === 'number' ? new Date(sub.trial_end * 1000) : null,
}));

vi.mock('@/lib/services/stripe-webhook-service', () => ({
  markPendingSignupPaymentCompleted: markPendingSignupPaymentCompletedMock,
  insertProvisioningJobFence: insertProvisioningJobFenceMock,
  getProvisioningJobIdBySignupRequestId: getProvisioningJobIdBySignupRequestIdMock,
}));

// Service import must come after all vi.mock calls
import {
  reconcileLostCheckoutSignups,
  recoverStuckProvisioningJobs,
  runProvisioning,
} from '../../src/lib/services/provisioning-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal pending signup for condo_718. */
const CONDO_SIGNUP = {
  signupRequestId: 'req_condo_001',
  authUserId: 'auth-uuid-001',
  primaryContactName: 'Alice Smith',
  email: 'alice@example.com',
  communityName: 'Palm Gardens Condo',
  communityType: 'condo_718' as const,
  address: '123 Main St, West Palm Beach, FL 33401',
  candidateSlug: 'palm-gardens',
  planKey: 'professional',
  // Accepted days BEFORE provisioning runs — the whole reason the version is
  // carried from pending_signups rather than stamped with new Date() here.
  termsAcceptedAt: new Date('2026-08-01T10:00:00Z'),
  termsVersion: '2026-08-09.1',
};

/** Minimal pending signup for apartment. */
const APT_SIGNUP = {
  ...CONDO_SIGNUP,
  signupRequestId: 'req_apt_001',
  communityType: 'apartment' as const,
  candidateSlug: 'sunset-apartments',
};

/** Build a job row at the given status. */
function makeJob(overrides: {
  id?: number;
  status?: string;
  lastSuccessfulStatus?: string | null;
  communityId?: number | null;
  signupRequestId?: string;
  startedAt?: Date | null;
}) {
  return {
    id: overrides.id ?? 1,
    status: overrides.status ?? 'initiated',
    lastSuccessfulStatus: overrides.lastSuccessfulStatus ?? null,
    communityId: overrides.communityId ?? null,
    signupRequestId: overrides.signupRequestId ?? CONDO_SIGNUP.signupRequestId,
    startedAt: overrides.startedAt ?? null,
    retryCount: 0,
    errorMessage: null,
  };
}

/** Track which DB operations were called for assertions. */
type DbCall = { op: string; table?: unknown; values?: unknown };

/**
 * Build a db mock that records every operation and resolves selects with
 * the provided sequence of row arrays.
 *
 * selectSequence: each call to .limit() pops the next array from the front.
 * insertReturning: array returned from .returning() on insert.
 * insertError: if set, insert().values() throws this error.
 * updateReturning: array returned from .returning() on update.
 */
function buildDb(opts: {
  selectSequence?: unknown[][];
  insertReturning?: unknown[];
  insertError?: Error;
  updateReturning?: unknown[];
} = {}): {
  db: ReturnType<typeof createUnscopedClientMock>;
  calls: DbCall[];
} {
  const calls: DbCall[] = [];
  const selectQueue = [...(opts.selectSequence ?? [])];

  const limitMock = vi.fn(() => {
    const rows = selectQueue.shift() ?? [];
    return Promise.resolve(rows);
  });

  const orderByMock = vi.fn(() => ({ limit: limitMock }));
  const whereMock = vi.fn(() => ({ limit: limitMock, orderBy: orderByMock }));
  const joinMock = vi.fn(() => ({ where: whereMock }));
  const fromMock = vi.fn(() => ({
    where: whereMock,
    innerJoin: joinMock,
  }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  const returningMock = vi.fn(() =>
    Promise.resolve(opts.insertReturning ?? [{ id: 10 }]),
  );

  const onConflictDoNothingMock = vi.fn(() => ({
    returning: returningMock,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve),
  }));

  // The `users` upserts use onConflictDoUpdate, NOT onConflictDoNothing —
  // provisioning is retried, and DoNothing would silently skip the terms columns
  // on any run where the users row already exists. Recorded on the call so the
  // narrow-set assertion below can inspect it.
  // See docs/audits/2026-08-09-legal-risk-audit.md F-18.
  const onConflictDoUpdateMock = vi.fn((config: unknown) => {
    calls.push({ op: 'onConflictDoUpdate', config });
    return {
      returning: returningMock,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve),
    };
  });

  const insertMock = vi.fn((table: unknown) => {
    const valuesMock = opts.insertError
      ? vi.fn(() => { throw opts.insertError; })
      : vi.fn((values: unknown) => {
          calls.push({ op: 'insert', table, values });
          return {
            onConflictDoNothing: onConflictDoNothingMock,
            onConflictDoUpdate: onConflictDoUpdateMock,
          };
        });
    if (opts.insertError) {
      calls.push({ op: 'insert', table });
    }
    return { values: valuesMock };
  });

  const updateWhereReturningMock = vi.fn(() =>
    Promise.resolve(opts.updateReturning ?? []),
  );
  const updateWhereMock = vi.fn(() => {
    const p = Promise.resolve(undefined) as Promise<unknown> & {
      returning: typeof updateWhereReturningMock;
    };
    p.returning = updateWhereReturningMock;
    return p;
  });
  const updateMock = vi.fn((table: unknown) => {
    const call: DbCall = { op: 'update', table: String(table) };
    calls.push(call);
    return {
      // Record the SET payload on the call we just pushed, so assertions can
      // check WHAT an update wrote and not merely that one happened.
      set: vi.fn((values: unknown) => {
        call.values = values;
        return { where: updateWhereMock };
      }),
    };
  });

  const db = {
    select: selectMock,
    insert: insertMock,
    update: updateMock,
  };

  createUnscopedClientMock.mockReturnValue(db);

  return { db, calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runProvisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  });

  // 1. Full happy path — condo_718
  it('runs all 7 steps for a condo_718 signup and ends completed', async () => {
    const job = makeJob({});

    const { calls } = buildDb({
      selectSequence: [
        [job],                               // load job
        [CONDO_SIGNUP],                      // load pending signup
        // community_created uses .returning() on insert, not a select
        [{ userId: 'auth-uuid-001' }],       // preferences_set: lookup user_role by communityId + role
        [{ userId: 'auth-uuid-001' }],       // completed: assert admin user_role exists before terminal
      ],
    });

    await runProvisioning(1);

    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(createUnscopedClientMock).toHaveBeenCalled();

    // creator-is-root (v3): the founding membership is root_manager. Spec §3.5(a).
    const userRoleInsert = calls.find(
      (c) => c.op === 'insert' && c.table === userRolesTable,
    );
    expect(userRoleInsert).toBeDefined();
    expect((userRoleInsert?.values as { role?: string }).role).toBe('root_manager');
  });

  // 1b. The community row must carry the purchased plan.
  //
  // Regression guard for the 2026-08-09 incident: communities 2358/2359 were
  // recovered by the provisioning watchdog and landed with
  // `subscription_plan = null` even though their pending_signups row said
  // `plan_key = 'professional'`. `stepCommunityCreated` never wrote the plan —
  // it was only ever stamped by a later `customer.subscription.*` event, which
  // resolves the community by `stripe_subscription_id` and therefore finds
  // NOTHING while the community does not exist yet. Every such event is dropped
  // silently, so a recovered (or merely race-losing) signup keeps a null plan
  // and sits in the gated/lapsed state despite having paid.
  it('stamps subscription_plan from the pending signup plan_key', async () => {
    const job = makeJob({});

    const { calls } = buildDb({
      selectSequence: [
        [job],
        [CONDO_SIGNUP],
        [{ userId: 'auth-uuid-001' }],
        [{ userId: 'auth-uuid-001' }],
      ],
    });

    await runProvisioning(1);

    const communityInsert = calls.find(
      (c) => c.op === 'insert' && c.table === communitiesTable,
    );
    expect(communityInsert).toBeDefined();
    expect((communityInsert?.values as { subscriptionPlan?: string }).subscriptionPlan).toBe(
      'professional',
    );
  });

  // 1c. An unrecognised plan_key must not be written verbatim — downstream
  // plan gating calls resolvePlanId(), which returns null for junk, so writing
  // it would produce a community that looks subscribed but gates as unplanned.
  it('omits subscription_plan when plan_key is not a canonical plan id', async () => {
    const job = makeJob({});

    const { calls } = buildDb({
      selectSequence: [
        [job],
        [{ ...CONDO_SIGNUP, planKey: 'not_a_real_plan' }],
        [{ userId: 'auth-uuid-001' }],
        [{ userId: 'auth-uuid-001' }],
      ],
    });

    await runProvisioning(1);

    const communityInsert = calls.find(
      (c) => c.op === 'insert' && c.table === communitiesTable,
    );
    expect(communityInsert).toBeDefined();
    expect((communityInsert?.values as Record<string, unknown>).subscriptionPlan).toBeUndefined();
  });

  // 1d. Retry over an already-created community backfills the plan.
  //
  // The INSERT is onConflictDoNothing, so a community created by a run that
  // predates the plan stamp can only be repaired here. This is the path that
  // fixes communities 2358/2359 in place on the next watchdog pass.
  it('backfills subscription_plan when the community row already exists', async () => {
    const job = makeJob({});

    const { calls } = buildDb({
      // Empty .returning() → insert was a no-op → existing-row lookup branch.
      insertReturning: [],
      selectSequence: [
        [job],
        [CONDO_SIGNUP],
        [{ id: 10 }], // community_created: existing community by slug
        [{ userId: 'auth-uuid-001' }],
        [{ userId: 'auth-uuid-001' }],
      ],
    });

    await runProvisioning(1);

    const planBackfill = calls.find(
      (c) =>
        c.op === 'update' &&
        c.table === String(communitiesTable) &&
        (c.values as { subscriptionPlan?: string } | undefined)?.subscriptionPlan ===
          'professional',
    );
    expect(planBackfill).toBeDefined();
  });

  // 2. Full happy path — apartment (checklist is a no-op)
  it('runs all steps for apartment; checklist_generated inserts nothing', async () => {
    const job = makeJob({ signupRequestId: APT_SIGNUP.signupRequestId });

    const { calls } = buildDb({
      selectSequence: [
        [job],
        [APT_SIGNUP],
        // community_created uses .returning() on insert, not a select
        [{ userId: 'auth-uuid-001' }], // preferences_set: lookup user_role by communityId + role
        [{ userId: 'auth-uuid-001' }], // completed: pm_admin user_role assertion
      ],
    });

    await runProvisioning(1);

    // checklist insert should NOT have been called for apartment
    const checklistInserts = calls.filter(
      (c) => c.op === 'insert' && c.table === complianceChecklistItemsTable,
    );
    expect(checklistInserts).toHaveLength(0);

    // apartment categories insert should have been called
    const categoryInserts = calls.filter(
      (c) => c.op === 'insert' && c.table === documentCategoriesTable,
    );
    expect(categoryInserts.length).toBeGreaterThan(0);
  });

  // 3. Resume from lastSuccessfulStatus = 'checklist_generated'
  it('resumes from checklist_generated — skips first 3 steps', async () => {
    const job = makeJob({
      status: 'failed',
      lastSuccessfulStatus: 'checklist_generated',
      communityId: 10,
    });

    const { calls } = buildDb({
      selectSequence: [
        [job],
        [CONDO_SIGNUP],
        [{ userId: 'auth-uuid-001' }], // preferences_set: lookup user_role
        [{ userId: 'auth-uuid-001' }], // completed: pm_admin user_role assertion
      ],
    });

    await runProvisioning(1);

    // community_created and user_linked inserts should NOT appear
    const communityInserts = calls.filter(
      (c) => c.op === 'insert' && c.table === communitiesTable,
    );
    expect(communityInserts).toHaveLength(0);

    expect(sendEmailMock).toHaveBeenCalledOnce();
  });

  // 4. Failure at categories_created — job ends failed, lastSuccessfulStatus preserved
  it('transitions to failed when categories_created throws; retryCount incremented', async () => {
    const job = makeJob({
      lastSuccessfulStatus: 'checklist_generated',
      communityId: 10,
    });

    const dbError = new Error('DB connection refused');

    // Build a db where insert into documentCategories throws
    const selectQueue = [
      [job],
      [CONDO_SIGNUP],
    ];

    let selectCallCount = 0;
    const limitMock = vi.fn(() => {
      const rows = selectQueue[selectCallCount++] ?? [];
      return Promise.resolve(rows);
    });
    const selectMock = vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: limitMock })) })),
    }));

    const updateWhereMock = vi.fn(() => Promise.resolve(undefined));
    const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
    const updateMock = vi.fn(() => ({ set: updateSetMock }));

    let insertCallCount = 0;
    const insertMock = vi.fn(() => {
      insertCallCount++;
      // Throw on the documentCategories insert (second insert call in this resume)
      if (insertCallCount >= 1) {
        return {
          values: vi.fn(() => { throw dbError; }),
        };
      }
      return {
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      };
    });

    createUnscopedClientMock.mockReturnValue({ select: selectMock, insert: insertMock, update: updateMock });

    await expect(runProvisioning(1)).rejects.toThrow('DB connection refused');

    // update should have been called with status='failed'
    expect(updateMock).toHaveBeenCalled();
    const setCall = updateSetMock.mock.calls[updateSetMock.mock.calls.length - 1][0];
    expect(setCall.status).toBe('failed');
    expect(setCall.lastSuccessfulStatus).toBeUndefined(); // NOT overwritten
  });

  // 5. Failure before first step — retry starts at community_created
  it('starts at community_created when lastSuccessfulStatus is null', async () => {
    const job = makeJob({ lastSuccessfulStatus: null, communityId: null });

    const { calls } = buildDb({
      selectSequence: [
        [job],
        [CONDO_SIGNUP],
        // community_created uses .returning() on insert, not a select
        [{ userId: 'auth-uuid-001' }], // preferences_set: lookup user_role by communityId + role
        [{ userId: 'auth-uuid-001' }], // completed: pm_admin user_role assertion
      ],
    });

    await runProvisioning(1);

    // community_created insert should be present
    const communityInserts = calls.filter(
      (c) => c.op === 'insert' && c.table === communitiesTable,
    );
    expect(communityInserts.length).toBeGreaterThan(0);
  });

  // 6. Business idempotency — completed job is a no-op
  it('returns immediately without mutations when job is already completed', async () => {
    const job = makeJob({ status: 'completed', lastSuccessfulStatus: 'completed' });

    const { calls } = buildDb({
      selectSequence: [[job]],
    });

    await runProvisioning(1);

    // No inserts or updates should have happened
    expect(calls.filter((c) => c.op === 'insert')).toHaveLength(0);
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  // 7. user_linked with non-null authUserId — skips createAdminClient
  it('user_linked with existing authUserId: skips Supabase createUser', async () => {
    const job = makeJob({
      lastSuccessfulStatus: 'community_created',
      communityId: 10,
    });

    buildDb({
      selectSequence: [
        [job],
        [{ ...CONDO_SIGNUP, authUserId: 'existing-uuid' }],
        [{ userId: 'existing-uuid' }], // preferences_set
        [{ userId: 'existing-uuid' }], // completed: pm_admin user_role assertion
      ],
    });

    await runProvisioning(1);

    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  // 8a. user_linked with null authUserId — calls createAdminClient
  it('user_linked with null authUserId: calls createAdminClient createUser', async () => {
    const job = makeJob({
      lastSuccessfulStatus: 'community_created',
      communityId: 10,
    });

    const mockAuthUser = { id: 'new-supabase-uuid', email: CONDO_SIGNUP.email };
    createAdminClientMock.mockReturnValue({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: mockAuthUser }, error: null }),
        },
      },
    });

    buildDb({
      selectSequence: [
        [job],
        [{ ...CONDO_SIGNUP, authUserId: null }],
        [{ userId: 'new-supabase-uuid' }], // preferences_set
        [{ userId: 'new-supabase-uuid' }], // completed: pm_admin user_role assertion
      ],
    });

    await runProvisioning(1);

    expect(createAdminClientMock).toHaveBeenCalled();
  });

  // 8b. user_linked: Supabase createUser failure transitions job to failed
  it('user_linked: Supabase createUser failure → job transitions to failed', async () => {
    const job = makeJob({
      lastSuccessfulStatus: 'community_created',
      communityId: 10,
    });

    createAdminClientMock.mockReturnValue({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Email already registered' },
          }),
        },
      },
    });

    let selectCallCount = 0;
    const selectQueue = [
      [job],
      [{ ...CONDO_SIGNUP, authUserId: null }],
    ];

    const limitMock = vi.fn(() => Promise.resolve(selectQueue[selectCallCount++] ?? []));
    const selectMock = vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: limitMock })) })),
    }));

    const updateWhereMock = vi.fn(() => Promise.resolve(undefined));
    const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
    const updateMock = vi.fn(() => ({ set: updateSetMock }));

    createUnscopedClientMock.mockReturnValue({
      select: selectMock,
      insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })) })),
      update: updateMock,
    });

    await expect(runProvisioning(1)).rejects.toThrow('Email already registered');

    const setCall = updateSetMock.mock.calls[updateSetMock.mock.calls.length - 1][0];
    expect(setCall.status).toBe('failed');
    expect(setCall.errorMessage).toContain('Email already registered');
  });

  // 9. Email double-send guard — resume from email_sent skips re-send
  it('skips email send on resume when lastSuccessfulStatus is email_sent', async () => {
    const job = makeJob({
      status: 'failed',
      lastSuccessfulStatus: 'email_sent',
      communityId: 10,
    });

    buildDb({
      selectSequence: [
        [job],
        [CONDO_SIGNUP],
        [{ userId: 'auth-uuid-001' }], // completed: pm_admin user_role assertion
      ],
    });

    await runProvisioning(1);

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('watchdog resumes stale paid signup jobs through the idempotent state machine', async () => {
    const staleJobRow = {
      id: 1,
      signupRequestId: CONDO_SIGNUP.signupRequestId,
      status: 'initiated',
      startedAt: null,
      signupUpdatedAt: new Date('2026-04-23T00:00:00.000Z'),
    };
    const job = makeJob({});

    buildDb({
      selectSequence: [
        [staleJobRow],                       // watchdog query
        [job],                               // runProvisioning: load job
        [CONDO_SIGNUP],                      // runProvisioning: load pending signup
        [{ userId: 'auth-uuid-001' }],       // preferences_set lookup
        [{ userId: 'auth-uuid-001' }],       // completed: pm_admin user_role assertion
        [],                                  // findOrphanCommunities sweep — no orphans
      ],
    });

    const summary = await recoverStuckProvisioningJobs({
      now: new Date('2026-04-23T00:10:00.000Z'),
      staleAfterMs: 5 * 60 * 1000,
    });

    expect(summary).toMatchObject({
      scanned: 1,
      attempted: 1,
      completed: 1,
      failed: 0,
      failures: [],
      orphans: [],
    });
    expect(sendEmailMock).toHaveBeenCalledOnce();
  });

  it('refuses to mark signup completed when no admin user_role exists', async () => {
    // Regression guard: stepCompleted must throw if user_linked silently no-op'd,
    // so the job stays in a recoverable state instead of going terminal as an orphan.
    const job = makeJob({
      status: 'failed',
      lastSuccessfulStatus: 'email_sent',
      communityId: 10,
    });

    buildDb({
      selectSequence: [
        [job],
        [CONDO_SIGNUP],
        [], // completed assertion: NO PM-scope role row → must throw
      ],
    });

    await expect(runProvisioning(1)).rejects.toThrow(
      /no admin user_role found for community 10/,
    );
  });
});

// ---------------------------------------------------------------------------
// reconcileLostCheckoutSignups (A1 — paid-but-webhook-lost recovery)
// ---------------------------------------------------------------------------

function buildReconcileDb(rows: unknown[]) {
  const limitMock = vi.fn().mockResolvedValue(rows);
  const orderByMock = vi.fn(() => ({ limit: limitMock }));
  const whereMock = vi.fn(() => ({ orderBy: orderByMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  return { select: selectMock };
}

describe('reconcileLostCheckoutSignups', () => {
  const TRIAL_END = Math.floor(Date.UTC(2026, 7, 12) / 1000);

  beforeEach(() => {
    vi.clearAllMocks();
    markPendingSignupPaymentCompletedMock.mockResolvedValue(undefined);
    insertProvisioningJobFenceMock.mockResolvedValue(undefined);
    getProvisioningJobIdBySignupRequestIdMock.mockResolvedValue(null);
  });

  it('recovers a paid-and-complete session that never got a provisioning job', async () => {
    createUnscopedClientMock.mockReturnValue(
      buildReconcileDb([
        { signupRequestId: 'req_lost', payload: { stripeCheckoutSessionId: 'cs_lost' } },
      ]),
    );
    retrieveCheckoutSessionMock.mockResolvedValue({
      status: 'complete',
      customer: 'cus_lost',
      subscription: { id: 'sub_lost', status: 'trialing', trial_end: TRIAL_END },
    });

    const summary = await reconcileLostCheckoutSignups({ now: new Date('2026-08-01T00:00:00Z') });

    expect(summary.scanned).toBe(1);
    expect(summary.recovered).toBe(1);
    expect(summary.failed).toBe(0);
    // Self-heals its own partial failures: the scan covers not just
    // checkout_started but also payment_completed/provisioning rows that lack a
    // job (a prior reconcile that marked paid but failed to insert the fence).
    expect(inArrayMock).toHaveBeenCalledWith(pendingSignupsTable.status, [
      'checkout_started',
      'payment_completed',
      'provisioning',
    ]);
    expect(markPendingSignupPaymentCompletedMock).toHaveBeenCalledWith({
      signupRequestId: 'req_lost',
      stripeCustomerId: 'cus_lost',
      stripeSubscriptionId: 'sub_lost',
      subscriptionStatus: 'trialing',
      subscriptionCurrentPeriodEndAt: new Date(TRIAL_END * 1000),
    });
    expect(insertProvisioningJobFenceMock).toHaveBeenCalledWith({
      signupRequestId: 'req_lost',
      stripeEventId: 'reconcile:cs_lost',
    });
  });

  it('leaves an abandoned (not complete) checkout alone', async () => {
    createUnscopedClientMock.mockReturnValue(
      buildReconcileDb([
        { signupRequestId: 'req_open', payload: { stripeCheckoutSessionId: 'cs_open' } },
      ]),
    );
    retrieveCheckoutSessionMock.mockResolvedValue({ status: 'open' });

    const summary = await reconcileLostCheckoutSignups();

    expect(summary.recovered).toBe(0);
    expect(summary.skippedNotComplete).toBe(1);
    expect(markPendingSignupPaymentCompletedMock).not.toHaveBeenCalled();
    expect(insertProvisioningJobFenceMock).not.toHaveBeenCalled();
  });

  it('skips a signup with no stored checkout session id', async () => {
    createUnscopedClientMock.mockReturnValue(
      buildReconcileDb([{ signupRequestId: 'req_nosession', payload: {} }]),
    );

    const summary = await reconcileLostCheckoutSignups();

    expect(summary.skippedNotComplete).toBe(1);
    expect(retrieveCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('records a failure and preserves the row when Stripe retrieval throws', async () => {
    createUnscopedClientMock.mockReturnValue(
      buildReconcileDb([
        { signupRequestId: 'req_err', payload: { stripeCheckoutSessionId: 'cs_err' } },
      ]),
    );
    retrieveCheckoutSessionMock.mockRejectedValue(new Error('stripe down'));

    const summary = await reconcileLostCheckoutSignups();

    expect(summary.failed).toBe(1);
    expect(summary.failures[0]).toEqual({
      signupRequestId: 'req_err',
      errorMessage: 'stripe down',
    });
    expect(markPendingSignupPaymentCompletedMock).not.toHaveBeenCalled();
  });

  // ── Terms acceptance carries through provisioning ──────────────────────────
  //
  // Two failure modes this pins down, both silent:
  //   1. `.onConflictDoNothing()` on the users upsert would skip the terms
  //      columns on every retry where the row already exists — and provisioning
  //      IS retried. A signup that genuinely accepted would end up with no record.
  //   2. Stamping `new Date()` here would backdate-forward: the acceptance
  //      happened at signup, possibly days earlier.
  // See docs/audits/2026-08-09-legal-risk-audit.md F-18.
  it('carries the signup terms acceptance onto the users row via an upsert', async () => {
    const job = makeJob({});
    const { calls } = buildDb({
      selectSequence: [
        [job],
        [CONDO_SIGNUP],
        [{ userId: 'auth-uuid-001' }],
        [{ userId: 'auth-uuid-001' }],
      ],
    });

    await runProvisioning(1);

    const usersInsert = calls.find(
      (c) => c.op === 'insert' && c.table === usersTable,
    ) as { values?: Record<string, unknown> } | undefined;

    expect(usersInsert?.values?.termsAcceptedAt).toEqual(CONDO_SIGNUP.termsAcceptedAt);
    expect(usersInsert?.values?.termsVersion).toBe(CONDO_SIGNUP.termsVersion);

    // Must be an UPDATE-on-conflict, not DoNothing, or a retry loses the write.
    const upsert = calls.find((c) => c.op === 'onConflictDoUpdate') as
      | { config?: { set?: Record<string, unknown> } }
      | undefined;
    expect(upsert, 'users upsert must use onConflictDoUpdate').toBeDefined();
    expect(upsert?.config?.set?.termsAcceptedAt).toEqual(CONDO_SIGNUP.termsAcceptedAt);
    expect(upsert?.config?.set?.termsVersion).toBe(CONDO_SIGNUP.termsVersion);

    // NARROW set — email/fullName must not be clobbered on retry, since a user
    // may have changed them in their profile since signup.
    expect(Object.keys(upsert?.config?.set ?? {}).sort()).toEqual([
      'termsAcceptedAt',
      'termsVersion',
    ]);
  });

});

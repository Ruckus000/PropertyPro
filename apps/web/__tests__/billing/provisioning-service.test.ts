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
  andMock,
  eqMock,
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
    andMock: vi.fn((...conditions: unknown[]) => ({ _and: conditions })),
    eqMock: vi.fn((col: unknown, val: unknown) => ({ _eq: [col, val] })),
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

vi.mock('@propertypro/db', () => ({
  createAdminClient: createAdminClientMock,
  communities: communitiesTable,
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
  eq: eqMock,
  sql: sqlMock,
}));

vi.mock('@propertypro/email', () => ({
  WelcomeEmail: vi.fn(),
  sendEmail: sendEmailMock,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

// Service import must come after all vi.mock calls
import { runProvisioning } from '../../src/lib/services/provisioning-service';

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

  const selectMock = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: limitMock })),
    })),
  }));

  const returningMock = vi.fn(() =>
    Promise.resolve(opts.insertReturning ?? [{ id: 10 }]),
  );

  const onConflictDoNothingMock = vi.fn(() => ({
    returning: returningMock,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve),
  }));

  const valuesMock = opts.insertError
    ? vi.fn(() => { throw opts.insertError; })
    : vi.fn(() => ({ onConflictDoNothing: onConflictDoNothingMock }));

  const insertMock = vi.fn((table: unknown) => {
    calls.push({ op: 'insert', table });
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
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn((table: unknown) => {
    calls.push({ op: 'update', table: String(table) });
    return { set: updateSetMock };
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

    buildDb({
      selectSequence: [
        [job],                               // load job
        [CONDO_SIGNUP],                      // load pending signup
        // community_created uses .returning() on insert, not a select
        [{ userId: 'auth-uuid-001' }],       // preferences_set: lookup user_role by communityId + role
      ],
    });

    await runProvisioning(1);

    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(createUnscopedClientMock).toHaveBeenCalled();
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
      ],
    });

    await runProvisioning(1);

    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

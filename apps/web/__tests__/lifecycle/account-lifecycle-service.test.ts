/**
 * Tests for the Account Lifecycle Service
 *
 * Service: apps/web/src/lib/services/account-lifecycle-service.ts
 *
 * Coverage:
 * - computeAccessPlanStatus: all 5 status branches (revoked, converted, active, in_grace, expired)
 * - requestUserDeletion: request created with correct cooling_ends_at; a repeat returns the pending one
 * - cancelUserDeletion: every cooling request cancelled, state-guarded
 * - executeUserSoftDelete: users.deletedAt set, auth ban called (non-fatal)
 * - purgeUserPII: PII scrubbed, idempotent on second call
 * - requestCommunityDeletion: request created with cooling period
 * - interveneCommunityDeletion: admin cancels community deletion
 * - executeCommunitySoftDelete: communities.deletedAt set
 * - purgeCommunityData: idempotent guard
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks — must precede all imports
// ---------------------------------------------------------------------------

const {
  createUnscopedClientMock,
  createAdminClientMock,
  purgeCommunitySiteAssetsMock,
  purgeCommunityAdminAssetsMock,
  purgeCommunityExportArchivesMock,
  logAuditEventMock,
  findCommunitiesUserIsRootOfMock,
  findRootOffboardingImpactMock,
  revokeVisitorPassesForUserMock,
  eqMock,
  andMock,
  isNullMock,
  neMock,
  inArrayMock,
  ascMock,
  sqlMock,
  accessPlansTable,
  communitiesTable,
  communityExportJobsTable,
  usersTable,
  visitorLogTable,
  accountDeletionRequestsTable,
} = vi.hoisted(() => {
  return {
    createUnscopedClientMock: vi.fn(),
    createAdminClientMock: vi.fn(),
    purgeCommunitySiteAssetsMock: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    purgeCommunityAdminAssetsMock: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    purgeCommunityExportArchivesMock: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    logAuditEventMock: vi.fn().mockResolvedValue(undefined),
    findCommunitiesUserIsRootOfMock: vi.fn().mockResolvedValue([]),
    findRootOffboardingImpactMock: vi.fn().mockResolvedValue([]),
    revokeVisitorPassesForUserMock: vi.fn().mockResolvedValue(0),
    eqMock: vi.fn((col: unknown, val: unknown) => ({ _eq: [col, val] })),
    andMock: vi.fn((...conditions: unknown[]) => ({ _and: conditions })),
    isNullMock: vi.fn((col: unknown) => ({ _isNull: col })),
    neMock: vi.fn((col: unknown, val: unknown) => ({ _ne: [col, val] })),
    inArrayMock: vi.fn((col: unknown, vals: unknown[]) => ({ _inArray: [col, vals] })),
    ascMock: vi.fn((col: unknown) => ({ _asc: col })),
    sqlMock: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      _sql: strings.join('?'),
      values,
    })),
    accessPlansTable: {
      id: 'access_plans.id',
      communityId: 'access_plans.community_id',
      expiresAt: 'access_plans.expires_at',
      graceEndsAt: 'access_plans.grace_ends_at',
      durationMonths: 'access_plans.duration_months',
      gracePeriodDays: 'access_plans.grace_period_days',
      grantedBy: 'access_plans.granted_by',
      notes: 'access_plans.notes',
      revokedAt: 'access_plans.revoked_at',
      revokedBy: 'access_plans.revoked_by',
      convertedAt: 'access_plans.converted_at',
      createdAt: 'access_plans.created_at',
    },
    communitiesTable: {
      id: 'communities.id',
      freeAccessExpiresAt: 'communities.free_access_expires_at',
      deletedAt: 'communities.deleted_at',
    },
    // Soft-deleting a community now also stops any export it had in flight.
    communityExportJobsTable: {
      communityId: 'community_export_jobs.community_id',
      status: 'community_export_jobs.status',
      deletedAt: 'community_export_jobs.deleted_at',
    },
    visitorLogTable: {
      communityId: 'visitor_log.community_id',
      hostUserId: 'visitor_log.host_user_id',
      revokedAt: 'visitor_log.revoked_at',
      deletedAt: 'visitor_log.deleted_at',
    },
    usersTable: {
      id: 'users.id',
      email: 'users.email',
      fullName: 'users.full_name',
      phone: 'users.phone',
      avatarUrl: 'users.avatar_url',
      deletedAt: 'users.deleted_at',
    },
    accountDeletionRequestsTable: {
      id: 'account_deletion_requests.id',
      requestType: 'account_deletion_requests.request_type',
      userId: 'account_deletion_requests.user_id',
      communityId: 'account_deletion_requests.community_id',
      status: 'account_deletion_requests.status',
      coolingEndsAt: 'account_deletion_requests.cooling_ends_at',
      scheduledPurgeAt: 'account_deletion_requests.scheduled_purge_at',
      purgedAt: 'account_deletion_requests.purged_at',
      cancelledAt: 'account_deletion_requests.cancelled_at',
      cancelledBy: 'account_deletion_requests.cancelled_by',
      recoveredAt: 'account_deletion_requests.recovered_at',
      interventionNotes: 'account_deletion_requests.intervention_notes',
    },
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db', () => ({
  accessPlans: accessPlansTable,
  communities: communitiesTable,
  users: usersTable,
  accountDeletionRequests: accountDeletionRequestsTable,
  communityExportJobs: communityExportJobsTable,
  visitorLog: visitorLogTable,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/services/package-visitor-service', () => ({
  revokeVisitorPassesForUser: revokeVisitorPassesForUserMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: eqMock,
  and: andMock,
  isNull: isNullMock,
  isNotNull: (col: unknown) => ({ _isNotNull: col }),
  ne: neMock,
  inArray: inArrayMock,
  asc: ascMock,
  sql: sqlMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@/lib/site-assets/cleanup', () => ({
  purgeCommunitySiteAssets: purgeCommunitySiteAssetsMock,
  purgeCommunityAdminAssets: purgeCommunityAdminAssetsMock,
}));

vi.mock('@/lib/services/export/purge-export-archives', () => ({
  purgeCommunityExportArchives: purgeCommunityExportArchivesMock,
}));

vi.mock('@/lib/account-lifecycle/root-offboarding', () => ({
  findCommunitiesUserIsRootOf: findCommunitiesUserIsRootOfMock,
  findRootOffboardingImpact: findRootOffboardingImpactMock,
}));

// Service import must come after all vi.mock calls
import {
  computeAccessPlanStatus,
  requestUserDeletion,
  RootOffboardingAckRequiredError,
  cancelUserDeletion,
  findCoolingDeletionRequestForUser,
  executeUserSoftDelete,
  purgeUserPII,
  requestCommunityDeletion,
  interveneCommunityDeletion,
  executeCommunitySoftDelete,
  purgeCommunityData,
} from '../../src/lib/services/account-lifecycle-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DbCall = { op: string; table?: unknown; values?: Record<string, unknown>; where?: unknown };

/**
 * Builds a chainable DB mock that records operations.
 * Supports: insert().values().returning(), update().set().where().returning(),
 * select().from().where(), and transaction().
 */
function buildDbMock(options: {
  insertReturning?: unknown[][];
  updateReturning?: unknown[][];
  selectResults?: unknown[][];
  transactionFn?: (tx: unknown) => Promise<unknown>;
}) {
  const calls: DbCall[] = [];
  let insertIdx = 0;
  let updateIdx = 0;
  let selectIdx = 0;

  function makeInsertChain() {
    let insertTable: unknown;
    return {
      values: (vals: Record<string, unknown>) => {
        calls.push({ op: 'insert', table: insertTable, values: vals });
        return {
          returning: () => {
            const result = options.insertReturning?.[insertIdx] ?? [];
            insertIdx++;
            return Promise.resolve(result);
          },
        };
      },
      _setTable: (t: unknown) => {
        insertTable = t;
      },
    };
  }

  function makeUpdateChain() {
    let updateValues: Record<string, unknown> | undefined;
    return {
      set: (vals: Record<string, unknown>) => {
        updateValues = vals;
        return {
          where: (condition: unknown) => {
            calls.push({ op: 'update', values: updateValues, where: condition });
            // Return a thenable that also supports .returning() chaining.
            // If caller does `await update().set().where()` → resolves to undefined.
            // If caller does `await update().set().where().returning()` → resolves to array.
            const whereResult = {
              returning: () => {
                const result = options.updateReturning?.[updateIdx] ?? [];
                updateIdx++;
                return Promise.resolve(result);
              },
              then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
                return Promise.resolve(undefined).then(resolve, reject);
              },
            };
            return whereResult;
          },
        };
      },
    };
  }

  function makeSelectChain() {
    return {
      from: (_table: unknown) => ({
        where: (_condition: unknown) => {
          calls.push({ op: 'select' });
          const result = options.selectResults?.[selectIdx] ?? [];
          selectIdx++;
          return Promise.resolve(result);
        },
      }),
    };
  }

  const mock = {
    insert: (table: unknown) => {
      const chain = makeInsertChain();
      chain._setTable(table);
      return { values: chain.values };
    },
    update: (_table: unknown) => makeUpdateChain(),
    select: () => makeSelectChain(),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      // The transaction callback receives a tx that behaves like db
      return fn(mock);
    },
    _calls: calls,
  };

  return mock;
}

// ---------------------------------------------------------------------------
// computeAccessPlanStatus
// ---------------------------------------------------------------------------

describe('computeAccessPlanStatus', () => {
  it('returns "revoked" when revokedAt is set', () => {
    const plan = {
      revokedAt: new Date('2024-01-01'),
      convertedAt: null,
      expiresAt: new Date('2025-01-01'),
      graceEndsAt: new Date('2025-02-01'),
    };
    expect(computeAccessPlanStatus(plan)).toBe('revoked');
  });

  it('returns "converted" when convertedAt is set (and not revoked)', () => {
    const plan = {
      revokedAt: null,
      convertedAt: new Date('2024-06-01'),
      expiresAt: new Date('2025-01-01'),
      graceEndsAt: new Date('2025-02-01'),
    };
    expect(computeAccessPlanStatus(plan)).toBe('converted');
  });

  it('returns "active" when now < expiresAt', () => {
    const plan = {
      revokedAt: null,
      convertedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000), // tomorrow
      graceEndsAt: new Date(Date.now() + 86_400_000 * 31), // next month
    };
    expect(computeAccessPlanStatus(plan)).toBe('active');
  });

  it('returns "in_grace" when expiresAt <= now < graceEndsAt', () => {
    const plan = {
      revokedAt: null,
      convertedAt: null,
      expiresAt: new Date(Date.now() - 86_400_000), // yesterday
      graceEndsAt: new Date(Date.now() + 86_400_000 * 29), // next month
    };
    expect(computeAccessPlanStatus(plan)).toBe('in_grace');
  });

  it('returns "expired" when now >= graceEndsAt', () => {
    const plan = {
      revokedAt: null,
      convertedAt: null,
      expiresAt: new Date(Date.now() - 86_400_000 * 60),
      graceEndsAt: new Date(Date.now() - 86_400_000),
    };
    expect(computeAccessPlanStatus(plan)).toBe('expired');
  });

  it('revoked takes precedence over converted', () => {
    const plan = {
      revokedAt: new Date('2024-01-01'),
      convertedAt: new Date('2024-02-01'),
      expiresAt: new Date('2025-01-01'),
      graceEndsAt: new Date('2025-02-01'),
    };
    expect(computeAccessPlanStatus(plan)).toBe('revoked');
  });
});

// ---------------------------------------------------------------------------
// requestUserDeletion
// ---------------------------------------------------------------------------

describe('requestUserDeletion', () => {
  const impact = (communityId: number, name: string, hasSuccessor = true) => ({
    communityId,
    name,
    hasSuccessor,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: user is root of no community (clearAllMocks wiped the resolved value).
    findRootOffboardingImpactMock.mockResolvedValue([]);
  });

  it('creates a deletion request with 30-day cooling period', async () => {
    const fakeRequest = {
      id: 1,
      requestType: 'user',
      userId: 'user-uuid-001',
      status: 'cooling',
      coolingEndsAt: new Date(),
    };
    const dbMock = buildDbMock({ insertReturning: [[fakeRequest]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await requestUserDeletion('user-uuid-001');

    expect(result).toEqual({ request: fakeRequest, created: true });
    const insertCall = dbMock._calls.find((c) => c.op === 'insert');
    expect((insertCall?.values as Record<string, unknown>)?.requestType).toBe('user');
    expect((insertCall?.values as Record<string, unknown>)?.status).toBe('cooling');
  });

  // A double POST (two tabs, a retry after a slow response) used to insert a
  // second cooling row. Cancel stopped only one, so the other soft-deleted the
  // account 30 days after the user was told it stays open.
  it('returns the pending cooling request instead of creating a second one', async () => {
    const pending = { id: 3, requestType: 'user', userId: 'user-uuid-001', status: 'cooling', coolingEndsAt: new Date() };
    const dbMock = buildDbMock({ selectResults: [[pending]], insertReturning: [[{ id: 4 }]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await requestUserDeletion('user-uuid-001');

    expect(result).toEqual({ request: pending, created: false });
    expect(dbMock._calls.find((c) => c.op === 'insert')).toBeUndefined();
    expect(andMock).toHaveBeenCalledWith(
      { _eq: [accountDeletionRequestsTable.userId, 'user-uuid-001'] },
      { _eq: [accountDeletionRequestsTable.requestType, 'user'] },
      { _eq: [accountDeletionRequestsTable.status, 'cooling'] },
    );
  });

  it('returns the earliest pending request when duplicates already exist', async () => {
    const older = { id: 3, status: 'cooling' };
    const newer = { id: 8, status: 'cooling' };
    createUnscopedClientMock.mockReturnValue(
      buildDbMock({ selectResults: [[newer, older]], insertReturning: [[{ id: 4 }]] }),
    );

    const result = await requestUserDeletion('user-uuid-001');

    expect(result).toEqual({ request: older, created: false });
  });

  it('a root repeating the request gets the pending one back: no prompt, no second audit', async () => {
    // Nothing is written on a repeat, so there is nothing to acknowledge, and
    // the rootless flags were already recorded against the pending request.
    const pending = { id: 3, requestType: 'user', userId: 'root-user', status: 'cooling', coolingEndsAt: new Date() };
    createUnscopedClientMock.mockReturnValue(buildDbMock({ selectResults: [[pending]] }));
    findRootOffboardingImpactMock.mockResolvedValue([impact(42, 'Sunset Condos')]);

    const result = await requestUserDeletion('root-user');

    expect(result).toEqual({ request: pending, created: false });
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('does not emit a root_pending_deletion audit event when the user is root of no community', async () => {
    const fakeRequest = { id: 5, requestType: 'user', userId: 'user-uuid-002', status: 'cooling', coolingEndsAt: new Date() };
    createUnscopedClientMock.mockReturnValue(buildDbMock({ insertReturning: [[fakeRequest]] }));
    findRootOffboardingImpactMock.mockResolvedValue([]);

    await requestUserDeletion('user-uuid-002');

    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  // R3-03b: the ack gate. A root deleting their account orphans the community,
  // so they must confirm — but it is an ACK, not a refusal, because account
  // deletion has to stay self-service for erasure requests.
  it('throws RootOffboardingAckRequiredError when root and not acknowledged', async () => {
    const dbMock = buildDbMock({ insertReturning: [[{ id: 7 }]] });
    createUnscopedClientMock.mockReturnValue(dbMock);
    findRootOffboardingImpactMock.mockResolvedValue([impact(42, 'Sunset Condos')]);

    await expect(requestUserDeletion('root-user')).rejects.toBeInstanceOf(
      RootOffboardingAckRequiredError,
    );
  });

  it('writes NOTHING when the ack is required — no stray cooling request', async () => {
    // The gate runs before the insert on purpose: a user who bails at the
    // confirmation prompt must not leave a pending deletion behind.
    const dbMock = buildDbMock({ insertReturning: [[{ id: 7 }]] });
    createUnscopedClientMock.mockReturnValue(dbMock);
    findRootOffboardingImpactMock.mockResolvedValue([impact(42, 'Sunset Condos')]);

    await expect(requestUserDeletion('root-user')).rejects.toThrow();

    expect(dbMock._calls.find((c) => c.op === 'insert')).toBeUndefined();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('carries the affected communities on the error so the prompt can name them', async () => {
    createUnscopedClientMock.mockReturnValue(buildDbMock({ insertReturning: [[{ id: 7 }]] }));
    findRootOffboardingImpactMock.mockResolvedValue([
      impact(42, 'Sunset Condos'),
      impact(99, 'Palm Shores HOA', false),
    ]);

    await requestUserDeletion('root-user').catch((err: unknown) => {
      expect(err).toBeInstanceOf(RootOffboardingAckRequiredError);
      expect((err as RootOffboardingAckRequiredError).communities).toEqual([
        { communityId: 42, name: 'Sunset Condos', hasSuccessor: true },
        { communityId: 99, name: 'Palm Shores HOA', hasSuccessor: false },
      ]);
    });
    expect.assertions(2);
  });

  it('proceeds and flags each community once acknowledged', async () => {
    const fakeRequest = { id: 9, requestType: 'user', userId: 'root-user', status: 'cooling', coolingEndsAt: new Date() };
    createUnscopedClientMock.mockReturnValue(buildDbMock({ insertReturning: [[fakeRequest]] }));
    findRootOffboardingImpactMock.mockResolvedValue([
      impact(42, 'Sunset Condos'),
      impact(99, 'Palm Shores HOA'),
    ]);

    const result = await requestUserDeletion('root-user', true);

    expect(result).toEqual({ request: fakeRequest, created: true });
    expect(findRootOffboardingImpactMock).toHaveBeenCalledWith('root-user');
    expect(logAuditEventMock).toHaveBeenCalledTimes(2);
    const calls = logAuditEventMock.mock.calls.map((c) => c[0]);
    expect(calls.every((p: Record<string, unknown>) => p.action === 'root_pending_deletion')).toBe(true);
    expect(calls.map((p: Record<string, unknown>) => p.communityId).sort()).toEqual([42, 99]);
    expect(calls.every((p: Record<string, unknown>) => p.resourceId === '9')).toBe(true);
  });

  // The zero-successor case gets its OWN action, not a metadata flag, so the
  // admin rootless report can filter for the communities that need the
  // two-step break-glass.
  it('uses root_pending_deletion_no_successor when no property_manager can claim root', async () => {
    const fakeRequest = { id: 13, requestType: 'user', userId: 'root-user-3', status: 'cooling', coolingEndsAt: new Date() };
    createUnscopedClientMock.mockReturnValue(buildDbMock({ insertReturning: [[fakeRequest]] }));
    findRootOffboardingImpactMock.mockResolvedValue([
      impact(42, 'Has A PM', true),
      impact(99, 'Nobody Left', false),
    ]);

    await requestUserDeletion('root-user-3', true);

    const byCommunity = new Map(
      logAuditEventMock.mock.calls.map((c) => [
        (c[0] as Record<string, unknown>).communityId,
        c[0] as Record<string, unknown>,
      ]),
    );
    expect(byCommunity.get(42)?.action).toBe('root_pending_deletion');
    expect(byCommunity.get(99)?.action).toBe('root_pending_deletion_no_successor');
    expect(byCommunity.get(99)?.metadata).toMatchObject({ hasSuccessor: false, communityName: 'Nobody Left' });
  });

  // BEHAVIOUR CHANGE (R3-03b). Previously the whole root lookup sat inside a
  // try/catch that swallowed failures, so a DB error meant the request was
  // created as if the user were root of nothing. That is the one case where
  // proceeding silently is unacceptable, so the impact lookup now propagates.
  it('does NOT create the request when the impact lookup fails', async () => {
    const dbMock = buildDbMock({ insertReturning: [[{ id: 11 }]] });
    createUnscopedClientMock.mockReturnValue(dbMock);
    findRootOffboardingImpactMock.mockRejectedValue(new Error('db down'));

    await expect(requestUserDeletion('root-user-2')).rejects.toThrow('db down');

    expect(dbMock._calls.find((c) => c.op === 'insert')).toBeUndefined();
  });

  it('still returns the request when only the AUDIT write fails (best-effort)', async () => {
    const fakeRequest = { id: 12, requestType: 'user', userId: 'root-user-4', status: 'cooling', coolingEndsAt: new Date() };
    createUnscopedClientMock.mockReturnValue(buildDbMock({ insertReturning: [[fakeRequest]] }));
    findRootOffboardingImpactMock.mockResolvedValue([impact(42, 'Sunset Condos')]);
    logAuditEventMock.mockRejectedValueOnce(new Error('audit down'));

    // The request is already committed and the user consented — a logging
    // failure must not surface to them as an error.
    await expect(requestUserDeletion('root-user-4', true)).resolves.toEqual({
      request: fakeRequest,
      created: true,
    });
  });
});

// ---------------------------------------------------------------------------
// cancelUserDeletion
// ---------------------------------------------------------------------------

describe('cancelUserDeletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets status to cancelled', async () => {
    const updated = { id: 1, status: 'cancelled', cancelledBy: 'user-uuid-001' };
    const dbMock = buildDbMock({ updateReturning: [[updated]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await cancelUserDeletion('user-uuid-001', 'user-uuid-001', 1);
    expect(result).toEqual({ outcome: 'cancelled', requests: [updated] });
    const updateCall = dbMock._calls.find((c) => c.op === 'update');
    expect(updateCall?.values).toMatchObject({ status: 'cancelled', cancelledBy: 'user-uuid-001' });
  });

  // Two cooling rows (a double request made before the fix, or one that beat
  // the check-then-insert): stopping only one left the other to soft-delete
  // the account after the user was told it stays open.
  it('cancels every cooling request the user has, not one of them', async () => {
    const rows = [
      { id: 3, status: 'cancelled' },
      { id: 8, status: 'cancelled' },
    ];
    const dbMock = buildDbMock({ updateReturning: [rows] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await cancelUserDeletion('user-uuid-001', 'user-uuid-001', 3);

    expect(result).toEqual({ outcome: 'cancelled', requests: rows });
    const updates = dbMock._calls.filter((c) => c.op === 'update');
    expect(updates).toHaveLength(1);
    // Keyed on the user, not on one request id.
    expect(updates[0]?.where).toEqual({
      _and: expect.arrayContaining([
        { _eq: [accountDeletionRequestsTable.userId, 'user-uuid-001'] },
        { _eq: [accountDeletionRequestsTable.requestType, 'user'] },
      ]),
    });
    expect(eqMock).not.toHaveBeenCalledWith(accountDeletionRequestsTable.id, expect.anything());
  });

  // The 04:00 UTC cron can soft-delete between the route's lookup and this
  // write. Unguarded, the write flipped soft_deleted back to cancelled while
  // the account stayed deleted and banned.
  it('only touches requests still cooling; a soft-deleted one is reported too_late', async () => {
    const dbMock = buildDbMock({ updateReturning: [[]], selectResults: [[{ status: 'soft_deleted' }]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await cancelUserDeletion('user-uuid-001', 'user-uuid-001', 9);

    expect(result).toEqual({ outcome: 'too_late', status: 'soft_deleted' });
    const updateCall = dbMock._calls.find((c) => c.op === 'update');
    expect(updateCall?.where).toEqual({
      _and: expect.arrayContaining([{ _eq: [accountDeletionRequestsTable.status, 'cooling'] }]),
    });
    // The re-read is the user's own request only.
    expect(andMock).toHaveBeenCalledWith(
      { _eq: [accountDeletionRequestsTable.id, 9] },
      { _eq: [accountDeletionRequestsTable.userId, 'user-uuid-001'] },
    );
  });

  // Two DELETEs at once: both looked up request 9, the other one cancelled it
  // first, and this update matched nothing. The account is open.
  it('reports already_cancelled when a concurrent cancel got there first', async () => {
    const dbMock = buildDbMock({
      updateReturning: [[]],
      selectResults: [[{ status: 'cancelled', accountDeleted: false }]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await cancelUserDeletion('user-uuid-001', 'user-uuid-001', 9);

    expect(result).toEqual({ outcome: 'already_cancelled' });
  });

  // Legacy duplicate pair: request 9 (earlier) and 12. The cron soft-deleted 9
  // and the account is deleted and banned; 12 is still cooling. A later cancel
  // finds 12 as the oldest cooling row. Cancelling it would report success and
  // email "your account stays open" to a deleted account.
  it('refuses once the ACCOUNT is deleted, even when the looked-up request is still cooling', async () => {
    // The UPDATE carries the account guard, so the database matches nothing.
    const dbMock = buildDbMock({
      updateReturning: [[]],
      selectResults: [[{ status: 'cooling', accountDeleted: true }]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await cancelUserDeletion('user-uuid-001', 'user-uuid-001', 12);

    expect(result).toEqual({ outcome: 'too_late', status: 'cooling' });
    const updateCall = dbMock._calls.find((c) => c.op === 'update');
    // `not <users.deleted_at set>`, keyed on the user. Not on a soft_deleted
    // request row: a recovered account can still carry one.
    expect(updateCall?.where).toEqual({
      _and: expect.arrayContaining([
        {
          _sql: 'not ?',
          values: [
            expect.objectContaining({
              _sql: expect.stringMatching(/^exists \(select 1 from \? u where u\.id = \? and u\.deleted_at is not null\)$/),
              values: expect.arrayContaining(['user-uuid-001']),
            }),
          ],
        },
      ]),
    });
  });

  it('does not report already_cancelled for a cancelled request on a deleted account', async () => {
    const dbMock = buildDbMock({
      updateReturning: [[]],
      selectResults: [[{ status: 'cancelled', accountDeleted: true }]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await cancelUserDeletion('user-uuid-001', 'user-uuid-001', 12);

    expect(result).toEqual({ outcome: 'too_late', status: 'cancelled' });
  });
});

// ---------------------------------------------------------------------------
// findCoolingDeletionRequestForUser
// ---------------------------------------------------------------------------

describe('findCoolingDeletionRequestForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // With duplicates, return the request the cron reaches first (earliest
  // coolingEndsAt, then id); an unordered .limit(1) could return either.
  it('returns the cooling request the cron reaches first when there are several', async () => {
    // Unordered, the database may hand back either row; model it as the newer.
    const orderByMock = vi.fn(() => ({ limit: () => Promise.resolve([{ id: 3 }]) }));
    createUnscopedClientMock.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({ orderBy: orderByMock, limit: () => Promise.resolve([{ id: 8 }]) }),
        }),
      }),
    });

    await expect(findCoolingDeletionRequestForUser('user-uuid-001')).resolves.toBe(3);
    expect(orderByMock).toHaveBeenCalledWith(
      { _asc: accountDeletionRequestsTable.coolingEndsAt },
      { _asc: accountDeletionRequestsTable.id },
    );
  });
});

// ---------------------------------------------------------------------------
// executeUserSoftDelete
// ---------------------------------------------------------------------------

describe('executeUserSoftDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets users.deletedAt and calls auth ban', async () => {
    const request = { id: 1, userId: 'user-uuid-001', status: 'soft_deleted' };
    const dbMock = buildDbMock({
      // request update + user update (which returns the address it stamped)
      updateReturning: [
        [request],
        [{ id: 'user-uuid-001', email: 'marisol@example.com', fullName: 'Marisol' }],
      ],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const updateUserByIdMock = vi.fn().mockResolvedValue({});
    createAdminClientMock.mockReturnValue({
      auth: { admin: { updateUserById: updateUserByIdMock } },
    });

    const result = await executeUserSoftDelete([1]);

    // The "account deleted" email goes to the address captured by the same
    // statement that soft-deleted the user (D13), not one re-read later.
    expect(result).toEqual([
      { ...request, recipient: { email: 'marisol@example.com', fullName: 'Marisol' } },
    ]);
    const userUpdate = dbMock._calls.filter((c) => c.op === 'update')[1]!;
    expect(userUpdate.values).toEqual({ deletedAt: expect.any(Date) });
    // 'none' LIFTS a ban in GoTrue; 876600h (~100y) is the repo's permanent
    // ban, as in demo-conversion. Pinning 'none' here kept a deleted user able
    // to sign in with every role they held.
    expect(updateUserByIdMock).toHaveBeenCalledWith('user-uuid-001', {
      ban_duration: '876600h',
      user_metadata: { soft_deleted: true },
    });
  });

  it('warns when the auth ban returns an error instead of throwing', async () => {
    const request = { id: 1, userId: 'user-uuid-001', status: 'soft_deleted' };
    const dbMock = buildDbMock({ updateReturning: [[request], [{}]] });
    createUnscopedClientMock.mockReturnValue(dbMock);
    createAdminClientMock.mockReturnValue({
      auth: {
        admin: {
          updateUserById: vi.fn().mockResolvedValue({ data: null, error: { message: 'User not found' } }),
        },
      },
    });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await executeUserSoftDelete([1]);

    expect(result).toEqual([{ ...request, recipient: null }]);
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('succeeds even if auth ban fails (non-fatal)', async () => {
    const request = { id: 1, userId: 'user-uuid-001', status: 'soft_deleted' };
    const dbMock = buildDbMock({
      updateReturning: [[request], [{}]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);
    createAdminClientMock.mockReturnValue({
      auth: { admin: { updateUserById: vi.fn().mockRejectedValue(new Error('Supabase down')) } },
    });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await executeUserSoftDelete([1]);

    expect(result).toEqual([{ ...request, recipient: null }]);
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('does not throw when request is not found, processes what it finds', async () => {
    const dbMock = buildDbMock({ updateReturning: [[]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await executeUserSoftDelete([999]);
    expect(result).toEqual([]);
  });

  // A used recurring, vendor or permanent pass never expires, so a deleted
  // account would otherwise leave it opening the gate.
  it("revokes the deleted user's visitor passes once per community", async () => {
    const request = { id: 1, userId: 'user-uuid-001', status: 'soft_deleted' };
    const dbMock = buildDbMock({
      updateReturning: [[request], [{}]],
      selectResults: [[
        { communityId: 7, hostUserId: 'user-uuid-001' },
        { communityId: 7, hostUserId: 'user-uuid-001' },
        { communityId: 9, hostUserId: 'user-uuid-001' },
      ]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);
    createAdminClientMock.mockReturnValue({
      auth: { admin: { updateUserById: vi.fn().mockResolvedValue({}) } },
    });

    await executeUserSoftDelete([1]);

    expect(revokeVisitorPassesForUserMock.mock.calls).toEqual([
      [7, 'user-uuid-001'],
      [9, 'user-uuid-001'],
    ]);
  });

  it('keeps going when revoking in one community fails, and never fails the soft delete', async () => {
    const request = { id: 1, userId: 'user-uuid-001', status: 'soft_deleted' };
    const dbMock = buildDbMock({
      updateReturning: [[request], [{}]],
      selectResults: [[
        { communityId: 7, hostUserId: 'user-uuid-001' },
        { communityId: 9, hostUserId: 'user-uuid-001' },
      ]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);
    const updateUserByIdMock = vi.fn().mockResolvedValue({});
    createAdminClientMock.mockReturnValue({ auth: { admin: { updateUserById: updateUserByIdMock } } });
    revokeVisitorPassesForUserMock.mockRejectedValueOnce(new Error('db down'));
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await executeUserSoftDelete([1]);

    expect(result).toEqual([{ ...request, recipient: null }]);
    expect(revokeVisitorPassesForUserMock).toHaveBeenCalledTimes(2);
    expect(updateUserByIdMock).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('still soft-deletes when the pass lookup itself fails', async () => {
    const request = { id: 1, userId: 'user-uuid-001', status: 'soft_deleted' };
    const dbMock = buildDbMock({ updateReturning: [[request], [{}]] });
    dbMock.select = () => {
      throw new Error('select failed');
    };
    createUnscopedClientMock.mockReturnValue(dbMock);
    createAdminClientMock.mockReturnValue({
      auth: { admin: { updateUserById: vi.fn().mockResolvedValue({}) } },
    });
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await executeUserSoftDelete([1]);

    expect(result).toEqual([{ ...request, recipient: null }]);
    expect(revokeVisitorPassesForUserMock).not.toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// purgeUserPII
// ---------------------------------------------------------------------------

describe('purgeUserPII', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const request = { id: 1, userId: 'user-uuid-001', status: 'purged', purgedAt: null };
  const finished = { id: 1, status: 'purged', purgedAt: new Date() };
  const authOk = () => {
    const updateUserByIdMock = vi.fn().mockResolvedValue({ data: {}, error: null });
    createAdminClientMock.mockReturnValue({ auth: { admin: { updateUserById: updateUserByIdMock } } });
    return updateUserByIdMock;
  };
  const updates = (dbMock: ReturnType<typeof buildDbMock>) => dbMock._calls.filter((c) => c.op === 'update');

  it('claims the request, scrubs users and auth.users, then sets purged_at', async () => {
    const dbMock = buildDbMock({
      // claim, users scrub, purged_at
      updateReturning: [[request], [{ id: 'user-uuid-001' }], [finished]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);
    const updateUserByIdMock = authOk();

    const result = await purgeUserPII(1);

    expect(result).toEqual(finished);
    // auth.users holds the real email and name too; scrubbing only public.users
    // left them there forever.
    expect(updateUserByIdMock).toHaveBeenCalledWith('user-uuid-001', {
      email: 'deleted-user-uuid-001@redacted.invalid',
      email_confirm: true,
      user_metadata: { full_name: null, fullName: null, external_user_id: null, soft_deleted: true },
    });
    const [claim, scrub, finish] = updates(dbMock);
    expect(claim!.values).toEqual({ status: 'purged' });
    const userUpdateValues = scrub!.values as Record<string, unknown>;
    expect(userUpdateValues.email).toBe('deleted-user-uuid-001@redacted');
    expect(userUpdateValues.fullName).toBe('Deleted User');
    expect(userUpdateValues.phone).toBeNull();
    expect(userUpdateValues.avatarUrl).toBeNull();
    expect(Object.keys(finish!.values!)).toEqual(['purgedAt']);
  });

  // The request's status is the lock between purge and recovery: whichever
  // moves it out of soft_deleted first wins. The claim is that move.
  it('claims only a soft_deleted (or own-claimed, unfinished) user request whose account is due', async () => {
    const dbMock = buildDbMock({ updateReturning: [[]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await expect(purgeUserPII(1)).resolves.toBeNull();

    expect(updates(dbMock)[0]!.where).toEqual({
      _and: [
        {
          _and: [
            { _eq: [accountDeletionRequestsTable.id, 1] },
            { _inArray: [accountDeletionRequestsTable.status, ['soft_deleted', 'purged']] },
            { _isNull: accountDeletionRequestsTable.purgedAt },
          ],
        },
        { _eq: [accountDeletionRequestsTable.requestType, 'user'] },
        expect.objectContaining({ _sql: expect.stringContaining('u.deleted_at <= ?::timestamptz') }),
      ],
    });
  });

  it('touches nothing else when the claim matches nothing (recovered, or already purged)', async () => {
    const dbMock = buildDbMock({ updateReturning: [[]] });
    createUnscopedClientMock.mockReturnValue(dbMock);
    const updateUserByIdMock = authOk();

    await expect(purgeUserPII(1)).resolves.toBeNull();

    expect(updates(dbMock)).toHaveLength(1);
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it('leaves purged_at null when the auth scrub fails, so the next run retries', async () => {
    const dbMock = buildDbMock({ updateReturning: [[request], [{ id: 'user-uuid-001' }]] });
    createUnscopedClientMock.mockReturnValue(dbMock);
    createAdminClientMock.mockReturnValue({
      auth: {
        admin: {
          updateUserById: vi.fn().mockResolvedValue({ data: null, error: { message: 'GoTrue down', status: 500 } }),
        },
      },
    });

    await expect(purgeUserPII(1)).rejects.toThrow(/GoTrue down/);
    expect(updates(dbMock).filter((c) => c.values?.purgedAt !== undefined)).toHaveLength(0);
  });

  // A user missing from auth has nothing to scrub there; without this the
  // purge failed every night forever.
  it('treats a user missing from auth as already scrubbed, logging only the id', async () => {
    const dbMock = buildDbMock({ updateReturning: [[request], [{ id: 'user-uuid-001' }], [finished]] });
    createUnscopedClientMock.mockReturnValue(dbMock);
    createAdminClientMock.mockReturnValue({
      auth: {
        admin: {
          updateUserById: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'User not found', status: 404, code: 'user_not_found' },
          }),
        },
      },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(purgeUserPII(1)).resolves.toEqual(finished);

    expect(warn).toHaveBeenCalledWith(
      '[account-lifecycle] auth user user-uuid-001 not found; treating auth as already scrubbed',
    );
    warn.mockRestore();
  });

  it('releases the claim, and leaves auth.users alone, when the account was reopened after the claim', async () => {
    // The users scrub is conditional on deleted_at still being set; it matches nothing.
    const dbMock = buildDbMock({ updateReturning: [[request], []] });
    createUnscopedClientMock.mockReturnValue(dbMock);
    const updateUserByIdMock = authOk();

    await expect(purgeUserPII(1)).resolves.toBeNull();

    expect(updateUserByIdMock).not.toHaveBeenCalled();
    const [, scrub, release] = updates(dbMock);
    expect(scrub!.where).toEqual({
      _and: [{ _eq: [usersTable.id, 'user-uuid-001'] }, { _isNotNull: usersTable.deletedAt }],
    });
    expect(release!.values).toEqual({ status: 'soft_deleted' });
    expect(release!.where).toEqual({
      _and: [
        { _eq: [accountDeletionRequestsTable.id, 1] },
        { _eq: [accountDeletionRequestsTable.status, 'purged'] },
        { _isNull: accountDeletionRequestsTable.purgedAt },
      ],
    });
  });

  // A double-fired cron: the other run set purged_at first. A clean skip.
  it('returns null when an overlapping run already finished the request', async () => {
    const dbMock = buildDbMock({ updateReturning: [[request], [{ id: 'user-uuid-001' }], []] });
    createUnscopedClientMock.mockReturnValue(dbMock);
    authOk();

    await expect(purgeUserPII(1)).resolves.toBeNull();
    expect(updates(dbMock)[2]!.where).toEqual({
      _and: [
        { _eq: [accountDeletionRequestsTable.id, 1] },
        { _eq: [accountDeletionRequestsTable.status, 'purged'] },
        { _isNull: accountDeletionRequestsTable.purgedAt },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// requestCommunityDeletion
// ---------------------------------------------------------------------------

describe('requestCommunityDeletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a community deletion request with 30-day cooling period', async () => {
    const fakeRequest = {
      id: 1,
      requestType: 'community',
      communityId: 100,
      userId: 'admin-001',
      status: 'cooling',
    };
    const dbMock = buildDbMock({ insertReturning: [[fakeRequest]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await requestCommunityDeletion(100, 'admin-001');

    expect(result).toEqual(fakeRequest);
    const insertCall = dbMock._calls.find((c) => c.op === 'insert');
    expect((insertCall?.values as Record<string, unknown>)?.requestType).toBe('community');
    expect((insertCall?.values as Record<string, unknown>)?.communityId).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// interveneCommunityDeletion
// ---------------------------------------------------------------------------

describe('interveneCommunityDeletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('platform admin cancels community deletion', async () => {
    const updated = { id: 1, status: 'cancelled', cancelledBy: 'platform-admin-001' };
    const dbMock = buildDbMock({ updateReturning: [[updated]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await interveneCommunityDeletion(1, {
      adminUserId: 'platform-admin-001',
      notes: 'Retained by admin review',
    });

    expect(result).toEqual(updated);
    const updateCall = dbMock._calls.find((c) => c.op === 'update');
    expect((updateCall?.values as Record<string, unknown>)?.interventionNotes).toBe(
      'Retained by admin review',
    );
  });

  // Unguarded, a cancel racing the cron overwrote `soft_deleted` with
  // `cancelled`: a deleted community that could be neither purged nor recovered.
  it('only cancels a request that is still cooling', async () => {
    const dbMock = buildDbMock({ updateReturning: [[]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await expect(
      interveneCommunityDeletion(1, { adminUserId: 'platform-admin-001' }),
    ).rejects.toThrow(/not found or no longer cooling/);
    expect(dbMock._calls.find((c) => c.op === 'update')?.where).toEqual({
      _and: [
        { _eq: [accountDeletionRequestsTable.id, 1] },
        { _eq: [accountDeletionRequestsTable.status, 'cooling'] },
      ],
    });
  });

  it('audits the cancellation against the community', async () => {
    // `apps/web/src/app/api/v1/communities/delete/route.ts` justifies making
    // cancellation root-exclusive by pointing at platform-admin intervention as
    // "a break-glass that leaves an audit trail". For the apps/admin route that
    // was true; for this service it was not.
    const updated = {
      id: 1,
      communityId: 100,
      status: 'cancelled',
      cancelledBy: 'platform-admin-001',
    };
    const dbMock = buildDbMock({ updateReturning: [[updated]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await interveneCommunityDeletion(1, { adminUserId: 'platform-admin-001', notes: 'ok' });

    expect(logAuditEventMock).toHaveBeenCalledOnce();
    expect(logAuditEventMock.mock.calls[0]![0]).toMatchObject({
      userId: 'platform-admin-001',
      action: 'update', // reversible — unlike the purge, which mints its own action
      resourceType: 'account_deletion_request',
      resourceId: '1',
      communityId: 100,
    });
  });

  it('does NOT log the intervention notes', async () => {
    // `notes` is admin-supplied free text (max 2000 chars) that can name a
    // resident or repeat a grievance, and compliance_audit_log is board-readable
    // and append-only — so a name logged here is visible to the board forever
    // and cannot be retracted. A boolean answers "was a reason given" without
    // committing the reason itself.
    //
    // apps/admin's twin DOES log notes, into platform_admin_audit_log, which is
    // operator-only with zero RLS policies. Different table, different
    // readership, different rule — the two are not inconsistent.
    const updated = { id: 1, communityId: 100, status: 'cancelled' };
    const dbMock = buildDbMock({ updateReturning: [[updated]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await interveneCommunityDeletion(1, {
      adminUserId: 'admin-1',
      notes: 'resident jane@example.com asked us to stop',
    });

    // A string search is right here: the claim is literally "this text is absent".
    expect(JSON.stringify(logAuditEventMock.mock.calls[0])).not.toContain('jane@example.com');
    expect(logAuditEventMock.mock.calls[0]![0]).toMatchObject({
      metadata: { notesProvided: true },
    });
  });

  it('does NOT audit a request with no community', async () => {
    // The intervene ROUTE passes any request id straight through with no
    // requestType filter, so a user-type request reaches this function. Same
    // NOT NULL wall as the purge.
    const updated = { id: 2, communityId: null, status: 'cancelled' };
    const dbMock = buildDbMock({ updateReturning: [[updated]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await interveneCommunityDeletion(2, { adminUserId: 'admin-1' });

    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('throws when request is not found', async () => {
    const dbMock = buildDbMock({ updateReturning: [[]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await expect(
      interveneCommunityDeletion(999, { adminUserId: 'admin-001' }),
    ).rejects.toThrow('Deletion request 999 not found');
  });
});

// ---------------------------------------------------------------------------
// executeCommunitySoftDelete
// ---------------------------------------------------------------------------

describe('executeCommunitySoftDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets communities.deletedAt and schedules purge', async () => {
    const request = { id: 1, communityId: 100, status: 'soft_deleted' };
    const dbMock = buildDbMock({
      updateReturning: [[request], [{}]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await executeCommunitySoftDelete([1]);

    expect(result).toEqual([request]);

    /*
     * Asserted by WHAT was written, not by how many writes happened. The count
     * was 2 and is now 3 — soft-delete also stops the community's in-flight
     * exports — and a bare count would have to be edited again for the next
     * addition while telling the reader nothing about which writes matter.
     */
    const updates = dbMock._calls.filter((c) => c.op === 'update');
    expect(updates.some((c) => c.values?.deletedAt instanceof Date)).toBe(true);
    expect(updates.some((c) => c.values?.status === 'soft_deleted')).toBe(true);
  });

  it('stops an in-flight export rather than leaving it queued for six months', async () => {
    /*
     * The claim scan skips soft-deleted communities, but a filter alone would
     * leave the job `queued` — invisible to the requester, holding the
     * one-active-job-per-community slot, and firing on a stale cursor the
     * moment the community is recovered.
     *
     * `failed` and not `cancelled` because the settings card renders
     * `errorMessage` only under `failed`; `cancelled` shows a bare "Cancelled."
     * that reads as user-initiated, so the board member who asked for the
     * export would never learn why it stopped.
     */
    const request = { id: 1, communityId: 100, status: 'soft_deleted' };
    const dbMock = buildDbMock({ updateReturning: [[request], [{}], [{}]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await executeCommunitySoftDelete([1]);

    const jobUpdate = dbMock._calls
      .filter((c) => c.op === 'update')
      .find((c) => c.values?.errorCode === 'COMMUNITY_DELETED');

    expect(jobUpdate).toBeDefined();
    expect(jobUpdate!.values!.status).toBe('failed');
    expect(jobUpdate!.values!.errorMessage).toMatch(/scheduled for deletion/i);
    // The lease must be released, or the reaper's lease guard would spare the
    // row and its partial volumes would survive the cooling window.
    expect(jobUpdate!.values!.leaseExpiresAt).toBeNull();
  });

  it('does not throw when request is not found, processes what it finds', async () => {
    const dbMock = buildDbMock({ updateReturning: [[]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await executeCommunitySoftDelete([999]);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// purgeCommunityData
// ---------------------------------------------------------------------------

describe('purgeCommunityData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    purgeCommunitySiteAssetsMock.mockResolvedValue({ deletedCount: 0 });
    purgeCommunityAdminAssetsMock.mockResolvedValue({ deletedCount: 0 });
    purgeCommunityExportArchivesMock.mockResolvedValue({ deletedCount: 0 });
  });

  it('sets status to purged', async () => {
    const request = { id: 1, communityId: 100, status: 'soft_deleted' };
    const updatedRequest = { id: 1, status: 'purged', purgedAt: new Date() };
    const dbMock = buildDbMock({
      updateReturning: [[request], [updatedRequest]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await purgeCommunityData(1);
    expect(result).toEqual(updatedRequest);
  });

  it('returns null when already purged (idempotent)', async () => {
    const dbMock = buildDbMock({ updateReturning: [[]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await purgeCommunityData(1);
    expect(result).toBeNull();
  });

  it('sweeps BOTH website-asset buckets, and counts them separately', async () => {
    // community-site-assets (site editor uploads) was swept; community-assets
    // (admin console uploads, `{id}/site/…`) was not, so a purged community's
    // logo and site imagery survived indefinitely in a PUBLIC bucket. The ToS
    // says the purge step deletes "community website assets" — both are that.
    //
    // Counted separately in the audit metadata rather than summed: the two
    // buckets fail independently, and a single total cannot tell you which
    // sweep found nothing because there was nothing, versus because it was
    // pointed at the wrong prefix.
    const request = { id: 1, communityId: 100, status: 'soft_deleted' };
    const dbMock = buildDbMock({
      updateReturning: [[request], [{ id: 1, status: 'purged', purgedAt: new Date() }]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);
    purgeCommunitySiteAssetsMock.mockResolvedValue({ deletedCount: 3 });
    purgeCommunityAdminAssetsMock.mockResolvedValue({ deletedCount: 5 });

    await purgeCommunityData(1);

    expect(purgeCommunityAdminAssetsMock).toHaveBeenCalledWith(100);
    expect(logAuditEventMock.mock.calls[0]![0]).toMatchObject({
      metadata: { siteAssetsDeleted: 3, adminAssetsDeleted: 5, exportArchivesDeleted: 0 },
    });
  });

  it('a failing admin-assets sweep aborts the status flip, keeping the request retryable', async () => {
    // Same contract as the two sweeps beside it. The cron never retries a
    // request already marked 'purged', so a sweep that throws MUST stop the
    // flip — otherwise the objects it failed to delete are stranded forever.
    const request = { id: 1, communityId: 100, status: 'soft_deleted' };
    const dbMock = buildDbMock({ updateReturning: [[request]] });
    createUnscopedClientMock.mockReturnValue(dbMock);
    purgeCommunityAdminAssetsMock.mockRejectedValueOnce(new Error('storage offline'));

    await expect(purgeCommunityData(1)).rejects.toThrow(/storage offline/);

    // Only the claim: purged_at stays null, so the next run retries.
    expect(dbMock._calls.filter((c) => c.op === 'update' && c.values?.purgedAt !== undefined)).toHaveLength(0);
  });

  it('does NOT sweep the maintenance or documents buckets', async () => {
    // Guarding a DECISION, not a mechanism. The privacy policy names uploaded
    // documents AND maintenance requests as "content you contributed to a
    // community … the association's record, not yours alone", retained beyond
    // the purge. Only the two website-asset buckets may be swept here; adding a
    // third would contradict a live policy rather than close a gap.
    const request = { id: 1, communityId: 100, status: 'soft_deleted' };
    const dbMock = buildDbMock({
      updateReturning: [[request], [{ id: 1, status: 'purged', purgedAt: new Date() }]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await purgeCommunityData(1);

    // createAdminClient is how any bucket sweep reaches storage. The two
    // sanctioned sweeps are mocked out, so a third would have to open its own.
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('audits the purge, carrying no PII in the payload', async () => {
    // The destructive step had no trail at all, while the REVERSIBLE
    // recover paths (now only in the admin console) both logged one. Worse, the route that makes
    // cancelling root-exclusive justifies itself by citing intervention as
    // "a break-glass that leaves an audit trail" — a promise this service did
    // not keep.
    const request = { id: 1, communityId: 100, status: 'soft_deleted' };
    const dbMock = buildDbMock({
      updateReturning: [[request], [{ id: 1, status: 'purged', purgedAt: new Date() }]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);
    purgeCommunitySiteAssetsMock.mockResolvedValue({ deletedCount: 7 });
    purgeCommunityExportArchivesMock.mockResolvedValue({ deletedCount: 2 });

    await purgeCommunityData(1);

    expect(logAuditEventMock).toHaveBeenCalledOnce();
    const entry = logAuditEventMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(entry).toMatchObject({
      userId: null, // the cron has no actor; AuditEntry renders null as "System"
      action: 'community_purged',
      resourceType: 'account_deletion_request',
      resourceId: '1',
      communityId: 100,
    });

    // EXACT keys, not a substring search. compliance_audit_log is append-only
    // AND board-readable, so anything logged here is permanent and
    // uncorrectable — and this function's whole job is destroying PII, so
    // logging any of it would defeat the purpose in the one place that can
    // never be undone. Asserting the exact key set reddens the moment a field
    // is added, which is the only durable way to state "no PII crept in".
    expect(Object.keys(entry['newValues'] as object).sort()).toEqual(['purgedAt', 'status']);
    expect(Object.keys(entry['metadata'] as object).sort()).toEqual([
      'adminAssetsDeleted',
      'exportArchivesDeleted',
      'siteAssetsDeleted',
    ]);
    expect(entry['metadata']).toMatchObject({ siteAssetsDeleted: 7, exportArchivesDeleted: 2 });
  });

  it('does NOT audit a user deletion — community_id is NOT NULL', async () => {
    // compliance_audit_log.community_id is NOT NULL with a RESTRICT FK, and a
    // user-type request has no community. The apparent escape hatch of passing
    // 0 is not one: prod's lowest community id is 1, so the insert FK-violates.
    // platform_admin_audit_log accepts a null community but requires a non-null
    // admin_user_id, and this is a cron with no actor. Both doors are shut.
    const request = { id: 2, communityId: null, status: 'soft_deleted' };
    const dbMock = buildDbMock({
      updateReturning: [[request], [{ id: 2, status: 'purged', purgedAt: new Date() }]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await purgeCommunityData(2);

    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('audits AFTER the status flip, so a failed audit cannot un-purge', async () => {
    // Ordering is deliberate. Auditing first would record an outcome that may
    // not have happened, and in an append-only table a false "purged" entry is
    // strictly worse than a missing one because it can never be retracted.
    // If the audit write throws, the bytes are already gone and the status is
    // already 'purged'; the cron's catch records it and the request is not
    // retried. We do not swallow it — an unaudited mutation must not look like
    // a success.
    const request = { id: 1, communityId: 100, status: 'soft_deleted' };
    const dbMock = buildDbMock({
      updateReturning: [[request], [{ id: 1, status: 'purged', purgedAt: new Date() }]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);
    logAuditEventMock.mockRejectedValueOnce(new Error('audit down'));

    await expect(purgeCommunityData(1)).rejects.toThrow(/audit down/);

    const updates = dbMock._calls.filter((c: { op: string }) => c.op === 'update');
    // The claim, then purged_at.
    expect(updates).toHaveLength(2);
  });

  it('calls purgeCommunitySiteAssets when communityId is set', async () => {
    const request = { id: 1, communityId: 100, status: 'soft_deleted' };
    const updatedRequest = { id: 1, status: 'purged', purgedAt: new Date() };
    const dbMock = buildDbMock({
      updateReturning: [[request], [updatedRequest]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await purgeCommunityData(1);

    expect(purgeCommunitySiteAssetsMock).toHaveBeenCalledOnce();
    expect(purgeCommunitySiteAssetsMock).toHaveBeenCalledWith(100);
  });

  it('does NOT call purgeCommunitySiteAssets when communityId is null (user deletion)', async () => {
    const request = { id: 2, communityId: null, status: 'soft_deleted' };
    const updatedRequest = { id: 2, status: 'purged', purgedAt: new Date() };
    const dbMock = buildDbMock({
      updateReturning: [[request], [updatedRequest]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await purgeCommunityData(2);

    expect(purgeCommunitySiteAssetsMock).not.toHaveBeenCalled();
  });

  it('aborts status update when purgeCommunitySiteAssets throws', async () => {
    const request = { id: 1, communityId: 100, status: 'soft_deleted' };
    const dbMock = buildDbMock({
      updateReturning: [[request]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);
    purgeCommunitySiteAssetsMock.mockRejectedValueOnce(new Error('storage offline'));

    await expect(purgeCommunityData(1)).rejects.toThrow('storage offline');
    // Verify no DB update was attempted
    expect(dbMock._calls.filter((c) => c.op === 'update' && c.values?.purgedAt !== undefined)).toHaveLength(0);
  });

  // ── Export archives must be purged too ────────────────────────────────────
  //
  // A generated export archive is a COPY OF THE ENTIRE ASSOCIATION — every table
  // plus every uploaded document, including resident PII. The export feature
  // would otherwise have introduced a right-to-erasure hole where a purged
  // community's whole dataset survived in the exports bucket.
  // See docs/audits/2026-08-09-legal-risk-audit.md F-07.
  it('purges export archives when communityId is set', async () => {
    const request = { id: 1, communityId: 100, status: 'soft_deleted' };
    const updatedRequest = { id: 1, status: 'purged', purgedAt: new Date() };
    const dbMock = buildDbMock({
      updateReturning: [[request], [updatedRequest]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await purgeCommunityData(1);

    expect(purgeCommunityExportArchivesMock).toHaveBeenCalledOnce();
    expect(purgeCommunityExportArchivesMock).toHaveBeenCalledWith(100);
  });

  it('does NOT purge export archives for a user deletion', async () => {
    const request = { id: 2, communityId: null, status: 'soft_deleted' };
    const updatedRequest = { id: 2, status: 'purged', purgedAt: new Date() };
    const dbMock = buildDbMock({
      updateReturning: [[request], [updatedRequest]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await purgeCommunityData(2);

    expect(purgeCommunityExportArchivesMock).not.toHaveBeenCalled();
  });

  it('aborts the status update when export-archive purge throws', async () => {
    // Same failure posture as site assets: the request must stay retryable
    // rather than being marked purged with a full dataset still in the bucket.
    const request = { id: 3, communityId: 100, status: 'soft_deleted' };
    const dbMock = buildDbMock({ updateReturning: [[request]] });
    createUnscopedClientMock.mockReturnValue(dbMock);
    purgeCommunityExportArchivesMock.mockRejectedValueOnce(new Error('storage down'));

    await expect(purgeCommunityData(3)).rejects.toThrow('storage down');
    expect(dbMock._calls.filter((c) => c.op === 'update' && c.values?.purgedAt !== undefined)).toHaveLength(0);
  });

  // The request's status is the lock between purge and recovery. Without the
  // claim, a recovery racing the scan (or one whose final step failed) let the
  // next cron delete a live community's assets and overwrite `recovered`.
  it('claims only a soft_deleted (or own-claimed) community request whose community is still deleted', async () => {
    const dbMock = buildDbMock({ updateReturning: [[]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await expect(purgeCommunityData(1)).resolves.toBeNull();

    const [claim] = dbMock._calls.filter((c) => c.op === 'update');
    expect(claim!.values).toEqual({ status: 'purged' });
    expect(claim!.where).toEqual({
      _and: [
        {
          _and: [
            { _eq: [accountDeletionRequestsTable.id, 1] },
            { _inArray: [accountDeletionRequestsTable.status, ['soft_deleted', 'purged']] },
            { _isNull: accountDeletionRequestsTable.purgedAt },
          ],
        },
        { _eq: [accountDeletionRequestsTable.requestType, 'community'] },
        expect.objectContaining({ _sql: expect.stringContaining('c.deleted_at is not null') }),
      ],
    });
  });

  it('destroys nothing when the claim matches nothing', async () => {
    createUnscopedClientMock.mockReturnValue(buildDbMock({ updateReturning: [[]] }));

    await expect(purgeCommunityData(1)).resolves.toBeNull();

    expect(purgeCommunitySiteAssetsMock).not.toHaveBeenCalled();
    expect(purgeCommunityAdminAssetsMock).not.toHaveBeenCalled();
    expect(purgeCommunityExportArchivesMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  // A double-fired cron: the other run set purged_at (and audited) first.
  it('returns null, without a second audit row, when an overlapping run finished first', async () => {
    const request = { id: 1, communityId: 100, status: 'purged' };
    createUnscopedClientMock.mockReturnValue(buildDbMock({ updateReturning: [[request], []] }));

    await expect(purgeCommunityData(1)).resolves.toBeNull();

    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});

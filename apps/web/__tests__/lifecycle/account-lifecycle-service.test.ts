/**
 * Tests for the Account Lifecycle Service
 *
 * Service: apps/web/src/lib/services/account-lifecycle-service.ts
 *
 * Coverage:
 * - computeAccessPlanStatus: all 5 status branches (revoked, converted, active, in_grace, expired)
 * - grantFreeAccess: transaction, plan creation, community update, audit log
 * - revokeFreeAccess: revokedAt set, community column cleared when no other plans
 * - extendFreeAccess: old plan revoked + new plan created atomically
 * - requestUserDeletion: request created with correct cooling_ends_at
 * - cancelUserDeletion: status set to cancelled
 * - executeUserSoftDelete: users.deletedAt set, auth ban called (non-fatal)
 * - recoverUser: deletedAt cleared, status recovered
 * - purgeUserPII: PII scrubbed, idempotent on second call
 * - requestCommunityDeletion: request created with cooling period
 * - interveneCommunityDeletion: admin cancels community deletion
 * - executeCommunitySoftDelete: communities.deletedAt set
 * - recoverCommunity: deletedAt cleared, status recovered
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
  eqMock,
  andMock,
  isNullMock,
  neMock,
  inArrayMock,
  accessPlansTable,
  communitiesTable,
  communityExportJobsTable,
  usersTable,
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
    eqMock: vi.fn((col: unknown, val: unknown) => ({ _eq: [col, val] })),
    andMock: vi.fn((...conditions: unknown[]) => ({ _and: conditions })),
    isNullMock: vi.fn((col: unknown) => ({ _isNull: col })),
    neMock: vi.fn((col: unknown, val: unknown) => ({ _ne: [col, val] })),
    inArrayMock: vi.fn((col: unknown, vals: unknown[]) => ({ _inArray: [col, vals] })),
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
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: eqMock,
  and: andMock,
  isNull: isNullMock,
  ne: neMock,
  inArray: inArrayMock,
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
  grantFreeAccess,
  revokeFreeAccess,
  extendFreeAccess,
  requestUserDeletion,
  RootOffboardingAckRequiredError,
  cancelUserDeletion,
  executeUserSoftDelete,
  recoverUser,
  purgeUserPII,
  requestCommunityDeletion,
  interveneCommunityDeletion,
  executeCommunitySoftDelete,
  recoverCommunity,
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
// grantFreeAccess
// ---------------------------------------------------------------------------

describe('grantFreeAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a plan and updates community in a transaction', async () => {
    const fakePlan = {
      id: 42,
      communityId: 100,
      expiresAt: new Date(),
      graceEndsAt: new Date(),
      durationMonths: 6,
      gracePeriodDays: 30,
      grantedBy: 'user-uuid-001',
    };

    const dbMock = buildDbMock({
      insertReturning: [[fakePlan]],
      updateReturning: [[{}]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await grantFreeAccess(100, {
      durationMonths: 6,
      gracePeriodDays: 30,
      grantedBy: 'user-uuid-001',
    });

    expect(result).toEqual(fakePlan);
    // Verify insert and update were both called (inside transaction)
    expect(dbMock._calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: 'insert' }),
        expect.objectContaining({ op: 'update' }),
      ]),
    );
    // Verify audit log was called
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        resourceType: 'access_plan',
        communityId: 100,
      }),
    );
  });

  it('passes notes through to the plan', async () => {
    const fakePlan = { id: 43, communityId: 100 };
    const dbMock = buildDbMock({
      insertReturning: [[fakePlan]],
      updateReturning: [[{}]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await grantFreeAccess(100, {
      durationMonths: 3,
      gracePeriodDays: 14,
      grantedBy: 'user-uuid-002',
      notes: 'Beta partner discount',
    });

    const insertCall = dbMock._calls.find((c) => c.op === 'insert');
    expect((insertCall?.values as Record<string, unknown>)?.notes).toBe('Beta partner discount');
  });
});

// ---------------------------------------------------------------------------
// revokeFreeAccess
// ---------------------------------------------------------------------------

describe('revokeFreeAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets revokedAt and clears community column when no other plans exist', async () => {
    const revokedPlan = { id: 42, communityId: 100, revokedAt: new Date(), revokedBy: 'admin-001' };
    const dbMock = buildDbMock({
      updateReturning: [[revokedPlan], [{}]], // first update = revoke plan, second = clear community
      selectResults: [[]], // no other active plans
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await revokeFreeAccess(42, { revokedBy: 'admin-001', reason: 'Contract ended' });

    expect(result).toEqual(revokedPlan);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        resourceType: 'access_plan',
        resourceId: '42',
      }),
    );
  });

  it('does not clear community column when other active plans exist', async () => {
    const revokedPlan = { id: 42, communityId: 100, revokedAt: new Date() };
    const otherPlan = { id: 43, communityId: 100 };
    const dbMock = buildDbMock({
      updateReturning: [[revokedPlan]],
      selectResults: [[otherPlan]], // another active plan exists
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await revokeFreeAccess(42, { revokedBy: 'admin-001' });

    // Should only have 1 update (revoke plan), not 2 (no community clear)
    const updateCalls = dbMock._calls.filter((c) => c.op === 'update');
    expect(updateCalls).toHaveLength(1);
  });

  it('throws when plan is not found', async () => {
    const dbMock = buildDbMock({
      updateReturning: [[]], // empty — plan not found
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await expect(revokeFreeAccess(999, { revokedBy: 'admin-001' })).rejects.toThrow(
      'Access plan 999 not found',
    );
  });
});

// ---------------------------------------------------------------------------
// extendFreeAccess
// ---------------------------------------------------------------------------

describe('extendFreeAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revokes old plan and creates new plan atomically', async () => {
    const oldPlan = {
      id: 42,
      communityId: 100,
      expiresAt: new Date('2025-06-01'),
      graceEndsAt: new Date('2025-07-01'),
      durationMonths: 6,
      gracePeriodDays: 30,
    };
    const newPlan = {
      id: 43,
      communityId: 100,
      expiresAt: new Date('2025-09-01'),
      graceEndsAt: new Date('2025-10-01'),
      durationMonths: 9,
      gracePeriodDays: 30,
    };
    const dbMock = buildDbMock({
      updateReturning: [[oldPlan], [{}]], // revoke plan, community update
      insertReturning: [[newPlan]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await extendFreeAccess(42, {
      additionalMonths: 3,
      grantedBy: 'admin-001',
      notes: 'Extended for good behavior',
    });

    expect(result).toEqual(newPlan);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        resourceType: 'access_plan',
        communityId: 100,
      }),
    );
  });

  it('throws when plan is not found', async () => {
    const dbMock = buildDbMock({
      updateReturning: [[]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await expect(
      extendFreeAccess(999, { additionalMonths: 3, grantedBy: 'admin-001' }),
    ).rejects.toThrow('Access plan 999 not found');
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

    expect(result).toEqual(fakeRequest);
    const insertCall = dbMock._calls.find((c) => c.op === 'insert');
    expect((insertCall?.values as Record<string, unknown>)?.requestType).toBe('user');
    expect((insertCall?.values as Record<string, unknown>)?.status).toBe('cooling');
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

    expect(result).toEqual(fakeRequest);
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
    await expect(requestUserDeletion('root-user-4', true)).resolves.toEqual(fakeRequest);
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

    const result = await cancelUserDeletion(1, 'user-uuid-001');
    expect(result).toEqual(updated);
  });

  it('throws when request is not found', async () => {
    const dbMock = buildDbMock({ updateReturning: [[]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await expect(cancelUserDeletion(999, 'user-uuid-001')).rejects.toThrow(
      'Deletion request 999 not found',
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
      updateReturning: [[request], [{}]], // request update + user update
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const updateUserByIdMock = vi.fn().mockResolvedValue({});
    createAdminClientMock.mockReturnValue({
      auth: { admin: { updateUserById: updateUserByIdMock } },
    });

    const result = await executeUserSoftDelete([1]);

    expect(result).toEqual([request]);
    expect(updateUserByIdMock).toHaveBeenCalledWith('user-uuid-001', {
      ban_duration: 'none',
      user_metadata: { soft_deleted: true },
    });
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

    expect(result).toEqual([request]);
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('does not throw when request is not found, processes what it finds', async () => {
    const dbMock = buildDbMock({ updateReturning: [[]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await executeUserSoftDelete([999]);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// recoverUser
// ---------------------------------------------------------------------------

describe('recoverUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears deletedAt and sets status to recovered', async () => {
    const request = { id: 1, userId: 'user-uuid-001', status: 'recovered' };
    const dbMock = buildDbMock({
      updateReturning: [[request], [{}]], // request update + user update
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await recoverUser(1, 'admin-001');

    expect(result).toEqual(request);
  });

  it('writes no audit entry — there is no community to attribute it to', async () => {
    // This case used to assert the OPPOSITE, and the assertion was wrong: it
    // pinned a call passing `communityId: 0, // platform-level, no community`.
    // compliance_audit_log.community_id is NOT NULL with an ON DELETE RESTRICT
    // FK to communities.id, and communities.id is a bigserial whose lowest value
    // in production is 1 — so that insert did not record a platform-level
    // event, it threw. And because logAuditEvent runs AFTER the transaction
    // commits, the recovery succeeded and then the admin route returned 500 on
    // an operation that had actually worked.
    //
    // The mock accepted `0` happily, which is why a green test coexisted with a
    // live 500 for as long as it did.
    const request = { id: 1, userId: 'user-uuid-001', status: 'recovered' };
    const dbMock = buildDbMock({ updateReturning: [[request], [{}]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await recoverUser(1, 'admin-001');

    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// purgeUserPII
// ---------------------------------------------------------------------------

describe('purgeUserPII', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scrubs PII from user record', async () => {
    const request = { id: 1, userId: 'user-uuid-001', status: 'soft_deleted' };
    const updatedRequest = { id: 1, status: 'purged', purgedAt: new Date() };
    const dbMock = buildDbMock({
      selectResults: [[request]], // found, not yet purged
      // Only the request update calls .returning(); user update does not
      updateReturning: [[updatedRequest]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await purgeUserPII(1);

    expect(result).toEqual(updatedRequest);
    // Verify user PII was scrubbed
    const updateCalls = dbMock._calls.filter((c) => c.op === 'update');
    expect(updateCalls).toHaveLength(2);
    const userUpdateValues = updateCalls[0]!.values as Record<string, unknown>;
    expect(userUpdateValues.email).toBe('deleted-user-uuid-001@redacted');
    expect(userUpdateValues.fullName).toBe('Deleted User');
    expect(userUpdateValues.phone).toBeNull();
    expect(userUpdateValues.avatarUrl).toBeNull();
  });

  it('returns null when already purged (idempotent)', async () => {
    const dbMock = buildDbMock({
      selectResults: [[]], // not found (purgedAt was set, so AND filter excludes it)
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await purgeUserPII(1);
    expect(result).toBeNull();
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
// recoverCommunity
// ---------------------------------------------------------------------------

describe('recoverCommunity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears communities.deletedAt and sets status to recovered', async () => {
    const request = { id: 1, communityId: 100, status: 'recovered' };
    const dbMock = buildDbMock({
      updateReturning: [[request], [{}]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await recoverCommunity(1, 'admin-001');

    expect(result).toEqual(request);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        resourceType: 'account_deletion_request',
        communityId: 100,
        newValues: expect.objectContaining({ status: 'recovered' }),
      }),
    );
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
      selectResults: [[request]],
      updateReturning: [[updatedRequest]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    const result = await purgeCommunityData(1);
    expect(result).toEqual(updatedRequest);
  });

  it('returns null when already purged (idempotent)', async () => {
    const dbMock = buildDbMock({ selectResults: [[]] });
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
      selectResults: [[request]],
      updateReturning: [[{ id: 1, status: 'purged', purgedAt: new Date() }]],
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
    const dbMock = buildDbMock({ selectResults: [[request]] });
    createUnscopedClientMock.mockReturnValue(dbMock);
    purgeCommunityAdminAssetsMock.mockRejectedValueOnce(new Error('storage offline'));

    await expect(purgeCommunityData(1)).rejects.toThrow(/storage offline/);

    expect(dbMock._calls.filter((c: { op: string }) => c.op === 'update')).toHaveLength(0);
  });

  it('does NOT sweep the maintenance or documents buckets', async () => {
    // Guarding a DECISION, not a mechanism. The privacy policy names uploaded
    // documents AND maintenance requests as "content you contributed to a
    // community … the association's record, not yours alone", retained beyond
    // the purge. Only the two website-asset buckets may be swept here; adding a
    // third would contradict a live policy rather than close a gap.
    const request = { id: 1, communityId: 100, status: 'soft_deleted' };
    const dbMock = buildDbMock({
      selectResults: [[request]],
      updateReturning: [[{ id: 1, status: 'purged', purgedAt: new Date() }]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await purgeCommunityData(1);

    // createAdminClient is how any bucket sweep reaches storage. The two
    // sanctioned sweeps are mocked out, so a third would have to open its own.
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('audits the purge, carrying no PII in the payload', async () => {
    // The destructive step had no trail at all, while the REVERSIBLE
    // recoverCommunity/recoverUser both logged one. Worse, the route that makes
    // cancelling root-exclusive justifies itself by citing intervention as
    // "a break-glass that leaves an audit trail" — a promise this service did
    // not keep.
    const request = { id: 1, communityId: 100, status: 'soft_deleted' };
    const dbMock = buildDbMock({
      selectResults: [[request]],
      updateReturning: [[{ id: 1, status: 'purged', purgedAt: new Date() }]],
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
      selectResults: [[request]],
      updateReturning: [[{ id: 2, status: 'purged', purgedAt: new Date() }]],
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
      selectResults: [[request]],
      updateReturning: [[{ id: 1, status: 'purged', purgedAt: new Date() }]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);
    logAuditEventMock.mockRejectedValueOnce(new Error('audit down'));

    await expect(purgeCommunityData(1)).rejects.toThrow(/audit down/);

    const updates = dbMock._calls.filter((c: { op: string }) => c.op === 'update');
    expect(updates).toHaveLength(1);
  });

  it('calls purgeCommunitySiteAssets when communityId is set', async () => {
    const request = { id: 1, communityId: 100, status: 'soft_deleted' };
    const updatedRequest = { id: 1, status: 'purged', purgedAt: new Date() };
    const dbMock = buildDbMock({
      selectResults: [[request]],
      updateReturning: [[updatedRequest]],
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
      selectResults: [[request]],
      updateReturning: [[updatedRequest]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await purgeCommunityData(2);

    expect(purgeCommunitySiteAssetsMock).not.toHaveBeenCalled();
  });

  it('aborts status update when purgeCommunitySiteAssets throws', async () => {
    const request = { id: 1, communityId: 100, status: 'soft_deleted' };
    const dbMock = buildDbMock({
      selectResults: [[request]],
      updateReturning: [],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);
    purgeCommunitySiteAssetsMock.mockRejectedValueOnce(new Error('storage offline'));

    await expect(purgeCommunityData(1)).rejects.toThrow('storage offline');
    // Verify no DB update was attempted
    expect(dbMock._calls.filter((c: { op: string }) => c.op === 'update')).toHaveLength(0);
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
      selectResults: [[request]],
      updateReturning: [[updatedRequest]],
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
      selectResults: [[request]],
      updateReturning: [[updatedRequest]],
    });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await purgeCommunityData(2);

    expect(purgeCommunityExportArchivesMock).not.toHaveBeenCalled();
  });

  it('aborts the status update when export-archive purge throws', async () => {
    // Same failure posture as site assets: the request must stay retryable
    // rather than being marked purged with a full dataset still in the bucket.
    const request = { id: 3, communityId: 100, status: 'soft_deleted' };
    const dbMock = buildDbMock({ selectResults: [[request]], updateReturning: [] });
    createUnscopedClientMock.mockReturnValue(dbMock);
    purgeCommunityExportArchivesMock.mockRejectedValueOnce(new Error('storage down'));

    await expect(purgeCommunityData(3)).rejects.toThrow('storage down');
    expect(dbMock._calls.filter((c: { op: string }) => c.op === 'update')).toHaveLength(0);
  });


});

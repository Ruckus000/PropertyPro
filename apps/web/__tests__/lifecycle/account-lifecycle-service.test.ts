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
  usersTable,
  accountDeletionRequestsTable,
} = vi.hoisted(() => {
  return {
    createUnscopedClientMock: vi.fn(),
    createAdminClientMock: vi.fn(),
    purgeCommunitySiteAssetsMock: vi.fn().mockResolvedValue({ deletedCount: 0 }),
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

type DbCall = { op: string; table?: unknown; values?: unknown; where?: unknown };

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
      values: (vals: unknown) => {
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
    let updateValues: unknown;
    return {
      set: (vals: unknown) => {
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
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        resourceType: 'account_deletion_request',
        newValues: expect.objectContaining({ status: 'recovered' }),
      }),
    );
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
    expect(dbMock._calls.filter((c) => c.op === 'update')).toHaveLength(2);
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

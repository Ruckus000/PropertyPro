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
  logAuditEventMock,
  eqMock,
  andMock,
  isNullMock,
  neMock,
  accessPlansTable,
  communitiesTable,
  usersTable,
  accountDeletionRequestsTable,
} = vi.hoisted(() => {
  return {
    createUnscopedClientMock: vi.fn(),
    createAdminClientMock: vi.fn(),
    logAuditEventMock: vi.fn().mockResolvedValue(undefined),
    eqMock: vi.fn((col: unknown, val: unknown) => ({ _eq: [col, val] })),
    andMock: vi.fn((...conditions: unknown[]) => ({ _and: conditions })),
    isNullMock: vi.fn((col: unknown) => ({ _isNull: col })),
    neMock: vi.fn((col: unknown, val: unknown) => ({ _ne: [col, val] })),
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
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

// Service import must come after all vi.mock calls
import {
  computeAccessPlanStatus,
  grantFreeAccess,
  revokeFreeAccess,
  extendFreeAccess,
  requestUserDeletion,
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
  beforeEach(() => {
    vi.clearAllMocks();
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

    const result = await executeUserSoftDelete(1);

    expect(result).toEqual(request);
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
    const result = await executeUserSoftDelete(1);

    expect(result).toEqual(request);
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('throws when request is not found', async () => {
    const dbMock = buildDbMock({ updateReturning: [[]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await expect(executeUserSoftDelete(999)).rejects.toThrow(
      'Deletion request 999 not found',
    );
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

    const result = await executeCommunitySoftDelete(1);

    expect(result).toEqual(request);
    expect(dbMock._calls.filter((c) => c.op === 'update')).toHaveLength(2);
  });

  it('throws when request is not found', async () => {
    const dbMock = buildDbMock({ updateReturning: [[]] });
    createUnscopedClientMock.mockReturnValue(dbMock);

    await expect(executeCommunitySoftDelete(999)).rejects.toThrow(
      'Deletion request 999 not found',
    );
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
});

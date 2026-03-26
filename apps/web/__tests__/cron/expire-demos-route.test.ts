import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

const {
  mockDbSelect,
  mockDbFrom,
  mockDbInnerJoin,
  mockDbWhere,
  mockDbUpdate,
  mockDbSet,
  mockDbReturning,
  mockUpdateUserById,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbFrom: vi.fn(),
  mockDbInnerJoin: vi.fn(),
  mockDbWhere: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbSet: vi.fn(),
  mockDbReturning: vi.fn(),
  mockUpdateUserById: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  communities: {
    id: 'communities.id',
    isDemo: 'communities.isDemo',
    demoExpiresAt: 'communities.demoExpiresAt',
    trialEndsAt: 'communities.trialEndsAt',
    deletedAt: 'communities.deletedAt',
  },
  demoInstances: {
    id: 'demoInstances.id',
    seededCommunityId: 'demoInstances.seededCommunityId',
    demoResidentUserId: 'demoInstances.demoResidentUserId',
    demoBoardUserId: 'demoInstances.demoBoardUserId',
    deletedAt: 'demoInstances.deletedAt',
  },
  accessRequests: {
    id: 'accessRequests.id',
    status: 'accessRequests.status',
    createdAt: 'accessRequests.createdAt',
    deletedAt: 'accessRequests.deletedAt',
  },
}));

vi.mock('@/lib/services/conversion-events', () => ({
  emitConversionEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  isNull: (col: unknown) => ({ isNull: col }),
  lt: (col: unknown, val: unknown) => ({ lt: [col, val] }),
  gt: (col: unknown, val: unknown) => ({ gt: [col, val] }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.join('') }),
}));


vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));
// ---------------------------------------------------------------------------
// Imports (after mocks are in place)
// ---------------------------------------------------------------------------

import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { POST } from '../../src/app/api/v1/internal/expire-demos/route';

const URL = 'http://localhost:3000/api/v1/internal/expire-demos';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetDbMocks() {
  mockDbSelect.mockReset();
  mockDbFrom.mockReset();
  mockDbInnerJoin.mockReset();
  mockDbWhere.mockReset();
  mockDbUpdate.mockReset();
  mockDbSet.mockReset();
  mockDbReturning.mockReset();
  mockUpdateUserById.mockReset();
}

/**
 * Build a mock DB client and admin client for the expire-demos route.
 *
 * The route performs:
 * 0. select().from().innerJoin().where() — find demos entering grace
 * 1. select().from().innerJoin().where() — find expired demos
 * 2. For each expired: update().set().where() — soft-delete community
 * 3. For each expired: update().set().where() — soft-delete demo instance
 * 4. admin.auth.admin.updateUserById() — ban demo users
 * 5. update().set().where().returning() — expire stale access requests
 */
function buildMocks(
  expiredDemos: object[] = [],
  expiredAccessRequests: object[] = [],
  banBehavior: 'success' | 'fail' = 'success',
) {
  resetDbMocks();

  // Use separate where mocks for select chains vs update chains
  const mockSelectWhere = vi.fn();
  const mockUpdateWhere = vi.fn();

  // Select chains: first call = grace detection (empty), second call = expired demos
  let selectWhereCallCount = 0;
  mockSelectWhere.mockImplementation(() => {
    selectWhereCallCount++;
    if (selectWhereCallCount === 1) return Promise.resolve([]); // grace query — no demos in grace
    return Promise.resolve(expiredDemos);
  });

  // Update chains: community/demo soft-deletes and access request expiry
  mockDbReturning.mockResolvedValue(expiredAccessRequests);
  mockUpdateWhere.mockReturnValue({ returning: mockDbReturning });

  mockDbInnerJoin.mockReturnValue({ where: mockSelectWhere });
  mockDbFrom.mockReturnValue({ innerJoin: mockDbInnerJoin });
  mockDbSelect.mockReturnValue({ from: mockDbFrom });

  mockDbSet.mockReturnValue({ where: mockUpdateWhere });
  mockDbUpdate.mockReturnValue({ set: mockDbSet });

  const db = {
    select: mockDbSelect,
    update: mockDbUpdate,
  };

  // --- admin client ---
  if (banBehavior === 'fail') {
    mockUpdateUserById.mockRejectedValue(new Error('User already deleted'));
  } else {
    mockUpdateUserById.mockResolvedValue({ data: {}, error: null });
  }

  const adminClient = {
    auth: {
      admin: {
        updateUserById: mockUpdateUserById,
      },
    },
  };

  (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(adminClient);

  return { db, adminClient };
}

function makeRequest(token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return new NextRequest(URL, { method: 'POST', headers });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('expire-demos cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEMO_EXPIRY_CRON_SECRET = 'test-demo-secret';
  });

  it('returns 401 for missing bearer token', async () => {
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong bearer token', async () => {
    const req = makeRequest('wrong-secret');
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns success with zero expired when no demos are expired', async () => {
    buildMocks([], []);

    const req = makeRequest('test-demo-secret');
    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as { data: { expired: number; graceDetected: number; expiredRequests: number } };
    expect(json.data).toEqual({ expired: 0, graceDetected: 0, expiredRequests: 0 });

    // The access request expiry update always runs (1 call), but no community/demo soft-deletes
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('soft-deletes expired communities and bans demo users', async () => {
    const expiredDemo = {
      communityId: 42,
      demoInstanceId: 101,
      demoResidentUserId: 'user-aaa',
      demoBoardUserId: 'user-bbb',
    };

    const staleRequests = [{ id: 501 }, { id: 502 }];

    buildMocks([expiredDemo], staleRequests, 'success');

    const req = makeRequest('test-demo-secret');
    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as { data: { expired: number; graceDetected: number; expiredRequests: number } };
    expect(json.data.expired).toBe(1);
    expect(json.data.expiredRequests).toBe(2);

    // Two soft-delete updates (community + demo instance) + one access request update
    expect(mockDbUpdate).toHaveBeenCalledTimes(3);

    // Both demo users should be banned
    expect(mockUpdateUserById).toHaveBeenCalledTimes(2);
    expect(mockUpdateUserById).toHaveBeenCalledWith('user-aaa', { ban_duration: '876600h' });
    expect(mockUpdateUserById).toHaveBeenCalledWith('user-bbb', { ban_duration: '876600h' });
  });

  it('continues processing if banning a user fails (non-fatal)', async () => {
    const expiredDemo = {
      communityId: 77,
      demoInstanceId: 200,
      demoResidentUserId: 'user-fail',
      demoBoardUserId: 'user-ok',
    };

    resetDbMocks();

    const localSelectWhere = vi.fn();
    const localUpdateWhere = vi.fn();
    let localSelectCount = 0;
    localSelectWhere.mockImplementation(() => {
      localSelectCount++;
      if (localSelectCount === 1) return Promise.resolve([]); // grace query
      return Promise.resolve([expiredDemo]); // expired query
    });

    mockDbReturning.mockResolvedValue([]);
    localUpdateWhere.mockReturnValue({ returning: mockDbReturning });

    mockDbInnerJoin.mockReturnValue({ where: localSelectWhere });
    mockDbFrom.mockReturnValue({ innerJoin: mockDbInnerJoin });
    mockDbSelect.mockReturnValue({ from: mockDbFrom });
    mockDbSet.mockReturnValue({ where: localUpdateWhere });
    mockDbUpdate.mockReturnValue({ set: mockDbSet });

    // First ban call fails, second succeeds
    mockUpdateUserById
      .mockRejectedValueOnce(new Error('User already deleted'))
      .mockResolvedValueOnce({ data: {}, error: null });

    const db = { select: mockDbSelect, update: mockDbUpdate };
    const adminClient = { auth: { admin: { updateUserById: mockUpdateUserById } } };

    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(adminClient);

    const req = makeRequest('test-demo-secret');
    const res = await POST(req);

    // Route should still return 200 — ban failure is non-fatal
    expect(res.status).toBe(200);

    const json = (await res.json()) as { data: { expired: number; graceDetected: number; expiredRequests: number } };
    expect(json.data.expired).toBe(1);

    // Both ban attempts were made despite the first failing
    expect(mockUpdateUserById).toHaveBeenCalledTimes(2);
    expect(mockUpdateUserById).toHaveBeenCalledWith('user-fail', { ban_duration: '876600h' });
    expect(mockUpdateUserById).toHaveBeenCalledWith('user-ok', { ban_duration: '876600h' });
  });
});

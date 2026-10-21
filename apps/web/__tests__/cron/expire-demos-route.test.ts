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
}));

vi.mock('@/lib/services/conversion-events', () => ({
  emitConversionEvent: vi.fn().mockResolvedValue(undefined),
  bulkEmitConversionEvents: vi.fn().mockResolvedValue(undefined),
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

// AUTHZ: Integration test fixture setup — bypass needed to seed/inspect rows across test communities.
import { createUnscopedClient } from '@propertypro/db/unsafe';
// AUTHZ: test — the module is vi.mock()ed above; this import only reaches the mock to program it
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { bulkEmitConversionEvents, emitConversionEvent } from '@/lib/services/conversion-events';
import { communities } from '@propertypro/db';
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
 */
function buildMocks(
  expiredDemos: object[] = [],
  banBehavior: 'success' | 'fail' = 'success',
  graceDemos: object[] = [],
  /** The community converted between the cron's find and its delete. */
  convertedMeanwhile = false,
) {
  resetDbMocks();

  // Use separate where mocks for select chains vs update chains
  const mockSelectWhere = vi.fn();
  const mockUpdateWhere = vi.fn();

  // Select chains: first call = grace detection, second call = expired demos
  let selectWhereCallCount = 0;
  mockSelectWhere.mockImplementation(() => {
    selectWhereCallCount++;
    if (selectWhereCallCount === 1) return Promise.resolve(graceDemos); // grace query
    return Promise.resolve(expiredDemos);
  });

  // Update chains: community/demo soft-deletes. The community delete is
  // guarded by is_demo and reports what it deleted.
  mockDbReturning.mockResolvedValue([]);
  let updatedTable: unknown = null;
  mockUpdateWhere.mockImplementation(() => ({
    returning: (...args: unknown[]) =>
      updatedTable === communities
        ? Promise.resolve(convertedMeanwhile ? [] : [{ id: 1 }])
        : mockDbReturning(...args),
  }));

  mockDbInnerJoin.mockReturnValue({ where: mockSelectWhere });
  // `where` without a join: softDeleteExpiredDemo's re-read of is_demo.
  mockDbFrom.mockReturnValue({
    innerJoin: mockDbInnerJoin,
    where: () => ({ limit: () => Promise.resolve([{ isDemo: !convertedMeanwhile }]) }),
  });
  mockDbSelect.mockReturnValue({ from: mockDbFrom });

  mockDbSet.mockReturnValue({ where: mockUpdateWhere });
  mockDbUpdate.mockImplementation((table: unknown) => {
    updatedTable = table;
    return { set: mockDbSet };
  });

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
    buildMocks([]);

    const req = makeRequest('test-demo-secret');
    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as { data: { expired: number; graceDetected: number } };
    expect(json.data).toEqual({ expired: 0, graceDetected: 0, failed: 0 });

    // No community/demo soft-deletes
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('detects demos entering grace period and emits bulk events', async () => {
    const graceDemo = {
      communityId: 10,
      demoInstanceId: 20,
      trialEndsAt: new Date('2025-01-01T10:00:00Z'),
    };

    buildMocks([], 'success', [graceDemo]);

    const req = makeRequest('test-demo-secret');
    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as { data: { graceDetected: number } };
    expect(json.data.graceDetected).toBe(1);

    expect(bulkEmitConversionEvents).toHaveBeenCalledTimes(1);
    expect(bulkEmitConversionEvents).toHaveBeenCalledWith([
      {
        demoId: 20,
        communityId: 10,
        eventType: 'grace_started',
        source: 'cron',
        dedupeKey: 'demo:20:grace_started',
        occurredAt: graceDemo.trialEndsAt,
      },
    ]);
  });

  it('soft-deletes expired communities and bans demo users', async () => {
    const expiredDemo = {
      communityId: 42,
      demoInstanceId: 101,
      demoResidentUserId: 'user-aaa',
      demoBoardUserId: 'user-bbb',
    };

    buildMocks([expiredDemo], 'success');

    const req = makeRequest('test-demo-secret');
    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as { data: { expired: number; graceDetected: number } };
    expect(json.data.expired).toBe(1);

    // Two soft-delete updates: community + demo instance
    expect(mockDbUpdate).toHaveBeenCalledTimes(2);

    // Both demo users should be banned
    expect(mockUpdateUserById).toHaveBeenCalledTimes(2);
    expect(mockUpdateUserById).toHaveBeenCalledWith('user-aaa', { ban_duration: '876600h' });
    expect(mockUpdateUserById).toHaveBeenCalledWith('user-bbb', { ban_duration: '876600h' });
  });

  // Onboarding audit F9: a demo that converted after the cron found it is a
  // paying customer's community — no ban, no demo_soft_deleted, not counted.
  it('leaves a community that converted after it was found entirely alone', async () => {
    buildMocks(
      [{ communityId: 42, demoInstanceId: 101, demoResidentUserId: 'user-aaa', demoBoardUserId: 'user-bbb' }],
      'success',
      [],
      true,
    );

    const res = await POST(makeRequest('test-demo-secret'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { expired: number } };
    expect(json.data.expired).toBe(0);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(emitConversionEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'demo_soft_deleted' }),
    );
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

    // The guarded community delete reports one row; nothing else returns rows.
    mockDbReturning.mockResolvedValueOnce([{ id: 77 }]).mockResolvedValue([]);
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

    const json = (await res.json()) as { data: { expired: number; failed: number } };
    expect(json.data.expired).toBe(1);
    expect(json.data.failed).toBe(1);

    // Both ban attempts were made despite the first failing
    expect(mockUpdateUserById).toHaveBeenCalledTimes(2);
    expect(mockUpdateUserById).toHaveBeenCalledWith('user-fail', { ban_duration: '876600h' });
    expect(mockUpdateUserById).toHaveBeenCalledWith('user-ok', { ban_duration: '876600h' });
  });

  // GoTrue RETURNS `{ error }` instead of throwing. The helper ignored it, so a
  // ban that never landed was logged as done and nothing counted it.
  it('counts a ban GoTrue returned an error for, and reports it as failed', async () => {
    buildMocks(
      [{ communityId: 42, demoInstanceId: 101, demoResidentUserId: 'user-aaa', demoBoardUserId: 'user-bbb' }],
      'success',
    );
    mockUpdateUserById.mockImplementation(async (userId: string) =>
      userId === 'user-bbb'
        ? { data: null, error: { status: 500, message: 'GoTrue down' } }
        : { data: {}, error: null },
    );

    const res = await POST(makeRequest('test-demo-secret'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { expired: number; failed: number } };
    expect(json.data).toMatchObject({ expired: 1, failed: 1 });
  });

  it('treats an already-deleted demo login (404) as banned', async () => {
    buildMocks(
      [{ communityId: 42, demoInstanceId: 101, demoResidentUserId: 'user-aaa', demoBoardUserId: 'user-bbb' }],
      'success',
    );
    mockUpdateUserById.mockResolvedValue({ data: null, error: { status: 404, message: 'User not found' } });

    const res = await POST(makeRequest('test-demo-secret'));
    const json = (await res.json()) as { data: { failed: number } };
    expect(json.data.failed).toBe(0);
  });
});

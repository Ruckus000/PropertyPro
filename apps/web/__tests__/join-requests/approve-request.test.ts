import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB state (shared between test + mock factory via vi.hoisted)
const { dbState, selectMock, insertNotificationsMock, mockDb } = vi.hoisted(() => {
  const dbState = {
    joinRequests: [] as Array<{
      id: number;
      userId: string;
      communityId: number;
      unitIdentifier: string;
      residentType: string;
      status: string;
      reviewedBy: string | null;
      reviewedAt: Date | null;
      reviewNotes: string | null;
    }>,
    userRoles: [] as Array<unknown>,
  };

  const selectMock = vi.fn();
  const insertNotificationsMock = vi.fn(
    async (_rows: unknown[]) => ({ created: 1 }),
  );

  const mockDb: Record<string, unknown> = {
    select: selectMock,
    insert: (_table: unknown) => ({
      values: (vals: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(vals) ? vals : [vals];
        dbState.userRoles.push(...rows);
        return {
          returning: () => Promise.resolve(rows),
        };
      },
    }),
    update: (_table: unknown) => ({
      set: (data: Record<string, unknown>) => ({
        where: () => {
          if ('status' in data && typeof data.status === 'string' && dbState.joinRequests.length > 0) {
            const last = dbState.joinRequests[dbState.joinRequests.length - 1]!;
            last.status = data.status;
            last.reviewedBy = (data.reviewedBy as string) ?? null;
            last.reviewedAt = (data.reviewedAt as Date) ?? null;
            last.reviewNotes = (data.reviewNotes as string | null) ?? null;
          }
          return Promise.resolve([]);
        },
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(mockDb),
  };

  return { dbState, selectMock, insertNotificationsMock, mockDb };
});

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => mockDb,
}));

vi.mock('@propertypro/db', () => ({
  communityJoinRequests: { id: 'cjr.id' },
  userRoles: { id: 'ur.id' },
  insertNotifications: insertNotificationsMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
}));

// Import after mocks
import {
  approveJoinRequest,
  denyJoinRequest,
} from '@/lib/join-requests/approve-request';

// ---------------------------------------------------------------------------

function seedRequest(overrides: Partial<(typeof dbState.joinRequests)[0]> = {}) {
  const req = {
    id: 1,
    userId: 'user-111',
    communityId: 42,
    unitIdentifier: 'Unit 101',
    residentType: 'owner',
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    reviewNotes: null,
    ...overrides,
  };
  dbState.joinRequests.length = 0;
  dbState.joinRequests.push(req);
  return req;
}

function mockSelectReturnsRequest(req: (typeof dbState.joinRequests)[0] | null) {
  selectMock.mockReturnValueOnce({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(req ? [req] : []),
      }),
    }),
  });
}

beforeEach(() => {
  dbState.joinRequests.length = 0;
  dbState.userRoles.length = 0;
  selectMock.mockReset();
  insertNotificationsMock.mockClear();
});

describe('approveJoinRequest', () => {
  it('marks the request approved and returns the result', async () => {
    const req = seedRequest({ residentType: 'owner' });
    mockSelectReturnsRequest(req);

    const result = await approveJoinRequest({
      requestId: 1,
      reviewerUserId: 'admin-222',
      notes: 'Looks good',
    });

    expect(result).toEqual({
      requestId: 1,
      communityId: 42,
      userId: 'user-111',
      status: 'approved',
    });
    expect(dbState.joinRequests[0]!.status).toBe('approved');
    expect(dbState.joinRequests[0]!.reviewedBy).toBe('admin-222');
    expect(dbState.joinRequests[0]!.reviewNotes).toBe('Looks good');
  });

  it('inserts a user_roles row when approved', async () => {
    const req = seedRequest({ residentType: 'owner' });
    mockSelectReturnsRequest(req);

    await approveJoinRequest({ requestId: 1, reviewerUserId: 'admin-222' });

    expect(dbState.userRoles).toHaveLength(1);
    const role = dbState.userRoles[0] as {
      userId: string;
      communityId: number;
      role: string;
      isUnitOwner: boolean;
      displayTitle: string;
    };
    expect(role.userId).toBe('user-111');
    expect(role.communityId).toBe(42);
    expect(role.role).toBe('resident');
    expect(role.isUnitOwner).toBe(true);
    expect(role.displayTitle).toBe('Owner');
  });

  it('maps residentType=tenant to isUnitOwner=false', async () => {
    const req = seedRequest({ residentType: 'tenant' });
    mockSelectReturnsRequest(req);

    await approveJoinRequest({ requestId: 1, reviewerUserId: 'admin-222' });

    const role = dbState.userRoles[0] as {
      isUnitOwner: boolean;
      displayTitle: string;
    };
    expect(role.isUnitOwner).toBe(false);
    expect(role.displayTitle).toBe('Tenant');
  });

  it('notifies the requester on approval', async () => {
    const req = seedRequest();
    mockSelectReturnsRequest(req);

    await approveJoinRequest({ requestId: 1, reviewerUserId: 'admin-222' });

    expect(insertNotificationsMock).toHaveBeenCalledTimes(1);
    const notifRows = insertNotificationsMock.mock.calls[0]![0] as Array<{
      userId: string;
      category: string;
    }>;
    expect(notifRows[0]!.userId).toBe('user-111');
    expect(notifRows[0]!.category).toBe('system');
  });

  it('throws if request does not exist', async () => {
    mockSelectReturnsRequest(null);

    await expect(
      approveJoinRequest({ requestId: 999, reviewerUserId: 'admin-222' }),
    ).rejects.toThrow('Join request not found');
  });

  it('throws if request is not pending', async () => {
    const req = seedRequest({ status: 'approved' });
    mockSelectReturnsRequest(req);

    await expect(
      approveJoinRequest({ requestId: 1, reviewerUserId: 'admin-222' }),
    ).rejects.toThrow('Request is not pending');
  });
});

describe('denyJoinRequest', () => {
  it('marks the request denied and notifies requester', async () => {
    const req = seedRequest();
    mockSelectReturnsRequest(req);

    const result = await denyJoinRequest({
      requestId: 1,
      reviewerUserId: 'admin-222',
      notes: 'Unit not recognized',
    });

    expect(result).toEqual({
      requestId: 1,
      communityId: 42,
      userId: 'user-111',
      status: 'denied',
    });
    expect(dbState.joinRequests[0]!.status).toBe('denied');
    expect(dbState.joinRequests[0]!.reviewNotes).toBe('Unit not recognized');

    expect(insertNotificationsMock).toHaveBeenCalledTimes(1);
    const notifRows = insertNotificationsMock.mock.calls[0]![0] as Array<{
      title: string;
      body?: string;
    }>;
    expect(notifRows[0]!.title).toBe('Join request not approved');
    expect(notifRows[0]!.body).toContain('Unit not recognized');
  });

  it('does NOT create a user_roles row when denied', async () => {
    const req = seedRequest();
    mockSelectReturnsRequest(req);

    await denyJoinRequest({ requestId: 1, reviewerUserId: 'admin-222' });

    expect(dbState.userRoles).toHaveLength(0);
  });

  it('throws when request not found', async () => {
    mockSelectReturnsRequest(null);
    await expect(
      denyJoinRequest({ requestId: 1, reviewerUserId: 'admin-222' }),
    ).rejects.toThrow('Join request not found');
  });

  it('throws when request already reviewed', async () => {
    const req = seedRequest({ status: 'denied' });
    mockSelectReturnsRequest(req);
    await expect(
      denyJoinRequest({ requestId: 1, reviewerUserId: 'admin-222' }),
    ).rejects.toThrow('Request is not pending');
  });
});

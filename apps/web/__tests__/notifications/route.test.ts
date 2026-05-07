/**
 * Unit tests for GET /api/v1/notifications.
 *
 * Mocks `paginate()` directly (matches document-categories + audit-trail B3
 * pilot pattern). The route delegates pagination to the canonical helper
 * and only owns auth, validation, and the where-predicate construction.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  paginateMock,
  scopedClient,
  createScopedClientMock,
  notificationsTable,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  paginateMock: vi.fn(),
  scopedClient: { __scoped: true },
  createScopedClientMock: vi.fn(),
  notificationsTable: { id: Symbol('notifications.id') },
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  notifications: notificationsTable,
  paginate: paginateMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

import { GET } from '../../src/app/api/v1/notifications/route';

interface JsonEnvelope {
  data: {
    data: Array<Record<string, unknown>>;
    pagination: { nextCursor: string | null; hasMore: boolean; pageSize: number };
  };
}

function makeNotificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    communityId: 42,
    userId: 'user-123',
    category: 'announcement',
    title: 'New announcement',
    body: null,
    actionUrl: null,
    sourceType: 'announcement',
    sourceId: '1',
    priority: 'normal',
    readAt: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: '2026-05-01T12:00:00Z',
    ...overrides,
  };
}

describe('GET /api/v1/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-123');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-123',
      communityId: 42,
      role: 'resident',
      isAdmin: false,
      isUnitOwner: true,
      displayTitle: 'Owner',
      communityType: 'condo_718',
    });
    createScopedClientMock.mockReturnValue(scopedClient);
    paginateMock.mockResolvedValue({
      data: [makeNotificationRow()],
      pagination: { nextCursor: null, hasMore: false, pageSize: 20 },
    });
  });

  it('returns the canonical paginated envelope', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/notifications?communityId=42');
    const res = await GET(req);
    const json = (await res.json()) as JsonEnvelope;

    expect(res.status).toBe(200);
    expect(json.data.data).toHaveLength(1);
    expect(json.data.pagination).toEqual({ nextCursor: null, hasMore: false, pageSize: 20 });
    expect(createScopedClientMock).toHaveBeenCalledWith(42);
  });

  it('forwards cursor and limit (as pageSize) to paginate()', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: 'opaque-next', hasMore: true, pageSize: 10 },
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications?communityId=42&cursor=abc&limit=10',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const [client, table, input, options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      { cursor?: string; pageSize?: number },
      { where?: unknown } | undefined,
    ];
    expect(client).toBe(scopedClient);
    expect(table).toBe(notificationsTable);
    expect(input).toEqual({ cursor: 'abc', pageSize: 10 });
    // userId + archivedAt IS NULL are always present, so where is always defined.
    expect(options?.where).toBeDefined();
  });

  it('passes a where predicate when category filter is set', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications?communityId=42&category=meeting',
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    const call = paginateMock.mock.calls[0] as [unknown, unknown, unknown, { where?: unknown }];
    expect(call[3]?.where).toBeDefined();
  });

  it('passes a where predicate when unread_only is set', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications?communityId=42&unread_only=true',
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    const call = paginateMock.mock.calls[0] as [unknown, unknown, unknown, { where?: unknown }];
    expect(call[3]?.where).toBeDefined();
  });

  it('treats unread_only=false as filter-off (regression: z.coerce.boolean treats "false" as truthy)', async () => {
    // The literal string "false" must NOT enable the unread filter. The
    // schema uses z.preprocess((v) => v === 'true', ...) to avoid the
    // Boolean(string) trap where any non-empty string is truthy.
    paginateMock.mockResolvedValueOnce({
      data: [makeNotificationRow({ readAt: '2026-05-01T13:00:00Z' })],
      pagination: { nextCursor: null, hasMore: false, pageSize: 20 },
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications?communityId=42&unread_only=false',
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as JsonEnvelope;
    expect(json.data.data).toHaveLength(1);
  });

  it('uses default pageSize=20 when limit is omitted (not paginate default of 50)', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/notifications?communityId=42');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const [, , input] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      { cursor?: string; pageSize?: number },
    ];
    expect(input.pageSize).toBe(20);
  });

  it('rejects invalid category enum values with 400', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications?communityId=42&category=bogus',
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(paginateMock).not.toHaveBeenCalled();
  });

  it('rejects negative limit with 400', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications?communityId=42&limit=-1',
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(paginateMock).not.toHaveBeenCalled();
  });

  it('returns 200 for limit=999 (paginate clamps silently)', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications?communityId=42&limit=999',
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it('returns 200 for malformed cursor (paginate treats as first page)', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications?communityId=42&cursor=not-base64url',
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const req = new NextRequest('http://localhost:3000/api/v1/notifications?communityId=42');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 when not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());
    const req = new NextRequest('http://localhost:3000/api/v1/notifications?communityId=42');
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

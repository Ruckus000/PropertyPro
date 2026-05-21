/**
 * Route unit test — `GET /api/v1/widgets`.
 *
 * Scaffolded by `pnpm new:resource widgets` (Plan A4 reference resource).
 *
 * Mocks `paginate()` from `@propertypro/db` along with the auth chain so the
 * route can be exercised without a database. Uses identity-ish operator
 * stubs per `.claude/rules/api-patterns.md`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../../src/lib/api/errors/ForbiddenError';

const {
  paginateMock,
  scopedClient,
  createScopedClientMock,
  widgetsTable,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  paginateMock: vi.fn(),
  scopedClient: { __scoped: true },
  createScopedClientMock: vi.fn(),
  widgetsTable: Symbol('widgets'),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  widgets: widgetsTable,
  paginate: paginateMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

import { GET } from '../../../src/app/api/v1/widgets/route';

interface PaginatedJson {
  data: {
    data: Array<{ id: number; name: string; description: string | null }>;
    pagination: { nextCursor: string | null; hasMore: boolean; pageSize: number };
  };
}

describe('widgets route', () => {
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
  });

  it('returns the canonical paginated envelope on a happy path', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [
        { id: 1, name: 'Sprocket', description: 'A small one' },
        { id: 2, name: 'Cog', description: null },
      ],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const req = new NextRequest('http://localhost:3000/api/v1/widgets?communityId=42');
    const res = await GET(req);
    const json = (await res.json()) as PaginatedJson;

    expect(res.status).toBe(200);
    expect(json.data.data).toEqual([
      { id: 1, name: 'Sprocket', description: 'A small one' },
      { id: 2, name: 'Cog', description: null },
    ]);
    expect(json.data.pagination).toEqual({ nextCursor: null, hasMore: false, pageSize: 50 });
    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-123');
    expect(paginateMock).toHaveBeenCalledWith(scopedClient, widgetsTable, {
      cursor: undefined,
      pageSize: undefined,
    });
  });

  it('forwards cursor and pageSize to paginate()', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [{ id: 5, name: 'Bigger Widget', description: null }],
      pagination: { nextCursor: 'opaque-next', hasMore: true, pageSize: 25 },
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/widgets?communityId=42&cursor=abc&pageSize=25',
    );
    const res = await GET(req);
    const json = (await res.json()) as PaginatedJson;

    expect(res.status).toBe(200);
    expect(paginateMock).toHaveBeenCalledWith(scopedClient, widgetsTable, {
      cursor: 'abc',
      pageSize: 25,
    });
    expect(json.data.pagination).toEqual({ nextCursor: 'opaque-next', hasMore: true, pageSize: 25 });
  });

  it('treats empty-string params as missing (regression: ?cursor= and ?pageSize= must not 400)', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/widgets?communityId=42&cursor=&pageSize=',
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(paginateMock).toHaveBeenCalledWith(scopedClient, widgetsTable, {
      cursor: undefined,
      pageSize: undefined,
    });
  });

  it('rejects non-integer pageSize', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/widgets?communityId=42&pageSize=abc',
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(paginateMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest('http://localhost:3000/api/v1/widgets?communityId=42');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('returns 403 when user is not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const req = new NextRequest('http://localhost:3000/api/v1/widgets?communityId=42');
    const res = await GET(req);

    expect(res.status).toBe(403);
  });
});

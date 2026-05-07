import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  paginateMock,
  scopedClient,
  createScopedClientMock,
  documentCategoriesTable,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  paginateMock: vi.fn(),
  scopedClient: { __scoped: true },
  createScopedClientMock: vi.fn(),
  documentCategoriesTable: Symbol('documentCategories'),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  documentCategories: documentCategoriesTable,
  paginate: paginateMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

import { GET } from '../../src/app/api/v1/document-categories/route';

interface PaginatedJson {
  data: {
    data: Array<{ id: number; name: string; slug: string; description: string | null; isSystem: boolean }>;
    pagination: { nextCursor: string | null; hasMore: boolean; pageSize: number };
  };
}

describe('document categories route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-123');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-123',
      communityId: 42,
      role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner',
      communityType: 'condo_718',
    });
    createScopedClientMock.mockReturnValue(scopedClient);
  });

  it('returns empty data when no categories are configured', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/document-categories?communityId=42',
    );
    const res = await GET(req);
    const json = (await res.json()) as PaginatedJson;

    expect(res.status).toBe(200);
    expect(json.data.data).toEqual([]);
    expect(json.data.pagination).toEqual({ nextCursor: null, hasMore: false, pageSize: 50 });
    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-123');
    expect(paginateMock).toHaveBeenCalledWith(scopedClient, documentCategoriesTable, {
      cursor: undefined,
      pageSize: undefined,
    });
  });

  it('returns mapped categories when present', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [
        { id: 1, name: 'Rules', description: 'Rules docs', isSystem: true },
        { id: 2, name: 'Meeting Minutes', description: null, isSystem: false },
      ],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/document-categories?communityId=42',
    );
    const res = await GET(req);
    const json = (await res.json()) as PaginatedJson;

    expect(res.status).toBe(200);
    expect(json.data.data).toEqual([
      { id: 1, name: 'Rules', slug: 'rules', description: 'Rules docs', isSystem: true },
      { id: 2, name: 'Meeting Minutes', slug: 'meeting-minutes', description: null, isSystem: false },
    ]);
  });

  it('forwards cursor and pageSize to paginate()', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [{ id: 5, name: 'Bylaws', description: null, isSystem: true }],
      pagination: { nextCursor: 'opaque-next', hasMore: true, pageSize: 25 },
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/document-categories?communityId=42&cursor=abc&pageSize=25',
    );
    const res = await GET(req);
    const json = (await res.json()) as PaginatedJson;

    expect(res.status).toBe(200);
    expect(paginateMock).toHaveBeenCalledWith(scopedClient, documentCategoriesTable, {
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
      'http://localhost:3000/api/v1/document-categories?communityId=42&cursor=&pageSize=',
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(paginateMock).toHaveBeenCalledWith(scopedClient, documentCategoriesTable, {
      cursor: undefined,
      pageSize: undefined,
    });
  });

  it('rejects non-integer pageSize', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/document-categories?communityId=42&pageSize=abc',
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(paginateMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest(
      'http://localhost:3000/api/v1/document-categories?communityId=42',
    );
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('returns 403 when user is not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const req = new NextRequest(
      'http://localhost:3000/api/v1/document-categories?communityId=42',
    );
    const res = await GET(req);

    expect(res.status).toBe(403);
  });
});

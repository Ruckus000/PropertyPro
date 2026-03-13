import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  createScopedClientMock,
  scopedQueryMock,
  documentCategoriesTable,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  scopedQueryMock: vi.fn(),
  documentCategoriesTable: Symbol('documentCategories'),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  documentCategories: documentCategoriesTable,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

import { GET } from '../../src/app/api/v1/document-categories/route';

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
    createScopedClientMock.mockReturnValue({
      query: scopedQueryMock,
    });
  });

  it('returns empty data when no categories are configured', async () => {
    scopedQueryMock.mockResolvedValue([]);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/document-categories?communityId=42',
    );
    const res = await GET(req);
    const json = (await res.json()) as { data: unknown[] };

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-123');
  });

  it('returns mapped categories when present', async () => {
    scopedQueryMock.mockResolvedValue([
      { id: 1, name: 'Rules', description: 'Rules docs', isSystem: true },
      { id: 2, name: 'Meeting Minutes', description: null, isSystem: false },
    ]);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/document-categories?communityId=42',
    );
    const res = await GET(req);
    const json = (await res.json()) as {
      data: Array<{ id: number; name: string; slug: string; description: string | null; isSystem: boolean }>;
    };

    expect(res.status).toBe(200);
    expect(json.data).toEqual([
      { id: 1, name: 'Rules', slug: 'rules', description: 'Rules docs', isSystem: true },
      { id: 2, name: 'Meeting Minutes', slug: 'meeting-minutes', description: null, isSystem: false },
    ]);
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

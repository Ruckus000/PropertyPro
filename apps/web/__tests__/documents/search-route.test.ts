import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  searchDocumentsMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  searchDocumentsMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@propertypro/db', () => ({
  searchDocuments: searchDocumentsMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

import { GET } from '../../src/app/api/v1/documents/search/route';

describe('p1-14 document search route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    searchDocumentsMock.mockResolvedValue({
      data: [
        {
          id: 1,
          title: 'Board Minutes',
          description: 'Quarterly meeting',
          fileName: 'minutes.pdf',
          mimeType: 'application/pdf',
          createdAt: new Date('2026-02-12T00:00:00.000Z'),
          rank: 0.5,
        },
      ],
      nextCursor: null,
    });
  });

  it('returns search results and pagination', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/search?communityId=42&q=minutes&limit=10',
    );

    const res = await GET(req);
    const json = (await res.json()) as {
      data: Array<{ id: number }>;
      pagination: { nextCursor: number | null; limit: number };
    };

    expect(res.status).toBe(200);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'session-user-1');
    expect(searchDocumentsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 42,
        query: 'minutes',
        limit: 10,
      }),
    );
    expect(json.data[0]?.id).toBe(1);
    expect(json.pagination.limit).toBe(10);
  });

  it('returns 403 for authenticated non-member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/search?communityId=42&q=minutes',
    );

    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('validates required communityId', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/documents/search?q=minutes');
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(searchDocumentsMock).not.toHaveBeenCalled();
  });
});

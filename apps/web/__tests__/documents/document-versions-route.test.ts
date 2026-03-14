import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  getDocumentWithAccessCheckMock,
  getAccessibleDocumentsMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  getDocumentWithAccessCheckMock: vi.fn(),
  getAccessibleDocumentsMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn().mockResolvedValue({
    role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner',
    communityType: 'condo_718',
  }),
}));

vi.mock('@propertypro/db', () => ({
  getDocumentWithAccessCheck: getDocumentWithAccessCheckMock,
  getAccessibleDocuments: getAccessibleDocumentsMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

import { GET } from '../../src/app/api/v1/documents/[id]/versions/route';

describe('p1-15 document versions route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-123');
    getDocumentWithAccessCheckMock.mockResolvedValue(null);
    getAccessibleDocumentsMock.mockResolvedValue([]);
  });

  it('returns documents with same title and category (version grouping)', async () => {
    const docsInDb = [
      {
        id: 1,
        title: 'Board Minutes',
        categoryId: 5,
        fileName: 'minutes-v1.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        createdAt: '2025-01-01T10:00:00Z',
        uploadedBy: 'user-a',
      },
      {
        id: 2,
        title: 'Board Minutes',
        categoryId: 5,
        fileName: 'minutes-v2.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        createdAt: '2025-02-01T10:00:00Z',
        uploadedBy: 'user-b',
      },
      {
        id: 3,
        title: 'Board Minutes',
        categoryId: 5,
        fileName: 'minutes-v3.pdf',
        fileSize: 3072,
        mimeType: 'application/pdf',
        createdAt: '2025-03-01T10:00:00Z',
        uploadedBy: 'user-c',
      },
      {
        id: 4,
        title: 'Different Document',
        categoryId: 5,
        fileName: 'other.pdf',
        fileSize: 512,
        mimeType: 'application/pdf',
        createdAt: '2025-01-15T10:00:00Z',
        uploadedBy: 'user-a',
      },
    ];
    // Mock: reference doc is id=2
    getDocumentWithAccessCheckMock.mockResolvedValue(docsInDb[1]);
    getAccessibleDocumentsMock.mockResolvedValue(docsInDb);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/2/versions?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '2' }) };

    const res = await GET(req, context);
    const json = (await res.json()) as { data: Array<{ id: number; title: string }> };

    expect(res.status).toBe(200);
    // Should return 3 versions (docs 1, 2, 3 with same title and category)
    expect(json.data).toHaveLength(3);
    // Sorted by createdAt descending (newest first)
    expect(json.data[0].id).toBe(3);
    expect(json.data[1].id).toBe(2);
    expect(json.data[2].id).toBe(1);
  });

  it('does NOT group documents with same title but different category', async () => {
    const docsInDb = [
      {
        id: 1,
        title: 'Board Minutes',
        categoryId: 5,
        fileName: 'minutes-cat5.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        createdAt: '2025-01-01T10:00:00Z',
        uploadedBy: 'user-a',
      },
      {
        id: 2,
        title: 'Board Minutes',
        categoryId: 6, // Different category
        fileName: 'minutes-cat6.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        createdAt: '2025-02-01T10:00:00Z',
        uploadedBy: 'user-b',
      },
    ];
    getDocumentWithAccessCheckMock.mockResolvedValue(docsInDb[0]);
    getAccessibleDocumentsMock.mockResolvedValue(docsInDb);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/1/versions?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '1' }) };

    const res = await GET(req, context);
    const json = (await res.json()) as { data: Array<{ id: number }> };

    expect(res.status).toBe(200);
    // Should only return 1 version (doc 1) - doc 2 has different category
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe(1);
  });

  it('does NOT group documents with different title but same category', async () => {
    const docsInDb = [
      {
        id: 1,
        title: 'Board Minutes',
        categoryId: 5,
        fileName: 'minutes.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        createdAt: '2025-01-01T10:00:00Z',
        uploadedBy: 'user-a',
      },
      {
        id: 2,
        title: 'Meeting Agenda', // Different title
        categoryId: 5, // Same category
        fileName: 'agenda.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        createdAt: '2025-02-01T10:00:00Z',
        uploadedBy: 'user-b',
      },
    ];
    getDocumentWithAccessCheckMock.mockResolvedValue(docsInDb[0]);
    getAccessibleDocumentsMock.mockResolvedValue(docsInDb);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/1/versions?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '1' }) };

    const res = await GET(req, context);
    const json = (await res.json()) as { data: Array<{ id: number }> };

    expect(res.status).toBe(200);
    // Should only return 1 version (doc 1) - doc 2 has different title
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe(1);
  });

  it('returns 404 for non-existent document', async () => {
    getDocumentWithAccessCheckMock.mockResolvedValue(null);
    getAccessibleDocumentsMock.mockResolvedValue([]);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/999/versions?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '999' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(404);
  });

  it('returns 401 for unauthenticated request', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/1/versions?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '1' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(401);
  });

  it('returns 403 for non-member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('User is not a member of this community'),
    );

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/1/versions?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '1' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(403);
  });

  it('handles documents with null category correctly', async () => {
    const docsInDb = [
      {
        id: 1,
        title: 'Uncategorized Doc',
        categoryId: null,
        fileName: 'doc1.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        createdAt: '2025-01-01T10:00:00Z',
        uploadedBy: 'user-a',
      },
      {
        id: 2,
        title: 'Uncategorized Doc',
        categoryId: null, // Also null category
        fileName: 'doc2.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        createdAt: '2025-02-01T10:00:00Z',
        uploadedBy: 'user-b',
      },
      {
        id: 3,
        title: 'Uncategorized Doc',
        categoryId: 5, // Different - has a category
        fileName: 'doc3.pdf',
        fileSize: 3072,
        mimeType: 'application/pdf',
        createdAt: '2025-03-01T10:00:00Z',
        uploadedBy: 'user-c',
      },
    ];
    getDocumentWithAccessCheckMock.mockResolvedValue(docsInDb[0]);
    getAccessibleDocumentsMock.mockResolvedValue(docsInDb);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/1/versions?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '1' }) };

    const res = await GET(req, context);
    const json = (await res.json()) as { data: Array<{ id: number }> };

    expect(res.status).toBe(200);
    // Should return 2 versions (docs 1 and 2 - both have null category)
    expect(json.data).toHaveLength(2);
    expect(json.data.map((d) => d.id).sort()).toEqual([1, 2]);
  });
});

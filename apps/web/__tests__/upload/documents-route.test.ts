import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  createScopedClientMock,
  createPresignedDownloadUrlMock,
  deleteStorageObjectMock,
  logAuditEventMock,
  scopedInsertMock,
  scopedQueryMock,
  scopedSoftDeleteMock,
  documentsTable,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  queuePdfExtractionMock,
  getAccessibleDocumentsMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  createPresignedDownloadUrlMock: vi.fn(),
  deleteStorageObjectMock: vi.fn().mockResolvedValue(undefined),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  scopedInsertMock: vi.fn(),
  scopedQueryMock: vi.fn(),
  scopedSoftDeleteMock: vi.fn(),
  documentsTable: Symbol('documents'),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn().mockResolvedValue({
    role: 'owner',
    communityType: 'condo_718',
  }),
  queuePdfExtractionMock: vi.fn(),
  getAccessibleDocumentsMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
  deleteStorageObject: deleteStorageObjectMock,
  documents: documentsTable,
  logAuditEvent: logAuditEventMock,
  getAccessibleDocuments: getAccessibleDocumentsMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/workers/pdf-extraction', () => ({
  queuePdfExtraction: queuePdfExtractionMock,
}));

vi.mock('@/lib/services/notification-service', () => ({
  queueNotification: vi.fn(),
}));

import { GET, POST, DELETE } from '../../src/app/api/v1/documents/route';

describe('p1-11 documents route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('95c454d2-9728-4f1f-8b75-5b9549fb9679');
    createPresignedDownloadUrlMock.mockResolvedValue('https://example.com/signed-download');
    getAccessibleDocumentsMock.mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const bytes = new Uint8Array(1024);
        bytes.set(new TextEncoder().encode('%PDF-'));
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => bytes.buffer,
        } as Response;
      }),
    );

    createScopedClientMock.mockReturnValue({
      insert: scopedInsertMock,
      query: scopedQueryMock,
      softDelete: scopedSoftDeleteMock,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POST creates document metadata with scoped client and audit log', async () => {
    scopedInsertMock.mockResolvedValue([
      {
        id: 99,
        communityId: 42,
        title: 'Board Minutes',
        filePath: 'communities/42/documents/abc/minutes.pdf',
      },
    ]);

    const req = new NextRequest('http://localhost:3000/api/v1/documents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        title: 'Board Minutes',
        description: 'March meeting minutes',
        categoryId: null,
        filePath: 'communities/42/documents/abc/minutes.pdf',
        fileName: 'minutes.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(
      42,
      '95c454d2-9728-4f1f-8b75-5b9549fb9679',
    );
    expect(scopedInsertMock).toHaveBeenCalledWith(
      documentsTable,
      expect.objectContaining({
        title: 'Board Minutes',
        filePath: 'communities/42/documents/abc/minutes.pdf',
      }),
    );

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        resourceType: 'document',
        communityId: 42,
      }),
    );
  });

  it('GET lists documents scoped by communityId', async () => {
    getAccessibleDocumentsMock.mockResolvedValue([
      { id: 1, communityId: 8, title: 'A' },
      { id: 2, communityId: 8, title: 'B' },
    ]);

    const req = new NextRequest('http://localhost:3000/api/v1/documents?communityId=8');
    const res = await GET(req);
    const json = (await res.json()) as {
      data: Array<{ id: number }>;
    };

    expect(res.status).toBe(200);
    expect(getAccessibleDocumentsMock).toHaveBeenCalledWith({
      communityId: 8,
      role: 'owner',
      communityType: 'condo_718',
    }, undefined);
    expect(json.data).toHaveLength(2);
  });

  it('GET forwards categoryId filter when provided', async () => {
    getAccessibleDocumentsMock.mockResolvedValue([]);

    const req = new NextRequest('http://localhost:3000/api/v1/documents?communityId=8&categoryId=55');
    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(getAccessibleDocumentsMock).toHaveBeenCalledWith(
      {
        communityId: 8,
        role: 'owner',
        communityType: 'condo_718',
      },
      expect.any(Object),
    );
  });

  it('POST rejects unauthenticated requests', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest('http://localhost:3000/api/v1/documents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        title: 'Board Minutes',
        filePath: 'communities/42/documents/abc/minutes.pdf',
        fileName: 'minutes.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('POST returns 403 for authenticated non-member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const req = new NextRequest('http://localhost:3000/api/v1/documents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        title: 'Board Minutes',
        filePath: 'communities/42/documents/abc/minutes.pdf',
        fileName: 'minutes.pdf',
        fileSize: 1024,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('POST returns 422, deletes object, and audits when file size does not match', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/documents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        title: 'Board Minutes',
        filePath: 'communities/42/documents/abc/minutes.pdf',
        fileName: 'minutes.pdf',
        fileSize: 2048,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    expect(deleteStorageObjectMock).toHaveBeenCalledWith(
      'documents',
      'communities/42/documents/abc/minutes.pdf',
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'validation_failed',
        resourceType: 'document_upload',
        communityId: 42,
      }),
    );
  });

  it('POST returns 422, deletes object, and audits when magic bytes validation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const bytes = new Uint8Array([0x4d, 0x5a]); // EXE signature, not an allowed upload type
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => bytes.buffer,
        } as Response;
      }),
    );

    const req = new NextRequest('http://localhost:3000/api/v1/documents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        title: 'Fake PDF',
        filePath: 'communities/42/documents/abc/fake.pdf',
        fileName: 'fake.pdf',
        fileSize: 2,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    expect(deleteStorageObjectMock).toHaveBeenCalledWith(
      'documents',
      'communities/42/documents/abc/fake.pdf',
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'validation_failed',
        resourceType: 'document_upload',
        communityId: 42,
      }),
    );
  });

  it('GET requires authentication', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest('http://localhost:3000/api/v1/documents?communityId=8');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('GET requires community membership', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('You are not a member of this community'),
    );

    const req = new NextRequest('http://localhost:3000/api/v1/documents?communityId=8');
    const res = await GET(req);

    expect(res.status).toBe(403);
  });
});

describe('p1-15 documents route DELETE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('95c454d2-9728-4f1f-8b75-5b9549fb9679');
    requireCommunityMembershipMock.mockResolvedValue({ role: 'owner', communityType: 'condo_718' });

    createScopedClientMock.mockReturnValue({
      insert: scopedInsertMock,
      query: scopedQueryMock,
      softDelete: scopedSoftDeleteMock,
    });
  });

  it('DELETE soft-deletes document and logs audit event', async () => {
    scopedQueryMock.mockResolvedValue([
      {
        id: 99,
        communityId: 42,
        title: 'Board Minutes',
        categoryId: 5,
        filePath: 'communities/42/documents/abc/minutes.pdf',
        fileName: 'minutes.pdf',
      },
    ]);
    scopedSoftDeleteMock.mockResolvedValue([{ id: 99, deletedAt: new Date() }]);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents?id=99&communityId=42',
      { method: 'DELETE' },
    );

    const res = await DELETE(req);
    const json = (await res.json()) as { data: { deleted: boolean; id: number } };

    expect(res.status).toBe(200);
    expect(json.data.deleted).toBe(true);
    expect(json.data.id).toBe(99);

    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(
      42,
      '95c454d2-9728-4f1f-8b75-5b9549fb9679',
    );

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete',
        resourceType: 'document',
        resourceId: '99',
        communityId: 42,
        oldValues: expect.objectContaining({
          title: 'Board Minutes',
          categoryId: 5,
        }),
      }),
    );
  });

  it('DELETE returns 400 for non-existent document', async () => {
    scopedQueryMock.mockResolvedValue([]);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents?id=999&communityId=42',
      { method: 'DELETE' },
    );

    const res = await DELETE(req);

    expect(res.status).toBe(400);
  });

  it('DELETE requires authentication', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents?id=99&communityId=42',
      { method: 'DELETE' },
    );

    const res = await DELETE(req);

    expect(res.status).toBe(401);
  });

  it('DELETE requires community membership', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('You are not a member of this community'),
    );

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents?id=99&communityId=42',
      { method: 'DELETE' },
    );

    const res = await DELETE(req);

    expect(res.status).toBe(403);
  });

  it('DELETE rejects restricted roles', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      role: 'tenant',
      communityType: 'condo_718',
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents?id=99&communityId=42',
      { method: 'DELETE' },
    );

    const res = await DELETE(req);
    expect(res.status).toBe(403);
  });

  it('DELETE validates required parameters', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents?communityId=42',
      { method: 'DELETE' },
    );

    const res = await DELETE(req);

    expect(res.status).toBe(400);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { AppError } from '../../src/lib/api/errors/AppError';

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
  requireActiveSubscriptionForMutationMock,
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
    role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner',
    communityType: 'condo_718',
  }),
  queuePdfExtractionMock: vi.fn(),
  getAccessibleDocumentsMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));

import { GET, POST, DELETE } from '../../src/app/api/v1/documents/route';

const MANAGER_MEMBERSHIP = {
  role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president',
  communityType: 'condo_718',
  permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
};

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
    requireCommunityMembershipMock.mockResolvedValueOnce(MANAGER_MEMBERSHIP);
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
      role: 'resident',
      communityType: 'condo_718',
      isUnitOwner: true,
      permissions: undefined,
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
        role: 'resident',
        communityType: 'condo_718',
        isUnitOwner: true,
        permissions: undefined,
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
    requireCommunityMembershipMock.mockResolvedValueOnce(MANAGER_MEMBERSHIP);
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
    requireCommunityMembershipMock.mockResolvedValueOnce(MANAGER_MEMBERSHIP);
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
      new ForbiddenError('User is not a member of this community'),
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
    requireCommunityMembershipMock.mockResolvedValue({ role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner', communityType: 'condo_718' });

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
      new ForbiddenError('User is not a member of this community'),
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
      role: 'resident', isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant',
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

  describe('DELETE status code behavior', () => {
    it('DELETE returns 400 for both missing id and non-existent document (intentional — body code distinguishes them)', async () => {
      // Missing id parameter
      const reqMissingId = new NextRequest(
        'http://localhost:3000/api/v1/documents?communityId=42',
        { method: 'DELETE' },
      );
      const resMissingId = await DELETE(reqMissingId);
      expect(resMissingId.status).toBe(400);

      // Non-existent document
      scopedQueryMock.mockResolvedValue([]);
      const reqNotFound = new NextRequest(
        'http://localhost:3000/api/v1/documents?id=999&communityId=42',
        { method: 'DELETE' },
      );
      const resNotFound = await DELETE(reqNotFound);
      expect(resNotFound.status).toBe(400);

      // Both intentionally 400; error body `code` field distinguishes them
      expect(resMissingId.status).toBe(resNotFound.status);
    });
  });
});

describe('p1-11 documents route — additional coverage', () => {
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

  describe('subscription guard enforcement', () => {
    it('POST returns 403 when guard throws SUBSCRIPTION_REQUIRED', async () => {
      requireCommunityMembershipMock.mockResolvedValueOnce(MANAGER_MEMBERSHIP);
      requireActiveSubscriptionForMutationMock.mockRejectedValueOnce(
        new AppError('Your subscription is no longer active. Please reactivate to continue.', 403, 'SUBSCRIPTION_REQUIRED'),
      );

      const req = new NextRequest('http://localhost:3000/api/v1/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
      expect(res.status).toBe(403);
    });
  });

  describe('POST input validation edge cases', () => {
    // TODO (security): filePath is not sanitized against path traversal.
    // The Zod schema only requires z.string().min(1). Consider adding a path
    // allowlist pattern (e.g. /^communities\/\d+\//) to prevent cross-tenant paths.

    it('GET without communityId returns 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/documents');
      const res = await GET(req);
      // Number(null) === 0, which fails the positive integer check → ValidationError (400)
      expect(res.status).toBe(400);
    });

    it('POST returns 400 when storage fetch returns non-ok (magic bytes validation path)', async () => {
      requireCommunityMembershipMock.mockResolvedValueOnce(MANAGER_MEMBERSHIP);
      // downloadStorageBytes throws ValidationError (400) when fetch returns !ok.
      // deleteStorageObject is NOT called in this code path (throws before rejectInvalidUpload).
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: false,
          status: 403,
          arrayBuffer: async () => new ArrayBuffer(0),
        }) as unknown as Response),
      );

      const req = new NextRequest('http://localhost:3000/api/v1/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
      expect(res.status).toBe(400);
      expect(deleteStorageObjectMock).not.toHaveBeenCalled();
    });

    it('POST handles deleteStorageObject throwing during cleanup and still returns 422', async () => {
      requireCommunityMembershipMock.mockResolvedValueOnce(MANAGER_MEMBERSHIP);
      // Stub EXE magic bytes to trigger rejectInvalidUpload
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          const bytes = new Uint8Array([0x4d, 0x5a]); // EXE signature
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => bytes.buffer,
          } as Response;
        }),
      );
      deleteStorageObjectMock.mockRejectedValueOnce(new Error('Storage unavailable'));

      const req = new NextRequest('http://localhost:3000/api/v1/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 42,
          title: 'Fake PDF',
          filePath: 'communities/42/documents/abc/fake.pdf',
          fileName: 'fake.pdf',
          fileSize: 2,
          mimeType: 'application/pdf',
        }),
      });

      const res = await POST(req);
      // rejectInvalidUpload catches the deleteStorageObject error internally
      // and still throws UnprocessableEntityError (422)
      expect(res.status).toBe(422);
      // Audit log still fires even when cleanup fails
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'validation_failed',
          resourceType: 'document_upload',
        }),
      );
    });
  });
});

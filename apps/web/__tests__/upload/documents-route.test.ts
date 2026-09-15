import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { ValidationError } from '../../src/lib/api/errors/ValidationError';
import { AppError } from '../../src/lib/api/errors/AppError';

const {
  createScopedClientMock,
  createPresignedDownloadUrlMock,
  deleteStorageObjectMock,
  logAuditEventMock,
  scopedInsertMock,
  scopedQueryMock,
  enforceRedactionAttestationMock,
  scopedSoftDeleteMock,
  scopedUpdateMock,
  documentsTable,
  complianceChecklistItemsTable,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  queuePdfExtractionMock,
  getAccessibleDocumentsMock,
  buildAccessibleDocumentsFilterMock,
  paginateMock,
  requireActiveSubscriptionForMutationMock,
  queueNotificationDetailedMock,
  createNotificationsForEventMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  createPresignedDownloadUrlMock: vi.fn(),
  deleteStorageObjectMock: vi.fn().mockResolvedValue(undefined),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  scopedInsertMock: vi.fn(),
  scopedQueryMock: vi.fn(),
  enforceRedactionAttestationMock: vi.fn(),
  scopedSoftDeleteMock: vi.fn(),
  scopedUpdateMock: vi.fn(),
  documentsTable: Symbol('documents'),
  complianceChecklistItemsTable: Symbol('compliance_checklist_items'),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn().mockResolvedValue({
    role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner',
    communityType: 'condo_718',
  }),
  queuePdfExtractionMock: vi.fn(),
  getAccessibleDocumentsMock: vi.fn(),
  buildAccessibleDocumentsFilterMock: vi.fn(),
  paginateMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn().mockResolvedValue(undefined),
  queueNotificationDetailedMock: vi.fn().mockResolvedValue({
    recipientsCount: 1,
    sentCount: 1,
    queuedCount: 0,
    failedCount: 0,
  }),
  createNotificationsForEventMock: vi.fn().mockResolvedValue({ created: 0, skipped: 0 }),
}));

vi.mock('@propertypro/db', () => ({
  buildAccessibleDocumentsFilter: buildAccessibleDocumentsFilterMock,
  // Loaded transitively via documents-service's deleted-documents read. Both
  // are real values, not spies: nothing here asserts on them.
  MAX_PAGE_SIZE: 100,
  buildSourceTypeFilter: () => ({ __sourceTypeFilter: true }),
  createScopedClient: createScopedClientMock,
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
  deleteStorageObject: deleteStorageObjectMock,
  documents: documentsTable,
  complianceChecklistItems: complianceChecklistItemsTable,
  logAuditEvent: logAuditEventMock,
  getAccessibleDocuments: getAccessibleDocumentsMock,
  paginate: paginateMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn((col: unknown, value: unknown) => ({ __eq: { col, value } })),
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
  queueNotificationDetailed: queueNotificationDetailedMock,
  createNotificationsForEvent: createNotificationsForEventMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));

// The §718.111(12)(c) redaction gate reads the category's NAME from the DB to
// decide whether an attestation is required (F-02). This file's `@propertypro/db`
// factory has no `createScopedClient`, so the real lookup 500s every POST here.
// Stubbed to "no attestation needed" — the gate's own behaviour is covered in
// `__tests__/documents/redaction-attestation.test.ts`, and the POST contract is
// covered in `__tests__/documents/documents-route.test.ts`.
vi.mock('@/lib/documents/redaction-attestation', () => ({
  enforceRedactionAttestation: enforceRedactionAttestationMock,
}));
import { GET, POST, DELETE } from '../../src/app/api/v1/documents/route';

const MANAGER_MEMBERSHIP = {
  role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president',
  communityType: 'condo_718',
  permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
};

function resetRouteMocks() {
  vi.resetAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('95c454d2-9728-4f1f-8b75-5b9549fb9679');
  requireCommunityMembershipMock.mockResolvedValue({
    role: 'resident',
    isAdmin: false,
    isUnitOwner: true,
    displayTitle: 'Owner',
    communityType: 'condo_718',
  });
  createPresignedDownloadUrlMock.mockResolvedValue('https://example.com/signed-download');
  deleteStorageObjectMock.mockResolvedValue(undefined);
  logAuditEventMock.mockResolvedValue(undefined);
  getAccessibleDocumentsMock.mockResolvedValue([]);
  // Plan B3: GET path now uses paginate + buildAccessibleDocumentsFilter
  // instead of getAccessibleDocuments. Default to a permissive filter +
  // empty page so tests that don't set these explicitly don't 500.
  buildAccessibleDocumentsFilterMock.mockResolvedValue({ __access: true });
  paginateMock.mockResolvedValue({
    data: [],
    pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
  });
  requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
  queueNotificationDetailedMock.mockResolvedValue({
    recipientsCount: 1,
    sentCount: 1,
    queuedCount: 0,
    failedCount: 0,
  });
  createNotificationsForEventMock.mockResolvedValue({ created: 0, skipped: 0 });
  scopedUpdateMock.mockResolvedValue([]);
  enforceRedactionAttestationMock.mockResolvedValue(undefined);
  createScopedClientMock.mockReturnValue({
    insert: scopedInsertMock,
    query: scopedQueryMock,
    // After A3 drain #62, getDocumentForDeletionAudit uses scoped.selectFrom
    // instead of scoped.query + JS .find(). Alias selectFrom to the same
    // queryMock so existing test rows feed through unchanged.
    selectFrom: scopedQueryMock,
    softDelete: scopedSoftDeleteMock,
    // DELETE now unlinks compliance checklist items that reference the doc
    // before soft-deleting it.
    update: scopedUpdateMock,
  });
}

describe('p1-11 documents route', () => {
  beforeEach(() => {
    resetRouteMocks();
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
        categoryId: 7,
        filePath: 'communities/42/documents/abc/minutes.pdf',
        fileName: 'minutes.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(
      42,
      '95c454d2-9728-4f1f-8b75-5b9549fb9679',
    );
    expect(scopedInsertMock).toHaveBeenCalledWith(
      documentsTable,
      expect.objectContaining({
        title: 'Board Minutes',
        categoryId: 7,
        filePath: 'communities/42/documents/abc/minutes.pdf',
        sourceType: 'library',
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
    // Plan B3: GET now uses paginate() + buildAccessibleDocumentsFilter
    // instead of getAccessibleDocuments. The where clause from
    // buildAccessibleDocumentsFilter is fed to paginate as `where`.
    paginateMock.mockResolvedValueOnce({
      data: [
        { id: 1, communityId: 8, title: 'A' },
        { id: 2, communityId: 8, title: 'B' },
      ],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const req = new NextRequest('http://localhost:3000/api/v1/documents?communityId=8');
    const res = await GET(req);
    const json = (await res.json()) as {
      data: { data: Array<{ id: number }>; pagination: unknown };
    };

    expect(res.status).toBe(200);
    expect(buildAccessibleDocumentsFilterMock).toHaveBeenCalledWith({
      communityId: 8,
      role: 'resident',
      communityType: 'condo_718',
      isUnitOwner: true,
      permissions: undefined,
    }, undefined);
    expect(json.data.data).toHaveLength(2);
  });

  it('GET forwards categoryId filter when provided', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const req = new NextRequest('http://localhost:3000/api/v1/documents?communityId=8&categoryId=55');
    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(buildAccessibleDocumentsFilterMock).toHaveBeenCalledWith(
      {
        communityId: 8,
        role: 'resident',
        communityType: 'condo_718',
        isUnitOwner: true,
        permissions: undefined,
      },
      // categoryId 55 was non-null, so the second arg (additionalFilter) is
      // a defined SQL eq() clause. The exact shape is drizzle-internal.
      expect.anything(),
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
        categoryId: 7,
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
        categoryId: 7,
        filePath: 'communities/42/documents/abc/minutes.pdf',
        fileName: 'minutes.pdf',
        fileSize: 1024,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    // The control for the cleanup boundary. withUploadCleanup opens AFTER the
    // membership and permission gates precisely so a non-member cannot use a
    // deliberately-failed POST as a delete primitive: validateUploadFilePath
    // proves only the path prefix, and it runs before this gate.
    expect(deleteStorageObjectMock).not.toHaveBeenCalled();
  });

  
  
  
  it.each([
    ['an e-sign source template', 'communities/42/esign-templates/uuid-lease.pdf'],
    ['an executed e-sign contract', 'communities/42/esign-signed/7/signed.pdf'],
    ['a processed community logo', 'communities/42/branding/logo.webp'],
  ])('POST rejects %s — same community, sibling namespace in the same bucket', async (_l, filePath) => {
    // THE INPUT CLASS THAT WAS MISSING, and the reason a live hole survived five
    // revert-checks: every filePath in this file used the `documents/` segment,
    // so a check that stopped at `communities/{id}/` passed everything while
    // admitting every other subsystem's objects in the same bucket. Accepting one
    // here would let a manager create a documents row pointing at an executed
    // contract and then flip publicAccess.
    requireCommunityMembershipMock.mockResolvedValueOnce(MANAGER_MEMBERSHIP);

    const req = new NextRequest('http://localhost:3000/api/v1/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        title: 'Board Minutes',
        categoryId: 7,
        filePath,
        fileName: 'minutes.pdf',
        fileSize: 1024,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(scopedInsertMock).not.toHaveBeenCalled();
  });

  it('POST accepts a filename containing a double dot, which the old substring check refused', async () => {
    // `sanitizeFilename` permits `.`, so `report..final.pdf` is a filename the
    // presign route can legitimately produce. The previous `includes('..')`
    // check 400d it. The segment-wise check accepts it while still rejecting a
    // real `..` segment — see the traversal case above.
    requireCommunityMembershipMock.mockResolvedValueOnce(MANAGER_MEMBERSHIP);
    scopedInsertMock.mockResolvedValue([
      { id: 99, communityId: 42, title: 'Report' },
    ]);

    const req = new NextRequest('http://localhost:3000/api/v1/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        title: 'Report',
        categoryId: 7,
        filePath: 'communities/42/documents/abc/report..final.pdf',
        fileName: 'report..final.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('POST returns 422 and audits, RETAINING the object, when file size does not match', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce(MANAGER_MEMBERSHIP);
    const req = new NextRequest('http://localhost:3000/api/v1/documents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        title: 'Board Minutes',
        categoryId: 7,
        filePath: 'communities/42/documents/abc/minutes.pdf',
        fileName: 'minutes.pdf',
        fileSize: 2048,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    // NOTHING is deleted, and that is the fix rather than a regression. The
    // delete this used to assert took a client-supplied path with no check that
    // anything referenced it, so a member could name an executed e-sign contract
    // and have it destroyed. The rejected bytes now stay in a private bucket with
    // no row — unreachable through every product surface — and
    // `pnpm documents:orphan-report` lists them for an operator.
    expect(deleteStorageObjectMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'validation_failed',
        resourceType: 'document_upload',
        communityId: 42,
      }),
    );
  });

  it('POST returns 422 and audits, RETAINING the object, when magic bytes validation fails', async () => {
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
        categoryId: 7,
        filePath: 'communities/42/documents/abc/fake.pdf',
        fileName: 'fake.pdf',
        fileSize: 2,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    // The rejected file stays in the bucket — see the size-mismatch case above.
    expect(deleteStorageObjectMock).not.toHaveBeenCalled();
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

  it('POST rejects missing categoryId for library documents', async () => {
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
        fileSize: 1024,
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(scopedInsertMock).not.toHaveBeenCalled();
  });

  it('POST returns warnings when notification dispatch fails', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce(MANAGER_MEMBERSHIP);
    queueNotificationDetailedMock.mockResolvedValueOnce({
      recipientsCount: 5,
      sentCount: 0,
      queuedCount: 0,
      failedCount: 5,
    });
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
        categoryId: 7,
        filePath: 'communities/42/documents/abc/minutes.pdf',
        fileName: 'minutes.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    const res = await POST(req);
    const json = await res.json() as { warnings?: Array<{ code: string }> };

    expect(res.status).toBe(200);
    expect(json.warnings).toEqual([
      expect.objectContaining({ code: 'notification_dispatch_failed' }),
    ]);
  });
});

describe('p1-15 documents route DELETE', () => {
  beforeEach(() => {
    resetRouteMocks();
    // Documents delete now gates on `documents:write` (#734), matching upload.
    // Default to an authorized writer (board_president-preset manager); the
    // denial-path tests below override the membership with owner/tenant.
    requireCommunityMembershipMock.mockResolvedValue(MANAGER_MEMBERSHIP);
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

  it('DELETE rejects owner — documents are read-only for owners (#734)', async () => {
    // Behavior change: delete is gated on documents:write, where owner is
    // false. Previously isElevatedRole() let owners delete; now they cannot
    // (they were never able to upload either — read-only §718 transparency).
    requireCommunityMembershipMock.mockResolvedValueOnce({
      role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner',
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
    resetRouteMocks();
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
          categoryId: 7,
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
    it('POST returns 400 when filePath contains path traversal', async () => {
      requireCommunityMembershipMock.mockResolvedValueOnce(MANAGER_MEMBERSHIP);

      const req = new NextRequest('http://localhost:3000/api/v1/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 42,
          title: 'Traversal Doc',
          categoryId: 7,
          filePath: 'communities/42/documents/../../../etc/passwd',
          fileName: 'passwd',
          fileSize: 1024,
          mimeType: 'application/pdf',
        }),
      });

      const res = await POST(req);
      // Currently this might not be 400 if it's not sanitized.
      // We WANT it to be 400 after the fix.
      expect(res.status).toBe(400);
    });

    it('POST returns 400 when filePath belongs to another community', async () => {
      requireCommunityMembershipMock.mockResolvedValueOnce(MANAGER_MEMBERSHIP);

      const req = new NextRequest('http://localhost:3000/api/v1/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 42,
          title: 'Cross-tenant Doc',
          categoryId: 7,
          filePath: 'communities/99/documents/secret.pdf',
          fileName: 'secret.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('POST returns 201 when filePath is valid', async () => {
      requireCommunityMembershipMock.mockResolvedValueOnce(MANAGER_MEMBERSHIP);
      scopedInsertMock.mockResolvedValueOnce([
        {
          id: 99,
          communityId: 42,
          title: 'Valid Doc',
          filePath: 'communities/42/documents/file.pdf',
        },
      ]);

      const req = new NextRequest('http://localhost:3000/api/v1/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 42,
          title: 'Valid Doc',
          categoryId: 7,
          filePath: 'communities/42/documents/file.pdf',
          fileName: 'file.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('GET without communityId returns 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/documents');
      const res = await GET(req);
      // Number(null) === 0, which fails the positive integer check → ValidationError (400)
      expect(res.status).toBe(400);
    });

    it('POST returns 400 when storage fetch returns non-ok (magic bytes validation path)', async () => {
      requireCommunityMembershipMock.mockResolvedValueOnce(MANAGER_MEMBERSHIP);
      // downloadStorageBytes throws ValidationError (400) when fetch returns !ok.
      // Nothing is deleted on any failure path any more: a deleter driven by a
      // client-supplied path needs a reference model covering every writer into
      // this bucket, and an incomplete one destroys records.
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
          categoryId: 7,
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

  });
});

/**
 * Route unit tests — `GET/POST/DELETE /api/v1/documents`.
 *
 * Added alongside the Plan A1 auto-drain. Covers the contracted runRoute
 * envelope: paginated GET (service args, cursor/pageSize, categoryId filter,
 * empty-string params), POST upload (auth chain, `?? null` description
 * coalescing, top-level `warnings` sibling preservation), DELETE soft-delete
 * (auth chain, audit log, `{ deleted: true, id }` body), 401s, 400 input
 * validation (non-numeric / zero ids — symmetric on GET + DELETE), and the
 * 403 gates. Fixtures use raw Drizzle-row fields only (the services return
 * `Record<string, unknown>` rows / `DocumentMutationResult`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ValidationError } from '../../src/lib/api/errors/ValidationError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  validateUploadFilePathMock,
  assertNotDemoGraceMock,
  requirePermissionMock,
  requireActiveSubscriptionForMutationMock,
  createUploadedDocumentMock,
  enforceRedactionAttestationMock,
  paginateAccessibleDocumentsMock,
  getDocumentForDeletionAuditMock,
  softDeleteDocumentMock,
  getDocumentForPublishAuditMock,
  setDocumentPublicAccessMock,
  enforcePublishRedactionAttestationMock,
  tryAutoCompleteMock,
  logAuditEventMock,
  createScopedClientMock,
  scopedUpdateMock,
  complianceChecklistItemsTable,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  validateUploadFilePathMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
  createUploadedDocumentMock: vi.fn(),
  enforceRedactionAttestationMock: vi.fn(),
  paginateAccessibleDocumentsMock: vi.fn(),
  getDocumentForDeletionAuditMock: vi.fn(),
  softDeleteDocumentMock: vi.fn(),
  getDocumentForPublishAuditMock: vi.fn(),
  setDocumentPublicAccessMock: vi.fn(),
  enforcePublishRedactionAttestationMock: vi.fn(),
  tryAutoCompleteMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  scopedUpdateMock: vi.fn(),
  complianceChecklistItemsTable: Symbol('compliance_checklist_items'),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/api/upload-path', () => ({
  validateUploadFilePath: validateUploadFilePathMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));

vi.mock('@/lib/documents/redaction-attestation', () => ({
  enforceRedactionAttestation: enforceRedactionAttestationMock,
  enforcePublishRedactionAttestation: enforcePublishRedactionAttestationMock,
}));

vi.mock('@/lib/documents/create-uploaded-document', () => ({
  createUploadedDocument: createUploadedDocumentMock,
}));

vi.mock('@/lib/services/onboarding-checklist-service', () => ({
  tryAutoComplete: tryAutoCompleteMock,
}));

vi.mock('@/lib/services/documents-service', () => ({
  paginateAccessibleDocuments: paginateAccessibleDocumentsMock,
  getDocumentForDeletionAudit: getDocumentForDeletionAuditMock,
  softDeleteDocument: softDeleteDocumentMock,
  getDocumentForPublishAudit: getDocumentForPublishAuditMock,
  setDocumentPublicAccess: setDocumentPublicAccessMock,
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
  createScopedClient: createScopedClientMock,
  complianceChecklistItems: complianceChecklistItemsTable,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn((col: unknown, value: unknown) => ({ __eq: { col, value } })),
}));

import { DELETE, GET, PATCH, POST } from '../../src/app/api/v1/documents/route';

const MEMBERSHIP = {
  userId: 'user-admin',
  communityId: 42,
  role: 'property_manager' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
  designation: 'board_president' as const,
};

const DOCUMENT_ROW = {
  id: 7,
  communityId: 42,
  title: 'Bylaws',
  description: null,
  categoryId: 3,
  filePath: 'community-42/bylaws.pdf',
  fileName: 'bylaws.pdf',
  createdAt: new Date('2026-05-23T00:00:00.000Z'),
  updatedAt: new Date('2026-05-23T00:00:00.000Z'),
  deletedAt: null,
};

const DOCUMENT_ROW_JSON = {
  ...DOCUMENT_ROW,
  createdAt: '2026-05-23T00:00:00.000Z',
  updatedAt: '2026-05-23T00:00:00.000Z',
};

interface PaginatedJson {
  data: {
    data: unknown[];
    pagination: { nextCursor: string | null; hasMore: boolean; pageSize: number };
  };
}

function getReq(url: string): NextRequest {
  return new NextRequest(url);
}

function jsonPost(payload: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/documents', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

function deleteReq(url: string): NextRequest {
  return new NextRequest(url, { method: 'DELETE' });
}

const VALID_CREATE_BODY = {
  communityId: 42,
  title: 'Bylaws',
  categoryId: 3,
  filePath: 'community-42/bylaws.pdf',
  fileName: 'bylaws.pdf',
  fileSize: 1024,
};

describe('GET /api/v1/documents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    paginateAccessibleDocumentsMock.mockResolvedValue({
      data: [DOCUMENT_ROW],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });
  });

  it('returns paginated documents (no categoryId / no cursor)', async () => {
    const res = await GET(getReq('http://localhost:3000/api/v1/documents?communityId=42'));

    expect(res.status).toBe(200);
    const json = (await res.json()) as PaginatedJson;
    expect(json.data.data).toEqual([DOCUMENT_ROW_JSON]);
    expect(json.data.pagination).toEqual({ nextCursor: null, hasMore: false, pageSize: 50 });
    expect(paginateAccessibleDocumentsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          communityId: 42,
          role: 'property_manager',
          communityType: 'condo_718',
          isUnitOwner: false,
        },
        categoryId: null,
        cursor: undefined,
        pageSize: undefined,
      }),
    );
    // B2: owner/tenant checklists carry `access_document` — fire it on list load
    // so residents can reach 100% (fires unconditionally; a no-op for other roles).
    expect(tryAutoCompleteMock).toHaveBeenCalledWith(42, 'user-admin', 'access_document');
  });

  it('forwards cursor, pageSize, and categoryId filter', async () => {
    await GET(
      getReq(
        'http://localhost:3000/api/v1/documents?communityId=42&categoryId=3&cursor=abc&pageSize=25',
      ),
    );

    expect(paginateAccessibleDocumentsMock).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 3, cursor: 'abc', pageSize: 25 }),
    );
  });

  it('treats empty-string cursor and pageSize as missing', async () => {
    await GET(
      getReq('http://localhost:3000/api/v1/documents?communityId=42&cursor=&pageSize='),
    );

    expect(paginateAccessibleDocumentsMock).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: undefined, pageSize: undefined }),
    );
  });

  it('returns 400 when communityId is missing', async () => {
    const res = await GET(getReq('http://localhost:3000/api/v1/documents'));
    expect(res.status).toBe(400);
    expect(paginateAccessibleDocumentsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is non-numeric', async () => {
    const res = await GET(getReq('http://localhost:3000/api/v1/documents?communityId=abc'));
    expect(res.status).toBe(400);
    expect(paginateAccessibleDocumentsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is zero', async () => {
    const res = await GET(getReq('http://localhost:3000/api/v1/documents?communityId=0'));
    expect(res.status).toBe(400);
    expect(paginateAccessibleDocumentsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when categoryId is non-numeric', async () => {
    const res = await GET(
      getReq('http://localhost:3000/api/v1/documents?communityId=42&categoryId=abc'),
    );
    expect(res.status).toBe(400);
    expect(paginateAccessibleDocumentsMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(getReq('http://localhost:3000/api/v1/documents?communityId=42'));
    expect(res.status).toBe(401);
    expect(paginateAccessibleDocumentsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when membership check fails', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));

    const res = await GET(getReq('http://localhost:3000/api/v1/documents?communityId=42'));
    expect(res.status).toBe(403);
    expect(paginateAccessibleDocumentsMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/documents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    validateUploadFilePathMock.mockReturnValue(undefined);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
    createUploadedDocumentMock.mockResolvedValue({ document: DOCUMENT_ROW, warnings: [] });
    enforceRedactionAttestationMock.mockResolvedValue(undefined);
  });

  // ── §718.111(12)(c) redaction attestation (F-02) ──────────────────────────

  it('refuses the upload when the redaction gate rejects', async () => {
    // The gate must run BEFORE the row is created — an unredacted record that
    // reaches the portal and is then deleted was still published.
    enforceRedactionAttestationMock.mockRejectedValueOnce(
      new ValidationError('Confirm you have redacted it before uploading.'),
    );

    const res = await POST(jsonPost(VALID_CREATE_BODY));

    expect(res.status).toBe(400);
    expect(createUploadedDocumentMock).not.toHaveBeenCalled();
  });

  it('passes the attestation flag and category through to the gate', async () => {
    await POST(jsonPost({ ...VALID_CREATE_BODY, redactionAttested: true }));

    expect(enforceRedactionAttestationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 42,
        categoryId: 3,
        userId: 'user-admin',
        attested: true,
      }),
    );
  });

  it('creates a document and returns the row (no warnings)', async () => {
    const res = await POST(jsonPost(VALID_CREATE_BODY));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown; warnings?: unknown };
    expect(json.data).toEqual(DOCUMENT_ROW_JSON);
    expect('warnings' in json).toBe(false);
    expect(createUploadedDocumentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-admin',
        communityId: 42,
        title: 'Bylaws',
        description: null,
        categoryId: 3,
        filePath: 'community-42/bylaws.pdf',
        fileName: 'bylaws.pdf',
        fileSize: 1024,
        sourceType: 'library',
      }),
    );
  });

  it('coalesces an omitted description to null', async () => {
    await POST(jsonPost(VALID_CREATE_BODY));
    expect(createUploadedDocumentMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
    );
  });

  it('preserves a top-level warnings sibling when the service returns warnings', async () => {
    const warnings = [{ code: 'duplicate_title', message: 'A document with this title exists' }];
    createUploadedDocumentMock.mockResolvedValueOnce({ document: DOCUMENT_ROW, warnings });

    const res = await POST(jsonPost(VALID_CREATE_BODY));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown; warnings?: unknown };
    expect(json.data).toEqual(DOCUMENT_ROW_JSON);
    expect(json.warnings).toEqual(warnings);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(jsonPost(VALID_CREATE_BODY));
    expect(res.status).toBe(401);
    expect(createUploadedDocumentMock).not.toHaveBeenCalled();
  });

  it('returns 400 when title is empty', async () => {
    const res = await POST(jsonPost({ ...VALID_CREATE_BODY, title: '' }));
    expect(res.status).toBe(400);
    expect(createUploadedDocumentMock).not.toHaveBeenCalled();
  });

  it('returns 400 when categoryId is missing', async () => {
    const { categoryId, ...rest } = VALID_CREATE_BODY;
    void categoryId;
    const res = await POST(jsonPost(rest));
    expect(res.status).toBe(400);
    expect(createUploadedDocumentMock).not.toHaveBeenCalled();
  });

  it('returns 400 when fileSize is not positive', async () => {
    const res = await POST(jsonPost({ ...VALID_CREATE_BODY, fileSize: 0 }));
    expect(res.status).toBe(400);
    expect(createUploadedDocumentMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the documents/write permission gate fails', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(jsonPost(VALID_CREATE_BODY));
    expect(res.status).toBe(403);
    expect(createUploadedDocumentMock).not.toHaveBeenCalled();
  });

  it('runs assertNotDemoGrace before requireCommunityMembership', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo grace'));

    const res = await POST(jsonPost(VALID_CREATE_BODY));
    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(createUploadedDocumentMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/documents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
    getDocumentForDeletionAuditMock.mockResolvedValue({
      title: 'Bylaws',
      categoryId: 3,
      filePath: 'community-42/bylaws.pdf',
      fileName: 'bylaws.pdf',
    });
    softDeleteDocumentMock.mockResolvedValue([{ id: 7 }]);
    logAuditEventMock.mockResolvedValue(undefined);
    // DELETE now unlinks compliance checklist items referencing the doc before
    // soft-deleting it, via a scoped update.
    scopedUpdateMock.mockResolvedValue([]);
    createScopedClientMock.mockReturnValue({ update: scopedUpdateMock });
  });

  it('soft-deletes a document and writes an audit entry', async () => {
    const res = await DELETE(
      deleteReq('http://localhost:3000/api/v1/documents?id=7&communityId=42'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { deleted: boolean; id: number } };
    expect(json.data).toEqual({ deleted: true, id: 7 });
    // Delete is gated on the same `documents:write` permission as upload (#734).
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'documents', 'write');
    expect(softDeleteDocumentMock).toHaveBeenCalledWith(42, 7);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-admin',
        action: 'delete',
        resourceType: 'document',
        resourceId: '7',
        communityId: 42,
        oldValues: {
          title: 'Bylaws',
          categoryId: 3,
          filePath: 'community-42/bylaws.pdf',
          fileName: 'bylaws.pdf',
        },
      }),
    );
  });

  it('returns 400 when id is non-numeric', async () => {
    const res = await DELETE(
      deleteReq('http://localhost:3000/api/v1/documents?id=abc&communityId=42'),
    );
    expect(res.status).toBe(400);
    expect(softDeleteDocumentMock).not.toHaveBeenCalled();
  });

  it('returns 400 when id is zero', async () => {
    const res = await DELETE(
      deleteReq('http://localhost:3000/api/v1/documents?id=0&communityId=42'),
    );
    expect(res.status).toBe(400);
    expect(softDeleteDocumentMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is missing', async () => {
    const res = await DELETE(deleteReq('http://localhost:3000/api/v1/documents?id=7'));
    expect(res.status).toBe(400);
    expect(softDeleteDocumentMock).not.toHaveBeenCalled();
  });

  it('returns 400 (Document not found) when no row matches the audit lookup', async () => {
    getDocumentForDeletionAuditMock.mockResolvedValueOnce(null);

    const res = await DELETE(
      deleteReq('http://localhost:3000/api/v1/documents?id=7&communityId=42'),
    );
    expect(res.status).toBe(400);
    expect(softDeleteDocumentMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await DELETE(
      deleteReq('http://localhost:3000/api/v1/documents?id=7&communityId=42'),
    );
    expect(res.status).toBe(401);
    expect(softDeleteDocumentMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the documents/write permission gate fails', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await DELETE(
      deleteReq('http://localhost:3000/api/v1/documents?id=7&communityId=42'),
    );
    expect(res.status).toBe(403);
    expect(requireActiveSubscriptionForMutationMock).not.toHaveBeenCalled();
    expect(softDeleteDocumentMock).not.toHaveBeenCalled();
  });

  it('runs assertNotDemoGrace before requireCommunityMembership', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo grace'));

    const res = await DELETE(
      deleteReq('http://localhost:3000/api/v1/documents?id=7&communityId=42'),
    );
    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(softDeleteDocumentMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/documents - public_access', () => {
  /**
   * This is the ONLY writer for `documents.public_access`, and that flag is what
   * puts an association's record on the open internet. Every gate below is a
   * reason a board cannot do that by accident.
   */
  function patchRequest(body: unknown, query = 'id=7&communityId=42') {
    return new NextRequest(`http://localhost/api/v1/documents?${query}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
    enforcePublishRedactionAttestationMock.mockResolvedValue(undefined);
    getDocumentForPublishAuditMock.mockResolvedValue({
      title: 'Bylaws',
      categoryId: 3,
      publicAccess: false,
    });
    setDocumentPublicAccessMock.mockResolvedValue([{ id: 7, publicAccess: true }]);
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('puts a document on the public site and records who did it', async () => {
    const response = await PATCH(patchRequest({ publicAccess: true, redactionAttested: true }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { id: 7, publicAccess: true },
    });
    expect(setDocumentPublicAccessMock).toHaveBeenCalledWith(42, 7, true);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-admin',
        action: 'update',
        resourceType: 'document',
        resourceId: '7',
        communityId: 42,
        oldValues: { publicAccess: false },
        newValues: { publicAccess: true },
      }),
    );
  });

  it('refuses a viewer without documents:write', async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const response = await PATCH(patchRequest({ publicAccess: true, redactionAttested: true }));

    expect(response.status).toBe(403);
    expect(setDocumentPublicAccessMock).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError('Unauthorized'));

    const response = await PATCH(patchRequest({ publicAccess: true }));

    expect(response.status).toBe(401);
    expect(setDocumentPublicAccessMock).not.toHaveBeenCalled();
  });

  it('will not publish without the redaction attestation the category requires', async () => {
    // Fla. Stat. 718.111(12)(c). The upload attestation covers the owner portal;
    // the open internet is a materially larger disclosure, so publishing asks
    // again rather than inheriting a consent given for a smaller audience.
    enforcePublishRedactionAttestationMock.mockRejectedValue(
      new ValidationError('Confirm you have redacted it before publishing.'),
    );

    const response = await PATCH(patchRequest({ publicAccess: true }));

    expect(response.status).toBe(400);
    expect(setDocumentPublicAccessMock).not.toHaveBeenCalled();
  });

  it('does not ask for an attestation to REMOVE a document from the public site', async () => {
    // Un-publishing reduces disclosure. Gating it would be friction with no
    // statutory purpose, and would strand a document a board wants pulled.
    getDocumentForPublishAuditMock.mockResolvedValue({
      title: 'Bylaws',
      categoryId: 3,
      publicAccess: true,
    });
    setDocumentPublicAccessMock.mockResolvedValue([{ id: 7, publicAccess: false }]);

    const response = await PATCH(patchRequest({ publicAccess: false }));

    expect(response.status).toBe(200);
    expect(enforcePublishRedactionAttestationMock).not.toHaveBeenCalled();
    expect(setDocumentPublicAccessMock).toHaveBeenCalledWith(42, 7, false);
  });

  it('refuses a document that is not in this community', async () => {
    getDocumentForPublishAuditMock.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ publicAccess: true, redactionAttested: true }));

    expect(response.status).toBe(400);
    expect(setDocumentPublicAccessMock).not.toHaveBeenCalled();
  });

  it('rejects a body that does not carry publicAccess', async () => {
    const response = await PATCH(patchRequest({ redactionAttested: true }));

    expect(response.status).toBe(400);
    expect(setDocumentPublicAccessMock).not.toHaveBeenCalled();
  });
});

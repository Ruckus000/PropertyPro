/**
 * Route unit tests — `PUT /api/v1/documents/[id]/file` (replace a document's
 * file, keeping the document).
 *
 * What each case protects:
 *  - the document keeps its id, and the write is conditional on the file the
 *    route read (`expectedFilePath`), so a racing replace cannot be overwritten;
 *  - the redaction question follows the audience the document ALREADY has —
 *    public documents get the public-site attestation, the rest the upload one;
 *  - every refusal happens before a write, and before an audit entry claims one;
 *  - the old file is recorded in the audit entry, since the row no longer holds it.
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
  assertCommunityOwnedStoragePathMock,
  assertNotDemoGraceMock,
  requirePermissionMock,
  requireActiveSubscriptionForMutationMock,
  enforceRedactionAttestationMock,
  enforcePublishRedactionAttestationMock,
  readValidatedUploadMock,
  queuePdfExtractionMock,
  getDocumentFileSnapshotMock,
  replaceDocumentFileMock,
  logAuditEventMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  assertCommunityOwnedStoragePathMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
  enforceRedactionAttestationMock: vi.fn(),
  enforcePublishRedactionAttestationMock: vi.fn(),
  readValidatedUploadMock: vi.fn(),
  queuePdfExtractionMock: vi.fn(),
  getDocumentFileSnapshotMock: vi.fn(),
  replaceDocumentFileMock: vi.fn(),
  logAuditEventMock: vi.fn(),
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
vi.mock('@/lib/services/storage-validators', () => ({
  assertCommunityOwnedStoragePath: assertCommunityOwnedStoragePathMock,
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
  readValidatedUpload: readValidatedUploadMock,
}));
vi.mock('@/lib/workers/pdf-extraction', () => ({
  queuePdfExtraction: queuePdfExtractionMock,
}));
vi.mock('@/lib/services/documents-service', () => ({
  getDocumentFileSnapshot: getDocumentFileSnapshotMock,
  replaceDocumentFile: replaceDocumentFileMock,
}));
vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
}));

import { PUT } from '../../src/app/api/v1/documents/[id]/file/route';

const OLD_PATH = 'communities/42/documents/old-uuid/budget.pdf';
const NEW_PATH = 'communities/42/documents/new-uuid/budget.pdf';

const MEMBERSHIP = {
  userId: 'user-admin',
  communityId: 42,
  role: 'property_manager' as const,
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718' as const,
};

const SNAPSHOT = {
  title: '2026 Annual Budget',
  categoryId: 3,
  publicAccess: false,
  sourceType: 'library',
  filePath: OLD_PATH,
  fileName: 'budget.pdf',
  fileSize: 1000,
  mimeType: 'application/pdf',
  postedAt: new Date('2026-01-15T00:00:00.000Z'),
};

function putRequest(body: Record<string, unknown>, id = '7') {
  return PUT(
    new NextRequest(`http://localhost/api/v1/documents/${id}/file`, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ id }) },
  );
}

const BODY = {
  communityId: 42,
  filePath: NEW_PATH,
  fileName: 'budget.pdf',
  fileSize: 2048,
  redactionAttested: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('user-admin');
  resolveEffectiveCommunityIdMock.mockReturnValue(42);
  assertCommunityOwnedStoragePathMock.mockReturnValue(undefined);
  assertNotDemoGraceMock.mockResolvedValue(undefined);
  requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
  requirePermissionMock.mockReturnValue(undefined);
  requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
  enforceRedactionAttestationMock.mockResolvedValue(undefined);
  enforcePublishRedactionAttestationMock.mockResolvedValue(undefined);
  getDocumentFileSnapshotMock.mockResolvedValue(SNAPSHOT);
  readValidatedUploadMock.mockResolvedValue({ byteLength: 2048, mime: 'application/pdf' });
  replaceDocumentFileMock.mockResolvedValue([{ id: 7 }]);
  logAuditEventMock.mockResolvedValue(undefined);
});

describe('PUT /api/v1/documents/[id]/file', () => {
  it('repoints the same document at the new file and records the old one', async () => {
    const res = await putRequest(BODY);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: { id: 7, fileName: 'budget.pdf', fileSize: 2048, mimeType: 'application/pdf' },
    });
    // Conditional on the file the route read — the race guard.
    expect(replaceDocumentFileMock).toHaveBeenCalledWith(42, 7, OLD_PATH, {
      filePath: NEW_PATH,
      fileName: 'budget.pdf',
      // The MEASURED size and type, not the client's claims.
      fileSize: 2048,
      mimeType: 'application/pdf',
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        resourceType: 'document',
        resourceId: '7',
        communityId: 42,
        oldValues: {
          filePath: OLD_PATH,
          fileName: 'budget.pdf',
          fileSize: 1000,
          mimeType: 'application/pdf',
        },
        newValues: expect.objectContaining({ filePath: NEW_PATH, fileSize: 2048 }),
        metadata: { change: 'file_replaced' },
      }),
    );
    expect(queuePdfExtractionMock).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 7, path: NEW_PATH }),
    );
  });

  it('pins the new file to this community’s documents namespace before anything else', async () => {
    assertCommunityOwnedStoragePathMock.mockImplementation(() => {
      throw new ValidationError('filePath must be a documents path');
    });

    const res = await putRequest({ ...BODY, filePath: 'communities/42/esign-signed/7/signed.pdf' });

    expect(res.status).toBe(400);
    expect(assertCommunityOwnedStoragePathMock).toHaveBeenCalledWith(
      'communities/42/esign-signed/7/signed.pdf',
      42,
      'documents',
      'filePath',
    );
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(replaceDocumentFileMock).not.toHaveBeenCalled();
  });

  it('asks the PUBLIC-SITE question for a document already on the public site', async () => {
    getDocumentFileSnapshotMock.mockResolvedValue({ ...SNAPSHOT, publicAccess: true });

    const res = await putRequest(BODY);

    expect(res.status).toBe(200);
    expect(enforcePublishRedactionAttestationMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 42, categoryId: 3, attested: true }),
    );
    expect(enforceRedactionAttestationMock).not.toHaveBeenCalled();
  });

  it('asks the upload question, by category, for a document that is not public', async () => {
    const res = await putRequest(BODY);

    expect(res.status).toBe(200);
    expect(enforceRedactionAttestationMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 42, categoryId: 3, attested: true }),
    );
    expect(enforcePublishRedactionAttestationMock).not.toHaveBeenCalled();
  });

  it('refuses without an attestation and writes nothing', async () => {
    enforceRedactionAttestationMock.mockRejectedValue(new ValidationError('Confirm redaction'));

    const res = await putRequest({ ...BODY, redactionAttested: false });

    expect(res.status).toBe(400);
    expect(readValidatedUploadMock).not.toHaveBeenCalled();
    expect(replaceDocumentFileMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('asks NOTHING when the document is a draft — owners cannot see it yet', async () => {
    getDocumentFileSnapshotMock.mockResolvedValue({ ...SNAPSHOT, postedAt: null, publicAccess: false });

    const res = await putRequest({ ...BODY, redactionAttested: false });

    expect(res.status).toBe(200);
    expect(enforceRedactionAttestationMock).not.toHaveBeenCalled();
    expect(enforcePublishRedactionAttestationMock).not.toHaveBeenCalled();
    expect(replaceDocumentFileMock).toHaveBeenCalled();
  });

  it('asks when the posted state is unknown — only a real NULL is a draft', async () => {
    const { postedAt: _omit, ...withoutPostedAt } = SNAPSHOT;
    getDocumentFileSnapshotMock.mockResolvedValue(withoutPostedAt);

    const res = await putRequest(BODY);

    expect(res.status).toBe(200);
    expect(enforceRedactionAttestationMock).toHaveBeenCalled();
  });

  it('refuses to replace an authored document’s file', async () => {
    getDocumentFileSnapshotMock.mockResolvedValue({ ...SNAPSHOT, sourceType: 'authored' });

    const res = await putRequest(BODY);

    expect(res.status).toBe(400);
    expect(replaceDocumentFileMock).not.toHaveBeenCalled();
  });

  it('refuses a "replacement" that is the current file', async () => {
    const res = await putRequest({ ...BODY, filePath: OLD_PATH });

    expect(res.status).toBe(400);
    expect(replaceDocumentFileMock).not.toHaveBeenCalled();
  });

  it('404s a document it cannot find in this community', async () => {
    getDocumentFileSnapshotMock.mockResolvedValue(null);

    const res = await putRequest(BODY);

    expect(res.status).toBe(404);
    expect(getDocumentFileSnapshotMock).toHaveBeenCalledWith(42, 7);
    expect(replaceDocumentFileMock).not.toHaveBeenCalled();
  });

  it('409s when the document moved on between the read and the write, and audits nothing', async () => {
    replaceDocumentFileMock.mockResolvedValue([]);

    const res = await putRequest(BODY);

    expect(res.status).toBe(409);
    expect(logAuditEventMock).not.toHaveBeenCalled();
    expect(queuePdfExtractionMock).not.toHaveBeenCalled();
  });

  it('401s without a session', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());

    const res = await putRequest(BODY);

    expect(res.status).toBe(401);
    expect(getDocumentFileSnapshotMock).not.toHaveBeenCalled();
  });

  it('403s without documents:write', async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('no');
    });

    const res = await putRequest(BODY);

    expect(res.status).toBe(403);
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'documents', 'write');
    expect(getDocumentFileSnapshotMock).not.toHaveBeenCalled();
  });

  it('refuses a body carrying anything but the file fields', async () => {
    const res = await putRequest({ ...BODY, title: 'Renamed' });

    expect(res.status).toBe(400);
    expect(getDocumentFileSnapshotMock).not.toHaveBeenCalled();
  });
});

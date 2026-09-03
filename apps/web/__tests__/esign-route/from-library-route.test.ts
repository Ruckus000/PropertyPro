/**
 * `POST /api/v1/esign/documents/from-library`.
 *
 * The builder's first step offers "upload a new PDF" or "pick one you already
 * have". The second needs a copy: library files live under
 * `communities/{id}/documents/`, and both e-sign create paths call
 * `assertCommunityOwnedStoragePath(path, id, 'esign-templates')`, which rejects
 * every other prefix. This route is what turns a library path into one they
 * accept, and it must not become the way around the gates they apply.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  parseCommunityIdFromBodyMock,
  requireEsignWritePermissionMock,
  requirePlanFeatureMock,
  assertNotDemoGraceMock,
  getDocumentWithAccessCheckMock,
  logAuditEventMock,
  copyStorageObjectMock,
  assertPdfMagicBytesMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromBodyMock: vi.fn(),
  requireEsignWritePermissionMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  getDocumentWithAccessCheckMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  copyStorageObjectMock: vi.fn(),
  assertPdfMagicBytesMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromBody: parseCommunityIdFromBodyMock,
}));
vi.mock('@/lib/esign/esign-route-helpers', () => ({
  requireEsignWritePermission: requireEsignWritePermissionMock,
}));
vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));
vi.mock('@propertypro/db', () => ({
  getDocumentWithAccessCheck: getDocumentWithAccessCheckMock,
  logAuditEvent: logAuditEventMock,
}));
vi.mock('@/lib/site-assets/copy-object', () => ({
  copyStorageObject: copyStorageObjectMock,
}));
vi.mock('@/lib/services/storage-validators', () => ({
  assertPdfMagicBytes: assertPdfMagicBytesMock,
}));

import { ValidationError } from '../../src/lib/api/errors';
import { POST } from '../../src/app/api/v1/esign/documents/from-library/route';

const COMMUNITY_ID = 42;
const DOCUMENT_ID = 7;

const membership = {
  userId: 'user-staff',
  communityId: COMMUNITY_ID,
  role: 'property_manager',
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718',
};

const libraryDocument = {
  id: DOCUMENT_ID,
  fileName: 'Limited Proxy 2026.pdf',
  filePath: `communities/${COMMUNITY_ID}/documents/2026/limited-proxy.pdf`,
};

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost:3000/api/v1/esign/documents/from-library', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' },
    }),
  );
}

const BODY = { communityId: COMMUNITY_ID, documentId: DOCUMENT_ID };

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('user-staff');
  parseCommunityIdFromBodyMock.mockReturnValue(COMMUNITY_ID);
  requireCommunityMembershipMock.mockResolvedValue(membership);
  requireEsignWritePermissionMock.mockResolvedValue(undefined);
  requirePlanFeatureMock.mockResolvedValue(undefined);
  assertNotDemoGraceMock.mockResolvedValue(undefined);
  getDocumentWithAccessCheckMock.mockResolvedValue(libraryDocument);
  copyStorageObjectMock.mockResolvedValue(1024);
  assertPdfMagicBytesMock.mockResolvedValue(undefined);
  logAuditEventMock.mockResolvedValue(undefined);
});

describe('POST /api/v1/esign/documents/from-library', () => {
  it('copies the library file into the community’s e-sign prefix', async () => {
    const response = await post(BODY);
    const json = await response.json();

    expect(response.status).toBe(200);

    const [bucket, from, to] = copyStorageObjectMock.mock.calls[0]!;
    expect(bucket).toBe('documents');
    expect(from).toBe(libraryDocument.filePath);
    // The destination is what makes the copy worth doing: both e-sign create
    // routes accept only this prefix.
    expect(to).toMatch(
      new RegExp(`^communities/${COMMUNITY_ID}/esign-templates/[0-9a-f-]{36}-`),
    );
    expect(json.data.sourceDocumentPath).toBe(to);
    expect(json.data.name).toBe('Limited Proxy 2026.pdf');
  });

  it('refuses a document the caller cannot already open', async () => {
    // Same read gate as the download route. Without it, sending a board-only
    // document for signature would be a way around its audience rules.
    getDocumentWithAccessCheckMock.mockResolvedValueOnce(null);

    const response = await post(BODY);

    expect(response.status).toBe(404);
    expect(copyStorageObjectMock).not.toHaveBeenCalled();
    expect(getDocumentWithAccessCheckMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: COMMUNITY_ID,
        role: 'property_manager',
        isUnitOwner: false,
      }),
      DOCUMENT_ID,
    );
  });

  it('rejects a library file that is not a PDF, checking the copy itself', async () => {
    // The library holds more than PDFs. Everything downstream assumes one, and
    // the validator deletes the object it rejects.
    assertPdfMagicBytesMock.mockRejectedValueOnce(
      new ValidationError('Uploaded file is not a valid PDF.'),
    );

    const response = await post(BODY);

    expect(response.status).toBe(400);
    const checkedPath = assertPdfMagicBytesMock.mock.calls[0]![1];
    expect(checkedPath).toBe(copyStorageObjectMock.mock.calls[0]![2]);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('runs the demo-grace check before the membership lookup', async () => {
    assertNotDemoGraceMock.mockImplementationOnce(async () => {
      expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    });

    await post(BODY);

    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(COMMUNITY_ID);
  });

  it('records the import in the audit trail', async () => {
    await post(BODY);

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-staff',
        communityId: COMMUNITY_ID,
        action: 'esign_source_document_imported',
        resourceType: 'document',
        resourceId: String(DOCUMENT_ID),
      }),
    );
  });

  it('rejects an invalid body before touching storage', async () => {
    const response = await post({ communityId: COMMUNITY_ID });

    expect(response.status).toBe(400);
    expect(copyStorageObjectMock).not.toHaveBeenCalled();
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
  });
});

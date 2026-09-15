import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ValidationError } from '../../src/lib/api/errors/ValidationError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireViolationsEnabledMock,
  requirePermissionMock,
  createUploadedDocumentMock,
  assertCommunityOwnedStoragePathMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireViolationsEnabledMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  createUploadedDocumentMock: vi.fn(),
  assertCommunityOwnedStoragePathMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/violations/common', () => ({
  requireViolationFinesEnabled: vi.fn(),
  requireNoticePdfEnabled: vi.fn(),
  requireViolationsEnabled: requireViolationsEnabledMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/documents/create-uploaded-document', () => ({
  createUploadedDocument: createUploadedDocumentMock,
}));

// Mocked because the module also exports assertPdfMagicBytes, which pulls
// @propertypro/db and needs a DATABASE_URL this suite does not have. The
// validator's own behaviour is covered by
// src/lib/services/__tests__/storage-validators.test.ts; the cases below assert
// that THIS ROUTE calls it, with the documents subdirectory pinned.
vi.mock('@/lib/services/storage-validators', () => ({
  assertCommunityOwnedStoragePath: assertCommunityOwnedStoragePathMock,
}));

// A FAITHFUL mock, not a no-op: two cases below assert the route rejects a
// traversal path and a cross-community path, and stubbing the check to nothing
// would leave them green while testing nothing. This mirrors the real
// contract — segment-wise traversal, then the `communities/{id}/{sub}/` prefix
// — and the real implementation has its own tests in
// src/lib/services/__tests__/storage-validators.test.ts.
assertCommunityOwnedStoragePathMock.mockImplementation(
  (path: string, communityId: number, subdirectory: string) => {
    const segments = path.split('/');
    if (path.includes('\\') || segments.some((seg) => seg === '..' || seg === '.')) {
      throw new ValidationError('Storage path is not a valid object key.');
    }
    if (!path.startsWith(`communities/${communityId}/${subdirectory}/`)) {
      throw new ValidationError('Storage path does not belong to this community.');
    }
  },
);


vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));
import { POST } from '../../src/app/api/v1/violations/evidence/route';

describe('violation evidence route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-123');
    requireCommunityMembershipMock.mockResolvedValue({
      communityId: 8,
      role: 'resident',
      communityType: 'condo_718',
    });
    createUploadedDocumentMock.mockResolvedValue({
      document: { id: 77, sourceType: 'violation_evidence' },
      warnings: [],
    });
  });

  it('creates hidden evidence documents through the dedicated endpoint', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/violations/evidence', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 8,
        title: 'Violation Evidence Photo 1',
        filePath: 'communities/8/documents/evidence-1.png',
        fileName: 'evidence-1.png',
        fileSize: 512,
        mimeType: 'image/png',
      }),
    });

    const res = await POST(req);
    const json = await res.json() as { data: { id: number } };

    expect(res.status).toBe(200);
    expect(json.data.id).toBe(77);
    expect(createUploadedDocumentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        communityId: 8,
        sourceType: 'violation_evidence',
        sendDocumentNotifications: false,
      }),
    );
  });

  it('validates the request body', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/violations/evidence', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 8,
        title: '',
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(createUploadedDocumentMock).not.toHaveBeenCalled();
  });

  it('rejects filePath with path traversal', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/violations/evidence', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 8,
        title: 'Traversal Evidence',
        filePath: 'communities/8/documents/../../etc/passwd',
        fileName: 'passwd',
        fileSize: 512,
        mimeType: 'image/png',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it.each([
    ['an e-sign source template', 'communities/8/esign-templates/uuid-lease.pdf'],
    ['an executed e-sign contract', 'communities/8/esign-signed/7/signed.pdf'],
    ['a processed community logo', 'communities/8/branding/logo.webp'],
  ])('rejects %s — same community, sibling namespace in the same bucket', async (_label, filePath) => {
    // THE INPUT CLASS THAT WAS MISSING. Every filePath in this suite and the
    // documents suite used the `documents/` segment, so a check that stopped at
    // `communities/{id}/` looked correct under every test while accepting every
    // other subsystem's objects in the same bucket.
    const req = new NextRequest('http://localhost:3000/api/v1/violations/evidence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 8,
        title: 'Evidence',
        filePath,
        fileName: 'evidence.png',
        fileSize: 512,
        mimeType: 'image/png',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(createUploadedDocumentMock).not.toHaveBeenCalled();
  });

  it('rejects filePath belonging to another community', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/violations/evidence', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 8,
        title: 'Cross-tenant Evidence',
        filePath: 'communities/9/documents/evidence.png',
        fileName: 'evidence.png',
        fileSize: 512,
        mimeType: 'image/png',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  
  });

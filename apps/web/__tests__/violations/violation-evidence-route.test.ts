import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireViolationsEnabledMock,
  requirePermissionMock,
  createUploadedDocumentMock,
  deleteUnreferencedUploadMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireViolationsEnabledMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  createUploadedDocumentMock: vi.fn(),
  deleteUnreferencedUploadMock: vi.fn(),
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

// A faithful pass-through rather than a stub: the wrapper's own behaviour (the
// reference guard, the scope check, failing closed) is covered in
// __tests__/documents/upload-cleanup.test.ts. What this file must prove is the
// ROUTE's part — that the wrapper is opened at all, with the right path, and
// only after the authz gates. Mocking it also keeps @propertypro/db out of this
// file, which has no DATABASE_URL.
vi.mock('@/lib/documents/upload-cleanup', () => ({
  deleteUnreferencedUpload: deleteUnreferencedUploadMock,
  withUploadCleanup: async (
    communityId: number,
    filePath: string,
    fn: () => Promise<unknown>,
  ) => {
    try {
      return await fn();
    } catch (error) {
      await deleteUnreferencedUploadMock(communityId, filePath);
      throw error;
    }
  },
}));


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
    // Cross-tenant paths are refused BEFORE any cleanup could run, so nothing
    // here can be used to reach another community's object.
    expect(deleteUnreferencedUploadMock).not.toHaveBeenCalled();
  });

  it('reclaims the uploaded object when document creation fails', async () => {
    // Same two-phase upload as /api/v1/documents: the browser has already PUT
    // the bytes and nothing records them until the insert lands.
    createUploadedDocumentMock.mockRejectedValueOnce(new Error('insert failed'));

    const req = new NextRequest('http://localhost:3000/api/v1/violations/evidence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 8,
        title: 'Evidence',
        filePath: 'communities/8/documents/abc/evidence.png',
        fileName: 'evidence.png',
        fileSize: 512,
        mimeType: 'image/png',
      }),
    });

    await POST(req);

    expect(deleteUnreferencedUploadMock).toHaveBeenCalledWith(
      8,
      'communities/8/documents/abc/evidence.png',
    );
  });

  it('does not reclaim anything when the membership gate refuses', async () => {
    // The boundary control: withUploadCleanup opens only after the authz gates,
    // so a non-member cannot use a deliberately-failed POST as a delete
    // primitive.
    requireCommunityMembershipMock.mockRejectedValueOnce(new Error('not a member'));

    const req = new NextRequest('http://localhost:3000/api/v1/violations/evidence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 8,
        title: 'Evidence',
        filePath: 'communities/8/documents/abc/evidence.png',
        fileName: 'evidence.png',
        fileSize: 512,
        mimeType: 'image/png',
      }),
    });

    await POST(req).catch(() => undefined);

    expect(deleteUnreferencedUploadMock).not.toHaveBeenCalled();
  });
});

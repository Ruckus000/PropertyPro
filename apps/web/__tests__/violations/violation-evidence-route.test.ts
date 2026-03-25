import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireViolationsEnabledMock,
  requireViolationsWritePermissionMock,
  createUploadedDocumentMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireViolationsEnabledMock: vi.fn(),
  requireViolationsWritePermissionMock: vi.fn(),
  createUploadedDocumentMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/violations/common', () => ({
  requireViolationsEnabled: requireViolationsEnabledMock,
  requireViolationsWritePermission: requireViolationsWritePermissionMock,
}));

vi.mock('@/lib/documents/create-uploaded-document', () => ({
  createUploadedDocument: createUploadedDocumentMock,
}));

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

    expect(res.status).toBe(201);
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
});

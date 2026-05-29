/**
 * Unit tests — `POST /api/v1/esign/templates/upload` (A1 drain #135).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  parseCommunityIdFromBodyMock,
  requireEsignWritePermissionMock,
  requirePlanFeatureMock,
  assertNotDemoGraceMock,
  createPresignedUploadUrlMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromBodyMock: vi.fn(),
  requireEsignWritePermissionMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  createPresignedUploadUrlMock: vi.fn(),
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
  createPresignedUploadUrl: createPresignedUploadUrlMock,
}));

import { POST } from '../../src/app/api/v1/esign/templates/upload/route';

const MEMBERSHIP = {
  userId: 'actor-1',
  communityId: 10,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'CAM',
  communityType: 'condo_718' as const,
};

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/esign/templates/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/esign/templates/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('actor-1');
    parseCommunityIdFromBodyMock.mockImplementation((_req: unknown, id: number) => id);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requireEsignWritePermissionMock.mockResolvedValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    createPresignedUploadUrlMock.mockResolvedValue({
      signedUrl: 'https://storage.example/upload',
      token: 'tok-1',
    });
  });

  it('returns presigned upload payload', async () => {
    const res = await POST(
      postReq({
        communityId: 10,
        fileName: 'lease.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.path).toContain('communities/10/esign-templates/');
    expect(json.data.token).toBe('tok-1');
    expect(json.data.uploadUrl).toBe('https://storage.example/upload');
    expect(json.data.expiresIn).toBe(15 * 60);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(10, 'hasEsign');
  });

  it('returns 400 for invalid mime type', async () => {
    const res = await POST(
      postReq({
        communityId: 10,
        fileName: 'lease.txt',
        fileSize: 1024,
        mimeType: 'text/plain',
      }),
    );

    expect(res.status).toBe(400);
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });
});

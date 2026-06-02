import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/api/errors/AppError';

const {
  requireAuthMock,
  requireMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePlanFeatureMock,
  assertWithinQuotaMock,
  createPresignedUploadUrlMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  assertWithinQuotaMock: vi.fn(),
  createPresignedUploadUrlMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthMock }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: requireMembershipMock }));
vi.mock('@/lib/api/tenant-context', () => ({ resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock }));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: requirePlanFeatureMock }));
vi.mock('@/lib/site-assets/quota', async () => {
  const { AppError } = await import('@/lib/api/errors/AppError');
  class QuotaExceededError extends AppError {
    constructor(message: string) {
      super(message, 413, 'SITE_ASSETS_QUOTA_EXCEEDED');
    }
  }
  return {
    QuotaExceededError,
    assertWithinQuota: assertWithinQuotaMock,
  };
});
vi.mock('@propertypro/db', () => ({
  createPresignedUploadUrl: createPresignedUploadUrlMock,
}));

import { POST } from '@/app/api/v1/site/uploads/presign/route';

const VALID_BODY = {
  communityId: 42,
  kind: 'hero',
  filename: 'beachfront.jpg',
  mimeType: 'image/jpeg',
  fileSize: 1024 * 1024,
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/site/uploads/presign', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/v1/site/uploads/presign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'pm_admin', communityId: 42 });
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    assertWithinQuotaMock.mockResolvedValue(undefined);
    createPresignedUploadUrlMock.mockResolvedValue({
      signedUrl: 'https://example.supabase.co/storage/v1/object/sign/upload',
      token: 'mock-token',
      path: '42/hero/abc.jpg',
    });
  });

  it('200s with uploadUrl + token + storagePath when all gates pass', async () => {
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual(expect.objectContaining({
      uploadUrl: expect.stringContaining('https://'),
      token: 'mock-token',
      storagePath: expect.stringMatching(/^42\/hero\/.+-beachfront\.jpg$/),
      expiresAt: expect.any(String),
    }));
    expect(createPresignedUploadUrlMock).toHaveBeenCalledWith(
      'community-site-assets',
      expect.stringMatching(/^42\/hero\//),
      expect.objectContaining({ upsert: false }),
    );
  });

  it('400s on invalid MIME type', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, mimeType: 'image/svg+xml' }));
    expect(res.status).toBe(400);
  });

  it('400s on file too large', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, fileSize: 50 * 1024 * 1024 }));
    expect(res.status).toBe(400);
  });

  it('413s when over quota', async () => {
    const { QuotaExceededError } = await import('@/lib/site-assets/quota');
    assertWithinQuotaMock.mockRejectedValueOnce(new QuotaExceededError('over budget'));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(413);
  });

  it('403s when caller does not hold pm_admin role', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'owner', communityId: 42 });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it('403s when caller is not a member of the community', async () => {
    requireMembershipMock.mockRejectedValueOnce(new AppError('Not a member', 403, 'FORBIDDEN'));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it('403s when plan lacks hasSiteEditor', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(new AppError('upgrade', 403, 'PLAN_UPGRADE_REQUIRED'));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it('401s when unauthenticated', async () => {
    requireAuthMock.mockRejectedValueOnce(new AppError('unauthorized', 401, 'UNAUTHORIZED'));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('400s when communityId is missing', async () => {
    const { communityId: _, ...body } = VALID_BODY;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });
});

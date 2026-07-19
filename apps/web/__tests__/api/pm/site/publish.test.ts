import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError, ConflictError } from '@/lib/api/errors';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  publishMock,
  requireAuthMock,
  requireMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePlanFeatureMock,
  markOnboardingCompleteMock,
} = vi.hoisted(() => ({
  publishMock: vi.fn(),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  markOnboardingCompleteMock: vi.fn(),
}));

vi.mock('@/lib/services/site-blocks-service', () => ({
  publishCommunitySite: publishMock,
}));

vi.mock('@/lib/api/branding', () => ({
  markSiteOnboardingComplete: markOnboardingCompleteMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

import { POST } from '@/app/api/v1/pm/site/publish/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/publish', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const VALID_BODY = {
  communityId: 42,
  expectedPublishedAt: '2026-05-01T10:00:00.000Z',
};

describe('POST /api/v1/pm/site/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'property_manager', communityId: 42 });
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    markOnboardingCompleteMock.mockResolvedValue(undefined);
  });

  it('200s and forwards the parsed expectedPublishedAt as a Date to publishCommunitySite', async () => {
    publishMock.mockResolvedValueOnce({
      published: true,
      publishedAt: new Date('2026-05-15T12:00:00.000Z'),
      promotedCount: 3,
      retiredCount: 5,
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(publishMock).toHaveBeenCalledTimes(1);
    const args = publishMock.mock.calls[0][0];
    expect(args.communityId).toBe(42);
    expect(args.actorUserId).toBe('user-1');
    expect(args.expectedPublishedAt).toBeInstanceOf(Date);
    expect((args.expectedPublishedAt as Date).toISOString()).toBe('2026-05-01T10:00:00.000Z');
  });

  it('passes expectedPublishedAt=null through unchanged for a first-ever publish', async () => {
    publishMock.mockResolvedValueOnce({
      published: true,
      publishedAt: new Date(),
      promotedCount: 1,
      retiredCount: 0,
    });
    const res = await POST(
      makeRequest({ communityId: 42, expectedPublishedAt: null }),
    );
    expect(res.status).toBe(200);
    expect(publishMock.mock.calls[0][0].expectedPublishedAt).toBeNull();
  });

  it('returns the service result body verbatim (published path)', async () => {
    publishMock.mockResolvedValueOnce({
      published: true,
      publishedAt: new Date('2026-05-15T12:00:00.000Z'),
      promotedCount: 3,
      retiredCount: 5,
    });
    const res = await POST(makeRequest(VALID_BODY));
    const json = await res.json();
    expect(json.data).toMatchObject({
      published: true,
      promotedCount: 3,
      retiredCount: 5,
    });
    expect(json.data.publishedAt).toBe('2026-05-15T12:00:00.000Z');
  });

  it('returns the nothing-to-publish result body verbatim', async () => {
    publishMock.mockResolvedValueOnce({
      published: false,
      reason: 'nothing-to-publish',
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ published: false, reason: 'nothing-to-publish' });
  });

  it('does NOT mark onboarding complete when the flag is absent (editor publish)', async () => {
    publishMock.mockResolvedValueOnce({
      published: true,
      publishedAt: new Date('2026-05-15T12:00:00.000Z'),
      promotedCount: 2,
      retiredCount: 1,
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(markOnboardingCompleteMock).not.toHaveBeenCalled();
  });

  it('marks onboarding complete when markOnboardingComplete=true (wizard publish)', async () => {
    publishMock.mockResolvedValueOnce({
      published: true,
      publishedAt: new Date('2026-05-15T12:00:00.000Z'),
      promotedCount: 4,
      retiredCount: 0,
    });
    const res = await POST(
      makeRequest({ ...VALID_BODY, markOnboardingComplete: true }),
    );
    expect(res.status).toBe(200);
    expect(markOnboardingCompleteMock).toHaveBeenCalledTimes(1);
    expect(markOnboardingCompleteMock).toHaveBeenCalledWith(42);
  });

  it('marks onboarding complete even when the publish was a no-op (wizard finished with no draft changes)', async () => {
    publishMock.mockResolvedValueOnce({
      published: false,
      reason: 'nothing-to-publish',
    });
    const res = await POST(
      makeRequest({ ...VALID_BODY, markOnboardingComplete: true }),
    );
    expect(res.status).toBe(200);
    expect(markOnboardingCompleteMock).toHaveBeenCalledTimes(1);
    expect(markOnboardingCompleteMock).toHaveBeenCalledWith(42);
  });

  it('does NOT mark onboarding complete when the publish errors (409 conflict)', async () => {
    publishMock.mockRejectedValueOnce(
      new ConflictError('Another editor published changes while you were working.'),
    );
    const res = await POST(
      makeRequest({ ...VALID_BODY, markOnboardingComplete: true }),
    );
    expect(res.status).toBe(409);
    expect(markOnboardingCompleteMock).not.toHaveBeenCalled();
  });

  it('400s when markOnboardingComplete is not a boolean', async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, markOnboardingComplete: 'yes' }),
    );
    expect(res.status).toBe(400);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('409s when the service throws ConflictError (optimistic-concurrency mismatch)', async () => {
    publishMock.mockRejectedValueOnce(
      new ConflictError('Another editor published changes while you were working.'),
    );
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error?.message).toMatch(/another editor published/i);
  });

  it('400s when communityId is missing', async () => {
    const { communityId: _ignored, ...body } = VALID_BODY;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('400s when communityId is not a positive integer', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, communityId: -1 }));
    expect(res.status).toBe(400);
  });

  it('400s when expectedPublishedAt is not ISO 8601', async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, expectedPublishedAt: 'last tuesday' }),
    );
    expect(res.status).toBe(400);
  });

  it('400s when expectedPublishedAt is missing entirely', async () => {
    const { expectedPublishedAt: _ignored, ...body } = VALID_BODY;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it('401s when unauthenticated (withErrorHandler maps to 401)', async () => {
    requireAuthMock.mockRejectedValueOnce(
      new AppError('Unauthorized', 401, 'UNAUTHORIZED'),
    );
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('403s when caller does not hold pm_admin or cam role', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'owner', communityId: 42 });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('allows CAM managers to publish', async () => {
    requireMembershipMock.mockResolvedValueOnce({
      role: 'property_manager',
      communityId: 42,
    });
    publishMock.mockResolvedValueOnce({
      published: true,
      publishedAt: new Date(),
      promotedCount: 1,
      retiredCount: 0,
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(publishMock).toHaveBeenCalled();
  });

  it('403s when plan does not include hasSiteEditor', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new AppError('This feature requires a higher plan.', 403, 'PLAN_UPGRADE_REQUIRED'),
    );
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it('403s when caller is not a member of the community', async () => {
    requireMembershipMock.mockRejectedValueOnce(
      new AppError('Not a member', 403, 'FORBIDDEN'),
    );
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    expect(publishMock).not.toHaveBeenCalled();
  });
});

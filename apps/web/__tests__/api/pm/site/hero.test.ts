import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/api/errors/AppError';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  upsertMock,
  requireAuthMock,
  requireMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePlanFeatureMock,
} = vi.hoisted(() => ({
  upsertMock: vi.fn().mockResolvedValue(undefined),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
}));

vi.mock('@/lib/services/site-blocks-service', () => ({
  upsertPublishedHero: upsertMock,
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

import { PATCH } from '@/app/api/v1/pm/site/hero/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/hero', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('PATCH /api/v1/pm/site/hero', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'pm_admin', communityId: 42 });
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    requirePlanFeatureMock.mockResolvedValue(undefined);
  });

  const VALID_BODY = {
    communityId: 42,
    headline: 'Welcome',
    subtitle: 'Hello.',
    ctaText: 'Login',
    ctaTarget: '/auth/login',
  };

  it('200s and calls upsertPublishedHero with the parsed hero content (sans communityId)', async () => {
    const res = await PATCH(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true } });
    expect(upsertMock).toHaveBeenCalledWith({
      communityId: 42,
      actorUserId: 'user-1',
      content: {
        headline: 'Welcome',
        subtitle: 'Hello.',
        ctaText: 'Login',
        ctaTarget: '/auth/login',
      },
    });
  });

  it('400s when communityId is missing', async () => {
    const { communityId: _, ...body } = VALID_BODY;
    const res = await PATCH(makeRequest(body));
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('400s when communityId is not a positive integer', async () => {
    const res = await PATCH(makeRequest({ ...VALID_BODY, communityId: -1 }));
    expect(res.status).toBe(400);
  });

  it('400s when hero content is invalid (missing headline)', async () => {
    const { headline: _, ...body } = VALID_BODY;
    const res = await PATCH(makeRequest(body));
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('400s on protocol-relative ctaTarget (Task 1 fix carries through)', async () => {
    const res = await PATCH(makeRequest({ ...VALID_BODY, ctaTarget: '//evil.com' }));
    expect(res.status).toBe(400);
  });

  it('401s when unauthenticated (withErrorHandler maps to 401)', async () => {
    requireAuthMock.mockRejectedValueOnce(
      new AppError('Unauthorized', 401, 'UNAUTHORIZED'),
    );
    const res = await PATCH(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('403s when caller does not hold pm_admin role', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'owner', communityId: 42 });
    const res = await PATCH(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('403s when plan does not include hasSiteEditor', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new AppError('This feature requires a higher plan.', 403, 'PLAN_UPGRADE_REQUIRED'),
    );
    const res = await PATCH(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });
});

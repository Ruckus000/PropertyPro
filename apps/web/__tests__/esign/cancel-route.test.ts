/**
 * Route unit tests — `POST /api/v1/esign/submissions/[id]/cancel`.
 *
 * Added alongside Plan A1 drain #72. Covers the contracted `runRoute`
 * envelope with the **dual `communityId` source** (body wins, query falls
 * back) and the **empty-body tolerance** preserved by making the body
 * schema fully optional.
 *
 * Test cases:
 *   - happy path with `communityId` in body
 *   - happy path with `communityId` in query (body omits it)
 *   - x-request-id forwarded; null fallback when header is absent
 *   - 401 unauthenticated
 *   - 400 VALIDATION_ERROR — params.id = '0'
 *   - 400 VALIDATION_ERROR — params.id non-numeric
 *   - 403 demo grace
 *   - 403 non-member
 *   - 403 esign-write-permission denied
 *   - 403 plan-feature gate
 *
 * NOTE: pre-existing `esign-route.test.ts` retains its single happy-path
 * cancel test (body-sourced communityId). This file adds the auth-chain
 * rejection paths + the query-sourced communityId branch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireEsignWritePermissionMock,
  assertNotDemoGraceMock,
  requirePlanFeatureMock,
  cancelSubmissionMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireEsignWritePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  cancelSubmissionMock: vi.fn(),
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

vi.mock('@/lib/esign/esign-route-helpers', () => ({
  requireEsignWritePermission: requireEsignWritePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

vi.mock('@/lib/services/esign-service', () => ({
  cancelSubmission: cancelSubmissionMock,
}));

import { POST } from '../../src/app/api/v1/esign/submissions/[id]/cancel/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

function postReq(
  id: string | number,
  opts: {
    body?: unknown;
    query?: string;
    headers?: Record<string, string>;
  } = {},
): NextRequest {
  const url =
    `http://localhost:3000/api/v1/esign/submissions/${id}/cancel` +
    (opts.query ? `?${opts.query}` : '');
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
  };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }
  return new NextRequest(url, init);
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/v1/esign/submissions/[id]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireEsignWritePermissionMock.mockResolvedValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    cancelSubmissionMock.mockResolvedValue(undefined);
  });

  it('cancels a submission using communityId from the body and returns { success: true }', async () => {
    const res = await POST(
      postReq(12, { body: { communityId: 42 }, headers: { 'x-request-id': 'req-abc' } }),
      routeCtx('12'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { success: true } };
    expect(json.data).toEqual({ success: true });
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.anything(), 42);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requireEsignWritePermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasEsign');
    expect(cancelSubmissionMock).toHaveBeenCalledWith(42, 'user-admin-1', 12, 'req-abc');
  });

  it('falls back to communityId from the query when the body omits it', async () => {
    const res = await POST(
      postReq(12, { body: {}, query: 'communityId=42' }),
      routeCtx('12'),
    );

    expect(res.status).toBe(200);
    // body.communityId is undefined → query.communityId (42) used
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.anything(), 42);
    expect(cancelSubmissionMock).toHaveBeenCalledWith(42, 'user-admin-1', 12, null);
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await POST(
      postReq(12, { body: { communityId: 42 } }),
      routeCtx('12'),
    );

    expect(res.status).toBe(200);
    const call = cancelSubmissionMock.mock.calls[0];
    expect(call[3]).toBeNull();
  });

  it('returns 401 when unauthenticated; downstream gates not called', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(
      postReq(12, { body: { communityId: 42 } }),
      routeCtx('12'),
    );

    expect(res.status).toBe(401);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(cancelSubmissionMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(
      postReq('0', { body: { communityId: 42 } }),
      routeCtx('0'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(cancelSubmissionMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(
      postReq('abc', { body: { communityId: 42 } }),
      routeCtx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cancelSubmissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window; downstream gates not called', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(
      postReq(12, { body: { communityId: 42 } }),
      routeCtx('12'),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireEsignWritePermissionMock).not.toHaveBeenCalled();
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(cancelSubmissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(
      postReq(12, { body: { communityId: 42 } }),
      routeCtx('12'),
    );

    expect(res.status).toBe(403);
    expect(requireEsignWritePermissionMock).not.toHaveBeenCalled();
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(cancelSubmissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when esign write permission is denied; plan gate not called', async () => {
    requireEsignWritePermissionMock.mockRejectedValueOnce(
      new ForbiddenError('E-Sign write permission required'),
    );

    const res = await POST(
      postReq(12, { body: { communityId: 42 } }),
      routeCtx('12'),
    );

    expect(res.status).toBe(403);
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(cancelSubmissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the plan feature gate denies hasEsign', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new ForbiddenError('E-Sign not included in current plan'),
    );

    const res = await POST(
      postReq(12, { body: { communityId: 42 } }),
      routeCtx('12'),
    );

    expect(res.status).toBe(403);
    expect(cancelSubmissionMock).not.toHaveBeenCalled();
  });
});

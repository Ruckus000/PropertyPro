/**
 * Route unit tests — `POST /api/v1/esign/templates/[id]/clone`.
 *
 * Added alongside Plan A1 drain #79. Covers the contracted `runRoute`
 * envelope; mirrors drain #72 (esign/submissions/[id]/cancel) auth chain.
 *
 * Test cases:
 *   - happy path → service called with (communityId, userId, id, name, requestId)
 *   - 401 unauthenticated
 *   - 400 VALIDATION_ERROR — params.id non-numeric
 *   - 400 VALIDATION_ERROR — params.id zero
 *   - 400 VALIDATION_ERROR — body missing communityId
 *   - 400 VALIDATION_ERROR — body missing name
 *   - 400 VALIDATION_ERROR — name empty after trim
 *   - 400 VALIDATION_ERROR — name > 200 chars
 *   - 403 demo grace
 *   - 403 non-member
 *   - 403 esign-write-permission denied
 *   - 403 plan-feature gate
 *   - x-request-id null forwarding at service arg index [4]
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
  cloneTemplateMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireEsignWritePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  cloneTemplateMock: vi.fn(),
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
  cloneTemplate: cloneTemplateMock,
}));

import { POST } from '../../src/app/api/v1/esign/templates/[id]/clone/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

const CLONED_TEMPLATE = {
  id: 999,
  communityId: 42,
  name: 'Copy of Lease',
  status: 'draft',
};

function postReq(
  id: string | number,
  opts: {
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): NextRequest {
  const url = `http://localhost:3000/api/v1/esign/templates/${id}/clone`;
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

describe('POST /api/v1/esign/templates/[id]/clone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireEsignWritePermissionMock.mockResolvedValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    cloneTemplateMock.mockResolvedValue(CLONED_TEMPLATE);
  });

  it('clones a template and returns { data: T } with correct service args', async () => {
    const res = await POST(
      postReq(12, {
        body: { communityId: 42, name: 'Copy of Lease' },
        headers: { 'x-request-id': 'req-abc' },
      }),
      routeCtx('12'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: typeof CLONED_TEMPLATE };
    expect(json.data).toEqual(CLONED_TEMPLATE);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.anything(), 42);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requireEsignWritePermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasEsign');
    expect(cloneTemplateMock).toHaveBeenCalledWith(42, 'user-admin-1', 12, 'Copy of Lease', 'req-abc');
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await POST(
      postReq(12, { body: { communityId: 42, name: 'Copy of Lease' } }),
      routeCtx('12'),
    );

    expect(res.status).toBe(200);
    const call = cloneTemplateMock.mock.calls[0];
    expect(call[4]).toBeNull();
  });

  it('returns 401 when unauthenticated; downstream gates not called', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(
      postReq(12, { body: { communityId: 42, name: 'Copy of Lease' } }),
      routeCtx('12'),
    );

    expect(res.status).toBe(401);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(cloneTemplateMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(
      postReq('abc', { body: { communityId: 42, name: 'Copy of Lease' } }),
      routeCtx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cloneTemplateMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(
      postReq('0', { body: { communityId: 42, name: 'Copy of Lease' } }),
      routeCtx('0'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cloneTemplateMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await POST(
      postReq(12, { body: { name: 'Copy of Lease' } }),
      routeCtx('12'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cloneTemplateMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing name', async () => {
    const res = await POST(
      postReq(12, { body: { communityId: 42 } }),
      routeCtx('12'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cloneTemplateMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when name is empty after trim', async () => {
    const res = await POST(
      postReq(12, { body: { communityId: 42, name: '   ' } }),
      routeCtx('12'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cloneTemplateMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when name exceeds 200 characters', async () => {
    const res = await POST(
      postReq(12, { body: { communityId: 42, name: 'x'.repeat(201) } }),
      routeCtx('12'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(cloneTemplateMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window; downstream gates not called', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(
      postReq(12, { body: { communityId: 42, name: 'Copy of Lease' } }),
      routeCtx('12'),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireEsignWritePermissionMock).not.toHaveBeenCalled();
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(cloneTemplateMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(
      postReq(12, { body: { communityId: 42, name: 'Copy of Lease' } }),
      routeCtx('12'),
    );

    expect(res.status).toBe(403);
    expect(requireEsignWritePermissionMock).not.toHaveBeenCalled();
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(cloneTemplateMock).not.toHaveBeenCalled();
  });

  it('returns 403 when esign write permission is denied; plan gate not called', async () => {
    requireEsignWritePermissionMock.mockRejectedValueOnce(
      new ForbiddenError('E-Sign write permission required'),
    );

    const res = await POST(
      postReq(12, { body: { communityId: 42, name: 'Copy of Lease' } }),
      routeCtx('12'),
    );

    expect(res.status).toBe(403);
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(cloneTemplateMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the plan feature gate denies hasEsign', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new ForbiddenError('E-Sign not included in current plan'),
    );

    const res = await POST(
      postReq(12, { body: { communityId: 42, name: 'Copy of Lease' } }),
      routeCtx('12'),
    );

    expect(res.status).toBe(403);
    expect(cloneTemplateMock).not.toHaveBeenCalled();
  });
});

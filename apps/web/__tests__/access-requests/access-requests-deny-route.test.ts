/**
 * Route unit tests — `POST /api/v1/access-requests/[id]/deny`.
 *
 * Added alongside Plan A1 drain #40. The pre-existing `route.test.ts` in
 * this directory covers the deny route under the legacy hand-rolled
 * handler; this file covers the post-migration `runRoute(contract, handler)`
 * shape, including the runner's canonical `VALIDATION_ERROR` envelope for
 * 400 paths.
 *
 * Mirrors drain #39 (`approve`) test layout. Auth chain under test:
 *   requireAuthenticatedUserId → resolveEffectiveCommunityId(req, null)
 *   → assertNotDemoGrace → requireCommunityMembership
 *   → requirePermission('residents', 'write') → denyAccessRequest.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  resolveEffectiveCommunityIdMock,
  assertNotDemoGraceMock,
  denyAccessRequestMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  denyAccessRequestMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/access-request-service', () => ({
  denyAccessRequest: denyAccessRequestMock,
}));

// Prevent DATABASE_URL eager load from @propertypro/db/unsafe transitive deps.
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

import { POST } from '../../src/app/api/v1/access-requests/[id]/deny/route';

const ADMIN_MEMBERSHIP = {
  userId: 'admin-1',
  communityId: 1,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

interface DataEnvelope {
  data: unknown;
}

function ctx(id: string): { params: Promise<Record<string, string>> } {
  return { params: Promise.resolve({ id }) };
}

function jsonPost(payload: unknown, id = '42'): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/access-requests/${id}/deny`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/v1/access-requests/[id]/deny', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('admin-1');
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    resolveEffectiveCommunityIdMock.mockReturnValue(1);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    denyAccessRequestMock.mockResolvedValue(undefined);
  });

  it('returns 200 with {success:true} on happy path with reason', async () => {
    const res = await POST(jsonPost({ reason: 'duplicate' }, '42'), ctx('42'));

    expect(res.status).toBe(200);
    const json = (await res.json()) as DataEnvelope;
    expect(json).toEqual({ data: { success: true } });
    expect(denyAccessRequestMock).toHaveBeenCalledWith({
      requestId: 42,
      communityId: 1,
      reviewerId: 'admin-1',
      reason: 'duplicate',
    });
  });

  it('returns 200 with reason undefined when body is empty object', async () => {
    const res = await POST(jsonPost({}, '7'), ctx('7'));

    expect(res.status).toBe(200);
    expect(denyAccessRequestMock).toHaveBeenCalledWith({
      requestId: 7,
      communityId: 1,
      reviewerId: 'admin-1',
      reason: undefined,
    });
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(jsonPost({}, '42'), ctx('42'));

    expect(res.status).toBe(401);
    expect(denyAccessRequestMock).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member'),
    );

    const res = await POST(jsonPost({}, '42'), ctx('42'));

    expect(res.status).toBe(403);
    expect(denyAccessRequestMock).not.toHaveBeenCalled();
  });

  it('returns 403 when community is in demo grace', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(
      new ForbiddenError('Demo grace period'),
    );

    const res = await POST(jsonPost({}, '42'), ctx('42'));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(denyAccessRequestMock).not.toHaveBeenCalled();
  });

  it('returns 403 when permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(jsonPost({}, '42'), ctx('42'));

    expect(res.status).toBe(403);
    expect(denyAccessRequestMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(jsonPost({}, 'abc'), ctx('abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(denyAccessRequestMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when reason exceeds 500 chars', async () => {
    const longReason = 'x'.repeat(501);
    const res = await POST(jsonPost({ reason: longReason }, '42'), ctx('42'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(denyAccessRequestMock).not.toHaveBeenCalled();
  });
});

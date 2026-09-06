/**
 * Route unit tests — `POST /api/v1/violations/[id]/resolve`.
 *
 * Added alongside Plan A1 drain #52. Covers the contracted runRoute envelope:
 * happy paths (with notes / without notes / HTML sanitization), 401 unauth,
 * 400 invalid params.id / missing-communityId / oversized resolutionNotes,
 * 403 demo-grace, 403 non-member, 403 violations-disabled, 403 permission,
 * 403 admin-write gate, and x-request-id null forwarding.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireViolationsEnabledMock,
  requireViolationAdminWriteMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  resolveViolationForCommunityMock,
  sanitizeHtmlMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireViolationsEnabledMock: vi.fn(),
  requireViolationAdminWriteMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  resolveViolationForCommunityMock: vi.fn(),
  sanitizeHtmlMock: vi.fn(),
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

vi.mock('@/lib/violations/common', () => ({
  requireViolationFinesEnabled: vi.fn(),
  requireNoticePdfEnabled: vi.fn(),
  requireViolationsEnabled: requireViolationsEnabledMock,
  requireViolationAdminWrite: requireViolationAdminWriteMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/services/violations-service', () => ({
  resolveViolationForCommunity: resolveViolationForCommunityMock,
}));

vi.mock('@/lib/utils/html-sanitizer', () => ({
  sanitizeHtml: sanitizeHtmlMock,
}));

import { POST } from '../../src/app/api/v1/violations/[id]/resolve/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const VIOLATION_RESULT = {
  id: 99,
  communityId: 42,
  status: 'resolved' as const,
  resolvedAt: new Date('2026-01-01T00:00:00Z'),
};

function jsonPost(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/violations/${id}/resolve`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    },
  );
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/v1/violations/[id]/resolve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireViolationsEnabledMock.mockResolvedValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    requireViolationAdminWriteMock.mockReturnValue(undefined);
    sanitizeHtmlMock.mockImplementation((input: string) => `sanitized:${input}`);
    resolveViolationForCommunityMock.mockResolvedValue(VIOLATION_RESULT);
  });

  it('resolves a violation with resolutionNotes (sanitized notes forwarded to service)', async () => {
    const res = await POST(
      jsonPost(
        99,
        { communityId: 42, resolutionNotes: 'all fixed' },
        { 'x-request-id': 'req-abc' },
      ),
      routeCtx('99'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; status: string } };
    expect(json.data.id).toBe(99);
    expect(json.data.status).toBe('resolved');
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requireViolationsEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      ADMIN_MEMBERSHIP,
      'violations',
      'write',
    );
    expect(requireViolationAdminWriteMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(sanitizeHtmlMock).toHaveBeenCalledWith('all fixed');
    expect(resolveViolationForCommunityMock).toHaveBeenCalledWith(
      42,
      99,
      'user-admin-1',
      'sanitized:all fixed',
      'req-abc',
    );
  });

  it('resolves a violation without resolutionNotes (null forwarded to service)', async () => {
    const res = await POST(jsonPost(99, { communityId: 42 }), routeCtx('99'));

    expect(res.status).toBe(200);
    expect(sanitizeHtmlMock).not.toHaveBeenCalled();
    expect(resolveViolationForCommunityMock).toHaveBeenCalledWith(
      42,
      99,
      'user-admin-1',
      null,
      null,
    );
  });

  it('sanitizes HTML in resolutionNotes before calling the service', async () => {
    const dirty = '<script>alert(1)</script>safe';
    const res = await POST(
      jsonPost(99, { communityId: 42, resolutionNotes: dirty }),
      routeCtx('99'),
    );

    expect(res.status).toBe(200);
    expect(sanitizeHtmlMock).toHaveBeenCalledWith(dirty);
    expect(resolveViolationForCommunityMock).toHaveBeenCalledWith(
      42,
      99,
      'user-admin-1',
      `sanitized:${dirty}`,
      null,
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(jsonPost(99, { communityId: 42 }), routeCtx('99'));

    expect(res.status).toBe(401);
    expect(resolveViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(
      jsonPost('abc', { communityId: 42 }),
      routeCtx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(resolveViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(jsonPost('0', { communityId: 42 }), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(resolveViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await POST(jsonPost(99, {}), routeCtx('99'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(resolveViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when resolutionNotes exceeds 4000 chars', async () => {
    const tooLong = 'x'.repeat(4001);
    const res = await POST(
      jsonPost(99, { communityId: 42, resolutionNotes: tooLong }),
      routeCtx('99'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(resolveViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/permission checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(jsonPost(99, { communityId: 42 }), routeCtx('99'));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(resolveViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(jsonPost(99, { communityId: 42 }), routeCtx('99'));

    expect(res.status).toBe(403);
    expect(requireViolationsEnabledMock).not.toHaveBeenCalled();
    expect(resolveViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when violations are disabled for the community', async () => {
    requireViolationsEnabledMock.mockRejectedValueOnce(
      new ForbiddenError('Violations not enabled'),
    );

    const res = await POST(jsonPost(99, { communityId: 42 }), routeCtx('99'));

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(resolveViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when violations.write permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(jsonPost(99, { communityId: 42 }), routeCtx('99'));

    expect(res.status).toBe(403);
    expect(requireViolationAdminWriteMock).not.toHaveBeenCalled();
    expect(resolveViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a violations admin (requireViolationAdminWrite throws)', async () => {
    requireViolationAdminWriteMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Only violation administrators can perform this action');
    });

    const res = await POST(jsonPost(99, { communityId: 42 }), routeCtx('99'));

    expect(res.status).toBe(403);
    expect(resolveViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await POST(
      jsonPost(99, { communityId: 42, resolutionNotes: 'note' }),
      routeCtx('99'),
    );

    expect(res.status).toBe(200);
    const call = resolveViolationForCommunityMock.mock.calls[0]!;
    expect(call[4]).toBeNull();
  });
});

/**
 * Route unit tests — `POST /api/v1/arc/[id]/decide`.
 *
 * Added alongside Plan A1 drain #51. Covers the contracted runRoute envelope:
 * happy approved-with-notes / denied-without-notes (?? null coercion) paths,
 * 401 unauth, 400 invalid params.id (non-numeric / zero), 400 missing
 * communityId / invalid decision enum / reviewNotes > 4000, 403 demo-grace,
 * 403 non-member, 403 arc-disabled, 403 read-permission, 403 write-permission,
 * 403 arc-review-permission, and x-request-id null forwarding.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireArcEnabledMock,
  requireArcReviewPermissionMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  decideArcSubmissionForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireArcEnabledMock: vi.fn(),
  requireArcReviewPermissionMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  decideArcSubmissionForCommunityMock: vi.fn(),
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
  requireArcEnabled: requireArcEnabledMock,
  requireArcReviewPermission: requireArcReviewPermissionMock,
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
  decideArcSubmissionForCommunity: decideArcSubmissionForCommunityMock,
}));

import { POST } from '../../src/app/api/v1/arc/[id]/decide/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const DECIDE_RESULT = {
  id: 99,
  status: 'approved',
  decidedAt: new Date('2026-01-01T00:00:00Z'),
};

function jsonPost(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/arc/${id}/decide`,
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

describe('POST /api/v1/arc/[id]/decide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireArcEnabledMock.mockResolvedValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    requireArcReviewPermissionMock.mockReturnValue(undefined);
    decideArcSubmissionForCommunityMock.mockResolvedValue(DECIDE_RESULT);
  });

  it('records an approved decision with reviewNotes (happy path)', async () => {
    const res = await POST(
      jsonPost(
        7,
        { communityId: 42, decision: 'approved', reviewNotes: 'Looks great.' },
        { 'x-request-id': 'req-abc' },
      ),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; status: string } };
    expect(json.data.id).toBe(99);
    expect(json.data.status).toBe('approved');
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requireArcEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requirePermissionMock).toHaveBeenNthCalledWith(
      1,
      ADMIN_MEMBERSHIP,
      'arc_submissions',
      'read',
    );
    expect(requirePermissionMock).toHaveBeenNthCalledWith(
      2,
      ADMIN_MEMBERSHIP,
      'arc_submissions',
      'write',
    );
    expect(requireArcReviewPermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(decideArcSubmissionForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin-1',
      {
        decision: 'approved',
        reviewNotes: 'Looks great.',
      },
      'req-abc',
    );
  });

  it('records a denied decision without reviewNotes (?? null coercion)', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, decision: 'denied' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    expect(decideArcSubmissionForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin-1',
      {
        decision: 'denied',
        reviewNotes: null,
      },
      null,
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(
      jsonPost(7, { communityId: 42, decision: 'approved' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(401);
    expect(decideArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(
      jsonPost('abc', { communityId: 42, decision: 'approved' }),
      routeCtx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(decideArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(
      jsonPost('0', { communityId: 42, decision: 'approved' }),
      routeCtx('0'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(decideArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await POST(
      jsonPost(7, { decision: 'approved' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(decideArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when decision is not in the enum', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, decision: 'maybe' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(decideArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when reviewNotes exceeds 4000 chars', async () => {
    const tooLong = 'x'.repeat(4001);
    const res = await POST(
      jsonPost(7, { communityId: 42, decision: 'approved', reviewNotes: tooLong }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(decideArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/permission checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(
      jsonPost(7, { communityId: 42, decision: 'approved' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(decideArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(
      jsonPost(7, { communityId: 42, decision: 'approved' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireArcEnabledMock).not.toHaveBeenCalled();
    expect(decideArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when ARC is disabled for the community', async () => {
    requireArcEnabledMock.mockRejectedValueOnce(new ForbiddenError('ARC not enabled'));

    const res = await POST(
      jsonPost(7, { communityId: 42, decision: 'approved' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(decideArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when arc_submissions.read permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(
      jsonPost(7, { communityId: 42, decision: 'approved' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requirePermissionMock).toHaveBeenCalledTimes(1);
    expect(requireArcReviewPermissionMock).not.toHaveBeenCalled();
    expect(decideArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when arc_submissions.write permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => undefined);
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(
      jsonPost(7, { communityId: 42, decision: 'approved' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requirePermissionMock).toHaveBeenCalledTimes(2);
    expect(requireArcReviewPermissionMock).not.toHaveBeenCalled();
    expect(decideArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when ARC review permission is denied', async () => {
    requireArcReviewPermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Not authorized to review ARC submissions');
    });

    const res = await POST(
      jsonPost(7, { communityId: 42, decision: 'approved' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(decideArcSubmissionForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, decision: 'approved' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const call = decideArcSubmissionForCommunityMock.mock.calls[0];
    expect(call[4]).toBeNull();
  });
});

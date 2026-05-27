/**
 * Route unit tests — `POST /api/v1/violations/[id]/fine`.
 *
 * Added alongside Plan A1 drain #77. Covers the contracted runRoute envelope:
 * happy paths (full body / required-only), 401 unauth, 400 params validation
 * (non-numeric / zero, separate cases), 400 body validation (missing
 * communityId / missing amountCents / amountCents=0 / invalid dueDate /
 * graceDays out-of-range / oversized notes), 403 demo-grace, 403 non-member,
 * 403 violations-disabled, 403 permission, 403 admin-write gate, and
 * x-request-id null forwarding.
 *
 * Mirrors `dismiss-route.test.ts` (drain #65) auth-chain assertions; differs
 * in the body shape and the positional service options object.
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
  imposeViolationFineForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireViolationsEnabledMock: vi.fn(),
  requireViolationAdminWriteMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  imposeViolationFineForCommunityMock: vi.fn(),
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
  requireViolationsEnabled: requireViolationsEnabledMock,
  requireViolationAdminWrite: requireViolationAdminWriteMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/violations-service', () => ({
  imposeViolationFineForCommunity: imposeViolationFineForCommunityMock,
}));

import { POST } from '../../src/app/api/v1/violations/[id]/fine/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const FINE_RESULT = {
  id: 99,
  communityId: 42,
  status: 'fined' as const,
  amountCents: 5000,
  dueDate: new Date('2026-02-01T00:00:00Z'),
};

function jsonPost(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/violations/${id}/fine`,
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

describe('POST /api/v1/violations/[id]/fine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireViolationsEnabledMock.mockResolvedValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    requireViolationAdminWriteMock.mockReturnValue(undefined);
    imposeViolationFineForCommunityMock.mockResolvedValue(FINE_RESULT);
  });

  it('imposes a fine with all optional fields populated', async () => {
    const res = await POST(
      jsonPost(
        99,
        {
          communityId: 42,
          amountCents: 5000,
          dueDate: '2026-02-01',
          graceDays: 10,
          notes: 'Late fee for repeated infractions',
        },
        { 'x-request-id': 'req-abc' },
      ),
      routeCtx('99'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; status: string } };
    expect(json.data.id).toBe(99);
    expect(json.data.status).toBe('fined');
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
    expect(imposeViolationFineForCommunityMock).toHaveBeenCalledWith(
      42,
      99,
      'user-admin-1',
      {
        amountCents: 5000,
        dueDate: '2026-02-01',
        graceDays: 10,
        notes: 'Late fee for repeated infractions',
      },
      'req-abc',
    );
  });

  it('imposes a fine with only required fields (notes coerced to null)', async () => {
    const res = await POST(
      jsonPost(99, { communityId: 42, amountCents: 2500 }),
      routeCtx('99'),
    );

    expect(res.status).toBe(200);
    expect(imposeViolationFineForCommunityMock).toHaveBeenCalledWith(
      42,
      99,
      'user-admin-1',
      {
        amountCents: 2500,
        dueDate: undefined,
        graceDays: undefined,
        notes: null,
      },
      null,
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(
      jsonPost(99, { communityId: 42, amountCents: 2500 }),
      routeCtx('99'),
    );

    expect(res.status).toBe(401);
    expect(imposeViolationFineForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(
      jsonPost('abc', { communityId: 42, amountCents: 2500 }),
      routeCtx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(imposeViolationFineForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(
      jsonPost('0', { communityId: 42, amountCents: 2500 }),
      routeCtx('0'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(imposeViolationFineForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await POST(
      jsonPost(99, { amountCents: 2500 }),
      routeCtx('99'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(imposeViolationFineForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing amountCents', async () => {
    const res = await POST(jsonPost(99, { communityId: 42 }), routeCtx('99'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(imposeViolationFineForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when amountCents is zero (fails .positive())', async () => {
    const res = await POST(
      jsonPost(99, { communityId: 42, amountCents: 0 }),
      routeCtx('99'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(imposeViolationFineForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when dueDate is not YYYY-MM-DD', async () => {
    const res = await POST(
      jsonPost(99, { communityId: 42, amountCents: 2500, dueDate: '02/01/2026' }),
      routeCtx('99'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(imposeViolationFineForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when graceDays = 0 (fails .min(1))', async () => {
    const res = await POST(
      jsonPost(99, { communityId: 42, amountCents: 2500, graceDays: 0 }),
      routeCtx('99'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(imposeViolationFineForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when graceDays > 120', async () => {
    const res = await POST(
      jsonPost(99, { communityId: 42, amountCents: 2500, graceDays: 121 }),
      routeCtx('99'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(imposeViolationFineForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when notes exceeds 1000 chars', async () => {
    const tooLong = 'x'.repeat(1001);
    const res = await POST(
      jsonPost(99, { communityId: 42, amountCents: 2500, notes: tooLong }),
      routeCtx('99'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(imposeViolationFineForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/permission checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(
      jsonPost(99, { communityId: 42, amountCents: 2500 }),
      routeCtx('99'),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(imposeViolationFineForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(
      jsonPost(99, { communityId: 42, amountCents: 2500 }),
      routeCtx('99'),
    );

    expect(res.status).toBe(403);
    expect(requireViolationsEnabledMock).not.toHaveBeenCalled();
    expect(imposeViolationFineForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when violations are disabled for the community', async () => {
    requireViolationsEnabledMock.mockRejectedValueOnce(
      new ForbiddenError('Violations not enabled'),
    );

    const res = await POST(
      jsonPost(99, { communityId: 42, amountCents: 2500 }),
      routeCtx('99'),
    );

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(imposeViolationFineForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when violations.write permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(
      jsonPost(99, { communityId: 42, amountCents: 2500 }),
      routeCtx('99'),
    );

    expect(res.status).toBe(403);
    expect(requireViolationAdminWriteMock).not.toHaveBeenCalled();
    expect(imposeViolationFineForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a violations admin (requireViolationAdminWrite throws)', async () => {
    requireViolationAdminWriteMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Only violation administrators can perform this action');
    });

    const res = await POST(
      jsonPost(99, { communityId: 42, amountCents: 2500 }),
      routeCtx('99'),
    );

    expect(res.status).toBe(403);
    expect(imposeViolationFineForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await POST(
      jsonPost(99, { communityId: 42, amountCents: 2500 }),
      routeCtx('99'),
    );

    expect(res.status).toBe(200);
    const call = imposeViolationFineForCommunityMock.mock.calls[0];
    expect(call[4]).toBeNull();
  });
});

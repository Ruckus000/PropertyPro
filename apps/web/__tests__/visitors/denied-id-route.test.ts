/**
 * Route unit tests — `PATCH` and `DELETE /api/v1/visitors/denied/[id]`.
 *
 * Plan A1 drain #122. Staff-operator denied-visitor update and soft-delete.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireVisitorLoggingEnabledMock,
  requireVisitorsWritePermissionMock,
  requireStaffOperatorMock,
  assertNotDemoGraceMock,
  updateDeniedVisitorMock,
  softDeleteDeniedVisitorMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireVisitorLoggingEnabledMock: vi.fn(),
  requireVisitorsWritePermissionMock: vi.fn(),
  requireStaffOperatorMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  updateDeniedVisitorMock: vi.fn(),
  softDeleteDeniedVisitorMock: vi.fn(),
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

vi.mock('@/lib/logistics/common', () => ({
  requireVisitorLoggingEnabled: requireVisitorLoggingEnabledMock,
  requireVisitorsWritePermission: requireVisitorsWritePermissionMock,
  requireStaffOperator: requireStaffOperatorMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/package-visitor-service', () => ({
  updateDeniedVisitor: updateDeniedVisitorMock,
  softDeleteDeniedVisitor: softDeleteDeniedVisitorMock,
}));

import { PATCH, DELETE } from '../../src/app/api/v1/visitors/denied/[id]/route';

const STAFF_MEMBERSHIP = {
  userId: 'user-staff-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

const DENIED_ROW = {
  id: 5,
  communityId: 42,
  fullName: 'Jane Smith',
  reason: 'Prior incident',
  deniedByUserId: 'user-staff-1',
  vehiclePlate: 'ABC123',
  isActive: true,
  notes: null,
  createdAt: new Date('2026-01-15T12:00:00Z'),
  updatedAt: new Date('2026-01-15T12:00:00Z'),
};

function jsonReq(
  method: 'PATCH' | 'DELETE',
  id: string | number,
  payload: unknown,
): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/visitors/denied/${id}`, {
    method,
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' },
  });
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/v1/visitors/denied/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-staff-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(STAFF_MEMBERSHIP);
    requireVisitorLoggingEnabledMock.mockResolvedValue(undefined);
    requireVisitorsWritePermissionMock.mockReturnValue(undefined);
    requireStaffOperatorMock.mockReturnValue(undefined);
    updateDeniedVisitorMock.mockResolvedValue(DENIED_ROW);
  });

  it('updates a denied visitor', async () => {
    const res = await PATCH(
      jsonReq('PATCH', 5, { communityId: 42, fullName: 'Updated Name' }),
      routeCtx('5'),
    );

    expect(res.status).toBe(200);
    expect(updateDeniedVisitorMock).toHaveBeenCalledWith(
      42,
      5,
      'user-staff-1',
      { fullName: 'Updated Name' },
      'req-1',
    );
  });

  it('returns 400 when no update fields provided', async () => {
    const res = await PATCH(
      jsonReq('PATCH', 5, { communityId: 42 }),
      routeCtx('5'),
    );

    expect(res.status).toBe(400);
    expect(updateDeniedVisitorMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await PATCH(
      jsonReq('PATCH', 5, { communityId: 42, reason: 'Updated' }),
      routeCtx('5'),
    );

    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/v1/visitors/denied/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-staff-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(STAFF_MEMBERSHIP);
    requireVisitorLoggingEnabledMock.mockResolvedValue(undefined);
    requireVisitorsWritePermissionMock.mockReturnValue(undefined);
    requireStaffOperatorMock.mockReturnValue(undefined);
    softDeleteDeniedVisitorMock.mockResolvedValue(undefined);
  });

  it('soft-deletes a denied visitor', async () => {
    const res = await DELETE(
      jsonReq('DELETE', 5, { communityId: 42 }),
      routeCtx('5'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { success: boolean } };
    expect(json.data.success).toBe(true);
    expect(softDeleteDeniedVisitorMock).toHaveBeenCalledWith(42, 5, 'user-staff-1', 'req-1');
  });

  it('returns 403 when staff operator gate fails', async () => {
    requireStaffOperatorMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Staff only');
    });

    const res = await DELETE(
      jsonReq('DELETE', 5, { communityId: 42 }),
      routeCtx('5'),
    );

    expect(res.status).toBe(403);
    expect(softDeleteDeniedVisitorMock).not.toHaveBeenCalled();
  });
});

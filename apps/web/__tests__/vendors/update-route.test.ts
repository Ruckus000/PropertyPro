/**
 * Route unit tests — `PATCH /api/v1/vendors/[id]`.
 *
 * Added alongside Plan A1 drain #74. Covers the contracted runRoute envelope:
 * happy path (full + partial), 401 unauth, 400 invalid params.id / params.id
 * zero / missing communityId / invalid email / specialties >50 items, 403
 * demo-grace, 403 non-member, 403 work-orders-feature-disabled, 403
 * requirePlanFeature gate, 403 write-permission, 403 admin-write gate, and
 * x-request-id null forwarding.
 *
 * Mirrors drain #63 (`work-orders/[id]/complete`) shape. Same `requirePlanFeature`
 * async plan-gate ordering: AFTER `requireWorkOrdersEnabled`, BEFORE
 * `requireWorkOrdersWritePermission`/`requireWorkOrderAdminWrite`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireWorkOrdersEnabledMock,
  requireWorkOrdersWritePermissionMock,
  requireWorkOrderAdminWriteMock,
  assertNotDemoGraceMock,
  requirePlanFeatureMock,
  updateVendorForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireWorkOrdersEnabledMock: vi.fn(),
  requireWorkOrdersWritePermissionMock: vi.fn(),
  requireWorkOrderAdminWriteMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  updateVendorForCommunityMock: vi.fn(),
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

vi.mock('@/lib/work-orders/common', () => ({
  requireWorkOrdersEnabled: requireWorkOrdersEnabledMock,
  requireWorkOrdersWritePermission: requireWorkOrdersWritePermissionMock,
  requireWorkOrderAdminWrite: requireWorkOrderAdminWriteMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

vi.mock('@/lib/services/work-orders-service', () => ({
  updateVendorForCommunity: updateVendorForCommunityMock,
}));

import { PATCH } from '../../src/app/api/v1/vendors/[id]/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

const UPDATE_RESULT = {
  id: 11,
  name: 'Acme Plumbing',
  company: 'Acme LLC',
  phone: '555-1234',
  email: 'ops@acme.example',
  specialties: ['plumbing'],
  isActive: true,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function jsonPatch(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/vendors/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    },
  );
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/v1/vendors/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireWorkOrdersEnabledMock.mockReturnValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    requireWorkOrdersWritePermissionMock.mockReturnValue(undefined);
    requireWorkOrderAdminWriteMock.mockReturnValue(undefined);
    updateVendorForCommunityMock.mockResolvedValue(UPDATE_RESULT);
  });

  it('updates a vendor with all fields (happy path)', async () => {
    const res = await PATCH(
      jsonPatch(
        11,
        {
          communityId: 42,
          name: 'Acme Plumbing',
          company: 'Acme LLC',
          phone: '555-1234',
          email: 'ops@acme.example',
          specialties: ['plumbing'],
          isActive: true,
        },
        { 'x-request-id': 'req-abc' },
      ),
      routeCtx('11'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; name: string } };
    expect(json.data.id).toBe(11);
    expect(json.data.name).toBe('Acme Plumbing');
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requireWorkOrdersEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasWorkOrders');
    expect(requireWorkOrdersWritePermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireWorkOrderAdminWriteMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(updateVendorForCommunityMock).toHaveBeenCalledWith(
      42,
      11,
      'user-admin-1',
      {
        name: 'Acme Plumbing',
        company: 'Acme LLC',
        phone: '555-1234',
        email: 'ops@acme.example',
        specialties: ['plumbing'],
        isActive: true,
      },
      'req-abc',
    );
  });

  it('updates a vendor with only name (partial body, other fields undefined)', async () => {
    const res = await PATCH(
      jsonPatch(11, { communityId: 42, name: 'Renamed' }),
      routeCtx('11'),
    );

    expect(res.status).toBe(200);
    expect(updateVendorForCommunityMock).toHaveBeenCalledWith(
      42,
      11,
      'user-admin-1',
      {
        name: 'Renamed',
        company: undefined,
        phone: undefined,
        email: undefined,
        specialties: undefined,
        isActive: undefined,
      },
      null,
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await PATCH(jsonPatch(11, { communityId: 42 }), routeCtx('11'));

    expect(res.status).toBe(401);
    expect(updateVendorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await PATCH(jsonPatch('abc', { communityId: 42 }), routeCtx('abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(updateVendorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await PATCH(jsonPatch('0', { communityId: 42 }), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(updateVendorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await PATCH(jsonPatch(11, {}), routeCtx('11'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(updateVendorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when email is invalid format', async () => {
    const res = await PATCH(
      jsonPatch(11, { communityId: 42, email: 'not-an-email' }),
      routeCtx('11'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(updateVendorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when specialties has more than 50 items', async () => {
    const specialties = Array.from({ length: 51 }, (_, i) => `s${i}`);
    const res = await PATCH(
      jsonPatch(11, { communityId: 42, specialties }),
      routeCtx('11'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(updateVendorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/permission checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await PATCH(jsonPatch(11, { communityId: 42 }), routeCtx('11'));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireWorkOrdersEnabledMock).not.toHaveBeenCalled();
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(updateVendorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await PATCH(jsonPatch(11, { communityId: 42 }), routeCtx('11'));

    expect(res.status).toBe(403);
    expect(requireWorkOrdersEnabledMock).not.toHaveBeenCalled();
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(updateVendorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when work orders are not enabled for the community', async () => {
    requireWorkOrdersEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Work orders are not enabled for this community or plan');
    });

    const res = await PATCH(jsonPatch(11, { communityId: 42 }), routeCtx('11'));

    expect(res.status).toBe(403);
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(requireWorkOrdersWritePermissionMock).not.toHaveBeenCalled();
    expect(updateVendorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requirePlanFeature rejects (plan does not include hasWorkOrders)', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new ForbiddenError('This feature requires the Pro plan or higher.'),
    );

    const res = await PATCH(jsonPatch(11, { communityId: 42 }), routeCtx('11'));

    expect(res.status).toBe(403);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasWorkOrders');
    expect(requireWorkOrdersWritePermissionMock).not.toHaveBeenCalled();
    expect(requireWorkOrderAdminWriteMock).not.toHaveBeenCalled();
    expect(updateVendorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when work_orders.write permission is denied', async () => {
    requireWorkOrdersWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await PATCH(jsonPatch(11, { communityId: 42 }), routeCtx('11'));

    expect(res.status).toBe(403);
    expect(requireWorkOrderAdminWriteMock).not.toHaveBeenCalled();
    expect(updateVendorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not a work order administrator', async () => {
    requireWorkOrderAdminWriteMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Only work order administrators can perform this action');
    });

    const res = await PATCH(jsonPatch(11, { communityId: 42 }), routeCtx('11'));

    expect(res.status).toBe(403);
    expect(updateVendorForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await PATCH(jsonPatch(11, { communityId: 42 }), routeCtx('11'));

    expect(res.status).toBe(200);
    const call = updateVendorForCommunityMock.mock.calls[0];
    expect(call[4]).toBeNull();
  });
});

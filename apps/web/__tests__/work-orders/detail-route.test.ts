/**
 * Route unit tests — `GET` and `PATCH /api/v1/work-orders/[id]`.
 *
 * Added alongside Plan A1 drain #119.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const SCOPED_SENTINEL = { __scoped: true };

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  parseCommunityIdFromQueryMock,
  parseCommunityIdFromBodyMock,
  requireWorkOrdersEnabledMock,
  requireWorkOrdersReadPermissionMock,
  requireWorkOrdersWritePermissionMock,
  requireWorkOrderAdminWriteMock,
  assertNotDemoGraceMock,
  requirePlanFeatureMock,
  isResidentRoleMock,
  getActorUnitIdsMock,
  createScopedClientMock,
  getWorkOrderForCommunityMock,
  updateWorkOrderForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  parseCommunityIdFromBodyMock: vi.fn(),
  requireWorkOrdersEnabledMock: vi.fn(),
  requireWorkOrdersReadPermissionMock: vi.fn(),
  requireWorkOrdersWritePermissionMock: vi.fn(),
  requireWorkOrderAdminWriteMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  isResidentRoleMock: vi.fn(),
  getActorUnitIdsMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  getWorkOrderForCommunityMock: vi.fn(),
  updateWorkOrderForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromQuery: parseCommunityIdFromQueryMock,
  parseCommunityIdFromBody: parseCommunityIdFromBodyMock,
}));

vi.mock('@/lib/work-orders/common', () => ({
  requireWorkOrdersEnabled: requireWorkOrdersEnabledMock,
  requireWorkOrdersReadPermission: requireWorkOrdersReadPermissionMock,
  requireWorkOrdersWritePermission: requireWorkOrdersWritePermissionMock,
  requireWorkOrderAdminWrite: requireWorkOrderAdminWriteMock,
  isResidentRole: isResidentRoleMock,
  getActorUnitIds: getActorUnitIdsMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
}));

vi.mock('@/lib/services/work-orders-service', () => ({
  getWorkOrderForCommunity: getWorkOrderForCommunityMock,
  updateWorkOrderForCommunity: updateWorkOrderForCommunityMock,
}));

import { GET, PATCH } from '../../src/app/api/v1/work-orders/[id]/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

const RESIDENT_MEMBERSHIP = {
  ...ADMIN_MEMBERSHIP,
  role: 'owner' as const,
  isAdmin: false,
  isUnitOwner: true,
};

const WORK_ORDER = {
  id: 7,
  communityId: 42,
  unitId: 101,
  title: 'Leaky faucet',
  status: 'created',
};

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonPatch(id: string | number, payload: unknown, headers?: Record<string, string>) {
  return new NextRequest(`http://localhost:3000/api/v1/work-orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('GET /api/v1/work-orders/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    parseCommunityIdFromQueryMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireWorkOrdersEnabledMock.mockReturnValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    requireWorkOrdersReadPermissionMock.mockReturnValue(undefined);
    isResidentRoleMock.mockReturnValue(false);
    getWorkOrderForCommunityMock.mockResolvedValue(WORK_ORDER);
  });

  it('returns work order wrapped in { data }', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/work-orders/7?communityId=42');
    const res = await GET(req, routeCtx('7'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ data: WORK_ORDER });
    expect(getWorkOrderForCommunityMock).toHaveBeenCalledWith(42, 7);
  });

  it('returns 401 for unauthenticated requests', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const req = new NextRequest('http://localhost:3000/api/v1/work-orders/7?communityId=42');

    const res = await GET(req, routeCtx('7'));
    expect(res.status).toBe(401);
    expect(getWorkOrderForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid params.id before service call', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/work-orders/0?communityId=42');

    const res = await GET(req, routeCtx('0'));
    expect(res.status).toBe(400);
    expect(getWorkOrderForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when resident views a work order for another unit', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce(RESIDENT_MEMBERSHIP);
    isResidentRoleMock.mockReturnValueOnce(true);
    createScopedClientMock.mockReturnValueOnce(SCOPED_SENTINEL);
    getActorUnitIdsMock.mockResolvedValueOnce([999]);
    getWorkOrderForCommunityMock.mockResolvedValueOnce({ ...WORK_ORDER, unitId: 101 });

    const req = new NextRequest('http://localhost:3000/api/v1/work-orders/7?communityId=42');
    const res = await GET(req, routeCtx('7'));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.message).toBe('You can only view work orders for your own unit');
  });

  it('returns 403 when requirePlanFeature rejects', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new ForbiddenError('This feature requires the Pro plan or higher.'),
    );
    const req = new NextRequest('http://localhost:3000/api/v1/work-orders/7?communityId=42');

    const res = await GET(req, routeCtx('7'));
    expect(res.status).toBe(403);
    expect(getWorkOrderForCommunityMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/work-orders/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    parseCommunityIdFromBodyMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireWorkOrdersEnabledMock.mockReturnValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    requireWorkOrdersWritePermissionMock.mockReturnValue(undefined);
    requireWorkOrderAdminWriteMock.mockReturnValue(undefined);
    updateWorkOrderForCommunityMock.mockResolvedValue({ ...WORK_ORDER, title: 'Updated title' });
  });

  it('updates a work order (happy path)', async () => {
    const res = await PATCH(
      jsonPatch(7, { communityId: 42, title: 'Updated title' }, { 'x-request-id': 'req-1' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.title).toBe('Updated title');
    expect(updateWorkOrderForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin-1',
      expect.objectContaining({ title: 'Updated title' }),
      'req-1',
    );
  });

  it('returns 401 when unauthenticated before empty-field guard', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await PATCH(jsonPatch(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(401);
    expect(updateWorkOrderForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 when no updatable fields are provided', async () => {
    const res = await PATCH(jsonPatch(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toBe('At least one field must be provided for update');
    expect(updateWorkOrderForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await PATCH(
      jsonPatch('0', { communityId: 42, title: 'Updated title' }),
      routeCtx('0'),
    );

    expect(res.status).toBe(400);
    expect(updateWorkOrderForCommunityMock).not.toHaveBeenCalled();
  });

  it('requires admin write when status is updated', async () => {
    const res = await PATCH(
      jsonPatch(7, { communityId: 42, status: 'in_progress' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    expect(requireWorkOrderAdminWriteMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
  });

  it('returns 403 when admin write is required but denied', async () => {
    requireWorkOrderAdminWriteMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Only work order administrators can perform this action');
    });

    const res = await PATCH(
      jsonPatch(7, { communityId: 42, status: 'in_progress' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(updateWorkOrderForCommunityMock).not.toHaveBeenCalled();
  });
});

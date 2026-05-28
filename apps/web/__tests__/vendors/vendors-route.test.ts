/**
 * Route unit tests — `GET` and `POST /api/v1/vendors`.
 *
 * Plan A1 drain #96. Covers paginated GET envelope, cursor/pageSize forwarding,
 * empty query-param normalization, POST happy path + null coalescing, auth
 * gates, and validation envelopes. Vendor fixtures use only `VendorRecord`
 * fields from work-orders-service.
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
  requireWorkOrdersReadPermissionMock,
  requireWorkOrdersWritePermissionMock,
  requireWorkOrderAdminWriteMock,
  assertNotDemoGraceMock,
  requirePlanFeatureMock,
  paginateVendorsForCommunityMock,
  createVendorForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireWorkOrdersEnabledMock: vi.fn(),
  requireWorkOrdersReadPermissionMock: vi.fn(),
  requireWorkOrdersWritePermissionMock: vi.fn(),
  requireWorkOrderAdminWriteMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  paginateVendorsForCommunityMock: vi.fn(),
  createVendorForCommunityMock: vi.fn(),
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
  requireWorkOrdersReadPermission: requireWorkOrdersReadPermissionMock,
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
  createVendorForCommunity: createVendorForCommunityMock,
  paginateVendorsForCommunity: paginateVendorsForCommunityMock,
}));

import { GET, POST } from '../../src/app/api/v1/vendors/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

const VENDOR_RECORD = {
  id: 1,
  communityId: 42,
  name: 'Acme Plumbing',
  company: 'Acme LLC',
  phone: '555-1234',
  email: 'ops@acme.example',
  specialties: ['plumbing'],
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function jsonPost(payload: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/vendors', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('GET /api/v1/vendors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireWorkOrdersEnabledMock.mockReturnValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    requireWorkOrdersReadPermissionMock.mockReturnValue(undefined);
    paginateVendorsForCommunityMock.mockResolvedValue({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });
  });

  it('returns the canonical paginated double-wrapped envelope', async () => {
    paginateVendorsForCommunityMock.mockResolvedValueOnce({
      data: [VENDOR_RECORD],
      pagination: { nextCursor: 'next', hasMore: true, pageSize: 1 },
    });

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/vendors?communityId=42&pageSize=1'),
    );
    const json = (await res.json()) as {
      data: {
        data: Array<{ id: number; name: string }>;
        pagination: { nextCursor: string | null; hasMore: boolean; pageSize: number };
      };
    };

    expect(res.status).toBe(200);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.anything(), 42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requireWorkOrdersEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasWorkOrders');
    expect(requireWorkOrdersReadPermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(paginateVendorsForCommunityMock).toHaveBeenCalledWith(42, {
      cursor: undefined,
      pageSize: 1,
    });
    expect(json.data.pagination).toEqual({ nextCursor: 'next', hasMore: true, pageSize: 1 });
    expect(json.data.data).toHaveLength(1);
    expect(json.data.data[0]).toMatchObject({
      id: 1,
      communityId: 42,
      name: 'Acme Plumbing',
      company: 'Acme LLC',
      isActive: true,
      specialties: ['plumbing'],
    });
  });

  it('forwards cursor and pageSize to paginateVendorsForCommunity', async () => {
    await GET(
      new NextRequest(
        'http://localhost:3000/api/v1/vendors?communityId=42&cursor=abc123&pageSize=2',
      ),
    );

    expect(paginateVendorsForCommunityMock).toHaveBeenCalledWith(42, {
      cursor: 'abc123',
      pageSize: 2,
    });
  });

  it('treats empty cursor and pageSize query params as missing', async () => {
    await GET(
      new NextRequest('http://localhost:3000/api/v1/vendors?communityId=42&cursor=&pageSize='),
    );

    expect(paginateVendorsForCommunityMock).toHaveBeenCalledWith(42, {
      cursor: undefined,
      pageSize: undefined,
    });
  });

  it('returns 400 VALIDATION_ERROR with Invalid query parameters when communityId is missing', async () => {
    const res = await GET(new NextRequest('http://localhost:3000/api/v1/vendors'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as {
      error: { code: string; message: string; details?: { fields: unknown[] } };
    };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.message).toBe('Invalid query parameters');
    expect(json.error.details?.fields?.length).toBeGreaterThan(0);
    expect(paginateVendorsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/vendors?communityId=42'),
    );

    expect(res.status).toBe(401);
    expect(paginateVendorsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when work orders are not enabled', async () => {
    requireWorkOrdersEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Work orders are not enabled for this community or plan');
    });

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/vendors?communityId=42'),
    );

    expect(res.status).toBe(403);
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    expect(paginateVendorsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requirePlanFeature rejects', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new ForbiddenError('This feature requires the Pro plan or higher.'),
    );

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/vendors?communityId=42'),
    );

    expect(res.status).toBe(403);
    expect(requireWorkOrdersReadPermissionMock).not.toHaveBeenCalled();
    expect(paginateVendorsForCommunityMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/vendors', () => {
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
    createVendorForCommunityMock.mockResolvedValue(VENDOR_RECORD);
  });

  it('creates a vendor with nullable fields coalesced to null (happy path)', async () => {
    const res = await POST(
      jsonPost(
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
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; name: string } };
    expect(json.data.id).toBe(1);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasWorkOrders');
    expect(requireWorkOrdersWritePermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireWorkOrderAdminWriteMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(createVendorForCommunityMock).toHaveBeenCalledWith(
      42,
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

  it('coalesces omitted company/phone/email to null', async () => {
    await POST(jsonPost({ communityId: 42, name: 'Solo Vendor' }));

    expect(createVendorForCommunityMock).toHaveBeenCalledWith(
      42,
      'user-admin-1',
      {
        name: 'Solo Vendor',
        company: null,
        phone: null,
        email: null,
        specialties: undefined,
        isActive: undefined,
      },
      null,
    );
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await POST(jsonPost({ name: 'No community' }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createVendorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when email is invalid', async () => {
    const res = await POST(
      jsonPost({ communityId: 42, name: 'Bad Email', email: 'not-an-email' }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createVendorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during demo grace before membership checks', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(jsonPost({ communityId: 42, name: 'Blocked' }));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(createVendorForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when work order admin write is denied', async () => {
    requireWorkOrderAdminWriteMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Only work order administrators can perform this action');
    });

    const res = await POST(jsonPost({ communityId: 42, name: 'Denied' }));

    expect(res.status).toBe(403);
    expect(createVendorForCommunityMock).not.toHaveBeenCalled();
  });
});

/**
 * Route unit tests — `GET` and `POST /api/v1/visitors/denied`.
 *
 * Added alongside Plan A1 drain #94. Covers contracted runRoute envelopes for
 * paginated list + create, including `active` tri-state parsing, empty-string
 * cursor/pageSize collapse, auth gates, and POST `?? null` coercion.
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
  requireVisitorsReadPermissionMock,
  requireVisitorsWritePermissionMock,
  requireStaffOperatorMock,
  assertNotDemoGraceMock,
  paginateDeniedVisitorsMock,
  createDeniedVisitorMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireVisitorLoggingEnabledMock: vi.fn(),
  requireVisitorsReadPermissionMock: vi.fn(),
  requireVisitorsWritePermissionMock: vi.fn(),
  requireStaffOperatorMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  paginateDeniedVisitorsMock: vi.fn(),
  createDeniedVisitorMock: vi.fn(),
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
  requireVisitorsReadPermission: requireVisitorsReadPermissionMock,
  requireVisitorsWritePermission: requireVisitorsWritePermissionMock,
  requireStaffOperator: requireStaffOperatorMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/package-visitor-service', () => ({
  paginateDeniedVisitors: paginateDeniedVisitorsMock,
  createDeniedVisitor: createDeniedVisitorMock,
}));

import { GET, POST } from '../../src/app/api/v1/visitors/denied/route';

const STAFF_MEMBERSHIP = {
  userId: 'user-staff-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

/** Fields from `DeniedVisitorRow` in package-visitor-service.ts only. */
const DENIED_ROW = {
  id: 1,
  communityId: 42,
  fullName: 'Jane Smith',
  reason: 'Prior incident',
  deniedByUserId: 'user-staff-1',
  vehiclePlate: 'ABC123',
  isActive: true,
  notes: 'Front desk note',
  createdAt: new Date('2026-01-15T12:00:00Z'),
  updatedAt: new Date('2026-01-15T12:00:00Z'),
};

const PAGINATION = { nextCursor: null, hasMore: false, pageSize: 50 };

function buildGetReq(qs: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/visitors/denied${qs}`, {
    method: 'GET',
  });
}

function jsonPost(payload: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/visitors/denied', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('GET /api/v1/visitors/denied', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-staff-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(STAFF_MEMBERSHIP);
    requireVisitorLoggingEnabledMock.mockResolvedValue(undefined);
    requireVisitorsReadPermissionMock.mockReturnValue(undefined);
    requireStaffOperatorMock.mockReturnValue(undefined);
    paginateDeniedVisitorsMock.mockResolvedValue({
      data: [DENIED_ROW],
      pagination: PAGINATION,
    });
  });

  it('returns paginated denied visitors (happy path)', async () => {
    const res = await GET(buildGetReq('?communityId=42'));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { data: typeof DENIED_ROW[]; pagination: typeof PAGINATION };
    };
    expect(json.data.data).toHaveLength(1);
    expect(json.data.pagination).toEqual(PAGINATION);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.anything(), 42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-staff-1');
    expect(requireVisitorLoggingEnabledMock).toHaveBeenCalledWith(STAFF_MEMBERSHIP);
    expect(requireVisitorsReadPermissionMock).toHaveBeenCalledWith(STAFF_MEMBERSHIP);
    expect(requireStaffOperatorMock).toHaveBeenCalledWith(STAFF_MEMBERSHIP);
    expect(paginateDeniedVisitorsMock).toHaveBeenCalledWith({
      communityId: 42,
      cursor: undefined,
      pageSize: undefined,
      onlyActive: undefined,
    });
  });

  it('passes onlyActive: true when ?active=true', async () => {
    paginateDeniedVisitorsMock.mockResolvedValueOnce({ data: [], pagination: PAGINATION });

    await GET(buildGetReq('?communityId=42&active=true'));

    expect(paginateDeniedVisitorsMock).toHaveBeenCalledWith(
      expect.objectContaining({ onlyActive: true }),
    );
  });

  it('passes onlyActive: false when ?active=false', async () => {
    paginateDeniedVisitorsMock.mockResolvedValueOnce({ data: [], pagination: PAGINATION });

    await GET(buildGetReq('?communityId=42&active=false'));

    expect(paginateDeniedVisitorsMock).toHaveBeenCalledWith(
      expect.objectContaining({ onlyActive: false }),
    );
  });

  it('treats unknown active values as absent (onlyActive undefined)', async () => {
    paginateDeniedVisitorsMock.mockResolvedValueOnce({ data: [], pagination: PAGINATION });

    await GET(buildGetReq('?communityId=42&active=garbage'));

    expect(paginateDeniedVisitorsMock).toHaveBeenCalledWith(
      expect.objectContaining({ onlyActive: undefined }),
    );
  });

  it('forwards cursor and pageSize to the service', async () => {
    paginateDeniedVisitorsMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: 'opaque-next', hasMore: true, pageSize: 25 },
    });

    const res = await GET(buildGetReq('?communityId=42&cursor=abc&pageSize=25'));
    const json = (await res.json()) as {
      data: { pagination: { nextCursor: string; hasMore: boolean; pageSize: number } };
    };

    expect(res.status).toBe(200);
    expect(paginateDeniedVisitorsMock).toHaveBeenCalledWith({
      communityId: 42,
      cursor: 'abc',
      pageSize: 25,
      onlyActive: undefined,
    });
    expect(json.data.pagination).toEqual({
      nextCursor: 'opaque-next',
      hasMore: true,
      pageSize: 25,
    });
  });

  it('treats empty-string ?cursor= and ?pageSize= as missing', async () => {
    paginateDeniedVisitorsMock.mockResolvedValueOnce({ data: [], pagination: PAGINATION });

    const res = await GET(buildGetReq('?communityId=42&cursor=&pageSize='));

    expect(res.status).toBe(200);
    expect(paginateDeniedVisitorsMock).toHaveBeenCalledWith({
      communityId: 42,
      cursor: undefined,
      pageSize: undefined,
      onlyActive: undefined,
    });
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(buildGetReq('?communityId=42'));

    expect(res.status).toBe(401);
    expect(paginateDeniedVisitorsMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when communityId is missing', async () => {
    const res = await GET(buildGetReq(''));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(paginateDeniedVisitorsMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when communityId is non-numeric', async () => {
    const res = await GET(buildGetReq('?communityId=abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(paginateDeniedVisitorsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await GET(buildGetReq('?communityId=42'));

    expect(res.status).toBe(403);
    expect(requireVisitorLoggingEnabledMock).not.toHaveBeenCalled();
    expect(paginateDeniedVisitorsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when visitor logging is disabled for the community', async () => {
    requireVisitorLoggingEnabledMock.mockRejectedValueOnce(
      new ForbiddenError('Visitor logging not enabled'),
    );

    const res = await GET(buildGetReq('?communityId=42'));

    expect(res.status).toBe(403);
    expect(requireVisitorsReadPermissionMock).not.toHaveBeenCalled();
    expect(paginateDeniedVisitorsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when visitors.read permission is denied', async () => {
    requireVisitorsReadPermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await GET(buildGetReq('?communityId=42'));

    expect(res.status).toBe(403);
    expect(requireStaffOperatorMock).not.toHaveBeenCalled();
    expect(paginateDeniedVisitorsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not a staff operator', async () => {
    requireStaffOperatorMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Staff operator required');
    });

    const res = await GET(buildGetReq('?communityId=42'));

    expect(res.status).toBe(403);
    expect(paginateDeniedVisitorsMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/visitors/denied', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-staff-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(STAFF_MEMBERSHIP);
    requireVisitorLoggingEnabledMock.mockResolvedValue(undefined);
    requireVisitorsWritePermissionMock.mockReturnValue(undefined);
    requireStaffOperatorMock.mockReturnValue(undefined);
    createDeniedVisitorMock.mockResolvedValue(DENIED_ROW);
  });

  it('creates a denied visitor entry (happy path)', async () => {
    const res = await POST(
      jsonPost(
        {
          communityId: 42,
          fullName: 'Jane Smith',
          reason: 'Prior incident',
          vehiclePlate: 'ABC123',
          notes: 'Front desk note',
        },
        { 'x-request-id': 'req-abc' },
      ),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; fullName: string } };
    expect(json.data.id).toBe(1);
    expect(json.data.fullName).toBe('Jane Smith');
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.anything(), 42);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-staff-1');
    expect(requireVisitorLoggingEnabledMock).toHaveBeenCalledWith(STAFF_MEMBERSHIP);
    expect(requireVisitorsWritePermissionMock).toHaveBeenCalledWith(STAFF_MEMBERSHIP);
    expect(requireStaffOperatorMock).toHaveBeenCalledWith(STAFF_MEMBERSHIP);
    expect(createDeniedVisitorMock).toHaveBeenCalledWith(
      42,
      'user-staff-1',
      {
        fullName: 'Jane Smith',
        reason: 'Prior incident',
        vehiclePlate: 'ABC123',
        notes: 'Front desk note',
      },
      'req-abc',
    );
  });

  it('coerces omitted vehiclePlate and notes to null', async () => {
    const res = await POST(
      jsonPost({
        communityId: 42,
        fullName: 'Jane Smith',
        reason: 'Prior incident',
      }),
    );

    expect(res.status).toBe(200);
    expect(createDeniedVisitorMock).toHaveBeenCalledWith(
      42,
      'user-staff-1',
      {
        fullName: 'Jane Smith',
        reason: 'Prior incident',
        vehiclePlate: null,
        notes: null,
      },
      null,
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(
      jsonPost({ communityId: 42, fullName: 'Jane Smith', reason: 'Prior incident' }),
    );

    expect(res.status).toBe(401);
    expect(createDeniedVisitorMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await POST(jsonPost({ fullName: 'Jane Smith', reason: 'Prior incident' }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createDeniedVisitorMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when fullName is empty', async () => {
    const res = await POST(
      jsonPost({ communityId: 42, fullName: '', reason: 'Prior incident' }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createDeniedVisitorMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(
      jsonPost({ communityId: 42, fullName: 'Jane Smith', reason: 'Prior incident' }),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(createDeniedVisitorMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(
      jsonPost({ communityId: 42, fullName: 'Jane Smith', reason: 'Prior incident' }),
    );

    expect(res.status).toBe(403);
    expect(requireVisitorLoggingEnabledMock).not.toHaveBeenCalled();
    expect(createDeniedVisitorMock).not.toHaveBeenCalled();
  });

  it('returns 403 when visitor logging is disabled for the community', async () => {
    requireVisitorLoggingEnabledMock.mockRejectedValueOnce(
      new ForbiddenError('Visitor logging not enabled'),
    );

    const res = await POST(
      jsonPost({ communityId: 42, fullName: 'Jane Smith', reason: 'Prior incident' }),
    );

    expect(res.status).toBe(403);
    expect(requireVisitorsWritePermissionMock).not.toHaveBeenCalled();
    expect(createDeniedVisitorMock).not.toHaveBeenCalled();
  });

  it('returns 403 when visitors.write permission is denied', async () => {
    requireVisitorsWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(
      jsonPost({ communityId: 42, fullName: 'Jane Smith', reason: 'Prior incident' }),
    );

    expect(res.status).toBe(403);
    expect(createDeniedVisitorMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not a staff operator', async () => {
    requireStaffOperatorMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Staff operator required');
    });

    const res = await POST(
      jsonPost({ communityId: 42, fullName: 'Jane Smith', reason: 'Prior incident' }),
    );

    expect(res.status).toBe(403);
    expect(createDeniedVisitorMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await POST(
      jsonPost({ communityId: 42, fullName: 'Jane Smith', reason: 'Prior incident' }),
    );

    expect(res.status).toBe(200);
    expect(createDeniedVisitorMock.mock.calls[0]![3]).toBeNull();
  });
});

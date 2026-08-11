/**
 * Route unit tests — `GET` and `PATCH /api/v1/violations/[id]`.
 *
 * Added alongside Plan A1 drain #120.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const SCOPED_SENTINEL = { __scoped: true };

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  parseCommunityIdFromQueryMock,
  parseCommunityIdFromBodyMock,
  requireViolationsEnabledMock,
  requirePermissionMock,
  requireViolationAdminWriteMock,
  isResidentRoleMock,
  getActorUnitIdsMock,
  createScopedClientMock,
  getViolationForCommunityMock,
  updateViolationForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  parseCommunityIdFromBodyMock: vi.fn(),
  requireViolationsEnabledMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  requireViolationAdminWriteMock: vi.fn(),
  isResidentRoleMock: vi.fn(),
  getActorUnitIdsMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  getViolationForCommunityMock: vi.fn(),
  updateViolationForCommunityMock: vi.fn(),
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

vi.mock('@/lib/violations/common', () => ({
  requireViolationsEnabled: requireViolationsEnabledMock,
  requireViolationAdminWrite: requireViolationAdminWriteMock,
  isResidentRole: isResidentRoleMock,
  getActorUnitIds: getActorUnitIdsMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
}));

vi.mock('@/lib/services/violations-service', () => ({
  getViolationForCommunity: getViolationForCommunityMock,
  updateViolationForCommunity: updateViolationForCommunityMock,
}));

import { GET, PATCH } from '../../src/app/api/v1/violations/[id]/route';

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

const VIOLATION = {
  id: 12,
  communityId: 42,
  unitId: 101,
  category: 'Parking',
  status: 'reported',
};

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonPatch(id: string | number, payload: unknown, headers?: Record<string, string>) {
  return new NextRequest(`http://localhost:3000/api/v1/violations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('GET /api/v1/violations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    parseCommunityIdFromQueryMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireViolationsEnabledMock.mockResolvedValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    isResidentRoleMock.mockReturnValue(false);
    getViolationForCommunityMock.mockResolvedValue(VIOLATION);
  });

  it('returns violation wrapped in { data } for admin callers', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/violations/12?communityId=42');
    const res = await GET(req, routeCtx('12'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ data: VIOLATION });
    expect(getViolationForCommunityMock).toHaveBeenCalledWith(42, 12, undefined);
  });

  it('passes resident unit ids to the service for resident callers', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce(RESIDENT_MEMBERSHIP);
    isResidentRoleMock.mockReturnValueOnce(true);
    createScopedClientMock.mockReturnValueOnce(SCOPED_SENTINEL);
    getActorUnitIdsMock.mockResolvedValueOnce([101, 102]);

    const req = new NextRequest('http://localhost:3000/api/v1/violations/12?communityId=42');
    const res = await GET(req, routeCtx('12'));

    expect(res.status).toBe(200);
    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(getViolationForCommunityMock).toHaveBeenCalledWith(42, 12, [101, 102]);
  });

  it('returns 401 for unauthenticated requests', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const req = new NextRequest('http://localhost:3000/api/v1/violations/12?communityId=42');

    const res = await GET(req, routeCtx('12'));
    expect(res.status).toBe(401);
    expect(getViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid params.id before service call', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/violations/0?communityId=42');

    const res = await GET(req, routeCtx('0'));
    expect(res.status).toBe(400);
    expect(getViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when violations read permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });
    const req = new NextRequest('http://localhost:3000/api/v1/violations/12?communityId=42');

    const res = await GET(req, routeCtx('12'));
    expect(res.status).toBe(403);
    expect(getViolationForCommunityMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/violations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    parseCommunityIdFromBodyMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireViolationsEnabledMock.mockResolvedValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    requireViolationAdminWriteMock.mockReturnValue(undefined);
    updateViolationForCommunityMock.mockResolvedValue({
      ...VIOLATION,
      status: 'noticed',
    });
  });

  it('updates a violation (happy path)', async () => {
    const res = await PATCH(
      jsonPatch(12, { communityId: 42, status: 'noticed' }, { 'x-request-id': 'req-1' }),
      routeCtx('12'),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('noticed');
    expect(updateViolationForCommunityMock).toHaveBeenCalledWith(
      42,
      12,
      'user-admin-1',
      expect.objectContaining({ status: 'noticed' }),
      'req-1',
    );
  });

  /**
   * #932 — `hearingDate` had NO server-side check of any kind before this. The
   * 14-day rule lived only as a `min` attribute on one date input, so any
   * caller that was not that form could schedule a hearing for tomorrow.
   */
  describe('hearing notice window', () => {
    const NOW = new Date('2026-04-01T12:00:00.000Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('saves a short-noticed hearing and returns a warning inside the payload', async () => {
      const res = await PATCH(
        jsonPatch(12, {
          communityId: 42,
          status: 'hearing_scheduled',
          hearingDate: '2026-04-06T00:00:00.000Z',
        }),
        routeCtx('12'),
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      // Saved, not rejected — warn, never block.
      expect(updateViolationForCommunityMock).toHaveBeenCalledWith(
        42,
        12,
        'user-admin-1',
        expect.objectContaining({ hearingDate: '2026-04-06T00:00:00.000Z' }),
        null,
      );
      // INSIDE `data`, not beside it: this route runs through `runRoute`, whose
      // single-wrap cannot carry a top-level sibling.
      expect(json.data.warnings).toHaveLength(1);
      expect(json.data.warnings[0].code).toBe('hearing_notice_window_missed');
      expect(json.data.warnings[0].message).toContain('14-day notice window');
      // The violation itself still round-trips unchanged.
      expect(json.data.status).toBe('noticed');
    });

    it('adds no warning for a hearing scheduled with full notice', async () => {
      const res = await PATCH(
        jsonPatch(12, {
          communityId: 42,
          status: 'hearing_scheduled',
          hearingDate: '2026-05-01T00:00:00.000Z',
        }),
        routeCtx('12'),
      );

      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data).not.toHaveProperty('warnings');
    });

    it('does not nag when an unrelated field is saved on an existing violation', async () => {
      // Keyed off the incoming `hearingDate`, not the stored one — otherwise
      // every later edit to an already-short-noticed violation would re-warn.
      const res = await PATCH(
        jsonPatch(12, { communityId: 42, resolutionNotes: 'Spoke with owner' }),
        routeCtx('12'),
      );

      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data).not.toHaveProperty('warnings');
    });
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await PATCH(jsonPatch(12, { communityId: 42, status: 'noticed' }), routeCtx('12'));

    expect(res.status).toBe(401);
    expect(updateViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await PATCH(
      jsonPatch('0', { communityId: 42, status: 'noticed' }),
      routeCtx('0'),
    );

    expect(res.status).toBe(400);
    expect(updateViolationForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when violation admin write is denied', async () => {
    requireViolationAdminWriteMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Only violation administrators can perform this action');
    });

    const res = await PATCH(
      jsonPatch(12, { communityId: 42, status: 'noticed' }),
      routeCtx('12'),
    );

    expect(res.status).toBe(403);
    expect(updateViolationForCommunityMock).not.toHaveBeenCalled();
  });
});

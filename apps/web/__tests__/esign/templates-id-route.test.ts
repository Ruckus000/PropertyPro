/**
 * Unit tests — `GET` / `PATCH` / `DELETE /api/v1/esign/templates/[id]` (A1 drain #132).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  parseCommunityIdFromQueryMock,
  parseCommunityIdFromBodyMock,
  requireEsignReadPermissionMock,
  requireEsignWritePermissionMock,
  assertNotDemoGraceMock,
  requirePlanFeatureMock,
  getTemplateMock,
  updateTemplateMock,
  archiveTemplateMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  parseCommunityIdFromBodyMock: vi.fn(),
  requireEsignReadPermissionMock: vi.fn(),
  requireEsignWritePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  getTemplateMock: vi.fn(),
  updateTemplateMock: vi.fn(),
  archiveTemplateMock: vi.fn(),
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

vi.mock('@/lib/esign/esign-route-helpers', () => ({
  requireEsignReadPermission: requireEsignReadPermissionMock,
  requireEsignWritePermission: requireEsignWritePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

vi.mock('@/lib/services/esign-service', () => ({
  getTemplate: getTemplateMock,
  updateTemplate: updateTemplateMock,
  archiveTemplate: archiveTemplateMock,
}));

import { DELETE, GET, PATCH } from '../../src/app/api/v1/esign/templates/[id]/route';

const MEMBERSHIP = {
  userId: 'user-staff',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'CAM',
  communityType: 'condo_718' as const,
};

const TEMPLATE = { id: 7, name: 'Lease', status: 'active' };

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('/api/v1/esign/templates/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-staff');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    parseCommunityIdFromQueryMock.mockReturnValue(42);
    parseCommunityIdFromBodyMock.mockReturnValue(42);
    requireEsignReadPermissionMock.mockResolvedValue(undefined);
    requireEsignWritePermissionMock.mockResolvedValue(undefined);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    getTemplateMock.mockResolvedValue(TEMPLATE);
    updateTemplateMock.mockResolvedValue(TEMPLATE);
    archiveTemplateMock.mockResolvedValue(undefined);
  });

  describe('GET', () => {
    it('returns template wrapped in { data }', async () => {
      const res = await GET(
        new NextRequest('http://localhost:3000/api/v1/esign/templates/7?communityId=42'),
        routeCtx('7'),
      );

      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: typeof TEMPLATE };
      expect(json.data).toEqual(TEMPLATE);
      expect(getTemplateMock).toHaveBeenCalledWith(42, 7);
      expect(requireEsignReadPermissionMock).toHaveBeenCalledWith(MEMBERSHIP);
    });

    it('returns 400 for invalid id', async () => {
      const res = await GET(
        new NextRequest('http://localhost:3000/api/v1/esign/templates/abc?communityId=42'),
        routeCtx('abc'),
      );

      expect(res.status).toBe(400);
      expect(getTemplateMock).not.toHaveBeenCalled();
    });

    it('returns 401 when unauthenticated', async () => {
      requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

      const res = await GET(
        new NextRequest('http://localhost:3000/api/v1/esign/templates/7?communityId=42'),
        routeCtx('7'),
      );

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH', () => {
    it('updates template with x-request-id forwarded', async () => {
      const res = await PATCH(
        new NextRequest('http://localhost:3000/api/v1/esign/templates/7', {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'req-xyz',
          },
          body: JSON.stringify({ communityId: 42, name: 'Updated' }),
        }),
        routeCtx('7'),
      );

      expect(res.status).toBe(200);
      expect(updateTemplateMock).toHaveBeenCalledWith(
        42,
        'user-staff',
        7,
        { name: 'Updated', description: undefined, fieldsSchema: undefined },
        'req-xyz',
      );
    });

    it('returns 403 when esign write denied', async () => {
      requireEsignWritePermissionMock.mockRejectedValueOnce(new ForbiddenError());

      const res = await PATCH(
        new NextRequest('http://localhost:3000/api/v1/esign/templates/7', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId: 42, name: 'X' }),
        }),
        routeCtx('7'),
      );

      expect(res.status).toBe(403);
      expect(updateTemplateMock).not.toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('archives template and returns { data: { success: true } }', async () => {
      const res = await DELETE(
        new NextRequest('http://localhost:3000/api/v1/esign/templates/7?communityId=42', {
          headers: { 'x-request-id': 'req-del' },
        }),
        routeCtx('7'),
      );

      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: { success: boolean } };
      expect(json.data.success).toBe(true);
      expect(archiveTemplateMock).toHaveBeenCalledWith(42, 'user-staff', 7, 'req-del');
    });

    it('forwards null x-request-id when header absent', async () => {
      await DELETE(
        new NextRequest('http://localhost:3000/api/v1/esign/templates/7?communityId=42'),
        routeCtx('7'),
      );

      expect(archiveTemplateMock).toHaveBeenCalledWith(42, 'user-staff', 7, null);
    });
  });
});

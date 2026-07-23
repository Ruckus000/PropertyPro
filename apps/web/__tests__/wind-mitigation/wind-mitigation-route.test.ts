/**
 * Route unit tests — `/api/v1/wind-mitigation` (Wave 1 insurance hub).
 *
 * The behaviour that matters most here is the PERMISSION ASYMMETRY that makes
 * the feature work: `insurance:read` is open to every community role (owners
 * must retrieve the building's report for their own insurer) while
 * `insurance:write` is admin-tier. Several tests below exist specifically to
 * stop a future change from quietly closing read access.
 *
 * `requireInsuranceHubCommunity` uses the REAL `getFeaturesForCommunity` from
 * `@propertypro/shared` (condo_718/hoa_720 → hasInsuranceHub true; apartment →
 * false), so the membership `communityType` drives the gate rather than a mock.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  requireActiveSubscriptionForMutationMock,
  createScopedClientMock,
  logAuditEventMock,
  listWindMitigationReportsForCommunityMock,
  getWindMitigationReportByIdMock,
  getWindMitigationDocumentByIdMock,
  createWindMitigationReportForCommunityMock,
  updateWindMitigationReportByIdMock,
  softDeleteWindMitigationReportByIdMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  listWindMitigationReportsForCommunityMock: vi.fn(),
  getWindMitigationReportByIdMock: vi.fn(),
  getWindMitigationDocumentByIdMock: vi.fn(),
  createWindMitigationReportForCommunityMock: vi.fn(),
  updateWindMitigationReportByIdMock: vi.fn(),
  softDeleteWindMitigationReportByIdMock: vi.fn(),
}));

vi.mock('@/lib/middleware/read-entitlement-guard', () => ({ requireEntitledForAdminRead: vi.fn() }));
vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
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

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));

vi.mock('@/lib/services/wind-mitigation-service', () => ({
  listWindMitigationReportsForCommunity: listWindMitigationReportsForCommunityMock,
  getWindMitigationReportById: getWindMitigationReportByIdMock,
  getWindMitigationDocumentById: getWindMitigationDocumentByIdMock,
  createWindMitigationReportForCommunity: createWindMitigationReportForCommunityMock,
  updateWindMitigationReportById: updateWindMitigationReportByIdMock,
  softDeleteWindMitigationReportById: softDeleteWindMitigationReportByIdMock,
}));

import { GET, POST, PATCH, DELETE } from '../../src/app/api/v1/wind-mitigation/route';

const ADMIN_MEMBERSHIP = {
  userId: 'session-user-1',
  communityId: 42,
  communityName: 'Sunset Condos',
  role: 'manager' as const,
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718' as const,
};

const OWNER_MEMBERSHIP = {
  ...ADMIN_MEMBERSHIP,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
};

const SCOPED = { __scoped: true };

const EXISTING_REPORT = {
  id: 7,
  communityId: 42,
  documentId: 100,
  formType: 'oir_b1_1802',
  formVersion: '2026_04',
  buildingLabel: null,
  inspectedAt: '2026-01-10',
  expiresAt: '2031-01-10',
  inspectorName: null,
  inspectorLicense: null,
  notes: null,
  lastAlertBand: null,
};

const VALID_CREATE_BODY = {
  communityId: 42,
  documentId: 100,
  formType: 'oir_b1_1802',
  formVersion: '2026_04',
  inspectedAt: '2026-01-10',
  expiresAt: '2031-01-10',
};

function getReq(communityId?: string): NextRequest {
  const url =
    communityId === undefined
      ? 'http://localhost:3000/api/v1/wind-mitigation'
      : `http://localhost:3000/api/v1/wind-mitigation?communityId=${communityId}`;
  return new NextRequest(url);
}

function jsonReq(method: 'POST' | 'PATCH', payload: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/wind-mitigation', {
    method,
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  });
}

function deleteReq(id: number, communityId = 42): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/wind-mitigation?id=${id}&communityId=${communityId}`,
    { method: 'DELETE' },
  );
}

describe('wind-mitigation route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    createScopedClientMock.mockReturnValue(SCOPED);
    logAuditEventMock.mockResolvedValue(undefined);
    listWindMitigationReportsForCommunityMock.mockResolvedValue([]);
    getWindMitigationReportByIdMock.mockResolvedValue(EXISTING_REPORT);
    getWindMitigationDocumentByIdMock.mockResolvedValue({ id: 100, communityId: 42 });
    createWindMitigationReportForCommunityMock.mockResolvedValue({ ...EXISTING_REPORT, id: 1 });
    updateWindMitigationReportByIdMock.mockResolvedValue(EXISTING_REPORT);
    softDeleteWindMitigationReportByIdMock.mockResolvedValue(EXISTING_REPORT);
  });

  // -------------------------------------------------------------------------
  // GET
  // -------------------------------------------------------------------------

  describe('GET', () => {
    it('returns reports with a computed expiry band', async () => {
      listWindMitigationReportsForCommunityMock.mockResolvedValue([
        { ...EXISTING_REPORT, expiresAt: '2099-01-01' },
      ]);

      const res = await GET(getReq('42'));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.reports).toHaveLength(1);
      expect(json.data.reports[0].expiryBand).toBe('none');
      expect(json.data.reports[0].daysUntilExpiry).toBeGreaterThan(180);
    });

    it('bands an expired report as expired', async () => {
      listWindMitigationReportsForCommunityMock.mockResolvedValue([
        { ...EXISTING_REPORT, expiresAt: '2020-01-01' },
      ]);

      const res = await GET(getReq('42'));
      const json = await res.json();

      expect(json.data.reports[0].expiryBand).toBe('expired');
      expect(json.data.reports[0].daysUntilExpiry).toBeLessThan(0);
    });

    // The feature only works if owners can read. Guard against a regression
    // that adds an admin gate to the read path.
    it('lets a non-admin resident owner read reports', async () => {
      requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);

      const res = await GET(getReq('42'));

      expect(res.status).toBe(200);
      expect(requirePermissionMock).toHaveBeenCalledWith(
        OWNER_MEMBERSHIP,
        'insurance',
        'read',
      );
    });

    it('uses the resolved communityId for the scoped client', async () => {
      await GET(getReq('42'));
      expect(createScopedClientMock).toHaveBeenCalledWith(42);
    });

    it('401s when unauthenticated', async () => {
      requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError('Unauthorized'));
      const res = await GET(getReq('42'));
      expect(res.status).toBe(401);
    });

    it('400s without a communityId', async () => {
      const res = await GET(getReq());
      expect(res.status).toBe(400);
    });

    it('403s for an apartment community (feature gate)', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        ...ADMIN_MEMBERSHIP,
        communityType: 'apartment' as const,
      });

      const res = await GET(getReq('42'));

      expect(res.status).toBe(403);
      expect(listWindMitigationReportsForCommunityMock).not.toHaveBeenCalled();
    });

    it('403s when the read permission is denied', async () => {
      requirePermissionMock.mockImplementation(() => {
        throw new ForbiddenError('Insufficient permissions');
      });
      const res = await GET(getReq('42'));
      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // POST
  // -------------------------------------------------------------------------

  describe('POST', () => {
    it('creates a report and audit-logs it', async () => {
      const res = await POST(jsonReq('POST', VALID_CREATE_BODY));

      expect(res.status).toBe(200);
      expect(createWindMitigationReportForCommunityMock).toHaveBeenCalledWith(
        SCOPED,
        expect.objectContaining({
          communityId: 42,
          documentId: 100,
          formType: 'oir_b1_1802',
          createdBy: 'session-user-1',
        }),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create',
          resourceType: 'wind_mitigation_report',
          communityId: 42,
        }),
      );
    });

    it('defaults formVersion and coerces optional fields to null', async () => {
      const { formVersion: _omitted, ...withoutVersion } = VALID_CREATE_BODY;

      await POST(jsonReq('POST', withoutVersion));

      expect(createWindMitigationReportForCommunityMock).toHaveBeenCalledWith(
        SCOPED,
        expect.objectContaining({
          formVersion: 'pre_2026',
          buildingLabel: null,
          inspectorName: null,
          inspectorLicense: null,
          notes: null,
        }),
      );
    });

    it('accepts the 4+ story Citizens form family', async () => {
      const res = await POST(jsonReq('POST', { ...VALID_CREATE_BODY, formType: 'mit_bt_iii' }));
      expect(res.status).toBe(200);
    });

    it('400s on an unknown form type', async () => {
      const res = await POST(jsonReq('POST', { ...VALID_CREATE_BODY, formType: 'made_up_form' }));
      expect(res.status).toBe(400);
      expect(createWindMitigationReportForCommunityMock).not.toHaveBeenCalled();
    });

    it('400s when expiresAt is not after inspectedAt', async () => {
      const res = await POST(
        jsonReq('POST', { ...VALID_CREATE_BODY, inspectedAt: '2026-01-10', expiresAt: '2026-01-10' }),
      );
      expect(res.status).toBe(400);
      expect(createWindMitigationReportForCommunityMock).not.toHaveBeenCalled();
    });

    // Legal review #7: a board cannot record an implausible multi-year validity
    // window the UI would render as authoritative "Expires" fact.
    it('400s when the validity window exceeds the ~5-year cap', async () => {
      const res = await POST(
        jsonReq('POST', { ...VALID_CREATE_BODY, inspectedAt: '2026-01-10', expiresAt: '2040-01-10' }),
      );
      expect(res.status).toBe(400);
      expect(createWindMitigationReportForCommunityMock).not.toHaveBeenCalled();
    });

    it('accepts the standard 5-year window', async () => {
      const res = await POST(
        jsonReq('POST', { ...VALID_CREATE_BODY, inspectedAt: '2026-01-10', expiresAt: '2031-01-10' }),
      );
      expect(res.status).toBe(200);
    });

    it('400s on a malformed date', async () => {
      const res = await POST(jsonReq('POST', { ...VALID_CREATE_BODY, inspectedAt: '01/10/2026' }));
      expect(res.status).toBe(400);
    });

    // The scoped client cannot see another community's documents, so a
    // cross-tenant documentId simply resolves to null → 404.
    it('404s when the document is not in this community', async () => {
      getWindMitigationDocumentByIdMock.mockResolvedValue(null);

      const res = await POST(jsonReq('POST', VALID_CREATE_BODY));

      expect(res.status).toBe(404);
      expect(createWindMitigationReportForCommunityMock).not.toHaveBeenCalled();
    });

    it('403s a resident owner (write is admin-tier)', async () => {
      requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
      requirePermissionMock.mockImplementation(() => {
        throw new ForbiddenError('Insufficient permissions');
      });

      const res = await POST(jsonReq('POST', VALID_CREATE_BODY));

      expect(res.status).toBe(403);
      expect(createWindMitigationReportForCommunityMock).not.toHaveBeenCalled();
    });

    it('403s in demo grace before touching membership', async () => {
      assertNotDemoGraceMock.mockRejectedValue(new ForbiddenError('Demo expired'));

      const res = await POST(jsonReq('POST', VALID_CREATE_BODY));

      expect(res.status).toBe(403);
      expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    });

    it('403s for an apartment community (feature gate)', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        ...ADMIN_MEMBERSHIP,
        communityType: 'apartment' as const,
      });
      const res = await POST(jsonReq('POST', VALID_CREATE_BODY));
      expect(res.status).toBe(403);
    });

    it('401s when unauthenticated', async () => {
      requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError('Unauthorized'));
      const res = await POST(jsonReq('POST', VALID_CREATE_BODY));
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH
  // -------------------------------------------------------------------------

  describe('PATCH', () => {
    it('updates a report and audit-logs old/new values', async () => {
      const res = await PATCH(jsonReq('PATCH', { id: 7, communityId: 42, notes: 'Updated' }));

      expect(res.status).toBe(200);
      expect(updateWindMitigationReportByIdMock).toHaveBeenCalledWith(
        SCOPED,
        7,
        expect.objectContaining({ notes: 'Updated' }),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          resourceType: 'wind_mitigation_report',
          oldValues: EXISTING_REPORT,
        }),
      );
    });

    // A re-inspection must be able to earn its alerts again.
    it('resets the alert ladder when the expiry date changes', async () => {
      await PATCH(jsonReq('PATCH', { id: 7, communityId: 42, expiresAt: '2032-01-10' }));

      expect(updateWindMitigationReportByIdMock).toHaveBeenCalledWith(
        SCOPED,
        7,
        expect.objectContaining({ lastAlertBand: null }),
      );
    });

    it('does not reset the alert ladder on an unrelated edit', async () => {
      await PATCH(jsonReq('PATCH', { id: 7, communityId: 42, notes: 'Typo fix' }));

      const [, , values] = updateWindMitigationReportByIdMock.mock.calls[0];
      expect(values).not.toHaveProperty('lastAlertBand');
    });

    // A PATCH that moves only one endpoint can still invert the window, so the
    // check must run against the merged result, not the payload alone.
    it('400s when a partial edit inverts the validity window', async () => {
      const res = await PATCH(jsonReq('PATCH', { id: 7, communityId: 42, expiresAt: '2020-01-01' }));

      expect(res.status).toBe(400);
      expect(updateWindMitigationReportByIdMock).not.toHaveBeenCalled();
    });

    it('404s when the report does not exist', async () => {
      getWindMitigationReportByIdMock.mockResolvedValue(null);
      const res = await PATCH(jsonReq('PATCH', { id: 999, communityId: 42, notes: 'x' }));
      expect(res.status).toBe(404);
    });

    it('400s without an id', async () => {
      const res = await PATCH(jsonReq('PATCH', { communityId: 42, notes: 'x' }));
      expect(res.status).toBe(400);
    });

    it('403s a resident owner (write is admin-tier)', async () => {
      requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
      requirePermissionMock.mockImplementation(() => {
        throw new ForbiddenError('Insufficient permissions');
      });
      const res = await PATCH(jsonReq('PATCH', { id: 7, communityId: 42, notes: 'x' }));
      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE
  // -------------------------------------------------------------------------

  describe('DELETE', () => {
    it('soft-deletes a report and audit-logs it', async () => {
      const res = await DELETE(deleteReq(7));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data).toEqual({ deleted: true, id: 7 });
      expect(softDeleteWindMitigationReportByIdMock).toHaveBeenCalledWith(SCOPED, 7);
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          resourceType: 'wind_mitigation_report',
          oldValues: EXISTING_REPORT,
        }),
      );
    });

    it('404s when the report does not exist', async () => {
      getWindMitigationReportByIdMock.mockResolvedValue(null);
      const res = await DELETE(deleteReq(999));
      expect(res.status).toBe(404);
      expect(softDeleteWindMitigationReportByIdMock).not.toHaveBeenCalled();
    });

    it('403s a resident owner (write is admin-tier)', async () => {
      requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
      requirePermissionMock.mockImplementation(() => {
        throw new ForbiddenError('Insufficient permissions');
      });
      const res = await DELETE(deleteReq(7));
      expect(res.status).toBe(403);
    });
  });
});

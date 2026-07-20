/**
 * Route tests — `/api/v1/storm-damage` (GET / POST / PATCH).
 *
 * Covers the storm-damage intake behaviors:
 * - create: any resident (owner/tenant) may file; audit-logged
 * - list: returns the canonical double-wrap envelope from the paginated service
 * - status update: admin-tier only (residents 403)
 * - feature gate: 403 when hasStormTools is off for the community type
 * - RBAC: requirePermission('storm_damage', read|write) is enforced
 *
 * This records damage for the association — it is NOT an insurance claim
 * (§626.854); the route carries no claim/coverage logic to assert here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// DATABASE_URL load guard — @propertypro/db (transitively imported) refuses to
// load without it, even though the DB is fully mocked below.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
});

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  createScopedClientMock,
  logAuditEventMock,
  getRateLimiterMock,
  getFeaturesForCommunityMock,
  paginateStormDamageReportsMock,
  createStormDamageReportMock,
  getStormDamageReportByIdMock,
  getStormDamageDocumentByIdMock,
  updateStormDamageReportByIdMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  getRateLimiterMock: vi.fn(),
  getFeaturesForCommunityMock: vi.fn(),
  paginateStormDamageReportsMock: vi.fn(),
  createStormDamageReportMock: vi.fn(),
  getStormDamageReportByIdMock: vi.fn(),
  getStormDamageDocumentByIdMock: vi.fn(),
  updateStormDamageReportByIdMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
}));
vi.mock('@propertypro/shared', () => ({
  getFeaturesForCommunity: getFeaturesForCommunityMock,
}));
vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));
vi.mock('@/lib/db/access-control', () => ({ requirePermission: requirePermissionMock }));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: assertNotDemoGraceMock }));
vi.mock('@/lib/middleware/rate-limiter', () => ({ getRateLimiter: getRateLimiterMock }));
vi.mock('@/lib/services/storm-damage-service', () => ({
  paginateStormDamageReports: paginateStormDamageReportsMock,
  createStormDamageReport: createStormDamageReportMock,
  getStormDamageReportById: getStormDamageReportByIdMock,
  getStormDamageDocumentById: getStormDamageDocumentByIdMock,
  updateStormDamageReportById: updateStormDamageReportByIdMock,
}));

import { GET, POST, PATCH } from '../../src/app/api/v1/storm-damage/route';

const OWNER = {
  userId: 'u-owner',
  communityId: 42,
  communityName: 'Sunset Condos',
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  communityType: 'condo_718' as const,
};
const MANAGER = { ...OWNER, userId: 'u-mgr', role: 'property_manager' as const, isAdmin: true };

function jsonReq(method: string, url: string, payload?: unknown) {
  return new NextRequest(url, {
    method,
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    headers: { 'content-type': 'application/json' },
  });
}

const VALID_CREATE = {
  communityId: 42,
  locationLabel: 'Building B — 3rd floor hallway',
  category: 'water',
  severity: 'moderate',
  description: 'Ceiling leak after the storm.',
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('u-owner');
  resolveEffectiveCommunityIdMock.mockReturnValue(42);
  assertNotDemoGraceMock.mockResolvedValue(undefined);
  requireCommunityMembershipMock.mockResolvedValue(OWNER);
  requirePermissionMock.mockReturnValue(undefined);
  getFeaturesForCommunityMock.mockReturnValue({ hasStormTools: true });
  getRateLimiterMock.mockReturnValue({ check: () => ({ allowed: true, retryAfter: 0 }) });
  createScopedClientMock.mockReturnValue({ __scoped: true });
  logAuditEventMock.mockResolvedValue(undefined);
  paginateStormDamageReportsMock.mockResolvedValue({
    data: [{ id: 1, reportedBy: 'u-owner', status: 'submitted' }],
    pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
  });
  createStormDamageReportMock.mockResolvedValue({ id: 10, status: 'submitted' });
  getStormDamageReportByIdMock.mockResolvedValue({ id: 10, status: 'submitted' });
  getStormDamageDocumentByIdMock.mockResolvedValue({ id: 5 });
  updateStormDamageReportByIdMock.mockResolvedValue({ id: 10, status: 'acknowledged' });
});

describe('GET /api/v1/storm-damage', () => {
  it('returns the paginated double-wrap envelope', async () => {
    const res = await GET(jsonReq('GET', 'http://localhost/api/v1/storm-damage?communityId=42'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // requestJson unwraps the outer .data → consumer sees { data, pagination }.
    expect(body.data.data).toHaveLength(1);
    expect(body.data.pagination.hasMore).toBe(false);
    expect(requirePermissionMock).toHaveBeenCalledWith(OWNER, 'storm_damage', 'read');
  });

  it('403s when storm tools are not enabled for the community type', async () => {
    getFeaturesForCommunityMock.mockReturnValue({ hasStormTools: false });
    const res = await GET(jsonReq('GET', 'http://localhost/api/v1/storm-damage?communityId=42'));
    expect(res.status).toBe(403);
    expect(paginateStormDamageReportsMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/storm-damage', () => {
  it('lets an owner file a report and records an audit event', async () => {
    const res = await POST(jsonReq('POST', 'http://localhost/api/v1/storm-damage', VALID_CREATE));
    expect(res.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith(OWNER, 'storm_damage', 'write');
    expect(createStormDamageReportMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reportedBy: 'u-owner', status: 'submitted', category: 'water' }),
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', resourceType: 'storm_damage_report' }),
    );
  });

  it('forwards a filled occurredAt as a Date (mode:date column) so insert does not throw', async () => {
    const res = await POST(
      jsonReq('POST', 'http://localhost/api/v1/storm-damage', {
        ...VALID_CREATE,
        occurredAt: '2026-07-18T00:00:00.000Z',
      }),
    );
    expect(res.status).toBe(200);
    const passed = createStormDamageReportMock.mock.calls[0][1];
    expect(passed.occurredAt).toBeInstanceOf(Date);
    expect((passed.occurredAt as Date).toISOString()).toBe('2026-07-18T00:00:00.000Z');
  });

  it('validates a referenced photo document belongs to this community', async () => {
    getStormDamageDocumentByIdMock.mockResolvedValue(null);
    const res = await POST(
      jsonReq('POST', 'http://localhost/api/v1/storm-damage', {
        ...VALID_CREATE,
        photoDocumentIds: [999],
      }),
    );
    expect(res.status).toBe(400);
    expect(createStormDamageReportMock).not.toHaveBeenCalled();
  });

  it('403s when storm tools are disabled', async () => {
    getFeaturesForCommunityMock.mockReturnValue({ hasStormTools: false });
    const res = await POST(jsonReq('POST', 'http://localhost/api/v1/storm-damage', VALID_CREATE));
    expect(res.status).toBe(403);
    expect(createStormDamageReportMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/storm-damage', () => {
  const VALID_PATCH = { id: 10, communityId: 42, status: 'acknowledged' };

  it('lets an admin update a report status', async () => {
    requireCommunityMembershipMock.mockResolvedValue(MANAGER);
    const res = await PATCH(jsonReq('PATCH', 'http://localhost/api/v1/storm-damage', VALID_PATCH));
    expect(res.status).toBe(200);
    expect(updateStormDamageReportByIdMock).toHaveBeenCalledWith(expect.anything(), 10, {
      status: 'acknowledged',
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update', resourceType: 'storm_damage_report' }),
    );
  });

  it('403s when a non-admin resident tries to update status', async () => {
    // OWNER (isAdmin: false) is the default membership.
    const res = await PATCH(jsonReq('PATCH', 'http://localhost/api/v1/storm-damage', VALID_PATCH));
    expect(res.status).toBe(403);
    expect(updateStormDamageReportByIdMock).not.toHaveBeenCalled();
  });
});

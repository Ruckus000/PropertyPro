/**
 * Unit tests for leases API route (P2-37).
 *
 * Tests cover:
 * - Zod validation rejects invalid input
 * - Scoped queries prevent cross-tenant lease access
 * - Non-apartment community returns 403 (feature-not-available)
 * - CRUD operations with proper audit logging
 * - Renewal chain creation logic
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  createScopedClientMock,
  logAuditEventMock,
  leasesTableMock,
  unitsTableMock,
  userRolesTableMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  leasesTableMock: { id: Symbol('leases.id') },
  unitsTableMock: { id: Symbol('units.id') },
  userRolesTableMock: { id: Symbol('user_roles.id') },
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  leases: leasesTableMock,
  units: unitsTableMock,
  userRoles: userRolesTableMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));


vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));
import { GET, POST, PATCH, DELETE } from '../../src/app/api/v1/leases/route';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function makeDefaultScopedClient(overrides: Record<string, unknown> = {}) {
  const query = vi.fn().mockImplementation(async (table: unknown) => {
    if (table === unitsTableMock) {
      return [{ id: 10, communityId: 42, unitNumber: '101', rentAmount: '1500.00' }];
    }
    if (table === userRolesTableMock) {
      return [{ userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', role: 'resident', isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant', communityId: 42 }];
    }
    if (table === leasesTableMock) {
      return [];
    }
    return [];
  });

  return {
    query,
    insert: vi.fn().mockResolvedValue([
      {
        id: 1,
        communityId: 42,
        unitId: 10,
        residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        rentAmount: '1500.00',
        status: 'active',
        previousLeaseId: null,
        notes: null,
      },
    ]),
    update: vi.fn().mockResolvedValue([
      {
        id: 1,
        communityId: 42,
        status: 'terminated',
      },
    ]),
    softDelete: vi.fn().mockResolvedValue([]),
    hardDelete: vi.fn(),
    ...overrides,
  };
}

describe('p2-37 leases route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'session-user-1',
      communityId: 42,
      role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Site Manager', presetKey: 'site_manager', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
      communityType: 'apartment',
    });
    createScopedClientMock.mockReturnValue(makeDefaultScopedClient());
  });

  // -------------------------------------------------------------------------
  // Feature gate: non-apartment community → 403
  // -------------------------------------------------------------------------

  describe('apartment-only feature gate', () => {
    it('GET returns 403 for condo community', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        userId: 'session-user-1',
        communityId: 42,
        role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
        communityType: 'condo_718',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/leases?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it('GET returns 403 for HOA community', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        userId: 'session-user-1',
        communityId: 42,
        role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
        communityType: 'hoa_720',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/leases?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it('POST returns 403 for condo community', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        userId: 'session-user-1',
        communityId: 42,
        role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
        communityType: 'condo_718',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          unitId: 10,
          residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          startDate: '2026-01-01',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it('PATCH returns 403 for HOA community', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        userId: 'session-user-1',
        communityId: 42,
        role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
        communityType: 'hoa_720',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'PATCH',
        body: JSON.stringify({ id: 1, communityId: 42, status: 'terminated' }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(403);
    });

    it('DELETE returns 403 for condo community', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        userId: 'session-user-1',
        communityId: 42,
        role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
        communityType: 'condo_718',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/leases?id=1&communityId=42');
      const res = await DELETE(req);
      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Zod validation
  // -------------------------------------------------------------------------

  describe('Zod validation', () => {
    it('POST rejects missing required fields', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'POST',
        body: JSON.stringify({ communityId: 42 }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('Invalid lease payload');
    });

    it('POST rejects invalid date format', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          unitId: 10,
          residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          startDate: '01/01/2026', // wrong format
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('POST rejects invalid UUID for residentId', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          unitId: 10,
          residentId: 'not-a-uuid',
          startDate: '2026-01-01',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('POST rejects invalid rentAmount format', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          unitId: 10,
          residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          startDate: '2026-01-01',
          rentAmount: 'abc',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('POST rejects invalid lease status', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          unitId: 10,
          residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          startDate: '2026-01-01',
          status: 'invalid_status',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('PATCH rejects missing id', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'PATCH',
        body: JSON.stringify({ communityId: 42, status: 'terminated' }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(400);
    });

    it('GET rejects missing communityId', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases');
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it('DELETE rejects non-positive id', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases?id=0&communityId=42');
      const res = await DELETE(req);
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Scoped queries (tenant isolation)
  // -------------------------------------------------------------------------

  describe('scoped query enforcement', () => {
    it('GET uses createScopedClient with the resolved communityId', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases?communityId=42');
      await GET(req);
      expect(createScopedClientMock).toHaveBeenCalledWith(42);
    });

    it('POST uses createScopedClient with the resolved communityId', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          unitId: 10,
          residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          rentAmount: '1500.00',
        }),
        headers: { 'content-type': 'application/json' },
      });

      await POST(req);
      expect(createScopedClientMock).toHaveBeenCalledWith(42);
    });
  });

  // -------------------------------------------------------------------------
  // GET — listing leases
  // -------------------------------------------------------------------------

  describe('GET', () => {
    it('returns leases for a community', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === leasesTableMock) {
          return [
            {
              id: 1,
              communityId: 42,
              unitId: 10,
              residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              startDate: '2026-01-01',
              endDate: '2026-12-31',
              rentAmount: '1500.00',
              status: 'active',
              previousLeaseId: null,
              notes: null,
            },
          ];
        }
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as { data: Array<{ id: number }> };

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].id).toBe(1);
    });

    it('filters by status parameter', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === leasesTableMock) {
          return [
            { id: 1, communityId: 42, unitId: 10, residentId: 'u1', startDate: '2026-01-01', endDate: '2026-12-31', rentAmount: null, status: 'active', previousLeaseId: null, notes: null },
            { id: 2, communityId: 42, unitId: 11, residentId: 'u2', startDate: '2025-01-01', endDate: '2025-12-31', rentAmount: null, status: 'expired', previousLeaseId: null, notes: null },
          ];
        }
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases?communityId=42&status=expired');
      const res = await GET(req);
      const json = (await res.json()) as { data: Array<{ id: number }> };

      expect(json.data).toHaveLength(1);
      expect(json.data[0].id).toBe(2);
    });

    it('filters by unit parameter', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === leasesTableMock) {
          return [
            { id: 1, communityId: 42, unitId: 10, residentId: 'u1', startDate: '2026-01-01', endDate: '2026-12-31', rentAmount: null, status: 'active', previousLeaseId: null, notes: null },
            { id: 2, communityId: 42, unitId: 11, residentId: 'u2', startDate: '2026-01-01', endDate: '2026-12-31', rentAmount: null, status: 'active', previousLeaseId: null, notes: null },
          ];
        }
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases?communityId=42&unit=11');
      const res = await GET(req);
      const json = (await res.json()) as { data: Array<{ id: number }> };

      expect(json.data).toHaveLength(1);
      expect(json.data[0].id).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // POST — creating leases
  // -------------------------------------------------------------------------

  describe('POST', () => {
    it('creates a lease and logs audit event', async () => {
      const insert = vi.fn().mockResolvedValue([
        {
          id: 99,
          communityId: 42,
          unitId: 10,
          residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          rentAmount: '1500.00',
          status: 'active',
          previousLeaseId: null,
          notes: null,
        },
      ]);
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ insert }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          unitId: 10,
          residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          rentAmount: '1500.00',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      const json = (await res.json()) as { data: { id: number } };

      expect(res.status).toBe(201);
      expect(json.data.id).toBe(99);
      expect(insert).toHaveBeenCalledWith(
        leasesTableMock,
        expect.objectContaining({
          unitId: 10,
          residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          startDate: '2026-01-01',
        }),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create',
          resourceType: 'lease',
          resourceId: '99',
          communityId: 42,
        }),
      );
    });

    it('rejects when unit does not belong to community', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === unitsTableMock) return []; // no units found
        if (table === userRolesTableMock) return [{ userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', role: 'resident', isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant' }];
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          unitId: 999,
          residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          startDate: '2026-01-01',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('Unit not found');
    });

    it('rejects when resident does not have tenant role', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === unitsTableMock) return [{ id: 10, communityId: 42 }];
        if (table === userRolesTableMock) return [{ userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Site Manager', presetKey: 'site_manager', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } } }]; // not tenant
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          unitId: 10,
          residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          startDate: '2026-01-01',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('tenant role');
    });

    it('rejects lease start date that is not first of month', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          unitId: 10,
          residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          startDate: '2026-01-15',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('first day of the month');
    });

    it('rejects overlapping lease periods for same unit', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === unitsTableMock) return [{ id: 10, communityId: 42, rentAmount: '1500.00' }];
        if (table === userRolesTableMock) return [{ userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', role: 'resident', isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant', communityId: 42 }];
        if (table === leasesTableMock) {
          return [{ id: 11, communityId: 42, unitId: 10, residentId: 'u1', startDate: '2026-01-01', endDate: '2026-12-31', status: 'active', previousLeaseId: null }];
        }
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          unitId: 10,
          residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          startDate: '2026-06-01',
          endDate: '2027-05-31',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('overlaps an existing lease');
    });

    it('allows lease create with explicit rentAmount even when unit rent differs', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === unitsTableMock) return [{ id: 10, communityId: 42, rentAmount: '1800.00' }];
        if (table === userRolesTableMock) return [{ userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', role: 'resident', isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant', communityId: 42 }];
        if (table === leasesTableMock) return [];
        return [];
      });
      const insert = vi.fn().mockResolvedValue([
        {
          id: 77,
          communityId: 42,
          unitId: 10,
          residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          rentAmount: '1500.00',
          status: 'active',
          previousLeaseId: null,
        },
      ]);
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query, insert }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          unitId: 10,
          residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          rentAmount: '1500.00',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      expect(insert).toHaveBeenCalledWith(
        leasesTableMock,
        expect.objectContaining({ rentAmount: '1500.00' }),
      );
    });

    it('handles renewal: marks previous lease as renewed and links', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === unitsTableMock) return [{ id: 10, communityId: 42 }];
        if (table === userRolesTableMock) return [{ userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', role: 'resident', isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant', communityId: 42 }];
        if (table === leasesTableMock) return [{ id: 50, communityId: 42, status: 'active', unitId: 10, residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', startDate: '2026-01-01', endDate: '2026-12-31', previousLeaseId: null }];
        return [];
      });
      const update = vi.fn().mockResolvedValue([{ id: 50, status: 'renewed' }]);
      const insert = vi.fn().mockResolvedValue([
        {
          id: 51,
          communityId: 42,
          unitId: 10,
          residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          startDate: '2027-01-01',
          endDate: '2027-12-31',
          status: 'active',
          previousLeaseId: 50,
        },
      ]);
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query, update, insert }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          unitId: 10,
          residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          startDate: '2027-01-01',
          endDate: '2027-12-31',
          isRenewal: true,
          previousLeaseId: 50,
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(201);

      // Previous lease should be marked as renewed
      expect(update).toHaveBeenCalled();

      // Audit should log both: renewal of previous and creation of new
      expect(logAuditEventMock).toHaveBeenCalledTimes(2);
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          resourceType: 'lease',
          resourceId: '50',
          newValues: expect.objectContaining({ status: 'renewed' }),
        }),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create',
          resourceType: 'lease',
          resourceId: '51',
        }),
      );
    });

    it('rejects renewal when startDate is not contiguous with previous lease endDate', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === unitsTableMock) return [{ id: 10, communityId: 42, rentAmount: '1500.00' }];
        if (table === userRolesTableMock) return [{ userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', role: 'resident', isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant', communityId: 42 }];
        if (table === leasesTableMock) return [{ id: 50, communityId: 42, status: 'active', unitId: 10, residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', startDate: '2026-01-01', endDate: '2026-12-31', previousLeaseId: null }];
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          unitId: 10,
          residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          startDate: '2027-02-01',
          endDate: '2027-12-31',
          isRenewal: true,
          previousLeaseId: 50,
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('day after the previous lease endDate');
    });
  });

  // -------------------------------------------------------------------------
  // PATCH — updating leases
  // -------------------------------------------------------------------------

  describe('PATCH', () => {
    it('updates lease status and logs audit', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === leasesTableMock) {
          return [{ id: 1, communityId: 42, unitId: 10, residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', startDate: '2026-01-01', status: 'active', endDate: '2026-12-31', rentAmount: '1500.00', previousLeaseId: null, notes: null }];
        }
        return [];
      });
      const update = vi.fn().mockResolvedValue([{ id: 1, status: 'terminated' }]);
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query, update }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'PATCH',
        body: JSON.stringify({ id: 1, communityId: 42, status: 'terminated' }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      expect(update).toHaveBeenCalled();
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          resourceType: 'lease',
          resourceId: '1',
          oldValues: expect.objectContaining({ status: 'active' }),
          newValues: expect.objectContaining({ status: 'terminated' }),
        }),
      );
    });

    it('returns 404 when lease not found', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === leasesTableMock) return [];
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'PATCH',
        body: JSON.stringify({ id: 999, communityId: 42, status: 'terminated' }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(404);
    });

    it('returns 400 when no update fields provided', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === leasesTableMock) {
          return [{ id: 1, communityId: 42, status: 'active' }];
        }
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'PATCH',
        body: JSON.stringify({ id: 1, communityId: 42 }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(400);
    });

    it('allows lease rentAmount changes through PATCH', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === leasesTableMock) {
          return [{ id: 1, communityId: 42, unitId: 10, residentId: 'u1', startDate: '2026-01-01', endDate: '2026-12-31', status: 'active', rentAmount: '1500.00', previousLeaseId: null, notes: null }];
        }
        return [];
      });
      const update = vi.fn().mockResolvedValue([{ id: 1, rentAmount: '1600.00' }]);
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query, update }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'PATCH',
        body: JSON.stringify({ id: 1, communityId: 42, rentAmount: '1600.00' }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      expect(update).toHaveBeenCalledWith(
        leasesTableMock,
        expect.objectContaining({ rentAmount: '1600.00' }),
        expect.any(Object),
      );
    });
  });

  // -------------------------------------------------------------------------
  // DELETE — soft-deleting leases
  // -------------------------------------------------------------------------

  describe('DELETE', () => {
    it('soft-deletes a lease and logs audit', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === leasesTableMock) {
          return [{ id: 1, communityId: 42, unitId: 10, residentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', status: 'active' }];
        }
        return [];
      });
      const softDelete = vi.fn().mockResolvedValue([]);
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query, softDelete }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases?id=1&communityId=42');
      const res = await DELETE(req);
      const json = (await res.json()) as { data: { deleted: boolean; id: number } };

      expect(res.status).toBe(200);
      expect(json.data.deleted).toBe(true);
      expect(softDelete).toHaveBeenCalled();
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          resourceType: 'lease',
          resourceId: '1',
          communityId: 42,
        }),
      );
    });

    it('returns 404 when lease not found for delete', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === leasesTableMock) return [];
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases?id=999&communityId=42');
      const res = await DELETE(req);
      expect(res.status).toBe(404);
    });
  });
});

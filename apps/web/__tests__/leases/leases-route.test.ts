/**
 * Unit tests for leases API route (P2-37).
 *
 * Tests cover:
 * - Zod validation rejects invalid input
 * - Scoped queries prevent cross-tenant lease access
 * - Non-apartment community returns 403 (feature-not-available)
 * - CRUD operations with proper audit logging
 * - Renewal chain creation logic
 * - AZ-01: mutations require units:write; a non-manager's GET (and its renewal
 *   chain) is party-scoped to their own residentId
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors';

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
  const selectFrom = vi.fn().mockImplementation(async (table: unknown) => {
    const queryImpl = typeof overrides['query'] === 'function'
      ? overrides['query'] as (table: unknown) => Promise<unknown[]>
      : query;
    return queryImpl(table);
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
    selectFrom: overrides['selectFrom'] ?? selectFrom,
  };
}

describe('p2-37 leases route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'session-user-1',
      communityId: 42,
      // AZ-01: `role` is a v3 `CommunityRole`, which is what
      // `requireCommunityMembership` actually returns (it validates through
      // `requireCommunityRole` and would throw on anything else). The matrix
      // gate and `isAdminRole` both resolve `property_manager` onto the
      // `manager` row, so this stays the management-tier default.
      role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Site Manager', presetKey: 'site_manager', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
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
  // Auth gate: unauthenticated → 401 (asserted on every method)
  // -------------------------------------------------------------------------

  describe('unauthenticated → 401', () => {
    beforeEach(() => {
      requireAuthenticatedUserIdMock.mockRejectedValue(
        new UnauthorizedError('Authentication required'),
      );
    });

    it('GET returns 401 and does not resolve membership', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(401);
      expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    });

    it('POST returns 401 and does not resolve membership', async () => {
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
      expect(res.status).toBe(401);
      expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    });

    it('PATCH returns 401 and does not resolve membership', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'PATCH',
        body: JSON.stringify({ id: 1, communityId: 42, status: 'terminated' }),
        headers: { 'content-type': 'application/json' },
      });
      const res = await PATCH(req);
      expect(res.status).toBe(401);
      expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    });

    it('DELETE returns 401 and does not resolve membership', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases?id=1&communityId=42');
      const res = await DELETE(req);
      expect(res.status).toBe(401);
      expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
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
      // Post-migration: body validation is enforced by the contract runner,
      // so the envelope is the canonical `VALIDATION_ERROR` ('Invalid request
      // body') rather than the bespoke pre-migration 'Invalid lease payload'.
      // No consumer surfaces this message (requestJson consumers don't read
      // it for body-validation failures).
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('Invalid request body');
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

    it('DELETE rejects zero id (id=0)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases?id=0&communityId=42');
      const res = await DELETE(req);
      expect(res.status).toBe(400);
    });

    it('DELETE rejects non-numeric id (id=abc) as a separate case', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases?id=abc&communityId=42');
      const res = await DELETE(req);
      expect(res.status).toBe(400);
    });

    it('DELETE rejects zero communityId (communityId=0)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases?id=1&communityId=0');
      const res = await DELETE(req);
      expect(res.status).toBe(400);
    });

    it('GET rejects non-numeric communityId (communityId=abc)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/leases?communityId=abc');
      const res = await GET(req);
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
      expect(json.data[0]!.id).toBe(1);
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
      expect(json.data[0]!.id).toBe(2);
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
      expect(json.data[0]!.id).toBe(2);
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

      expect(res.status).toBe(200);
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
      expect(res.status).toBe(200);
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
      expect(res.status).toBe(200);

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

  // -------------------------------------------------------------------------
  // AZ-01 — role gate on the mutations, party-scoped rows on the read
  //
  // `@/lib/db/access-control` is deliberately NOT mocked here (the invitations
  // suite does the same): the whole claim is that the RBAC row for the actor's
  // role refuses `units:write`, so the real `checkPermissionV2` must run. And
  // because the lease services are reached only through `createScopedClient`,
  // "the gate fired first" is asserted on that mock plus the audit-log mock —
  // a route that got past the gate would have opened a client by now.
  // -------------------------------------------------------------------------

  describe('AZ-01 role gate', () => {
    // A real UUID, because `residentId` feeds both the party-scope comparison
    // and the contract's `z.string().uuid()` on POST — a non-UUID stand-in
    // would 400 in the runner before the handler's gate ever ran.
    const ACTOR = '11111111-1111-4111-8111-111111111111';
    const OTHER_RESIDENT = '22222222-2222-4222-8222-222222222222';

    beforeEach(() => {
      requireAuthenticatedUserIdMock.mockResolvedValue(ACTOR);
    });

    /** A plain community member — everything the default fixture is not. */
    function memberMembership(overrides: Record<string, unknown> = {}) {
      return {
        userId: ACTOR,
        communityId: 42,
        role: 'resident' as const,
        isAdmin: false,
        isUnitOwner: false,
        displayTitle: 'Resident',
        communityType: 'apartment' as const,
        ...overrides,
      };
    }

    /**
     * Lease 1 names the actor; lease 2 names someone else and renews lease 1,
     * so lease 2 is also the root of a two-link renewal chain. Rent amounts
     * differ per row so a leak is visible in the serialized payload.
     */
    const twoTenantRows = [
      {
        id: 1, communityId: 42, unitId: 10, residentId: ACTOR,
        startDate: '2026-01-01', endDate: '2026-12-31',
        rentAmount: '1100.00', status: 'active', previousLeaseId: null, notes: null,
      },
      {
        id: 2, communityId: 42, unitId: 11, residentId: OTHER_RESIDENT,
        startDate: '2026-01-01', endDate: '2026-12-31',
        rentAmount: '9999.99', status: 'active', previousLeaseId: 1, notes: null,
      },
    ];

    function seedLeases(rows: unknown[]) {
      const query = vi.fn().mockImplementation(async (table: unknown) =>
        table === leasesTableMock ? rows : [],
      );
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));
    }

    // --- mutations: units:write is the manager row only, so a resident is refused
    //
    // Titles are spelled out per case rather than interpolated, so a source
    // grep for the gate (the roadmap's AZ-01 done-criterion) finds real text.

    /** Act as a plain member, POST a lease, expect refusal with zero side effects. */
    async function postAsMember(isUnitOwner: boolean): Promise<number> {
      requireCommunityMembershipMock.mockResolvedValue(memberMembership({ isUnitOwner }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          unitId: 10,
          residentId: ACTOR,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          rentAmount: '1100.00',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      // No unit lookup, no insert, no renewal marking, no audit row.
      expect(createScopedClientMock).not.toHaveBeenCalled();
      expect(logAuditEventMock).not.toHaveBeenCalled();
      return res.status;
    }

    /** Act as a plain member, PATCH a lease, expect refusal with zero side effects. */
    async function patchAsMember(isUnitOwner: boolean): Promise<number> {
      requireCommunityMembershipMock.mockResolvedValue(memberMembership({ isUnitOwner }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases', {
        method: 'PATCH',
        body: JSON.stringify({ id: 1, communityId: 42, rentAmount: '1.00' }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await PATCH(req);
      expect(createScopedClientMock).not.toHaveBeenCalled();
      expect(logAuditEventMock).not.toHaveBeenCalled();
      return res.status;
    }

    /** Act as a plain member, DELETE a lease, expect refusal with zero side effects. */
    async function deleteAsMember(isUnitOwner: boolean): Promise<number> {
      requireCommunityMembershipMock.mockResolvedValue(memberMembership({ isUnitOwner }));

      const req = new NextRequest('http://localhost:3000/api/v1/leases?id=1&communityId=42');

      const res = await DELETE(req);
      expect(createScopedClientMock).not.toHaveBeenCalled();
      expect(logAuditEventMock).not.toHaveBeenCalled();
      return res.status;
    }

    it('POST returns 403 for a tenant (resident, not a unit owner) and writes nothing', async () => {
      expect(await postAsMember(false)).toBe(403);
    });

    it('POST returns 403 for a non-manager who IS a unit owner and writes nothing', async () => {
      expect(await postAsMember(true)).toBe(403);
    });

    it('PATCH returns 403 for a tenant (resident, not a unit owner) and mutates nothing', async () => {
      expect(await patchAsMember(false)).toBe(403);
    });

    it('PATCH returns 403 for a non-manager who IS a unit owner and mutates nothing', async () => {
      expect(await patchAsMember(true)).toBe(403);
    });

    it('DELETE returns 403 for a tenant (resident, not a unit owner) and deletes nothing', async () => {
      expect(await deleteAsMember(false)).toBe(403);
    });

    it('DELETE returns 403 for a non-manager who IS a unit owner and deletes nothing', async () => {
      expect(await deleteAsMember(true)).toBe(403);
    });

    // --- read: party-scoped, deliberately (roadmap ledger D1/D29) -------------

    it('GET lets a non-manager read, but only the leases naming them', async () => {
      requireCommunityMembershipMock.mockResolvedValue(memberMembership());
      seedLeases(twoTenantRows);

      const req = new NextRequest('http://localhost:3000/api/v1/leases?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as { data: Array<{ id: number; residentId: string }> };

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(json.data[0]!.id).toBe(1);
      expect(json.data[0]!.residentId).toBe(ACTOR);
      // The neighbour's rent figure must not be in the payload at all.
      expect(JSON.stringify(json.data)).not.toContain('9999.99');
      expect(JSON.stringify(json.data)).not.toContain(OTHER_RESIDENT);
    });

    it('GET does NOT widen to a unit owner who is not the named party (ledger D1/D29)', async () => {
      // Owning a unit is not being a party to the lease, and `units:read` is
      // true on the owner row too — so only the row filter stands between this
      // caller and someone else's rent amount.
      requireCommunityMembershipMock.mockResolvedValue(memberMembership({ isUnitOwner: true }));
      seedLeases(twoTenantRows);

      const req = new NextRequest('http://localhost:3000/api/v1/leases?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as { data: unknown[] };

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(JSON.stringify(json.data)).not.toContain('9999.99');
    });

    it('GET still returns every lease to the management tier (control)', async () => {
      // Default fixture is management tier. Without this control the two cases
      // above would pass equally well if the filter ran unconditionally.
      seedLeases(twoTenantRows);

      const req = new NextRequest('http://localhost:3000/api/v1/leases?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as { data: Array<{ id: number }> };

      expect(res.status).toBe(200);
      expect(json.data.map((l) => l.id)).toEqual([1, 2]);
      expect(JSON.stringify(json.data)).toContain('9999.99');
    });

    it('renewal_chain_for returns nothing for a non-manager asking about another lease', async () => {
      requireCommunityMembershipMock.mockResolvedValue(memberMembership());
      seedLeases(twoTenantRows);

      // Lease 2 belongs to the other resident; its chain runs through lease 1.
      const req = new NextRequest(
        'http://localhost:3000/api/v1/leases?communityId=42&renewal_chain_for=2',
      );
      const res = await GET(req);
      const json = (await res.json()) as { data: unknown[] };

      expect(res.status).toBe(200);
      expect(json.data).toEqual([]);
      expect(JSON.stringify(json.data)).not.toContain('9999.99');
    });

    it('renewal_chain_for still returns the actor’s own chain link', async () => {
      requireCommunityMembershipMock.mockResolvedValue(memberMembership());
      seedLeases(twoTenantRows);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/leases?communityId=42&renewal_chain_for=1',
      );
      const res = await GET(req);
      const json = (await res.json()) as { data: Array<{ id: number }> };

      expect(res.status).toBe(200);
      expect(json.data.map((l) => l.id)).toEqual([1]);
    });

    it('renewal_chain_for returns the full chain to the management tier (control)', async () => {
      seedLeases(twoTenantRows);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/leases?communityId=42&renewal_chain_for=2',
      );
      const res = await GET(req);
      const json = (await res.json()) as { data: Array<{ id: number }> };

      expect(res.status).toBe(200);
      expect(json.data.map((l) => l.id)).toEqual([1, 2]);
    });
  });

  // -------------------------------------------------------------------------
  // AZ-01 source fence (ledger D30) — lives in THIS file, not a new one
  //
  // The behavioural cases above are the real proof. This one is cheap
  // belt-and-braces for the specific way this route regresses: because neither
  // the scoped client nor RLS filters leases by role (both connect as
  // `service_role`), deleting one of the three gate lines silently reopens the
  // whole community to any tenant, and a future test edit could relax the
  // 403 cases without noticing. Same idiom as
  // `apps/web/__tests__/api/root-exclusive-routes.test.ts` — which, unlike this
  // fence, cannot supply the behavioural half.
  //
  // Path is resolved from `import.meta.url`, so it survives a working-directory
  // change; the non-empty assertion below means a wrong path fails LOUDLY
  // instead of scanning nothing and passing.
  // -------------------------------------------------------------------------

  describe('AZ-01 source fence', () => {
    const routeSource = readFileSync(
      fileURLToPath(new URL('../../src/app/api/v1/leases/route.ts', import.meta.url)),
      'utf8',
    );

    it('reads a non-empty route source (the fence is not scanning nothing)', () => {
      expect(routeSource.length).toBeGreaterThan(1_000);
      expect(routeSource).toContain('export const GET');
    });

    it('gates all three mutating methods on units:write', () => {
      // Statement-shaped, not a bare substring: the file's own docblock names
      // the gate once per method, so a plain count would read 6 and pass even
      // if every real call were deleted. Anchoring on the indented statement
      // counts enforcement, not prose.
      const gateStatements = routeSource.match(
        /^ {4}requirePermission\(membership, 'units', 'write'\);$/gm,
      );
      expect(gateStatements).not.toBeNull();
      expect(gateStatements).toHaveLength(3);
    });

    it('keeps the non-manager read party-scoped to actorUserId', () => {
      expect(routeSource).toMatch(/=> l\.residentId === actorUserId/);
      // And the widening is driven by the resolved role, not anything the
      // caller controls.
      expect(routeSource).toMatch(/const seesAllLeases = isAdminRole\(membership\.role\);/);
    });
  });
});

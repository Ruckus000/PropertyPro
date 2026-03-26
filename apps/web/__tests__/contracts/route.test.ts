/**
 * Unit tests for contracts API route (P3-52).
 *
 * Tests cover:
 * - Feature gate: apartment blocked via hasCompliance=false
 * - Role gate: owner/tenant denied (admin roles only)
 * - Zod validation rejects invalid input
 * - Scoped queries prevent cross-tenant access
 * - Contract CRUD with audit logging
 * - Bid creation with audit logging
 * - Bid embargo hides details before close date, reveals after
 * - Document/checklist ownership validation
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  createScopedClientMock,
  logAuditEventMock,
  contractsTableMock,
  contractBidsTableMock,
  documentsTableMock,
  complianceChecklistItemsTableMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  contractsTableMock: { id: Symbol('contracts.id') },
  contractBidsTableMock: { id: Symbol('contract_bids.id') },
  documentsTableMock: { id: Symbol('documents.id') },
  complianceChecklistItemsTableMock: { id: Symbol('compliance_checklist_items.id') },
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  contracts: contractsTableMock,
  contractBids: contractBidsTableMock,
  documents: documentsTableMock,
  complianceChecklistItems: complianceChecklistItemsTableMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn().mockReturnValue('eq-filter'),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));


vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));
import { GET, POST, PATCH } from '../../src/app/api/v1/contracts/route';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function makeChainableBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  builder.orderBy = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue(builder);
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return builder;
}

function makeDefaultScopedClient(overrides: Record<string, unknown> = {}) {
  const query = vi.fn().mockImplementation(async (table: unknown) => {
    if (table === contractsTableMock) return [];
    if (table === contractBidsTableMock) return [];
    return [];
  });

  // selectFrom is used for single-record lookups in PATCH and POST handlers
  const selectFrom = vi.fn().mockImplementation((table: unknown) => {
    if (table === documentsTableMock) return makeChainableBuilder([{ id: 100, communityId: 42 }]);
    if (table === complianceChecklistItemsTableMock) return makeChainableBuilder([{ id: 200, communityId: 42 }]);
    // contracts and contractBids: default to empty (tests override as needed)
    return makeChainableBuilder([]);
  });

  return {
    query,
    selectFrom,
    insert: vi.fn().mockResolvedValue([
      {
        id: 1,
        communityId: 42,
        title: 'Test Contract',
        vendorName: 'Acme Corp',
        status: 'active',
      },
    ]),
    update: vi.fn().mockResolvedValue([
      {
        id: 1,
        communityId: 42,
        title: 'Updated Contract',
        status: 'active',
      },
    ]),
    softDelete: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('p3-52 contracts route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'session-user-1',
      communityId: 42,
      role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
      communityType: 'condo_718',
    });
    createScopedClientMock.mockReturnValue(makeDefaultScopedClient());
  });

  // -------------------------------------------------------------------------
  // Feature gate: apartment community → 403
  // -------------------------------------------------------------------------

  describe('compliance-only feature gate', () => {
    it('GET returns 403 for apartment community', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        userId: 'session-user-1',
        communityId: 42,
        role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Site Manager', presetKey: 'site_manager', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
        communityType: 'apartment',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/contracts?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it('POST returns 403 for apartment community', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        userId: 'session-user-1',
        communityId: 42,
        role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Site Manager', presetKey: 'site_manager', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
        communityType: 'apartment',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/contracts', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          title: 'Test',
          vendorName: 'Acme',
          startDate: '2026-01-01',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it('GET returns 200 for condo community', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/contracts?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(200);
    });

    it('GET returns 200 for HOA community', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        userId: 'session-user-1',
        communityId: 42,
        role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Community Manager', presetKey: 'cam', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
        communityType: 'hoa_720',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/contracts?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Role gate: non-admin → 403
  // -------------------------------------------------------------------------

  describe('admin role gate', () => {
    it('GET returns 403 for owner role', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        userId: 'session-user-1',
        communityId: 42,
        role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner',
        communityType: 'condo_718',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/contracts?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it('GET returns 403 for tenant role', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        userId: 'session-user-1',
        communityId: 42,
        role: 'resident', isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant',
        communityType: 'condo_718',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/contracts?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Zod validation
  // -------------------------------------------------------------------------

  describe('Zod validation', () => {
    it('POST rejects missing required fields', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/contracts', {
        method: 'POST',
        body: JSON.stringify({ communityId: 42 }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('Invalid contract payload');
    });

    it('POST rejects invalid date format', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/contracts', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          title: 'Test',
          vendorName: 'Acme',
          startDate: '01/01/2026',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('POST rejects invalid contractValue format', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/contracts', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          title: 'Test',
          vendorName: 'Acme',
          startDate: '2026-01-01',
          contractValue: 'abc',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('PATCH rejects missing id', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/contracts', {
        method: 'PATCH',
        body: JSON.stringify({ communityId: 42, title: 'Updated' }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(400);
    });

    it('GET rejects missing communityId', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/contracts');
      const res = await GET(req);
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Scoped queries
  // -------------------------------------------------------------------------

  describe('scoped query enforcement', () => {
    it('GET uses createScopedClient with the resolved communityId', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/contracts?communityId=42');
      await GET(req);
      expect(createScopedClientMock).toHaveBeenCalledWith(42);
    });
  });

  // -------------------------------------------------------------------------
  // POST — creating contracts
  // -------------------------------------------------------------------------

  describe('POST create contract', () => {
    it('creates a contract and logs audit event', async () => {
      const insert = vi.fn().mockResolvedValue([
        {
          id: 99,
          communityId: 42,
          title: 'Roof Maintenance',
          vendorName: 'RoofCo',
          status: 'active',
        },
      ]);
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ insert }));

      const req = new NextRequest('http://localhost:3000/api/v1/contracts', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          title: 'Roof Maintenance',
          vendorName: 'RoofCo',
          startDate: '2026-01-01',
          endDate: '2027-01-01',
          contractValue: '50000.00',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      const json = (await res.json()) as { data: { id: number } };

      expect(res.status).toBe(201);
      expect(json.data.id).toBe(99);
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create',
          resourceType: 'contract',
          resourceId: '99',
          communityId: 42,
        }),
      );
    });

    it('validates document belongs to same community', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === documentsTableMock) return makeChainableBuilder([]); // no document found
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/contracts', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          title: 'Test',
          vendorName: 'Acme',
          startDate: '2026-01-01',
          documentId: 999,
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('Document not found');
    });

    it('validates checklist item belongs to same community', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === complianceChecklistItemsTableMock) return makeChainableBuilder([]);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/contracts', {
        method: 'POST',
        body: JSON.stringify({
          communityId: 42,
          title: 'Test',
          vendorName: 'Acme',
          startDate: '2026-01-01',
          complianceChecklistItemId: 999,
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('Compliance checklist item not found');
    });
  });

  // -------------------------------------------------------------------------
  // POST — creating bids
  // -------------------------------------------------------------------------

  describe('POST create bid', () => {
    it('creates a bid and logs audit event', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === contractsTableMock) return makeChainableBuilder([{ id: 10, communityId: 42 }]);
        return makeChainableBuilder([]);
      });
      const insert = vi.fn().mockResolvedValue([
        { id: 5, contractId: 10, vendorName: 'BidCo', bidAmount: '25000.00' },
      ]);
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom, insert }));

      const req = new NextRequest('http://localhost:3000/api/v1/contracts', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add_bid',
          communityId: 42,
          contractId: 10,
          vendorName: 'BidCo',
          bidAmount: '25000.00',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create',
          resourceType: 'contract_bid',
          resourceId: '5',
        }),
      );
    });

    it('rejects bid for non-existent contract', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === contractsTableMock) return makeChainableBuilder([]);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/contracts', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add_bid',
          communityId: 42,
          contractId: 999,
          vendorName: 'BidCo',
          bidAmount: '25000.00',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH — updating contracts
  // -------------------------------------------------------------------------

  describe('PATCH', () => {
    it('updates contract and logs audit', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === contractsTableMock) {
          return makeChainableBuilder([{ id: 1, communityId: 42, title: 'Old Title', status: 'active' }]);
        }
        return makeChainableBuilder([]);
      });
      const update = vi.fn().mockResolvedValue([{ id: 1, title: 'New Title' }]);
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom, update }));

      const req = new NextRequest('http://localhost:3000/api/v1/contracts', {
        method: 'PATCH',
        body: JSON.stringify({ id: 1, communityId: 42, title: 'New Title' }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          resourceType: 'contract',
          resourceId: '1',
          oldValues: expect.objectContaining({ title: 'Old Title' }),
          newValues: expect.objectContaining({ title: 'New Title' }),
        }),
      );
    });

    it('returns 404 when contract not found', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === contractsTableMock) return makeChainableBuilder([]);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/contracts', {
        method: 'PATCH',
        body: JSON.stringify({ id: 999, communityId: 42, title: 'Updated' }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(404);
    });

    it('returns 400 when no update fields provided', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === contractsTableMock) return makeChainableBuilder([{ id: 1, communityId: 42 }]);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/contracts', {
        method: 'PATCH',
        body: JSON.stringify({ id: 1, communityId: 42 }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Bid embargo
  // -------------------------------------------------------------------------

  describe('bid embargo', () => {
    it('hides bid details when biddingClosesAt is in the future', async () => {
      const futureDate = new Date(Date.now() + 86400000); // tomorrow
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === contractsTableMock) {
          return [
            {
              id: 1,
              communityId: 42,
              title: 'Contract A',
              vendorName: 'Vendor A',
              description: null,
              contractValue: '10000.00',
              startDate: '2026-01-01',
              endDate: '2027-01-01',
              documentId: null,
              complianceChecklistItemId: null,
              biddingClosesAt: futureDate,
              conflictOfInterest: false,
              conflictOfInterestNote: null,
              status: 'active',
              createdBy: 'user-1',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
        }
        if (table === contractBidsTableMock) {
          return [
            { id: 1, contractId: 1, vendorName: 'Secret Bidder', bidAmount: '5000.00' },
            { id: 2, contractId: 1, vendorName: 'Another Bidder', bidAmount: '6000.00' },
          ];
        }
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

      const req = new NextRequest('http://localhost:3000/api/v1/contracts?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as {
        data: Array<{ bidSummary: { embargoed: boolean; bidCount: number; bids: unknown[] } }>;
      };

      expect(res.status).toBe(200);
      expect(json.data[0].bidSummary.embargoed).toBe(true);
      expect(json.data[0].bidSummary.bidCount).toBe(2);
      expect(json.data[0].bidSummary.bids).toHaveLength(0); // bids hidden
    });

    it('reveals bid details when biddingClosesAt is in the past', async () => {
      const pastDate = new Date(Date.now() - 86400000); // yesterday
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === contractsTableMock) {
          return [
            {
              id: 1,
              communityId: 42,
              title: 'Contract A',
              vendorName: 'Vendor A',
              description: null,
              contractValue: '10000.00',
              startDate: '2026-01-01',
              endDate: '2027-01-01',
              documentId: null,
              complianceChecklistItemId: null,
              biddingClosesAt: pastDate,
              conflictOfInterest: false,
              conflictOfInterestNote: null,
              status: 'active',
              createdBy: 'user-1',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
        }
        if (table === contractBidsTableMock) {
          return [
            { id: 1, contractId: 1, vendorName: 'Visible Bidder', bidAmount: '5000.00' },
          ];
        }
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

      const req = new NextRequest('http://localhost:3000/api/v1/contracts?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as {
        data: Array<{ bidSummary: { embargoed: boolean; bidCount: number; bids: unknown[] } }>;
      };

      expect(res.status).toBe(200);
      expect(json.data[0].bidSummary.embargoed).toBe(false);
      expect(json.data[0].bidSummary.bids).toHaveLength(1);
    });

    it('reveals bid details when biddingClosesAt is null', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === contractsTableMock) {
          return [
            {
              id: 1,
              communityId: 42,
              title: 'Contract A',
              vendorName: 'Vendor A',
              description: null,
              contractValue: null,
              startDate: '2026-01-01',
              endDate: null,
              documentId: null,
              complianceChecklistItemId: null,
              biddingClosesAt: null,
              conflictOfInterest: false,
              conflictOfInterestNote: null,
              status: 'active',
              createdBy: 'user-1',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
        }
        if (table === contractBidsTableMock) {
          return [{ id: 1, contractId: 1, vendorName: 'Bidder', bidAmount: '1000.00' }];
        }
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

      const req = new NextRequest('http://localhost:3000/api/v1/contracts?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as {
        data: Array<{ bidSummary: { embargoed: boolean; bids: unknown[] } }>;
      };

      expect(json.data[0].bidSummary.embargoed).toBe(false);
      expect(json.data[0].bidSummary.bids).toHaveLength(1);
    });
  });
});

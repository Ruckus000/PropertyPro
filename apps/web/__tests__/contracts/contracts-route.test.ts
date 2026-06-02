/**
 * Route unit tests — `GET`/`POST`/`PATCH /api/v1/contracts`.
 *
 * Added alongside the Plan A1 auto-drain of the contracts route to
 * `runRoute(contract, handler)`. Covers the contracted runner envelope:
 *
 * GET:
 *   - happy path → `{ data: { contracts, alerts } }` folded shape
 *   - bid embargo (future close → hidden, past/null → revealed)
 *   - 401 unauth
 *   - 400 missing communityId / 400 non-numeric communityId
 *   - 403 feature gate (apartment), 403 read-permission gate
 *   - scoped-client uses resolved communityId
 *
 * POST (action-dispatched create-contract vs add-bid):
 *   - create contract happy path + audit + optional-field `?? null` coercion
 *   - create bid happy path + audit
 *   - 401 unauth
 *   - 400 `'Invalid contract payload'` / `'Invalid bid payload'` (messages
 *     preserved byte-identical via handler-level safeParse)
 *   - 400 invalid date / contractValue format
 *   - 403 demo-grace (runs BEFORE membership), 403 feature gate, 403 perm
 *   - 404 bid for non-existent contract
 *   - doc / checklist ownership validation
 *
 * PATCH:
 *   - update happy path + audit (old/new values)
 *   - 400 missing id (contract-layer VALIDATION_ERROR)
 *   - 401 unauth
 *   - 404 contract not found
 *   - 400 no update fields
 *   - 403 demo-grace (runs BEFORE membership)
 *
 * `requireComplianceCommunity` uses the REAL `getFeaturesForCommunity` from
 * `@propertypro/shared` (condo_718/hoa_720 → hasCompliance true; apartment →
 * false), so the membership `communityType` drives the feature gate rather
 * than a mock.
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
  createScopedClientMock,
  logAuditEventMock,
  getContractExpirationAlertsMock,
  listContractsForCommunityMock,
  listContractBidsForCommunityMock,
  getContractByIdMock,
  getContractDocumentByIdMock,
  getContractChecklistItemByIdMock,
  createContractForCommunityMock,
  createContractBidForCommunityMock,
  updateContractByIdMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  getContractExpirationAlertsMock: vi.fn(),
  listContractsForCommunityMock: vi.fn(),
  listContractBidsForCommunityMock: vi.fn(),
  getContractByIdMock: vi.fn(),
  getContractDocumentByIdMock: vi.fn(),
  getContractChecklistItemByIdMock: vi.fn(),
  createContractForCommunityMock: vi.fn(),
  createContractBidForCommunityMock: vi.fn(),
  updateContractByIdMock: vi.fn(),
}));

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

vi.mock('@/lib/services/contract-renewal-alerts', () => ({
  getContractExpirationAlerts: getContractExpirationAlertsMock,
}));

vi.mock('@/lib/services/contract-service', () => ({
  listContractsForCommunity: listContractsForCommunityMock,
  listContractBidsForCommunity: listContractBidsForCommunityMock,
  getContractById: getContractByIdMock,
  getContractDocumentById: getContractDocumentByIdMock,
  getContractChecklistItemById: getContractChecklistItemByIdMock,
  createContractForCommunity: createContractForCommunityMock,
  createContractBidForCommunity: createContractBidForCommunityMock,
  updateContractById: updateContractByIdMock,
}));

import { GET, POST, PATCH } from '../../src/app/api/v1/contracts/route';

const ADMIN_MEMBERSHIP = {
  userId: 'session-user-1',
  communityId: 42,
  role: 'manager' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const SCOPED = { __scoped: true };

function getReq(communityId?: string): NextRequest {
  const url =
    communityId === undefined
      ? 'http://localhost:3000/api/v1/contracts'
      : `http://localhost:3000/api/v1/contracts?communityId=${communityId}`;
  return new NextRequest(url);
}

function jsonReq(
  method: 'POST' | 'PATCH',
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/contracts', {
    method,
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('contracts route (runRoute)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    createScopedClientMock.mockReturnValue(SCOPED);
    logAuditEventMock.mockResolvedValue(undefined);
    getContractExpirationAlertsMock.mockReturnValue([]);
    listContractsForCommunityMock.mockResolvedValue([]);
    listContractBidsForCommunityMock.mockResolvedValue([]);
    getContractByIdMock.mockResolvedValue(null);
    getContractDocumentByIdMock.mockResolvedValue({ id: 100, communityId: 42 });
    getContractChecklistItemByIdMock.mockResolvedValue({ id: 200, communityId: 42 });
    createContractForCommunityMock.mockResolvedValue({
      id: 1,
      communityId: 42,
      title: 'Test Contract',
      vendorName: 'Acme Corp',
      status: 'active',
    });
    createContractBidForCommunityMock.mockResolvedValue({
      id: 5,
      contractId: 10,
      vendorName: 'BidCo',
      bidAmount: '25000.00',
    });
    updateContractByIdMock.mockResolvedValue({ id: 1, title: 'New Title' });
  });

  // -------------------------------------------------------------------------
  // GET
  // -------------------------------------------------------------------------

  describe('GET', () => {
    it('returns the folded { data: { contracts, alerts } } envelope', async () => {
      const contractRow = {
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
        biddingClosesAt: null,
        conflictOfInterest: false,
        conflictOfInterestNote: null,
        status: 'active',
        createdBy: 'user-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      };
      listContractsForCommunityMock.mockResolvedValue([contractRow]);
      listContractBidsForCommunityMock.mockResolvedValue([]);
      getContractExpirationAlertsMock.mockReturnValue([
        { contractId: 1, title: 'Contract A', vendorName: 'Vendor A', endDate: '2027-01-01', daysUntilExpiry: 365, window: 'none' },
      ]);

      const res = await GET(getReq('42'));
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        data: { contracts: Array<{ id: number }>; alerts: Array<{ contractId: number }> };
      };
      expect(json.data.contracts).toHaveLength(1);
      expect(json.data.contracts[0].id).toBe(1);
      expect(json.data.alerts).toHaveLength(1);
      expect(json.data.alerts[0].contractId).toBe(1);
    });

    it('uses createScopedClient with the resolved communityId', async () => {
      await GET(getReq('42'));
      expect(createScopedClientMock).toHaveBeenCalledWith(42);
    });

    it('hides bid details when biddingClosesAt is in the future', async () => {
      const futureDate = new Date(Date.now() + 86_400_000);
      listContractsForCommunityMock.mockResolvedValue([
        {
          id: 1,
          communityId: 42,
          title: 'A',
          vendorName: 'V',
          startDate: '2026-01-01',
          endDate: '2027-01-01',
          biddingClosesAt: futureDate,
          conflictOfInterest: false,
          status: 'active',
          createdBy: 'u',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      listContractBidsForCommunityMock.mockResolvedValue([
        { id: 1, contractId: 1, vendorName: 'Secret', bidAmount: '5000.00' },
        { id: 2, contractId: 1, vendorName: 'Other', bidAmount: '6000.00' },
      ]);

      const res = await GET(getReq('42'));
      const json = (await res.json()) as {
        data: { contracts: Array<{ bidSummary: { embargoed: boolean; bidCount: number; bids: unknown[] } }> };
      };
      expect(json.data.contracts[0].bidSummary.embargoed).toBe(true);
      expect(json.data.contracts[0].bidSummary.bidCount).toBe(2);
      expect(json.data.contracts[0].bidSummary.bids).toHaveLength(0);
    });

    it('reveals bid details when biddingClosesAt is null', async () => {
      listContractsForCommunityMock.mockResolvedValue([
        {
          id: 1,
          communityId: 42,
          title: 'A',
          vendorName: 'V',
          startDate: '2026-01-01',
          endDate: null,
          biddingClosesAt: null,
          conflictOfInterest: false,
          status: 'active',
          createdBy: 'u',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      listContractBidsForCommunityMock.mockResolvedValue([
        { id: 1, contractId: 1, vendorName: 'Bidder', bidAmount: '1000.00' },
      ]);

      const res = await GET(getReq('42'));
      const json = (await res.json()) as {
        data: { contracts: Array<{ bidSummary: { embargoed: boolean; bids: unknown[] } }> };
      };
      expect(json.data.contracts[0].bidSummary.embargoed).toBe(false);
      expect(json.data.contracts[0].bidSummary.bids).toHaveLength(1);
    });

    it('returns 401 when unauthenticated', async () => {
      requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
      const res = await GET(getReq('42'));
      expect(res.status).toBe(401);
    });

    it('returns 400 when communityId is missing', async () => {
      const res = await GET(getReq(undefined));
      expect(res.status).toBe(400);
    });

    it('returns 400 when communityId is non-numeric', async () => {
      const res = await GET(getReq('abc'));
      expect(res.status).toBe(400);
    });

    it('returns 400 when communityId is zero', async () => {
      const res = await GET(getReq('0'));
      expect(res.status).toBe(400);
    });

    it('returns 403 for an apartment community (feature gate)', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        ...ADMIN_MEMBERSHIP,
        communityType: 'apartment' as const,
      });
      const res = await GET(getReq('42'));
      expect(res.status).toBe(403);
      // Permission gate is downstream of the feature gate — not reached.
      expect(requirePermissionMock).not.toHaveBeenCalled();
    });

    it('returns 403 when read permission is denied', async () => {
      requirePermissionMock.mockImplementationOnce(() => {
        throw new ForbiddenError('Forbidden');
      });
      const res = await GET(getReq('42'));
      expect(res.status).toBe(403);
      expect(listContractsForCommunityMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // POST — create contract
  // -------------------------------------------------------------------------

  describe('POST create contract', () => {
    it('creates a contract and logs the audit event', async () => {
      createContractForCommunityMock.mockResolvedValue({
        id: 99,
        communityId: 42,
        title: 'Roof Maintenance',
        vendorName: 'RoofCo',
        status: 'active',
      });

      const res = await POST(
        jsonReq('POST', {
          communityId: 42,
          title: 'Roof Maintenance',
          vendorName: 'RoofCo',
          startDate: '2026-01-01',
          endDate: '2027-01-01',
          contractValue: '50000.00',
        }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: { id: number } };
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

    it('coerces omitted optional fields to null when creating', async () => {
      await POST(
        jsonReq('POST', {
          communityId: 42,
          title: 'Minimal',
          vendorName: 'Acme',
          startDate: '2026-01-01',
        }),
      );
      expect(createContractForCommunityMock).toHaveBeenCalledWith(
        SCOPED,
        expect.objectContaining({
          description: null,
          contractValue: null,
          endDate: null,
          documentId: null,
          complianceChecklistItemId: null,
          biddingClosesAt: null,
          conflictOfInterest: false,
          conflictOfInterestNote: null,
          status: 'active',
        }),
      );
    });

    it('returns 401 when unauthenticated', async () => {
      requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
      const res = await POST(
        jsonReq('POST', {
          communityId: 42,
          title: 'T',
          vendorName: 'A',
          startDate: '2026-01-01',
        }),
      );
      expect(res.status).toBe(401);
    });

    it('rejects missing required fields with "Invalid contract payload"', async () => {
      const res = await POST(jsonReq('POST', { communityId: 42 }));
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('Invalid contract payload');
    });

    it('rejects invalid date format', async () => {
      const res = await POST(
        jsonReq('POST', {
          communityId: 42,
          title: 'T',
          vendorName: 'A',
          startDate: '01/01/2026',
        }),
      );
      expect(res.status).toBe(400);
    });

    it('rejects invalid contractValue format', async () => {
      const res = await POST(
        jsonReq('POST', {
          communityId: 42,
          title: 'T',
          vendorName: 'A',
          startDate: '2026-01-01',
          contractValue: 'abc',
        }),
      );
      expect(res.status).toBe(400);
    });

    it('returns 403 when demo-grace blocks (before membership)', async () => {
      assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));
      const res = await POST(
        jsonReq('POST', {
          communityId: 42,
          title: 'T',
          vendorName: 'A',
          startDate: '2026-01-01',
        }),
      );
      expect(res.status).toBe(403);
      expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    });

    it('returns 403 for an apartment community (feature gate)', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        ...ADMIN_MEMBERSHIP,
        communityType: 'apartment' as const,
      });
      const res = await POST(
        jsonReq('POST', {
          communityId: 42,
          title: 'T',
          vendorName: 'A',
          startDate: '2026-01-01',
        }),
      );
      expect(res.status).toBe(403);
    });

    it('returns 403 when write permission is denied', async () => {
      requirePermissionMock.mockImplementationOnce(() => {
        throw new ForbiddenError('Forbidden');
      });
      const res = await POST(
        jsonReq('POST', {
          communityId: 42,
          title: 'T',
          vendorName: 'A',
          startDate: '2026-01-01',
        }),
      );
      expect(res.status).toBe(403);
      expect(createContractForCommunityMock).not.toHaveBeenCalled();
    });

    it('validates document belongs to same community', async () => {
      getContractDocumentByIdMock.mockResolvedValue(null);
      const res = await POST(
        jsonReq('POST', {
          communityId: 42,
          title: 'T',
          vendorName: 'A',
          startDate: '2026-01-01',
          documentId: 999,
        }),
      );
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('Document not found');
    });

    it('validates checklist item belongs to same community', async () => {
      getContractChecklistItemByIdMock.mockResolvedValue(null);
      const res = await POST(
        jsonReq('POST', {
          communityId: 42,
          title: 'T',
          vendorName: 'A',
          startDate: '2026-01-01',
          complianceChecklistItemId: 999,
        }),
      );
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('Compliance checklist item not found');
    });
  });

  // -------------------------------------------------------------------------
  // POST — create bid
  // -------------------------------------------------------------------------

  describe('POST create bid', () => {
    it('creates a bid and logs the audit event', async () => {
      getContractByIdMock.mockResolvedValue({ id: 10, communityId: 42 });
      createContractBidForCommunityMock.mockResolvedValue({
        id: 5,
        contractId: 10,
        vendorName: 'BidCo',
        bidAmount: '25000.00',
      });

      const res = await POST(
        jsonReq('POST', {
          action: 'add_bid',
          communityId: 42,
          contractId: 10,
          vendorName: 'BidCo',
          bidAmount: '25000.00',
        }),
      );
      expect(res.status).toBe(200);
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create',
          resourceType: 'contract_bid',
          resourceId: '5',
        }),
      );
    });

    it('coerces omitted optional notes to null when creating a bid', async () => {
      getContractByIdMock.mockResolvedValue({ id: 10, communityId: 42 });
      await POST(
        jsonReq('POST', {
          action: 'add_bid',
          communityId: 42,
          contractId: 10,
          vendorName: 'BidCo',
          bidAmount: '25000.00',
        }),
      );
      expect(createContractBidForCommunityMock).toHaveBeenCalledWith(
        SCOPED,
        expect.objectContaining({ notes: null }),
      );
    });

    it('rejects an invalid bid payload with "Invalid bid payload"', async () => {
      const res = await POST(
        jsonReq('POST', { action: 'add_bid', communityId: 42 }),
      );
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('Invalid bid payload');
    });

    it('returns 404 for a bid against a non-existent contract', async () => {
      getContractByIdMock.mockResolvedValue(null);
      const res = await POST(
        jsonReq('POST', {
          action: 'add_bid',
          communityId: 42,
          contractId: 999,
          vendorName: 'BidCo',
          bidAmount: '25000.00',
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH
  // -------------------------------------------------------------------------

  describe('PATCH', () => {
    it('updates a contract and logs the audit event', async () => {
      getContractByIdMock.mockResolvedValue({
        id: 1,
        communityId: 42,
        title: 'Old Title',
        status: 'active',
      });
      updateContractByIdMock.mockResolvedValue({ id: 1, title: 'New Title' });

      const res = await PATCH(
        jsonReq('PATCH', { id: 1, communityId: 42, title: 'New Title' }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: { id: number } };
      expect(json.data.id).toBe(1);
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

    it('returns 401 when unauthenticated', async () => {
      requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
      const res = await PATCH(
        jsonReq('PATCH', { id: 1, communityId: 42, title: 'X' }),
      );
      expect(res.status).toBe(401);
    });

    it('returns 400 when id is missing (contract-layer validation)', async () => {
      const res = await PATCH(
        jsonReq('PATCH', { communityId: 42, title: 'Updated' }),
      );
      expect(res.status).toBe(400);
    });

    it('returns 404 when the contract is not found', async () => {
      getContractByIdMock.mockResolvedValue(null);
      const res = await PATCH(
        jsonReq('PATCH', { id: 999, communityId: 42, title: 'Updated' }),
      );
      expect(res.status).toBe(404);
    });

    it('returns 400 when there are no fields to update', async () => {
      getContractByIdMock.mockResolvedValue({ id: 1, communityId: 42 });
      const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42 }));
      expect(res.status).toBe(400);
    });

    it('returns 403 when demo-grace blocks (before membership)', async () => {
      assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));
      const res = await PATCH(
        jsonReq('PATCH', { id: 1, communityId: 42, title: 'X' }),
      );
      expect(res.status).toBe(403);
      expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    });
  });
});

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
import { CLOSING_TIME_LOCKED_MESSAGE } from '../../src/lib/contracts/bid-sealing';
import {
  CONTRACT_AMOUNT_MESSAGE,
  CONTRACT_AMOUNT_TOO_LARGE_MESSAGE,
  CONTRACT_END_BEFORE_START_MESSAGE,
  CONTRACT_TITLE_REQUIRED_MESSAGE,
  CONTRACT_VENDOR_REQUIRED_MESSAGE,
} from '../../src/lib/contracts/contract-rules';

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
  updateContractGuardingSealedBidsMock,
  auditSpy,
  locked,
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
  updateContractGuardingSealedBidsMock: vi.fn(),
  // What the service hands the scoped client's logAudit, inside the transaction.
  auditSpy: vi.fn(),
  // The contract row as the service sees it UNDER THE LOCK (null: same as the first read).
  locked: { row: null as Record<string, unknown> | null },
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

// The reads and writes are stand-ins; the sealing rule is NOT. `applyBidEmbargo`
// lives in this module and the route must run the real one, or the embargo
// tests below would only prove that a mock returns what it was told to.
vi.mock('@/lib/services/contract-service', async (importOriginal) => ({
  applyBidEmbargo: (await importOriginal<typeof import('../../src/lib/services/contract-service')>())
    .applyBidEmbargo,
  listContractsForCommunity: listContractsForCommunityMock,
  listContractBidsForCommunity: listContractBidsForCommunityMock,
  getContractById: getContractByIdMock,
  getContractDocumentById: getContractDocumentByIdMock,
  getContractChecklistItemById: getContractChecklistItemByIdMock,
  createContractForCommunity: createContractForCommunityMock,
  createContractBidForCommunity: createContractBidForCommunityMock,
  updateContractById: updateContractByIdMock,
  updateContractGuardingSealedBids: updateContractGuardingSealedBidsMock,
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
    locked.row = null;
    // The service writes its audit entry inside its own transaction; these
    // stand-ins run the route's audit builder the way the service does.
    const lockedRow = async () => locked.row ?? ((await getContractByIdMock()) as Record<string, unknown>);
    createContractBidForCommunityMock.mockImplementation(async (_s, _values, audit) => {
      const row = { id: 5, contractId: 10, vendorName: 'BidCo', bidAmount: '25000.00' };
      auditSpy(audit(row));
      return row;
    });
    updateContractByIdMock.mockImplementation(async (_s, _id, _values, audit) => {
      auditSpy(audit(await lockedRow()));
      return { id: 1, title: 'New Title' };
    });
    updateContractGuardingSealedBidsMock.mockImplementation(async (_s, _id, _values, _now, audit) => {
      const before = await lockedRow();
      auditSpy(audit(before));
      return { status: 'updated', row: { id: 1 }, before };
    });
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
      expect(json.data.contracts[0]!.id).toBe(1);
      expect(json.data.alerts).toHaveLength(1);
      expect(json.data.alerts[0]!.contractId).toBe(1);
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
      expect(json.data.contracts[0]!.bidSummary.embargoed).toBe(true);
      expect(json.data.contracts[0]!.bidSummary.bidCount).toBe(2);
      expect(json.data.contracts[0]!.bidSummary.bids).toHaveLength(0);
    });

    it('a sealed contract: no bid vendor, amount or note is anywhere in the response', async () => {
      listContractsForCommunityMock.mockResolvedValue([
        {
          id: 1,
          communityId: 42,
          title: 'A',
          vendorName: 'V',
          startDate: '2026-01-01',
          endDate: '2027-01-01',
          biddingClosesAt: new Date(Date.now() + 86_400_000),
          conflictOfInterest: false,
          status: 'active',
          createdBy: 'u',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      listContractBidsForCommunityMock.mockResolvedValue([
        { id: 1, contractId: 1, vendorName: 'Zephyr Roofing', bidAmount: '48250.00', notes: 'Includes tear-off' },
      ]);

      const body = await (await GET(getReq('42'))).text();
      expect(body).toContain('"bidCount":1');
      for (const secret of ['Zephyr Roofing', '48250', 'Includes tear-off']) {
        expect(body).not.toContain(secret);
      }
    });

    it('reveals bid details once biddingClosesAt has passed', async () => {
      listContractsForCommunityMock.mockResolvedValue([
        {
          id: 1,
          communityId: 42,
          title: 'A',
          vendorName: 'V',
          startDate: '2026-01-01',
          endDate: null,
          biddingClosesAt: new Date(Date.now() - 86_400_000),
          conflictOfInterest: false,
          status: 'active',
          createdBy: 'u',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      listContractBidsForCommunityMock.mockResolvedValue([
        { id: 1, contractId: 1, vendorName: 'Zephyr Roofing', bidAmount: '48250.00' },
      ]);

      const body = await (await GET(getReq('42'))).text();
      expect(body).toContain('Zephyr Roofing');
      expect(body).toContain('"embargoed":false');
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
      expect(json.data.contracts[0]!.bidSummary.embargoed).toBe(false);
      expect(json.data.contracts[0]!.bidSummary.bids).toHaveLength(1);
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

    it('refuses 1,200 as a value and says how to write an amount', async () => {
      const res = await POST(
        jsonReq('POST', {
          communityId: 42,
          title: 'T',
          vendorName: 'A',
          startDate: '2026-01-01',
          contractValue: '1,200',
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.text()).toContain(CONTRACT_AMOUNT_MESSAGE);
      expect(createContractForCommunityMock).not.toHaveBeenCalled();
    });

    it('refuses an amount numeric(12,2) cannot hold with a 400 that says so, and accepts the largest it can', async () => {
      const tooLarge = await POST(
        jsonReq('POST', {
          communityId: 42,
          title: 'T',
          vendorName: 'A',
          startDate: '2026-01-01',
          contractValue: '10000000000',
        }),
      );
      expect(tooLarge.status).toBe(400);
      expect(await tooLarge.text()).toContain(CONTRACT_AMOUNT_TOO_LARGE_MESSAGE);
      expect(createContractForCommunityMock).not.toHaveBeenCalled();

      const largest = await POST(
        jsonReq('POST', {
          communityId: 42,
          title: 'T',
          vendorName: 'A',
          startDate: '2026-01-01',
          contractValue: '9999999999.99',
        }),
      );
      expect(largest.status).toBe(200);
    });

    it('refuses a title or vendor name made only of spaces, naming the field, and stores names trimmed', async () => {
      const blankTitle = await POST(
        jsonReq('POST', { communityId: 42, title: '   ', vendorName: 'A', startDate: '2026-01-01' }),
      );
      expect(blankTitle.status).toBe(400);
      expect(((await blankTitle.json()) as { error: { message: string } }).error.message).toBe(
        CONTRACT_TITLE_REQUIRED_MESSAGE,
      );

      const blankVendor = await POST(
        jsonReq('POST', { communityId: 42, title: 'T', vendorName: ' \t ', startDate: '2026-01-01' }),
      );
      expect(blankVendor.status).toBe(400);
      expect(((await blankVendor.json()) as { error: { message: string } }).error.message).toBe(
        CONTRACT_VENDOR_REQUIRED_MESSAGE,
      );
      expect(createContractForCommunityMock).not.toHaveBeenCalled();

      await POST(
        jsonReq('POST', { communityId: 42, title: '  Roof  ', vendorName: ' RoofCo ', startDate: '2026-01-01' }),
      );
      expect(createContractForCommunityMock).toHaveBeenCalledWith(
        SCOPED,
        expect.objectContaining({ title: 'Roof', vendorName: 'RoofCo' }),
      );
    });

    it('refuses an end date before the start date, with the stated message', async () => {
      const res = await POST(
        jsonReq('POST', {
          communityId: 42,
          title: 'T',
          vendorName: 'A',
          startDate: '2026-03-01',
          endDate: '2026-02-28',
        }),
      );
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toBe(CONTRACT_END_BEFORE_START_MESSAGE);
      expect(createContractForCommunityMock).not.toHaveBeenCalled();
    });

    it('accepts a contract that starts and ends on the same day', async () => {
      const res = await POST(
        jsonReq('POST', {
          communityId: 42,
          title: 'T',
          vendorName: 'A',
          startDate: '2026-03-01',
          endDate: '2026-03-01',
        }),
      );
      expect(res.status).toBe(200);
    });

    it('saves the status and the conflict-of-interest note it is given', async () => {
      await POST(
        jsonReq('POST', {
          communityId: 42,
          title: 'T',
          vendorName: 'A',
          startDate: '2026-01-01',
          status: 'draft',
          conflictOfInterest: true,
          conflictOfInterestNote: 'Treasurer owns the vendor',
        }),
      );
      expect(createContractForCommunityMock).toHaveBeenCalledWith(
        SCOPED,
        expect.objectContaining({
          status: 'draft',
          conflictOfInterest: true,
          conflictOfInterestNote: 'Treasurer owns the vendor',
        }),
      );
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
      expect(logAuditEventMock).not.toHaveBeenCalled();
      expect(auditSpy).toHaveBeenCalledWith({
        userId: 'session-user-1',
        action: 'create',
        resourceType: 'contract_bid',
        resourceId: '5',
        newValues: { contractId: 10, vendorName: 'BidCo', bidAmount: '25000.00' },
      });
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
        expect.any(Function),
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

    it('refuses 1,200 as a bid amount and says how to write an amount', async () => {
      getContractByIdMock.mockResolvedValue({ id: 10, communityId: 42 });
      const res = await POST(
        jsonReq('POST', {
          action: 'add_bid',
          communityId: 42,
          contractId: 10,
          vendorName: 'BidCo',
          bidAmount: '1,200',
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.text()).toContain(CONTRACT_AMOUNT_MESSAGE);
      expect(createContractBidForCommunityMock).not.toHaveBeenCalled();
    });

    it('refuses a bid amount numeric(12,2) cannot hold, and a vendor name made only of spaces', async () => {
      getContractByIdMock.mockResolvedValue({ id: 10, communityId: 42 });
      const tooLarge = await POST(
        jsonReq('POST', {
          action: 'add_bid',
          communityId: 42,
          contractId: 10,
          vendorName: 'BidCo',
          bidAmount: '12345678901.00',
        }),
      );
      expect(tooLarge.status).toBe(400);
      expect(await tooLarge.text()).toContain(CONTRACT_AMOUNT_TOO_LARGE_MESSAGE);

      const blankVendor = await POST(
        jsonReq('POST', {
          action: 'add_bid',
          communityId: 42,
          contractId: 10,
          vendorName: '   ',
          bidAmount: '100',
        }),
      );
      expect(blankVendor.status).toBe(400);
      expect(((await blankVendor.json()) as { error: { message: string } }).error.message).toBe(
        CONTRACT_VENDOR_REQUIRED_MESSAGE,
      );
      expect(createContractBidForCommunityMock).not.toHaveBeenCalled();
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

      const res = await PATCH(
        jsonReq('PATCH', { id: 1, communityId: 42, title: 'New Title' }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: { id: number } };
      expect(json.data.id).toBe(1);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          resourceType: 'contract',
          resourceId: '1',
          oldValues: expect.objectContaining({ title: 'Old Title' }),
          newValues: expect.objectContaining({ title: 'New Title' }),
        }),
      );
    });

    const STORED = {
      id: 1,
      communityId: 42,
      title: 'Old Title',
      status: 'active',
      startDate: '2026-03-01',
      endDate: '2026-12-31',
    };

    it('refuses an end date before the STORED start date when only the end date is sent', async () => {
      getContractByIdMock.mockResolvedValue(STORED);
      const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, endDate: '2026-02-28' }));
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toBe(CONTRACT_END_BEFORE_START_MESSAGE);
      expect(updateContractByIdMock).not.toHaveBeenCalled();
    });

    it('refuses a start date after the STORED end date when only the start date is sent', async () => {
      getContractByIdMock.mockResolvedValue(STORED);
      const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, startDate: '2027-01-01' }));
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toBe(CONTRACT_END_BEFORE_START_MESSAGE);
      expect(updateContractByIdMock).not.toHaveBeenCalled();
    });

    it('accepts both dates moved together, and an end date cleared to open-ended', async () => {
      getContractByIdMock.mockResolvedValue(STORED);
      const moved = await PATCH(
        jsonReq('PATCH', { id: 1, communityId: 42, startDate: '2027-01-01', endDate: '2027-12-31' }),
      );
      expect(moved.status).toBe(200);
      const cleared = await PATCH(
        jsonReq('PATCH', { id: 1, communityId: 42, startDate: '2027-01-01', endDate: null }),
      );
      expect(cleared.status).toBe(200);
    });

    it('an update that sends neither date is not refused for dates already stored out of order', async () => {
      getContractByIdMock.mockResolvedValue({ ...STORED, startDate: '2026-03-01', endDate: '2026-01-01' });
      const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, title: 'Renamed' }));
      expect(res.status).toBe(200);
    });

    it('refuses 1,200 as a value and says how to write an amount', async () => {
      getContractByIdMock.mockResolvedValue(STORED);
      const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, contractValue: '1,200' }));
      expect(res.status).toBe(400);
      expect(await res.text()).toContain(CONTRACT_AMOUNT_MESSAGE);
      expect(updateContractByIdMock).not.toHaveBeenCalled();
    });

    it('refuses an amount numeric(12,2) cannot hold', async () => {
      getContractByIdMock.mockResolvedValue(STORED);
      const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, contractValue: '10000000000' }));
      expect(res.status).toBe(400);
      expect(await res.text()).toContain(CONTRACT_AMOUNT_TOO_LARGE_MESSAGE);
      expect(updateContractByIdMock).not.toHaveBeenCalled();
    });

    it('refuses a title or vendor name made only of spaces, naming the field, and stores names trimmed', async () => {
      getContractByIdMock.mockResolvedValue(STORED);
      const blankTitle = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, title: '   ' }));
      expect(blankTitle.status).toBe(400);
      expect(((await blankTitle.json()) as { error: { message: string } }).error.message).toBe(
        CONTRACT_TITLE_REQUIRED_MESSAGE,
      );
      const blankVendor = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, vendorName: '  ' }));
      expect(blankVendor.status).toBe(400);
      expect(((await blankVendor.json()) as { error: { message: string } }).error.message).toBe(
        CONTRACT_VENDOR_REQUIRED_MESSAGE,
      );
      expect(updateContractByIdMock).not.toHaveBeenCalled();

      await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, title: '  Roof  ' }));
      expect(updateContractByIdMock).toHaveBeenCalledWith(SCOPED, 1, { title: 'Roof' }, expect.any(Function));
    });

    it('stores the bidding-close time as the instant it was sent, and audits the text', async () => {
      getContractByIdMock.mockResolvedValue({ ...STORED, biddingClosesAt: null });
      const res = await PATCH(
        jsonReq('PATCH', { id: 1, communityId: 42, biddingClosesAt: '2026-12-12T22:00:00.000Z' }),
      );
      expect(res.status).toBe(200);
      // The column takes a Date: ISO text handed to the driver throws.
      // And a change to the closing time goes through the guarded update, not the plain one.
      expect(updateContractByIdMock).not.toHaveBeenCalled();
      const values = updateContractGuardingSealedBidsMock.mock.calls[0]![2] as { biddingClosesAt: unknown };
      expect(values.biddingClosesAt).toBeInstanceOf(Date);
      expect((values.biddingClosesAt as Date).toISOString()).toBe('2026-12-12T22:00:00.000Z');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          oldValues: { biddingClosesAt: null },
          newValues: { biddingClosesAt: '2026-12-12T22:00:00.000Z' },
        }),
      );
    });

    it('clears the bidding-close time with null', async () => {
      getContractByIdMock.mockResolvedValue(STORED);
      await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, biddingClosesAt: null }));
      expect(updateContractGuardingSealedBidsMock).toHaveBeenCalledWith(
        SCOPED,
        1,
        { biddingClosesAt: null },
        expect.any(Date),
        expect.any(Function),
      );
      expect(updateContractByIdMock).not.toHaveBeenCalled();
    });

    it('sealed with bids: a closing time that would open them early is refused, and nothing is audited', async () => {
      getContractByIdMock.mockResolvedValue({ ...STORED, biddingClosesAt: new Date('2099-01-01T00:00:00Z') });
      updateContractGuardingSealedBidsMock.mockResolvedValue({ status: 'closing_time_locked' });

      for (const biddingClosesAt of [null, '2020-01-01T00:00:00.000Z']) {
        const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, biddingClosesAt }));
        expect(res.status).toBe(400);
        const json = (await res.json()) as { error: { message: string } };
        expect(json.error.message).toBe(CLOSING_TIME_LOCKED_MESSAGE);
      }
      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('an accepted change to the closing time is still audited with its old and new values', async () => {
      const stored = new Date('2026-12-12T22:00:00.000Z');
      getContractByIdMock.mockResolvedValue({ ...STORED, biddingClosesAt: stored });

      const res = await PATCH(
        jsonReq('PATCH', { id: 1, communityId: 42, biddingClosesAt: '2026-12-20T22:00:00.000Z' }),
      );
      expect(res.status).toBe(200);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          resourceType: 'contract',
          resourceId: '1',
          oldValues: { biddingClosesAt: stored },
          newValues: { biddingClosesAt: '2026-12-20T22:00:00.000Z' },
        }),
      );
    });

    it('404 when the contract disappears between the first read and the guarded update', async () => {
      getContractByIdMock.mockResolvedValue(STORED);
      updateContractGuardingSealedBidsMock.mockResolvedValue({ status: 'not_found' });
      const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, biddingClosesAt: null }));
      expect(res.status).toBe(404);
    });

    it('an update that does not touch the closing time does not go through the guard', async () => {
      getContractByIdMock.mockResolvedValue(STORED);
      await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, title: 'Renamed' }));
      expect(updateContractByIdMock).toHaveBeenCalledWith(SCOPED, 1, { title: 'Renamed' }, expect.any(Function));
      expect(updateContractGuardingSealedBidsMock).not.toHaveBeenCalled();
    });

    it('saves a new status and conflict-of-interest note', async () => {
      getContractByIdMock.mockResolvedValue(STORED);
      const res = await PATCH(
        jsonReq('PATCH', {
          id: 1,
          communityId: 42,
          status: 'terminated',
          conflictOfInterest: true,
          conflictOfInterestNote: 'Treasurer owns the vendor',
        }),
      );
      expect(res.status).toBe(200);
      expect(updateContractByIdMock).toHaveBeenCalledWith(
        SCOPED,
        1,
        {
          status: 'terminated',
          conflictOfInterest: true,
          conflictOfInterestNote: 'Treasurer owns the vendor',
        },
        expect.any(Function),
      );
    });

    it('the audit entry is built in the service (inside its transaction), not written by the route afterwards', async () => {
      getContractByIdMock.mockResolvedValue(STORED);
      await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, title: 'Renamed' }));
      expect(logAuditEventMock).not.toHaveBeenCalled();
      expect(auditSpy).toHaveBeenCalledTimes(1);
    });

    it('the audit old values come from the row read under the lock, not the unlocked first read', async () => {
      getContractByIdMock.mockResolvedValue({ ...STORED, title: 'Stale title' });
      locked.row = { ...STORED, title: 'Title under the lock' };
      const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, title: 'Renamed' }));
      expect(res.status).toBe(200);
      expect(auditSpy).toHaveBeenCalledWith({
        userId: 'session-user-1',
        action: 'update',
        resourceType: 'contract',
        resourceId: '1',
        oldValues: { title: 'Title under the lock' },
        newValues: { title: 'Renamed' },
      });
    });

    it('the same holds for an update that touches the closing time', async () => {
      getContractByIdMock.mockResolvedValue({ ...STORED, biddingClosesAt: null });
      locked.row = { ...STORED, biddingClosesAt: new Date('2026-12-12T22:00:00.000Z') };
      await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, biddingClosesAt: '2026-12-20T22:00:00.000Z' }));
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          oldValues: { biddingClosesAt: new Date('2026-12-12T22:00:00.000Z') },
          newValues: { biddingClosesAt: '2026-12-20T22:00:00.000Z' },
        }),
      );
    });

    it('a blank title from someone who may not write is refused as forbidden, not as invalid', async () => {
      requirePermissionMock.mockImplementationOnce(() => {
        throw new ForbiddenError('No write access');
      });
      const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, title: '   ' }));
      expect(res.status).toBe(403);
    });

    it('a blank title is not examined before the membership is', async () => {
      requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));
      const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, vendorName: '  ' }));
      expect(res.status).toBe(403);
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

/**
 * Route unit test — `GET /api/v1/ledger/balance/[unitId]`.
 *
 * Added alongside the Plan A1 drain (drain #3). The route had only an
 * integration test before (DB-backed, gated on `DATABASE_URL`); this
 * adds isolated unit coverage of the auth chain, owner-vs-staff branch,
 * params validation, and the runner's envelope wrapping.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireFinanceEnabledMock,
  requireFinanceReadPermissionMock,
  getLedgerBalanceForUnitMock,
  listActorUnitIdsForFinanceMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireFinanceEnabledMock: vi.fn(),
  requireFinanceReadPermissionMock: vi.fn(),
  getLedgerBalanceForUnitMock: vi.fn(),
  listActorUnitIdsForFinanceMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/common', () => ({
  requirePaymentsEnabled: vi.fn(),
  requireFinanceEnabled: requireFinanceEnabledMock,
  requireFinanceReadPermission: requireFinanceReadPermissionMock,
}));

vi.mock('@/lib/services/finance-service', () => ({
  getLedgerBalanceForUnit: getLedgerBalanceForUnitMock,
  listActorUnitIdsForFinance: listActorUnitIdsForFinanceMock,
}));

import { GET } from '../../src/app/api/v1/ledger/balance/[unitId]/route';

const STAFF_MEMBERSHIP = {
  userId: 'staff-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'CAM',
  communityType: 'condo_718' as const,
};

const OWNER_MEMBERSHIP = {
  userId: 'owner-1',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Unit Owner',
  communityType: 'condo_718' as const,
};

interface EnvelopeJson {
  data: {
    unitId: number;
    balanceCents: number;
    balanceDollars: string;
  };
}

function buildReq(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

function ctx(unitId: number | string): { params: Promise<Record<string, string>> } {
  return { params: Promise.resolve({ unitId: String(unitId) }) };
}

describe('GET /api/v1/ledger/balance/[unitId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireFinanceEnabledMock.mockResolvedValue(undefined);
  });

  it('returns balance for staff member (no owner-unit restriction)', async () => {
    requireCommunityMembershipMock.mockResolvedValue(STAFF_MEMBERSHIP);
    getLedgerBalanceForUnitMock.mockResolvedValue(12345);

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/ledger/balance/7?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as EnvelopeJson;
    expect(json.data).toEqual({
      unitId: 7,
      balanceCents: 12345,
      balanceDollars: '123.45',
    });
    expect(requireFinanceReadPermissionMock).toHaveBeenCalledWith(STAFF_MEMBERSHIP);
    expect(listActorUnitIdsForFinanceMock).not.toHaveBeenCalled();
    expect(getLedgerBalanceForUnitMock).toHaveBeenCalledWith(42, 7);
  });

  it('returns balance for owner accessing their own unit', async () => {
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([7]);
    getLedgerBalanceForUnitMock.mockResolvedValue(0);

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/ledger/balance/7?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as EnvelopeJson;
    expect(json.data).toEqual({
      unitId: 7,
      balanceCents: 0,
      balanceDollars: '0.00',
    });
    expect(listActorUnitIdsForFinanceMock).toHaveBeenCalledWith(42, 'user-1');
    expect(requireFinanceReadPermissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when owner asks for a unit they do not own', async () => {
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([7]);

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/ledger/balance/99?communityId=42'),
      ctx(99),
    );

    expect(res.status).toBe(403);
    expect(getLedgerBalanceForUnitMock).not.toHaveBeenCalled();
  });

  it('returns 403 when owner has no unit associations at all', async () => {
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([]);

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/ledger/balance/7?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(403);
    expect(getLedgerBalanceForUnitMock).not.toHaveBeenCalled();
  });

  it('returns 403 when finance read permission is denied for staff', async () => {
    requireCommunityMembershipMock.mockResolvedValue(STAFF_MEMBERSHIP);
    requireFinanceReadPermissionMock.mockImplementation(() => {
      throw new ForbiddenError('Insufficient finance read permission');
    });

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/ledger/balance/7?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(403);
    expect(getLedgerBalanceForUnitMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/ledger/balance/7?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(401);
    expect(getLedgerBalanceForUnitMock).not.toHaveBeenCalled();
  });

  it('returns 400 when unitId is not a positive integer', async () => {
    const res = await GET(
      buildReq('http://localhost:3000/api/v1/ledger/balance/not-a-number?communityId=42'),
      ctx('not-a-number'),
    );

    expect(res.status).toBe(400);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(getLedgerBalanceForUnitMock).not.toHaveBeenCalled();
  });

  it('returns 400 when unitId is zero', async () => {
    const res = await GET(
      buildReq('http://localhost:3000/api/v1/ledger/balance/0?communityId=42'),
      ctx(0),
    );

    expect(res.status).toBe(400);
    expect(getLedgerBalanceForUnitMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is missing', async () => {
    const res = await GET(
      buildReq('http://localhost:3000/api/v1/ledger/balance/7'),
      ctx(7),
    );

    expect(res.status).toBe(400);
    expect(getLedgerBalanceForUnitMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with the query (regression: pre-migration was 400)', async () => {
    const res = await GET(
      buildReq('http://localhost:3000/api/v1/ledger/balance/7?communityId=42', {
        headers: { 'x-community-id': '99' },
      }),
      ctx(7),
    );

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(getLedgerBalanceForUnitMock).not.toHaveBeenCalled();
  });
});

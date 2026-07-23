import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/api/errors/AppError';
const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  parseCommunityIdFromQueryMock,
  requireFinanceEnabledMock,
  requireFinanceReadPermissionMock,
  listActorUnitIdsForFinanceMock,
  listLedgerForCommunityMock,
  requireEntitledForAdminReadMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  requireFinanceEnabledMock: vi.fn(),
  requireFinanceReadPermissionMock: vi.fn(),
  listActorUnitIdsForFinanceMock: vi.fn(),
  listLedgerForCommunityMock: vi.fn(),
  requireEntitledForAdminReadMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromQuery: parseCommunityIdFromQueryMock,
}));

vi.mock('@/lib/finance/common', () => ({
  requireFinanceEnabled: requireFinanceEnabledMock,
  requireFinanceReadPermission: requireFinanceReadPermissionMock,
  parseDateOnly: (s: string) => s,
  parsePositiveInt: (s: string) => Number(s),
}));

vi.mock('@/lib/services/finance-service', () => ({
  listActorUnitIdsForFinance: listActorUnitIdsForFinanceMock,
  listLedgerForCommunity: listLedgerForCommunityMock,
}));

vi.mock('@/lib/middleware/read-entitlement-guard', () => ({
  requireEntitledForAdminRead: requireEntitledForAdminReadMock,
}));

import { GET } from '../../src/app/api/v1/ledger/route';

const STAFF_MEMBERSHIP = {
  userId: 'staff-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718' as const,
};

const OWNER_MEMBERSHIP = {
  ...STAFF_MEMBERSHIP,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
  parseCommunityIdFromQueryMock.mockReturnValue(42);
  requireCommunityMembershipMock.mockResolvedValue(STAFF_MEMBERSHIP);
  requireFinanceEnabledMock.mockResolvedValue(undefined);
  requireFinanceReadPermissionMock.mockReturnValue(undefined);
  requireEntitledForAdminReadMock.mockResolvedValue(undefined);
  listLedgerForCommunityMock.mockResolvedValue([{ id: 1, amountCents: 100 }]);
});

describe('GET /api/v1/ledger', () => {
  it('returns ledger entries for staff with finance read permission', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/ledger?communityId=42'),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown[] };
    expect(json.data).toHaveLength(1);
    expect(requireFinanceReadPermissionMock).toHaveBeenCalled();
    expect(listLedgerForCommunityMock).toHaveBeenCalledWith(42, {
      unitId: undefined,
      startDate: undefined,
      endDate: undefined,
      entryType: undefined,
      limit: undefined,
    });
  });

  it('scopes unit owners to their unit when only one association exists', async () => {
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([7]);

    await GET(new NextRequest('http://localhost:3000/api/v1/ledger?communityId=42'));

    expect(listLedgerForCommunityMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ unitId: 7 }),
    );
    expect(requireFinanceReadPermissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when owner requests another unit', async () => {
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([7]);

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/ledger?communityId=42&unitId=99'),
    );
    expect(res.status).toBe(403);
    expect(listLedgerForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards entryType filter when valid', async () => {
    await GET(
      new NextRequest('http://localhost:3000/api/v1/ledger?communityId=42&entryType=payment'),
    );
    expect(listLedgerForCommunityMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ entryType: 'payment' }),
    );
  });

  it('calls requireEntitledForAdminRead for a staff/admin caller', async () => {
    await GET(new NextRequest('http://localhost/api/v1/ledger?communityId=42'));
    expect(requireEntitledForAdminReadMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ isAdmin: true }),
    );
  });

  it('does not block a resident-owner — the admin read-gate is never reached on the owner path', async () => {
    // Resident-owner reads their own unit via the `if` branch, which returns
    // before the admin `else` branch where the gate lives. The gate must never
    // run for them (not merely no-op), so their reads are wholly unaffected.
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([7]);
    const res = await GET(new NextRequest('http://localhost/api/v1/ledger?communityId=42&unitId=7'));
    expect(res.status).toBe(200);
    expect(requireEntitledForAdminReadMock).not.toHaveBeenCalled();
  });

  it('propagates a 403 when the guard rejects an admin on a lapsed community', async () => {
    requireEntitledForAdminReadMock.mockRejectedValue(
      new AppError('lapsed', 403, 'SUBSCRIPTION_REQUIRED'),
    );
    const res = await GET(new NextRequest('http://localhost/api/v1/ledger?communityId=42'));
    expect(res.status).toBe(403);
  });
});

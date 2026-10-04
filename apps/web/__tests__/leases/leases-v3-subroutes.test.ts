/**
 * Leases v3 sub-routes: offers, transfer, unit-status, settings,
 * deposits. Plan P1-S4. Every mutation must refuse a non-manager before any
 * write, and the lifecycle rules must hold.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { leaseSelectBuilder, type LeasePred } from '../helpers/lease-where-mock';

const t = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  // Field-name column refs so the WHERE can be applied (helpers/lease-where-mock).
  leases: { id: 'id', unitId: 'unitId', residentId: 'residentId', status: 'status', startDate: 'startDate', endDate: 'endDate', previousLeaseId: 'previousLeaseId', transferredFromLeaseId: 'transferredFromLeaseId', idempotencyKey: 'idempotencyKey', deletedAt: 'deletedAt' },
  units: { id: Symbol('units') },
  userRoles: { id: Symbol('user_roles') },
  leaseResidents: { id: Symbol('lease_residents') },
  unitOccupants: { id: Symbol('unit_occupants') },
  leaseDeposits: { id: Symbol('lease_deposits') },
  leaseRenewalOffers: { id: Symbol('lease_renewal_offers') },
  rentObligations: { id: Symbol('rent_obligations') },
  communities: { id: Symbol('communities') },
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: t.createScopedClientMock,
  logAuditEvent: t.logAuditEventMock,
  leases: t.leases,
  units: t.units,
  userRoles: t.userRoles,
  leaseResidents: t.leaseResidents,
  unitOccupants: t.unitOccupants,
  leaseDeposits: t.leaseDeposits,
  leaseRenewalOffers: t.leaseRenewalOffers,
  rentObligations: t.rentObligations,
  communities: t.communities,
}));
vi.mock('@propertypro/db/filters', async (orig) =>
  (await import('../helpers/lease-where-mock')).leaseFiltersMock(await orig()));
vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: t.requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: t.requireCommunityMembershipMock }));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/middleware/read-entitlement-guard', () => ({ requireEntitledForAdminRead: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/services/move-checklist-service', () => ({ createMoveChecklist: vi.fn().mockResolvedValue(undefined) }));

import * as offers from '../../src/app/api/v1/leases/offers/route';
import * as transfer from '../../src/app/api/v1/leases/transfer/route';
import * as unitStatus from '../../src/app/api/v1/leases/unit-status/route';
import * as settings from '../../src/app/api/v1/leases/settings/route';
import * as deposits from '../../src/app/api/v1/leases/deposits/route';

const MANAGER = '00000000-0000-4000-8000-000000000001';
const R1 = '11111111-1111-4111-8111-111111111111';
const allTrue = { read: true, write: true };

function membership(role: 'property_manager' | 'root_manager' | 'resident') {
  const admin = role !== 'resident';
  return {
    userId: MANAGER, communityId: 42, role, isAdmin: admin, isUnitOwner: false,
    displayTitle: role, timezone: 'America/New_York', communityType: 'apartment' as const,
    ...(admin ? { permissions: { resources: { units: allTrue } } } : {}),
  };
}

type Rows = Partial<Record<keyof typeof t, unknown[]>>;
function seed(rows: Rows) {
  const table = (x: unknown) => {
    for (const [k, v] of Object.entries(t)) if (v === x) return (rows as Record<string, unknown[]>)[k] ?? defaults[k] ?? [];
    return [];
  };
  const defaults: Record<string, unknown[]> = {
    units: [{ id: 20, rentAmount: '1800.00', offlineSince: null }],
    userRoles: [{ userId: R1, role: 'resident', isUnitOwner: false }],
    communities: [{ communitySettings: {} }],
  };
  const read = vi.fn(async (x: unknown) => table(x));
  const client = {
    query: read,
    queryById: vi.fn(async (x: unknown, id: unknown) => (table(x) as Array<Record<string, unknown>>).find((r) => r['id'] === id) ?? null),
    selectFrom: vi.fn((x: unknown, _cols?: unknown, where?: LeasePred) =>
      leaseSelectBuilder(() => read(x), x === t.leases, where, () => table(t.leaseResidents) as Array<Record<string, unknown>>)),
    insert: vi.fn(async (x: unknown, data: unknown) => {
      if (x === t.leases) return [{ id: 900, ...(data as object) }];
      if (x === t.leaseRenewalOffers) return [{ id: 300, ...(data as object) }];
      if (x === t.leaseDeposits) return [{ id: 400, ...(data as object) }];
      if (x === t.unitOccupants) return [{ id: 700, ...(data as object) }];
      return Array.isArray(data) ? data : [data];
    }),
    update: vi.fn(async (_x: unknown, data: unknown) => [{ id: 1, ...(data as object) }]),
    softDelete: vi.fn().mockResolvedValue([]),
    hardDelete: vi.fn().mockResolvedValue([]),
  };
  t.createScopedClientMock.mockReturnValue(client);
  return client;
}

const currentLease = {
  id: 1, communityId: 42, unitId: 10, residentId: R1, startDate: '2026-01-01', endDate: '2026-12-31',
  rentAmount: '1500.00', status: 'active', previousLeaseId: null, version: 2, moveOutOn: null, endVia: null,
};
const residentRow = { id: 1, leaseId: 1, userId: R1, occupantId: null, isPrimary: true, addedOn: '2026-01-01', removedOn: null };

function req(method: string, path: string, body?: unknown) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T16:00:00Z'));
  t.requireAuthenticatedUserIdMock.mockResolvedValue(MANAGER);
  t.requireCommunityMembershipMock.mockResolvedValue(membership('property_manager'));
});
afterEach(() => vi.useRealTimers());

describe('every v3 mutation refuses a resident before writing', () => {
  const cases: Array<[string, () => Promise<Response>]> = [
    ['offers POST', () => offers.POST(req('POST', '/api/v1/leases/offers', { communityId: 42, leaseId: 1, offerRent: '1600.00', termMonths: 12, expiresOn: '2026-11-30' }))],
    ['offers PATCH', () => offers.PATCH(req('PATCH', '/api/v1/leases/offers', { communityId: 42, offerId: 300, action: 'sign' }))],
    ['transfer POST', () => transfer.POST(req('POST', '/api/v1/leases/transfer', { communityId: 42, fromLeaseId: 1, toUnitId: 20, moveOutOn: '2026-10-31', startDate: '2026-11-01', rentAmount: '1800.00', carryDeposit: false }))],
    ['unit-status PATCH', () => unitStatus.PATCH(req('PATCH', '/api/v1/leases/unit-status', { communityId: 42, unitId: 20, offline: null }))],
    ['settings PATCH', () => settings.PATCH(req('PATCH', '/api/v1/leases/settings', { communityId: 42, alertWindows: [30] }))],
    ['deposits POST', () => deposits.POST(req('POST', '/api/v1/leases/deposits', { communityId: 42, leaseId: 1, amount: '100.00' }))],
  ];
  for (const [name, call] of cases) {
    it(name, async () => {
      t.requireCommunityMembershipMock.mockResolvedValue(membership('resident'));
      const client = seed({ leases: [currentLease] });
      const res = await call();
      expect(res.status).toBe(403);
      expect(client.insert).not.toHaveBeenCalled();
      expect(client.update).not.toHaveBeenCalled();
    });
  }
});

describe('offers', () => {
  it('an offer starts the day after the current lease and must expire before that', async () => {
    const client = seed({ leases: [currentLease] });
    const ok = await offers.POST(req('POST', '/api/v1/leases/offers', { communityId: 42, leaseId: 1, offerRent: '1600.00', termMonths: 12, expiresOn: '2026-11-30' }));
    expect(ok.status).toBe(200);
    expect(client.insert).toHaveBeenCalledWith(t.leaseRenewalOffers, expect.objectContaining({ startDate: '2027-01-01', sentOn: '2026-09-28' }));
    // The current lease is untouched by sending an offer.
    expect(client.update).not.toHaveBeenCalled();

    seed({ leases: [currentLease] });
    const late = await offers.POST(req('POST', '/api/v1/leases/offers', { communityId: 42, leaseId: 1, offerRent: '1600.00', termMonths: 12, expiresOn: '2027-01-01' }));
    expect(late.status).toBe(400);
  });

  it('a lease ending mid-month can be renewed: the renewal starts the next day (D8 exempts renewals)', async () => {
    const client = seed({ leases: [{ ...currentLease, endDate: '2026-12-15' }] });
    const res = await offers.POST(req('POST', '/api/v1/leases/offers', { communityId: 42, leaseId: 1, offerRent: '1600.00', termMonths: 12, expiresOn: '2026-11-30' }));
    expect(res.status).toBe(200);
    expect(client.insert).toHaveBeenCalledWith(t.leaseRenewalOffers, expect.objectContaining({ startDate: '2026-12-16' }));
  });

  it('signing a mid-month renewal creates the lease (the 1st-of-month rule is for new leases only)', async () => {
    const lease = { ...currentLease, endDate: '2026-12-15' };
    const offer = { id: 300, leaseId: 1, stage: 'accepted', offerRent: '1600.00', zeroRentReason: null, startDate: '2026-12-16', termMonths: 12, customEndDate: null, depositAmount: null, proposedResidents: null };
    const client = seed({ leases: [lease], leaseRenewalOffers: [offer], leaseResidents: [residentRow] });
    const res = await offers.PATCH(req('PATCH', '/api/v1/leases/offers', { communityId: 42, offerId: 300, action: 'sign' }));
    expect(res.status).toBe(200);
    expect(client.insert).toHaveBeenCalledWith(t.leases, expect.objectContaining({ startDate: '2026-12-16', endDate: '2027-12-15' }));
  });

  it('signing a month-to-month renewal ends the old lease the day before the new term', async () => {
    const m2m = { ...currentLease, endDate: null };
    const offer = { id: 300, leaseId: 1, stage: 'accepted', offerRent: '1600.00', zeroRentReason: null, startDate: '2026-11-01', termMonths: 12, customEndDate: null, depositAmount: null, proposedResidents: null };
    const client = seed({ leases: [m2m], leaseRenewalOffers: [offer], leaseResidents: [residentRow] });
    // Like the database, a lease update is visible to the next read.
    const baseUpdate = client.update;
    client.update = vi.fn(async (x: unknown, data: unknown, where: unknown) => {
      if (x === t.leases) Object.assign(m2m, data as object);
      return (baseUpdate as (...a: unknown[]) => Promise<unknown>)(x, data, where);
    }) as never;
    const res = await offers.PATCH(req('PATCH', '/api/v1/leases/offers', { communityId: 42, offerId: 300, action: 'sign' }));
    expect(res.status).toBe(200);
    expect(client.update).toHaveBeenCalledWith(t.leases, expect.objectContaining({ endDate: '2026-10-31' }), expect.anything());
    expect(client.insert).toHaveBeenCalledWith(t.leases, expect.objectContaining({ previousLeaseId: 1, startDate: '2026-11-01' }));
  });

  it('a second open offer is a 409', async () => {
    const client = seed({ leases: [currentLease] });
    client.insert = vi.fn().mockRejectedValue(Object.assign(new Error('dup'), { cause: { code: '23505' } })) as never;
    const res = await offers.POST(req('POST', '/api/v1/leases/offers', { communityId: 42, leaseId: 1, offerRent: '1600.00', termMonths: 12, expiresOn: '2026-11-30' }));
    expect(res.status).toBe(409);
  });

  it('declining schedules the move-out on the current lease for its end date', async () => {
    const offer = { id: 300, leaseId: 1, stage: 'offer_sent', offerRent: '1600.00', startDate: '2027-01-01', termMonths: 12, customEndDate: null };
    const client = seed({ leases: [currentLease], leaseRenewalOffers: [offer] });
    const res = await offers.PATCH(req('PATCH', '/api/v1/leases/offers', { communityId: 42, offerId: 300, action: 'decline' }));
    expect(res.status).toBe(200);
    expect(client.update).toHaveBeenCalledWith(t.leases, expect.objectContaining({ moveOutOn: '2026-12-31', endVia: 'declined' }), expect.anything());
  });

  it('signing creates the renewal lease and leaves the current lease active', async () => {
    const offer = { id: 300, leaseId: 1, stage: 'accepted', offerRent: '1600.00', zeroRentReason: null, startDate: '2027-01-01', termMonths: 12, customEndDate: null, depositAmount: null, proposedResidents: null };
    const client = seed({ leases: [currentLease], leaseRenewalOffers: [offer], leaseResidents: [residentRow] });
    const res = await offers.PATCH(req('PATCH', '/api/v1/leases/offers', { communityId: 42, offerId: 300, action: 'sign' }));
    expect(res.status).toBe(200);
    expect(client.insert).toHaveBeenCalledWith(t.leases, expect.objectContaining({ previousLeaseId: 1, startDate: '2027-01-01', endDate: '2027-12-31', rentAmount: '1600.00' }));
    const leaseUpdates = client.update.mock.calls.filter(([x]) => x === t.leases);
    expect(leaseUpdates).toHaveLength(0);
  });

  it('a sign that loses the race to another response is a 409 and creates nothing', async () => {
    const offer = { id: 300, leaseId: 1, stage: 'offer_sent', offerRent: '1600.00', startDate: '2027-01-01', termMonths: 12 };
    const client = seed({ leases: [currentLease], leaseRenewalOffers: [offer] });
    client.update = vi.fn().mockResolvedValue([]) as never;
    const res = await offers.PATCH(req('PATCH', '/api/v1/leases/offers', { communityId: 42, offerId: 300, action: 'sign' }));
    expect(res.status).toBe(409);
    expect(client.insert).not.toHaveBeenCalled();
  });
});

describe('transfer', () => {
  const body = { communityId: 42, fromLeaseId: 1, toUnitId: 20, moveOutOn: '2026-10-31', startDate: '2026-11-01', endDate: '2027-10-31', rentAmount: '1800.00', carryDeposit: true };

  it('opens a lease on the new unit, schedules the old move-out, and carries the deposit', async () => {
    const client = seed({
      leases: [currentLease],
      leaseResidents: [residentRow],
      leaseDeposits: [{ id: 50, leaseId: 1, amount: '1500.00', heldMethod: 'separate_noninterest', depository: 'Bank', receivedOn: '2026-01-01', noticeSentOn: '2026-01-10', disposition: null }],
    });
    const res = await transfer.POST(req('POST', '/api/v1/leases/transfer', body));
    expect(res.status).toBe(200);
    expect(client.insert).toHaveBeenCalledWith(t.leases, expect.objectContaining({ unitId: 20, transferredFromLeaseId: 1, residentId: R1 }));
    expect(client.insert).toHaveBeenCalledWith(t.leaseDeposits, expect.objectContaining({ carriedFromDepositId: 50, amount: '1500.00', noticeSentOn: '2026-01-10' }));
    expect(client.update).toHaveBeenCalledWith(t.leases, expect.objectContaining({ moveOutOn: '2026-10-31', endVia: 'transfer' }), expect.anything());
    expect(client.update).toHaveBeenCalledWith(t.leaseDeposits, expect.objectContaining({ disposition: 'carried_to_transfer' }), expect.anything());
  });

  it('a changed deposit amount restarts the §83.49 notice', async () => {
    const client = seed({
      leases: [currentLease],
      leaseResidents: [residentRow],
      leaseDeposits: [{ id: 50, leaseId: 1, amount: '1500.00', noticeSentOn: '2026-01-10', disposition: null }],
    });
    await transfer.POST(req('POST', '/api/v1/leases/transfer', { ...body, depositAmount: '1800.00' }));
    expect(client.insert).toHaveBeenCalledWith(t.leaseDeposits, expect.objectContaining({ amount: '1800.00', noticeSentOn: null }));
  });

  it('refuses while rent is owed on the old lease (D9)', async () => {
    const client = seed({
      leases: [currentLease],
      rentObligations: [{ id: 5, periodStart: '2026-09-01', dueDate: '2026-09-01', amountCents: 1, status: 'pending' }],
    });
    const res = await transfer.POST(req('POST', '/api/v1/leases/transfer', body));
    expect(res.status).toBe(409);
    expect(client.insert).not.toHaveBeenCalled();
  });

  it('restores the old lease if scheduling its move-out fails', async () => {
    const client = seed({ leases: [currentLease], leaseResidents: [residentRow] });
    let calls = 0;
    client.update = vi.fn(async (_x: unknown, data: unknown) => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return [{ id: 1, ...(data as object) }];
    }) as never;
    const res = await transfer.POST(req('POST', '/api/v1/leases/transfer', { ...body, carryDeposit: false }));
    expect(res.status).toBe(500);
    expect(client.softDelete).toHaveBeenCalledWith(t.leases, expect.anything());
    expect(client.update).toHaveBeenLastCalledWith(t.leases, expect.objectContaining({ moveOutOn: null, endVia: null }), expect.anything());
  });
});

describe('unit-status', () => {
  it('refuses to take an occupied unit offline', async () => {
    const client = seed({ leases: [{ ...currentLease, unitId: 20 }] });
    const res = await unitStatus.PATCH(req('PATCH', '/api/v1/leases/unit-status', { communityId: 42, unitId: 20, offline: { reason: 'storm_damage', since: '2026-09-28' } }));
    expect(res.status).toBe(409);
    expect(client.update).not.toHaveBeenCalled();
  });

  it('takes an empty unit offline', async () => {
    const client = seed({ leases: [{ ...currentLease, unitId: 20, endDate: '2026-06-30', status: 'expired' }] });
    const res = await unitStatus.PATCH(req('PATCH', '/api/v1/leases/unit-status', { communityId: 42, unitId: 20, offline: { reason: 'renovation', since: '2026-09-28', until: '2026-12-01' } }));
    expect(res.status).toBe(200);
    expect(client.update).toHaveBeenCalledWith(t.units, expect.objectContaining({ offlineReason: 'renovation', offlineSince: '2026-09-28' }), expect.anything());
  });
});

describe('settings', () => {
  it('only the root manager can change them', async () => {
    const client = seed({});
    const res = await settings.PATCH(req('PATCH', '/api/v1/leases/settings', { communityId: 42, allowResidentsWithoutEmail: true }));
    expect(res.status).toBe(403);
    expect(client.update).not.toHaveBeenCalled();
  });

  it('root manager sets windows (sorted) in one merge', async () => {
    t.requireCommunityMembershipMock.mockResolvedValue(membership('root_manager'));
    const client = seed({});
    const res = await settings.PATCH(req('PATCH', '/api/v1/leases/settings', { communityId: 42, alertWindows: [90, 30, 60] }));
    expect(res.status).toBe(200);
    expect(client.update).toHaveBeenCalledTimes(1);
    expect(client.update.mock.calls[0]![0]).toBe(t.communities);
  });
});

describe('deposits', () => {
  it('a claim cannot keep more than the deposit', async () => {
    const client = seed({ leaseDeposits: [{ id: 50, leaseId: 1, amount: '1500.00', claimedAmount: null, dispositionOn: null }] });
    const res = await deposits.PATCH(req('PATCH', '/api/v1/leases/deposits', { communityId: 42, depositId: 50, disposition: 'claim_sent', dispositionOn: '2026-11-20', claimedAmount: '1600.00' }));
    expect(res.status).toBe(400);
    expect(client.update).not.toHaveBeenCalled();
  });

  it('records a notice sent after receipt; refuses one dated before it', async () => {
    let client = seed({ leases: [currentLease] });
    expect((await deposits.POST(req('POST', '/api/v1/leases/deposits', { communityId: 42, leaseId: 1, amount: '1500.00', receivedOn: '2026-09-01', noticeSentOn: '2026-08-01' }))).status).toBe(400);
    expect(client.insert).not.toHaveBeenCalled();
    client = seed({ leases: [currentLease] });
    expect((await deposits.POST(req('POST', '/api/v1/leases/deposits', { communityId: 42, leaseId: 1, amount: '1500.00', receivedOn: '2026-09-01', noticeSentOn: '2026-09-10' }))).status).toBe(200);
  });
});

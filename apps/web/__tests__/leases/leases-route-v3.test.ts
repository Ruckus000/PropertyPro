/**
 * Leases v3 behaviour of /api/v1/leases.
 *
 * Plan: docs/superpowers/plans/2026-09-29-leases-v3.md (P1-S3). The pre-v3
 * contract stays covered by leases-route.test.ts; this file covers what v3
 * adds or changes:
 * - the resident read boundary now comes from lease_residents (co-tenants)
 * - residents without email are refused unless the community opted in
 * - $0 rent needs a reason; offline units take no new lease
 * - cancel / delete refuse while rent is owed (decisions D9)
 * - optimistic concurrency (version) and idempotent create
 * - move-out scheduling, pre-leasing after it, and clearing it
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  createScopedClientMock,
  logAuditEventMock,
  leasesTableMock,
  unitsTableMock,
  userRolesTableMock,
  leaseResidentsTableMock,
  residentContactsTableMock,
  leaseDepositsTableMock,
  rentObligationsTableMock,
  communitiesTableMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  leasesTableMock: { id: Symbol('leases.id') },
  unitsTableMock: { id: Symbol('units.id') },
  userRolesTableMock: { id: Symbol('user_roles.id') },
  leaseResidentsTableMock: { id: Symbol('lease_residents.id') },
  residentContactsTableMock: { id: Symbol('resident_contacts.id') },
  leaseDepositsTableMock: { id: Symbol('lease_deposits.id') },
  rentObligationsTableMock: { id: Symbol('rent_obligations.id') },
  communitiesTableMock: { id: Symbol('communities.id') },
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  leases: leasesTableMock,
  units: unitsTableMock,
  userRoles: userRolesTableMock,
  leaseResidents: leaseResidentsTableMock,
  residentContacts: residentContactsTableMock,
  leaseDeposits: leaseDepositsTableMock,
  rentObligations: rentObligationsTableMock,
  communities: communitiesTableMock,
}));
vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: requireCommunityMembershipMock }));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/services/move-checklist-service', () => ({ createMoveChecklist: vi.fn().mockResolvedValue(undefined) }));

import { GET, POST, PATCH, DELETE } from '../../src/app/api/v1/leases/route';

const MANAGER = '00000000-0000-4000-8000-000000000001';
const ACTOR = '11111111-1111-4111-8111-111111111111';
const CO_TENANT = '33333333-3333-4333-8333-333333333333';
const OTHER = '22222222-2222-4222-8222-222222222222';

const allTrue = { read: true, write: true };
function managerMembership() {
  return {
    userId: MANAGER,
    communityId: 42,
    role: 'property_manager' as const,
    isAdmin: true,
    isUnitOwner: false,
    displayTitle: 'Site Manager',
    presetKey: 'site_manager',
    timezone: 'America/New_York',
    permissions: { resources: { units: allTrue, leases: allTrue, residents: allTrue } },
    communityType: 'apartment' as const,
  };
}
function residentMembership(userId: string) {
  return {
    userId,
    communityId: 42,
    role: 'resident' as const,
    isAdmin: false,
    isUnitOwner: false,
    displayTitle: 'Resident',
    timezone: 'America/New_York',
    communityType: 'apartment' as const,
  };
}

type Tables = Partial<Record<'leases' | 'units' | 'userRoles' | 'leaseResidents' | 'residentContacts' | 'leaseDeposits' | 'rentObligations' | 'communities', unknown[]>>;

/** A scoped-client double whose reads return fixed rows per table. */
function seed(tables: Tables, overrides: Record<string, unknown> = {}) {
  const byTable = new Map<unknown, unknown[]>([
    [leasesTableMock, tables.leases ?? []],
    [unitsTableMock, tables.units ?? [{ id: 10, communityId: 42, rentAmount: '1500.00', offlineSince: null }]],
    [userRolesTableMock, tables.userRoles ?? [{ userId: ACTOR, role: 'resident', isUnitOwner: false }]],
    [leaseResidentsTableMock, tables.leaseResidents ?? []],
    [residentContactsTableMock, tables.residentContacts ?? []],
    [leaseDepositsTableMock, tables.leaseDeposits ?? []],
    [rentObligationsTableMock, tables.rentObligations ?? []],
    [communitiesTableMock, tables.communities ?? [{ communitySettings: {} }]],
  ]);
  const read = vi.fn(async (table: unknown) => byTable.get(table) ?? []);
  const client = {
    query: read,
    selectFrom: vi.fn((table: unknown) => read(table)),
    insert: vi.fn(async (table: unknown, data: unknown) => {
      if (table === leasesTableMock) return [{ id: 900, communityId: 42, ...(data as object) }];
      if (table === residentContactsTableMock) return [{ id: 700, ...(data as object) }];
      return Array.isArray(data) ? data : [data];
    }),
    update: vi.fn(async (_t: unknown, data: unknown) => [{ id: 1, ...(data as object) }]),
    softDelete: vi.fn().mockResolvedValue([]),
    hardDelete: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  createScopedClientMock.mockReturnValue(client);
  return client;
}

function lease(overrides: Record<string, unknown>) {
  return {
    id: 1, communityId: 42, unitId: 10, residentId: ACTOR,
    startDate: '2026-01-01', endDate: '2026-12-31', rentAmount: '1500.00',
    status: 'active', previousLeaseId: null, notes: 'manager-only', version: 3,
    moveOutOn: null, endVia: null,
    ...overrides,
  };
}

function jsonReq(method: string, body: unknown) {
  return new NextRequest('http://localhost:3000/api/v1/leases', {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Community "today" is derived from the clock; pin it.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T16:00:00Z'));
  requireAuthenticatedUserIdMock.mockResolvedValue(MANAGER);
  requireCommunityMembershipMock.mockResolvedValue(managerMembership());
});
afterEach(() => {
  vi.useRealTimers();
});

describe('GET — read boundary from lease_residents', () => {
  const leases = [
    // Lease 1: ACTOR is the legacy/primary resident; CO_TENANT is on it too.
    lease({ id: 1, residentId: ACTOR, rentAmount: '1100.00' }),
    // Lease 2: someone else's lease.
    lease({ id: 2, unitId: 11, residentId: OTHER, rentAmount: '9999.99' }),
  ];
  const leaseResidents = [
    { id: 1, leaseId: 1, userId: ACTOR, contactId: null, isPrimary: true, addedOn: '2026-01-01', removedOn: null },
    { id: 2, leaseId: 1, userId: CO_TENANT, contactId: null, isPrimary: false, addedOn: '2026-01-01', removedOn: null },
    { id: 3, leaseId: 2, userId: OTHER, contactId: null, isPrimary: true, addedOn: '2026-01-01', removedOn: null },
  ];

  it('a co-tenant (not the legacy residentId) sees the lease they are on — and nothing else', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValue(CO_TENANT);
    requireCommunityMembershipMock.mockResolvedValue(residentMembership(CO_TENANT));
    seed({ leases, leaseResidents });

    const res = await GET(new NextRequest('http://localhost:3000/api/v1/leases?communityId=42'));
    const json = (await res.json()) as { data: Array<{ id: number; notes: string | null; residents: unknown[] }> };

    expect(res.status).toBe(200);
    expect(json.data.map((l) => l.id)).toEqual([1]);
    expect(json.data[0]!.notes).toBeNull();
    expect(json.data[0]!.residents).toHaveLength(2);
    const body = JSON.stringify(json.data);
    expect(body).not.toContain('9999.99');
    expect(body).not.toContain(OTHER);
    expect(body).not.toContain('deposits');
  });

  it('a removed co-tenant no longer sees the lease', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValue(CO_TENANT);
    requireCommunityMembershipMock.mockResolvedValue(residentMembership(CO_TENANT));
    seed({
      leases,
      leaseResidents: leaseResidents.map((r) => (r.userId === CO_TENANT ? { ...r, removedOn: '2026-06-30' } : r)),
    });

    const res = await GET(new NextRequest('http://localhost:3000/api/v1/leases?communityId=42'));
    const json = (await res.json()) as { data: unknown[] };
    expect(json.data).toHaveLength(0);
  });

  it('a resident on no lease sees nothing', async () => {
    const STRANGER = '44444444-4444-4444-8444-444444444444';
    requireAuthenticatedUserIdMock.mockResolvedValue(STRANGER);
    requireCommunityMembershipMock.mockResolvedValue(residentMembership(STRANGER));
    seed({ leases, leaseResidents });

    const res = await GET(new NextRequest('http://localhost:3000/api/v1/leases?communityId=42'));
    expect(((await res.json()) as { data: unknown[] }).data).toHaveLength(0);
  });

  it('the legacy residentId still grants access when no lease_residents row exists yet (expand window)', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValue(ACTOR);
    requireCommunityMembershipMock.mockResolvedValue(residentMembership(ACTOR));
    seed({ leases, leaseResidents: [] });

    const res = await GET(new NextRequest('http://localhost:3000/api/v1/leases?communityId=42'));
    const json = (await res.json()) as { data: Array<{ id: number }> };
    expect(json.data.map((l) => l.id)).toEqual([1]);
  });

  it('managers get every lease with residents, contact details and deposits', async () => {
    seed({
      leases,
      leaseResidents: [
        ...leaseResidents,
        { id: 4, leaseId: 2, userId: null, contactId: 7, isPrimary: false, addedOn: '2026-01-01', removedOn: null },
      ],
      residentContacts: [{ id: 7, fullName: 'Paper Only', phone: '555', mailingAddress: '1 Main St', noticeDelivery: 'mail', linkedUserId: null }],
      leaseDeposits: [{ id: 1, leaseId: 2, amount: '1500.00' }],
    });

    const res = await GET(new NextRequest('http://localhost:3000/api/v1/leases?communityId=42'));
    const json = (await res.json()) as { data: Array<{ id: number; deposits: unknown[]; residents: Array<{ contact: { mailingAddress?: string } | null }> }> };
    expect(json.data).toHaveLength(2);
    const l2 = json.data.find((l) => l.id === 2)!;
    expect(l2.deposits).toHaveLength(1);
    expect(l2.residents.find((r) => r.contact)?.contact?.mailingAddress).toBe('1 Main St');
  });
});

describe('POST — residents, contacts and rent rules', () => {
  const base = { communityId: 42, unitId: 10, startDate: '2026-11-01', endDate: '2027-10-31' };

  it('writes one lease_residents row per resident and dual-writes the primary as residentId', async () => {
    const client = seed({ userRoles: [{ userId: ACTOR, role: 'resident', isUnitOwner: false }, { userId: CO_TENANT, role: 'resident', isUnitOwner: false }] });
    client.selectFrom = vi.fn(async (table: unknown, _cols: unknown, _where: unknown) => {
      if (table === userRolesTableMock) return [{ userId: ACTOR, role: 'resident', isUnitOwner: false }];
      if (table === unitsTableMock) return [{ id: 10, rentAmount: '1500.00', offlineSince: null }];
      if (table === communitiesTableMock) return [{ communitySettings: {} }];
      return [];
    }) as never;

    const res = await POST(jsonReq('POST', { ...base, residents: [{ userId: ACTOR }, { userId: CO_TENANT, isPrimary: true }] }));
    expect(res.status).toBe(200);
    expect(client.insert).toHaveBeenCalledWith(leasesTableMock, expect.objectContaining({ residentId: CO_TENANT, createdBy: MANAGER }));
    expect(client.insert).toHaveBeenCalledWith(leaseResidentsTableMock, [
      expect.objectContaining({ userId: ACTOR, isPrimary: false, leaseId: 900 }),
      expect.objectContaining({ userId: CO_TENANT, isPrimary: true, leaseId: 900 }),
    ]);
  });

  it('refuses a resident without email while the community switch is off (the default)', async () => {
    const client = seed({});
    const res = await POST(jsonReq('POST', { ...base, residents: [{ newContact: { fullName: 'Paper Only' } }] }));
    expect(res.status).toBe(403);
    expect(client.insert).not.toHaveBeenCalled();
  });

  it('treats the STRING "true" as off — the switch needs a real boolean', async () => {
    const client = seed({ communities: [{ communitySettings: { leasesAllowResidentsWithoutEmail: 'true' } }] });
    const res = await POST(jsonReq('POST', { ...base, residents: [{ newContact: { fullName: 'Paper Only' } }] }));
    expect(res.status).toBe(403);
    expect(client.insert).not.toHaveBeenCalled();
  });

  it('creates a contact-only primary resident when the switch is on; residentId stays null', async () => {
    const client = seed({ communities: [{ communitySettings: { leasesAllowResidentsWithoutEmail: true } }] });
    const res = await POST(jsonReq('POST', { ...base, residents: [{ newContact: { fullName: 'Paper Only', noticeDelivery: 'hand' } }] }));
    expect(res.status).toBe(200);
    expect(client.insert).toHaveBeenCalledWith(residentContactsTableMock, expect.objectContaining({ fullName: 'Paper Only', noticeDelivery: 'hand' }));
    expect(client.insert).toHaveBeenCalledWith(leasesTableMock, expect.objectContaining({ residentId: null }));
    expect(client.insert).toHaveBeenCalledWith(leaseResidentsTableMock, [expect.objectContaining({ contactId: 700, userId: null, isPrimary: true })]);
  });

  it('requires a reason for $0 rent, and stores it when given', async () => {
    let client = seed({});
    let res = await POST(jsonReq('POST', { ...base, residentId: ACTOR, rentAmount: '0' }));
    expect(res.status).toBe(400);
    expect(client.insert).not.toHaveBeenCalled();

    client = seed({});
    res = await POST(jsonReq('POST', { ...base, residentId: ACTOR, rentAmount: '0.00', zeroRentReason: 'staff' }));
    expect(res.status).toBe(200);
    expect(client.insert).toHaveBeenCalledWith(leasesTableMock, expect.objectContaining({ zeroRentReason: 'staff' }));
  });

  it('refuses a new lease on an offline unit', async () => {
    const client = seed({ units: [{ id: 10, rentAmount: '1500.00', offlineSince: '2026-09-01' }] });
    const res = await POST(jsonReq('POST', { ...base, residentId: ACTOR }));
    expect(res.status).toBe(400);
    expect(client.insert).not.toHaveBeenCalled();
  });

  it('allows pre-leasing from the month after a scheduled early move-out', async () => {
    const client = seed({ leases: [lease({ id: 1, endDate: '2027-03-31', moveOutOn: '2026-10-31', endVia: 'early' })] });
    const res = await POST(jsonReq('POST', { ...base, residentId: ACTOR }));
    expect(res.status).toBe(200);
    expect(client.insert).toHaveBeenCalledWith(leasesTableMock, expect.anything());
  });

  it('still refuses an overlap with a lease that is not moving out', async () => {
    const client = seed({ leases: [lease({ id: 1, endDate: '2027-03-31' })] });
    const res = await POST(jsonReq('POST', { ...base, residentId: ACTOR }));
    expect(res.status).toBe(400);
    expect(client.insert).not.toHaveBeenCalled();
  });

  it('a repeated submission with the same idempotencyKey returns the first lease instead of creating another', async () => {
    const client = seed({ leases: [lease({ id: 55, idempotencyKey: 'form-abc-123' })] });
    const res = await POST(jsonReq('POST', { ...base, residentId: ACTOR, idempotencyKey: 'form-abc-123' }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { id: number } }).data.id).toBe(55);
    expect(client.insert).not.toHaveBeenCalled();
  });

  it('rolls back the lease when writing its residents fails', async () => {
    const client = seed({});
    client.insert = vi.fn(async (table: unknown, data: unknown) => {
      if (table === leasesTableMock) return [{ id: 900, ...(data as object) }];
      throw new Error('lease_residents insert failed');
    }) as never;
    const res = await POST(jsonReq('POST', { ...base, residentId: ACTOR }));
    expect(res.status).toBe(500);
    expect(client.softDelete).toHaveBeenCalledWith(leasesTableMock, expect.anything());
  });
});

describe('PATCH — concurrency, cancel and move-out', () => {
  it('returns 409 when the version the client read is stale', async () => {
    const client = seed({ leases: [lease({ id: 1, version: 4 })] });
    client.update = vi.fn().mockResolvedValue([]) as never; // WHERE version = 3 matched nothing
    const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, version: 3, notes: 'x' }));
    expect(res.status).toBe(409);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('bumps the version on a successful versioned write', async () => {
    const client = seed({ leases: [lease({ id: 1, version: 3 })] });
    const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, version: 3, notes: 'x' }));
    expect(res.status).toBe(200);
    expect(client.update).toHaveBeenCalledWith(leasesTableMock, expect.objectContaining({ version: 4, notes: 'x', updatedBy: MANAGER }), expect.anything());
  });

  it('cancels a lease that has not started, with a reason', async () => {
    const client = seed({ leases: [lease({ id: 1, startDate: '2026-11-01', endDate: '2027-10-31' })] });
    const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, status: 'cancelled', cancelledReason: 'Applicant withdrew' }));
    expect(res.status).toBe(200);
    expect(client.update).toHaveBeenCalledWith(leasesTableMock, expect.objectContaining({ status: 'cancelled', cancelledReason: 'Applicant withdrew' }), expect.anything());
  });

  it('refuses to cancel a lease that has already started', async () => {
    const client = seed({ leases: [lease({ id: 1 })] });
    const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, status: 'cancelled', cancelledReason: 'x' }));
    expect(res.status).toBe(400);
    expect(client.update).not.toHaveBeenCalled();
  });

  it('refuses to cancel while rent is owed (D9), and lists the charges', async () => {
    const client = seed({
      leases: [lease({ id: 1, startDate: '2026-11-01', endDate: '2027-10-31' })],
      rentObligations: [
        { id: 5, periodStart: '2026-11-01', dueDate: '2026-11-01', amountCents: 150000, status: 'pending' },
        { id: 6, periodStart: '2026-10-01', dueDate: '2026-10-01', amountCents: 150000, status: 'paid' },
      ],
    });
    const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, status: 'cancelled', cancelledReason: 'x' }));
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: { details?: { unpaidObligations?: Array<{ id: number }> } } };
    expect(json.error.details?.unpaidObligations?.map((o) => o.id)).toEqual([5]);
    expect(client.update).not.toHaveBeenCalled();
  });

  it('schedules an early end without changing status — the lease stays active until then', async () => {
    const client = seed({ leases: [lease({ id: 1 })] });
    const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, moveOutOn: '2026-10-31', endVia: 'early', endReason: 'Job relocation' }));
    expect(res.status).toBe(200);
    const [, data] = client.update.mock.calls[0]!;
    expect(data).toMatchObject({ moveOutOn: '2026-10-31', endVia: 'early' });
    expect(data).not.toHaveProperty('status');
  });

  it('requires endVia when scheduling a move-out, and an early end cannot be after the end date', async () => {
    seed({ leases: [lease({ id: 1 })] });
    expect((await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, moveOutOn: '2026-10-31' }))).status).toBe(400);
    seed({ leases: [lease({ id: 1 })] });
    expect((await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, moveOutOn: '2027-02-28', endVia: 'early' }))).status).toBe(400);
  });

  it('refuses to clear a move-out while a pre-lease depends on it', async () => {
    const client = seed({
      leases: [
        lease({ id: 1, endDate: '2027-03-31', moveOutOn: '2026-10-31', endVia: 'early' }),
        lease({ id: 2, residentId: OTHER, startDate: '2026-11-01', endDate: '2027-10-31' }),
      ],
    });
    const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, moveOutOn: null }));
    expect(res.status).toBe(409);
    expect(client.update).not.toHaveBeenCalled();
  });

  it('clearing a move-out also clears how and why it was ending', async () => {
    const client = seed({ leases: [lease({ id: 1, moveOutOn: '2026-12-31', endVia: 'notice', endReason: 'Buying a house' })] });
    const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, moveOutOn: null }));
    expect(res.status).toBe(200);
    expect(client.update).toHaveBeenCalledWith(leasesTableMock, expect.objectContaining({ moveOutOn: null, endVia: null, endReason: null }), expect.anything());
  });

  it('setting rent to $0 without a reason is refused', async () => {
    const client = seed({ leases: [lease({ id: 1 })] });
    const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, rentAmount: '0' }));
    expect(res.status).toBe(400);
    expect(client.update).not.toHaveBeenCalled();
  });

  it('a resident cannot PATCH (units:write gate still first)', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValue(ACTOR);
    requireCommunityMembershipMock.mockResolvedValue(residentMembership(ACTOR));
    const client = seed({ leases: [lease({ id: 1 })] });
    const res = await PATCH(jsonReq('PATCH', { id: 1, communityId: 42, moveOutOn: '2026-10-31', endVia: 'notice' }));
    expect(res.status).toBe(403);
    expect(client.update).not.toHaveBeenCalled();
  });
});

describe('DELETE — refuses while rent is owed (D9)', () => {
  it('409 with unpaid charges; nothing deleted', async () => {
    const client = seed({
      leases: [lease({ id: 1 })],
      rentObligations: [{ id: 5, periodStart: '2026-09-01', dueDate: '2026-09-01', amountCents: 150000, status: 'overdue' }],
    });
    const res = await DELETE(new NextRequest('http://localhost:3000/api/v1/leases?id=1&communityId=42', { method: 'DELETE' }));
    expect(res.status).toBe(409);
    expect(client.softDelete).not.toHaveBeenCalled();
  });

  it('deletes when every charge is paid or waived', async () => {
    const client = seed({
      leases: [lease({ id: 1 })],
      rentObligations: [
        { id: 5, periodStart: '2026-09-01', dueDate: '2026-09-01', amountCents: 150000, status: 'paid' },
        { id: 6, periodStart: '2026-10-01', dueDate: '2026-10-01', amountCents: 150000, status: 'waived' },
      ],
    });
    const res = await DELETE(new NextRequest('http://localhost:3000/api/v1/leases?id=1&communityId=42', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(client.softDelete).toHaveBeenCalled();
  });
});

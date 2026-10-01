import { describe, expect, it } from 'vitest';
import type { Unit } from '../../src/hooks/use-units';
import type { ResidentRecord } from '../../src/hooks/use-residents-management';
import {
  NO_BUILDING_KEY,
  buildDirectoryUnits,
  buildResidentRows,
  computeOverview,
  describeRule,
  filterResidents,
  filterUnits,
  formatCents,
  groupByBuilding,
  initialsFor,
  listBuildings,
  shortUnitLabel,
  type DirectoryContext,
} from '../../src/components/directory/directory-model';

function unit(id: number, over: Partial<Unit> = {}): Unit {
  return {
    id,
    communityId: 1,
    unitNumber: String(100 + id),
    building: 'A',
    floor: 1,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 900,
    rentAmount: null,
    ownerUserId: null,
    occupancy: null,
    occupancyConfirmed: false,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function resident(userId: string, over: Partial<ResidentRecord> = {}): ResidentRecord {
  return {
    userId,
    fullName: userId,
    email: `${userId}@x.test`,
    role: 'resident',
    unitId: null,
    phone: null,
    isUnitOwner: false,
    designation: null,
    portalStatus: 'active',
    lastSignInAt: null,
    lastInvitedAt: null,
    ...over,
  };
}

const ADMIN: DirectoryContext = { hasOwnerRole: true, canSeeResidents: true };

describe('buildDirectoryUnits — owner and occupant lines', () => {
  it('surfaces contradictions between occupancy and who is on file', () => {
    const units = [
      unit(1, { occupancy: 'vacant' }),
      unit(2, { occupancy: 'rented' }),
      unit(3, { occupancy: 'owner_occupied' }),
      unit(4, { occupancy: 'vacant' }),
    ];
    const residents = [
      resident('Ann', { unitId: 1, isUnitOwner: true }),
      resident('Bob', { unitId: 1 }),
      resident('Cy', { unitId: 2, isUnitOwner: true }),
    ];
    const [u1, u2, u3, u4] = buildDirectoryUnits(units, residents, null, ADMIN);

    expect(u1!.occupantLine).toBe('Marked vacant, but 2 residents on file');
    expect(u1!.hasContradiction).toBe(true);
    expect(u2!.occupantLine).toBe('Rented — no tenant on file');
    expect(u2!.hasContradiction).toBe(true);
    expect(u3!.occupantLine).toBe('Owner-occupied — no owner on file');
    expect(u3!.noOwner).toBe(true);
    expect(u4!.occupantLine).toBe('Vacant — no one lives here');
    expect(u4!.hasContradiction).toBe(false);
  });

  it('joins owners with & and lists tenants', () => {
    const [u] = buildDirectoryUnits(
      [unit(1, { occupancy: 'rented' })],
      [
        resident('Zoe Owner', { unitId: 1, isUnitOwner: true }),
        resident('Al Owner', { unitId: 1, isUnitOwner: true }),
        resident('Tia Tenant', { unitId: 1 }),
      ],
      null,
      ADMIN,
    );
    expect(u!.ownerText).toBe('Al Owner & Zoe Owner');
    expect(u!.occupantLine).toBe('Tenant: Tia Tenant');
  });

  it('apartments have no owner flag and list everyone on the owner line', () => {
    const [empty, full] = buildDirectoryUnits(
      [unit(1), unit(2)],
      [resident('Ren', { unitId: 2 })],
      null,
      { hasOwnerRole: false, canSeeResidents: true },
    );
    expect(empty!.ownerText).toBe('No residents');
    expect(empty!.noOwner).toBe(false);
    expect(full!.ownerText).toBe('Ren');
  });

  it('without resident access: no names, no owner flag, occupancy label only', () => {
    const [u] = buildDirectoryUnits([unit(1, { occupancy: 'rented' })], null, null, {
      hasOwnerRole: true,
      canSeeResidents: false,
    });
    expect(u!.ownerText).toBeNull();
    expect(u!.occupantLine).toBe('Rented');
    expect(u!.noOwner).toBe(false);
  });

  it('ignores manager rows that carry a unitId', () => {
    const [u] = buildDirectoryUnits(
      [unit(1)],
      [resident('PM', { unitId: 1, role: 'property_manager' })],
      null,
      ADMIN,
    );
    expect(u!.residents).toHaveLength(0);
  });

  it('keys by unit id: the same number in two buildings stays two units', () => {
    const units = [unit(1, { unitNumber: '101', building: 'A' }), unit(2, { unitNumber: '101', building: 'B' })];
    const built = buildDirectoryUnits(units, [resident('Bea', { unitId: 2, isUnitOwner: true })], null, ADMIN);
    expect(built.map((u) => [u.locationLabel, u.ownerText])).toEqual([
      ['Building A · Floor 1', 'No owner on file'],
      ['Building B · Floor 1', 'Bea'],
    ]);
  });

  it('a blank building is "No building", never a character of the number', () => {
    const [u] = buildDirectoryUnits([unit(1, { building: '  ', floor: null })], [], null, ADMIN);
    expect(u!.buildingKey).toBe(NO_BUILDING_KEY);
    expect(u!.locationLabel).toBe('No building');
  });

  it('attaches past-due only for a positive overdue amount', () => {
    const [a, b] = buildDirectoryUnits(
      [unit(1), unit(2)],
      [],
      [
        { unitId: 1, overdueAmountCents: 125_000, daysOverdue: 62 },
        { unitId: 2, overdueAmountCents: 0, daysOverdue: 0 },
      ],
      ADMIN,
    );
    expect(a!.pastDue).toEqual({ amountCents: 125_000, daysOverdue: 62 });
    expect(b!.pastDue).toBeNull();
  });

  it('sorts unit numbers naturally within a building', () => {
    const built = buildDirectoryUnits(
      [unit(1, { unitNumber: '110' }), unit(2, { unitNumber: '12' }), unit(3, { unitNumber: '101' })],
      [],
      null,
      ADMIN,
    );
    expect(built.map((u) => u.unitNumber)).toEqual(['12', '101', '110']);
  });
});

describe('filters', () => {
  const units = buildDirectoryUnits(
    [
      unit(1, { occupancy: 'vacant', building: 'A' }),
      unit(2, { occupancy: 'rented', building: 'B' }),
      unit(3, { occupancy: 'owner_occupied', building: null }),
    ],
    [
      resident('Ann Owner', { unitId: 3, isUnitOwner: true, designation: 'board_member', phone: '+13055550100' }),
      resident('Ben Tenant', { unitId: 2, portalStatus: 'invited' }),
      resident('Nia Nowhere', { unitId: null, portalStatus: 'not_invited' }),
    ],
    [{ unitId: 2, overdueAmountCents: 5000, daysOverdue: 10 }],
    ADMIN,
  );

  it('filters units by status, building and search together', () => {
    expect(filterUnits(units, { status: 'past_due', building: null, query: '' }).map((u) => u.id)).toEqual([2]);
    expect(filterUnits(units, { status: 'vacant', building: null, query: '' }).map((u) => u.id)).toEqual([1]);
    expect(filterUnits(units, { status: 'no_owner', building: 'A', query: '' }).map((u) => u.id)).toEqual([1]);
    expect(filterUnits(units, { status: 'all', building: null, query: 'ann' }).map((u) => u.id)).toEqual([3]);
  });

  const rows = buildResidentRows(
    [
      resident('Ann Owner', { unitId: 3, isUnitOwner: true, designation: 'board_member', phone: '+13055550100' }),
      resident('Ben Tenant', { unitId: 2, portalStatus: 'invited' }),
      resident('Nia Nowhere', { unitId: null, portalStatus: 'not_invited' }),
      resident('Pat PM', { role: 'property_manager' }),
    ],
    units,
  );

  it('lists residents only (not managers), sorted by name', () => {
    expect(rows.map((r) => r.displayName)).toEqual(['Ann Owner', 'Ben Tenant', 'Nia Nowhere']);
  });

  it('filters residents by type, board and portal status', () => {
    const names = (status: Parameters<typeof filterResidents>[1]['status']) =>
      filterResidents(rows, { status, building: null, query: '' }).map((r) => r.displayName);
    expect(names('owners')).toEqual(['Ann Owner']);
    expect(names('tenants')).toEqual(['Ben Tenant', 'Nia Nowhere']);
    expect(names('board')).toEqual(['Ann Owner']);
    expect(names('not_active')).toEqual(['Ben Tenant', 'Nia Nowhere']);
  });

  it('a building filter hides residents with no unit', () => {
    expect(
      filterResidents(rows, { status: 'all', building: 'B', query: '' }).map((r) => r.displayName),
    ).toEqual(['Ben Tenant']);
  });

  it('searches unit number and phone digits regardless of formatting', () => {
    expect(filterResidents(rows, { status: 'all', building: null, query: '102' }).map((r) => r.displayName)).toEqual([
      'Ben Tenant',
    ]);
    expect(
      filterResidents(rows, { status: 'all', building: null, query: '(305) 555' }).map((r) => r.displayName),
    ).toEqual(['Ann Owner']);
  });
});

describe('buildings and floors', () => {
  const units = buildDirectoryUnits(
    [
      unit(1, { building: 'B', floor: 1 }),
      unit(2, { building: 'B', floor: 3 }),
      unit(3, { building: null, floor: null }),
      unit(4, { building: 'A', floor: -1, occupancy: 'vacant' }),
      unit(5, { building: 'B', floor: null }),
    ],
    [],
    null,
    ADMIN,
  );

  it('lists buildings with counts, "No building" last', () => {
    expect(listBuildings(units).map((b) => [b.label, b.unitCount])).toEqual([
      ['Building A', 1],
      ['Building B', 3],
      ['No building', 1],
    ]);
  });

  it('stacks floors highest first, basements below ground, no-floor last', () => {
    const b = groupByBuilding(units).find((g) => g.key === 'B')!;
    expect(b.floors.map((f) => f.label)).toEqual(['3', '1', '—']);
    const a = groupByBuilding(units).find((g) => g.key === 'A')!;
    expect(a.floors.map((f) => f.label)).toEqual(['-1']);
    expect(a.vacantCount).toBe(1);
  });
});

describe('computeOverview', () => {
  it('never produces NaN with zero units or residents', () => {
    const stats = computeOverview([], []);
    expect(stats).toMatchObject({ totalUnits: 0, occupiedUnits: 0, adoptionPct: null, pastDueCents: 0 });
  });

  it('sums past due, tracks the oldest, and computes adoption', () => {
    const units = buildDirectoryUnits(
      [unit(1, { occupancy: 'vacant' }), unit(2), unit(3)],
      [],
      [
        { unitId: 2, overdueAmountCents: 10_000, daysOverdue: 12 },
        { unitId: 3, overdueAmountCents: 20_000, daysOverdue: 45 },
      ],
      ADMIN,
    );
    const rows = buildResidentRows(
      [resident('a'), resident('b', { portalStatus: 'invited' }), resident('c', { portalStatus: 'not_invited' })],
      units,
    );
    expect(computeOverview(units, rows)).toEqual({
      totalUnits: 3,
      vacantUnits: 1,
      occupiedUnits: 2,
      pastDueCents: 30_000,
      pastDueUnits: 2,
      oldestPastDueDays: 45,
      adoptionPct: 33,
      notActiveResidents: 2,
    });
  });
});

describe('formatting helpers', () => {
  it.each([
    ['Ana María López', 'AL'],
    ['Cher', 'C'],
    ['  ', '?'],
    ['李 小龍', '李小'],
    ['Émile Zola Jr.', 'ÉJ'],
  ])('initialsFor(%j) → %s', (name, expected) => {
    expect(initialsFor(name)).toBe(expected);
  });

  it('strips only a letter-dash prefix for tiles', () => {
    expect(shortUnitLabel('A-101')).toBe('101');
    expect(shortUnitLabel('101')).toBe('101');
    expect(shortUnitLabel('PH-2')).toBe('2');
    expect(shortUnitLabel('Penthouse 2')).toBe('Penthouse 2');
  });

  it('formats cents as whole dollars', () => {
    expect(formatCents(125_049)).toBe('$1,250');
  });
});

describe('past-due rule', () => {
  const units = [unit(1), unit(2), unit(3), unit(4)];
  const rows = [
    { unitId: 1, overdueAmountCents: 60_000, daysOverdue: 45 }, // over both
    { unitId: 2, overdueAmountCents: 60_000, daysOverdue: 30 }, // days not MORE than 30
    { unitId: 3, overdueAmountCents: 50_000, daysOverdue: 90 }, // amount not OVER $500
    { unitId: 4, overdueAmountCents: 0, daysOverdue: 0 },
  ];
  const rule = { minCents: 50_000, minDays: 30 };

  it('flags only units over both thresholds; keeps the rest as below-rule balances', () => {
    const built = buildDirectoryUnits(units, [], rows, ADMIN, rule);
    expect(built.map((u) => [u.id, u.pastDue !== null, u.overdueBelowRule?.amountCents ?? null])).toEqual([
      [1, true, null],
      [2, false, 60_000],
      [3, false, 50_000],
      [4, false, null],
    ]);
  });

  it('defaults to any overdue balance', () => {
    const built = buildDirectoryUnits(units, [], rows, ADMIN);
    expect(built.filter((u) => u.pastDue).map((u) => u.id)).toEqual([1, 2, 3]);
  });

  it.each([
    [{ minCents: 0, minDays: 0 }, 'any overdue balance'],
    [{ minCents: 50_000, minDays: 30 }, 'a balance over $500 and more than 30 days late'],
    [{ minCents: 0, minDays: 1 }, 'a balance more than 1 day late'],
  ])('describes %j', (r, text) => {
    expect(describeRule(r)).toBe(text);
  });
});

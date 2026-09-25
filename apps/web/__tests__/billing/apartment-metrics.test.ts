import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@propertypro/db', () => ({
  createScopedClient: vi.fn(),
  announcements: { _tag: 'announcements' },
  communities: { _tag: 'communities' },
  leases: { _tag: 'leases' },
  maintenanceRequests: { _tag: 'maintenanceRequests' },
  units: { _tag: 'units' },
  users: { _tag: 'users', id: { _col: 'users.id' }, fullName: { _col: 'users.full_name' } },
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
}));

vi.mock('@/lib/utils/timezone', () => ({
  resolveTimezone: vi.fn((tz: string | undefined) => tz ?? 'America/New_York'),
}));

vi.mock('../../src/lib/dashboard/dashboard-selectors', () => ({
  selectRecentAnnouncements: vi.fn(() => []),
  toFirstName: vi.fn((name: string | null) => {
    if (!name) return 'Resident';
    const trimmed = name.trim();
    return trimmed.split(/\s+/)[0] ?? 'Resident';
  }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { createScopedClient } from '@propertypro/db';
import {
  DEFAULT_FINE_AGGREGATE_CAP_CENTS,
  DEFAULT_FINE_CAP_CENTS,
} from '@propertypro/shared';
import type { CommunityMembership } from '../../src/lib/api/community-membership';
import { loadApartmentMetrics } from '../../src/lib/queries/apartment-metrics';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fixed "now" used for all date arithmetic — UTC midnight 2026-02-19. */
const FIXED_NOW = new Date('2026-02-19T00:00:00Z');
const MS_PER_DAY = 86_400_000;

/** Format a Date as YYYY-MM-DD in UTC. */
function toYMD(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Return a YYYY-MM-DD string offset by `days` from FIXED_NOW. */
function offsetDate(days: number): string {
  return toYMD(new Date(FIXED_NOW.getTime() + days * MS_PER_DAY));
}

// ---------------------------------------------------------------------------
// Mock builder
// ---------------------------------------------------------------------------

const COMMUNITY_ID = 42;
const USER_ID = 'user-abc';
const DEFAULT_MEMBERSHIP: CommunityMembership = {
  userId: USER_ID,
  communityId: COMMUNITY_ID,
  communityName: 'Test Community',
  // `manager` pre-dates role-v3 and is not a CommunityRole. Inert here either
  // way: the only reader is canReadAnnouncementAudience, which returns early on
  // `isAdmin: true` and never consults `role`.
  role: 'property_manager',
  communityType: 'apartment',
  timezone: 'America/Chicago',
  isUnitOwner: false,
  isAdmin: true,
  displayTitle: 'Manager',
  city: null,
  state: null,
  isDemo: false,
  trialEndsAt: null,
  demoExpiresAt: null,
  electionsAttorneyReviewed: false,
  // Required by CommunityMembership but never read on this code path; the
  // values below are what the omitted properties already behaved as.
  subscriptionPlan: null,
  subscriptionStatus: null,
  subscriptionCanceledAt: null,
  subscriptionCurrentPeriodEndAt: null,
  freeAccessExpiresAt: null,
  designation: null,
  violationFinesEnabled: false,
  assessmentPaymentsEnabled: false,
  smsDispatchEnabled: false,
  noticePdfGenerationEnabled: false,
  fineCaps: {
    perFineCents: DEFAULT_FINE_CAP_CENTS,
    aggregateCents: DEFAULT_FINE_AGGREGATE_CAP_CENTS,
  },
};

interface MockData {
  units?: object[];
  leases?: object[];
  maintenanceRequests?: object[];
  announcements?: object[];
  communities?: object[];
  users?: object[];
}

function buildScopedMock(data: MockData = {}) {
  const {
    units: unitRows = [{ id: 1, deletedAt: null }],
    leases: leaseRows = [],
    maintenanceRequests: mrRows = [],
    announcements: annRows = [],
    communities: commRows = [{ id: COMMUNITY_ID, name: 'Test Community', timezone: 'America/Chicago' }],
    users: userRows = [{ id: USER_ID, fullName: 'Jane Doe' }],
  } = data;

  // createScopedClient(id).query(table) dispatches by the table's _tag.
  // `users` is deliberately NOT served here: it is platform-global, so a
  // `query(users)` is a full-table scan and must not be how the loader reads it.
  const queryFn = vi.fn((table: { _tag: string }) => {
    switch (table._tag) {
      case 'units':             return Promise.resolve(unitRows);
      case 'leases':            return Promise.resolve(leaseRows);
      case 'maintenanceRequests': return Promise.resolve(mrRows);
      case 'announcements':     return Promise.resolve(annRows);
      case 'communities':       return Promise.resolve(commRows);
      default:                  return Promise.resolve([]);
    }
  });

  // selectFrom(users, columns, where).limit(n) — emulate the point lookup by
  // applying the `eq(users.id, …)` filter and the limit to the fixture rows.
  const limitFn = vi.fn();
  const selectFromFn = vi.fn(
    (table: { _tag: string }, columns: Record<string, unknown>, where?: { __eq?: { val: unknown } }) => {
      const source = table._tag === 'users' ? (userRows as Array<Record<string, unknown>>) : [];
      const matched = where?.__eq ? source.filter((r) => r['id'] === where.__eq!.val) : source;
      const projected = matched.map((r) =>
        Object.fromEntries(Object.keys(columns).map((key) => [key, r[key]])),
      );
      return {
        limit: limitFn.mockImplementation((n: number) => Promise.resolve(projected.slice(0, n))),
      };
    },
  );

  (createScopedClient as ReturnType<typeof vi.fn>).mockReturnValue({
    query: queryFn,
    selectFrom: selectFromFn,
  });
  return { queryFn, selectFromFn, limitFn };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function activeLease(overrides: object = {}): object {
  return { id: 1, unitId: 1, status: 'active', deletedAt: null, endDate: null, rentAmount: '1500', ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadApartmentMetrics — lease expiration date arithmetic', () => {
  beforeEach(() => {
    // Pin Date.now() to FIXED_NOW so utcDaysFromNow() is deterministic
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('counts a lease expiring today (UTC midnight) in within30Days', async () => {
    const endDate = offsetDate(0); // today
    buildScopedMock({ leases: [activeLease({ endDate })] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.leaseExpirations?.within30Days).toBe(1);
    expect(metrics.leaseExpirations?.within60Days).toBe(1);
    expect(metrics.leaseExpirations?.within90Days).toBe(1);
  });

  it('does NOT count a lease that expired yesterday', async () => {
    const endDate = offsetDate(-1); // yesterday
    buildScopedMock({ leases: [activeLease({ endDate })] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.leaseExpirations?.within30Days).toBe(0);
    expect(metrics.leaseExpirations?.within60Days).toBe(0);
    expect(metrics.leaseExpirations?.within90Days).toBe(0);
  });

  it('counts a lease expiring at exactly 30 days (boundary inclusive)', async () => {
    const endDate = offsetDate(30);
    buildScopedMock({ leases: [activeLease({ endDate })] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.leaseExpirations?.within30Days).toBe(1);
  });

  it('does NOT count a lease expiring at 31 days in within30Days, but counts in within60Days', async () => {
    const endDate = offsetDate(31);
    buildScopedMock({ leases: [activeLease({ endDate })] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.leaseExpirations?.within30Days).toBe(0);
    expect(metrics.leaseExpirations?.within60Days).toBe(1);
  });

  it('counts within60Days but not within30Days for a lease at day 60', async () => {
    const endDate = offsetDate(60);
    buildScopedMock({ leases: [activeLease({ endDate })] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.leaseExpirations?.within30Days).toBe(0);
    expect(metrics.leaseExpirations?.within60Days).toBe(1);
    expect(metrics.leaseExpirations?.within90Days).toBe(1);
  });

  it('counts within90Days but not within60Days for a lease at day 61', async () => {
    const endDate = offsetDate(61);
    buildScopedMock({ leases: [activeLease({ endDate })] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.leaseExpirations?.within30Days).toBe(0);
    expect(metrics.leaseExpirations?.within60Days).toBe(0);
    expect(metrics.leaseExpirations?.within90Days).toBe(1);
  });

  it('does not count a lease with an invalid endDate format', async () => {
    buildScopedMock({ leases: [activeLease({ endDate: 'invalid' })] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.leaseExpirations?.within30Days).toBe(0);
    expect(metrics.leaseExpirations?.within60Days).toBe(0);
    expect(metrics.leaseExpirations?.within90Days).toBe(0);
  });

  it('returns all-zero expiration windows when there are no leases', async () => {
    buildScopedMock({ leases: [] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.leaseExpirations).toEqual({ within30Days: 0, within60Days: 0, within90Days: 0 });
  });
});

// ---------------------------------------------------------------------------
// Occupancy
// ---------------------------------------------------------------------------

describe('loadApartmentMetrics — occupancy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns occupancyRate = 0 when totalUnits = 0 (no division by zero)', async () => {
    buildScopedMock({ units: [], leases: [] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.totalUnits).toBe(0);
    expect(metrics.occupancyRate).toBe(0);
  });

  it('computes occupancyRate correctly with mixed occupied/vacant units', async () => {
    const unitRows = [
      { id: 1, deletedAt: null },
      { id: 2, deletedAt: null },
      { id: 3, deletedAt: null },
      { id: 4, deletedAt: null },
    ];
    // Units 1 and 2 are occupied
    const leaseRows = [
      activeLease({ unitId: 1 }),
      activeLease({ id: 2, unitId: 2 }),
    ];
    buildScopedMock({ units: unitRows, leases: leaseRows });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.totalUnits).toBe(4);
    expect(metrics.occupiedUnits).toBe(2);
    expect(metrics.vacantUnits).toBe(2);
    expect(metrics.occupancyRate).toBe(50);
  });

  it('excludes soft-deleted units from totalUnits', async () => {
    const unitRows = [
      { id: 1, deletedAt: null },
      { id: 2, deletedAt: new Date() }, // soft-deleted
    ];
    buildScopedMock({ units: unitRows, leases: [] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.totalUnits).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------

describe('loadApartmentMetrics — revenue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('sums totalMonthlyRevenue across active leases', async () => {
    const leaseRows = [
      activeLease({ id: 1, unitId: 1, rentAmount: '1200' }),
      activeLease({ id: 2, unitId: 2, rentAmount: '1800' }),
    ];
    buildScopedMock({ units: [{ id: 1, deletedAt: null }, { id: 2, deletedAt: null }], leases: leaseRows });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.totalMonthlyRevenue).toBe(3000);
  });

  it('coerces non-numeric rentAmount to 0 without crashing', async () => {
    const leaseRows = [activeLease({ rentAmount: 'NaN' })];
    buildScopedMock({ leases: leaseRows });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.totalMonthlyRevenue).toBe(0);
  });

  it('handles null rentAmount without crashing', async () => {
    const leaseRows = [activeLease({ rentAmount: null })];
    buildScopedMock({ leases: leaseRows });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.totalMonthlyRevenue).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Maintenance requests
// ---------------------------------------------------------------------------

describe('loadApartmentMetrics — maintenance requests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('counts open maintenance requests', async () => {
    const mrRows = [
      { id: 1, status: 'open', deletedAt: null },
      { id: 2, status: 'open', deletedAt: null },
      { id: 3, status: 'closed', deletedAt: null },
    ];
    buildScopedMock({ maintenanceRequests: mrRows });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.openMaintenanceRequests).toBe(2);
  });

  it('does NOT count soft-deleted open maintenance requests', async () => {
    const mrRows = [
      { id: 1, status: 'open', deletedAt: null },
      { id: 2, status: 'open', deletedAt: new Date() }, // soft-deleted
    ];
    buildScopedMock({ maintenanceRequests: mrRows });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.openMaintenanceRequests).toBe(1);
  });

  it('returns 0 when all open requests are soft-deleted', async () => {
    const mrRows = [
      { id: 1, status: 'open', deletedAt: new Date() },
      { id: 2, status: 'open', deletedAt: new Date() },
    ];
    buildScopedMock({ maintenanceRequests: mrRows });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.openMaintenanceRequests).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Community metadata and user name
// ---------------------------------------------------------------------------

describe('loadApartmentMetrics — metadata', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns communityName from the community row', async () => {
    buildScopedMock({
      communities: [{ id: COMMUNITY_ID, name: 'Palm Gardens', timezone: 'America/New_York' }],
    });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.communityName).toBe('Palm Gardens');
  });

  it('falls back to "Community" when no matching community row is found', async () => {
    buildScopedMock({ communities: [] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.communityName).toBe('Community');
  });

  it('extracts first name from user fullName', async () => {
    buildScopedMock({
      users: [{ id: USER_ID, fullName: 'Henry Higgins' }],
    });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    expect(metrics.firstName).toBe('Henry');
  });

  it('looks up only the viewer\'s name by id, never a full read of the global users table', async () => {
    const { queryFn, selectFromFn, limitFn } = buildScopedMock({
      users: [
        { id: 'someone-else', fullName: 'Other Person', phone: '+15550000000' },
        { id: USER_ID, fullName: 'Henry Higgins', phone: '+15551111111' },
      ],
    });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, DEFAULT_MEMBERSHIP);

    const userTableQueries = queryFn.mock.calls.filter(([table]) => table._tag === 'users');
    expect(userTableQueries).toEqual([]);
    expect(selectFromFn).toHaveBeenCalledTimes(1);
    expect(selectFromFn).toHaveBeenCalledWith(
      expect.objectContaining({ _tag: 'users' }),
      { fullName: expect.objectContaining({ _col: 'users.full_name' }) },
      { __eq: { col: expect.objectContaining({ _col: 'users.id' }), val: USER_ID } },
    );
    expect(limitFn).toHaveBeenCalledWith(1);
    expect(metrics.firstName).toBe('Henry');
  });
});

// ---------------------------------------------------------------------------
// Lease-derived metrics are manager-only
// ---------------------------------------------------------------------------

describe('loadApartmentMetrics — lease-derived metrics are withheld from non-managers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // A two-unit building: with revenue visible, a tenant subtracts their own
  // rent from the total and reads the neighbour's.
  const TWO_UNIT_BUILDING: MockData = {
    units: [{ id: 1, deletedAt: null }, { id: 2, deletedAt: null }],
    leases: [
      activeLease({ id: 1, unitId: 1, rentAmount: '1200', endDate: offsetDate(20) }),
      activeLease({ id: 2, unitId: 2, rentAmount: '1800', endDate: offsetDate(200) }),
    ],
    maintenanceRequests: [{ status: 'open', deletedAt: null }],
  };

  it.each([
    ['tenant', false],
    ['owner', true],
  ] as const)('%s: revenue, occupancy and expirations are null and leases/units are never read', async (_label, isUnitOwner) => {
    const { queryFn } = buildScopedMock(TWO_UNIT_BUILDING);

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, {
      ...DEFAULT_MEMBERSHIP,
      role: 'resident',
      isUnitOwner,
      isAdmin: false,
      displayTitle: isUnitOwner ? 'Owner' : 'Tenant',
    });

    expect(metrics.totalMonthlyRevenue).toBeNull();
    expect(metrics.leaseMetricsVisible).toBe(false);
    expect(metrics.occupiedUnits).toBeNull();
    expect(metrics.vacantUnits).toBeNull();
    expect(metrics.totalUnits).toBeNull();
    expect(metrics.occupancyRate).toBeNull();
    expect(metrics.leaseExpirations).toBeNull();
    // Nothing lease-derived survives serialization either.
    expect(JSON.stringify(metrics)).not.toMatch(/3000|1800|1200/);

    const tablesRead = queryFn.mock.calls.map(([table]) => table._tag);
    expect(tablesRead).not.toContain('leases');
    expect(tablesRead).not.toContain('units');

    // Non-lease content still loads.
    expect(metrics.openMaintenanceRequests).toBe(1);
    expect(metrics.communityName).toBe('Test Community');
  });

  it.each(['property_manager', 'root_manager'] as const)(
    '%s: lease-derived metrics are computed',
    async (role) => {
      buildScopedMock(TWO_UNIT_BUILDING);

      const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID, {
        ...DEFAULT_MEMBERSHIP,
        role,
      });

      expect(metrics.leaseMetricsVisible).toBe(true);
      expect(metrics.totalMonthlyRevenue).toBe(3000);
      expect(metrics.occupiedUnits).toBe(2);
      expect(metrics.occupancyRate).toBe(100);
      expect(metrics.leaseExpirations).toEqual({ within30Days: 1, within60Days: 1, within90Days: 1 });
    },
  );
});

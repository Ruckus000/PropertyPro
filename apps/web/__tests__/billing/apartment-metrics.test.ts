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
  users: { _tag: 'users' },
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

  // createScopedClient(id).query(table) dispatches by the table's _tag
  const queryFn = vi.fn((table: { _tag: string }) => {
    switch (table._tag) {
      case 'units':             return Promise.resolve(unitRows);
      case 'leases':            return Promise.resolve(leaseRows);
      case 'maintenanceRequests': return Promise.resolve(mrRows);
      case 'announcements':     return Promise.resolve(annRows);
      case 'communities':       return Promise.resolve(commRows);
      case 'users':             return Promise.resolve(userRows);
      default:                  return Promise.resolve([]);
    }
  });

  (createScopedClient as ReturnType<typeof vi.fn>).mockReturnValue({ query: queryFn });
  return queryFn;
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

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

    expect(metrics.leaseExpirations.within30Days).toBe(1);
    expect(metrics.leaseExpirations.within60Days).toBe(1);
    expect(metrics.leaseExpirations.within90Days).toBe(1);
  });

  it('does NOT count a lease that expired yesterday', async () => {
    const endDate = offsetDate(-1); // yesterday
    buildScopedMock({ leases: [activeLease({ endDate })] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

    expect(metrics.leaseExpirations.within30Days).toBe(0);
    expect(metrics.leaseExpirations.within60Days).toBe(0);
    expect(metrics.leaseExpirations.within90Days).toBe(0);
  });

  it('counts a lease expiring at exactly 30 days (boundary inclusive)', async () => {
    const endDate = offsetDate(30);
    buildScopedMock({ leases: [activeLease({ endDate })] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

    expect(metrics.leaseExpirations.within30Days).toBe(1);
  });

  it('does NOT count a lease expiring at 31 days in within30Days, but counts in within60Days', async () => {
    const endDate = offsetDate(31);
    buildScopedMock({ leases: [activeLease({ endDate })] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

    expect(metrics.leaseExpirations.within30Days).toBe(0);
    expect(metrics.leaseExpirations.within60Days).toBe(1);
  });

  it('counts within60Days but not within30Days for a lease at day 60', async () => {
    const endDate = offsetDate(60);
    buildScopedMock({ leases: [activeLease({ endDate })] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

    expect(metrics.leaseExpirations.within30Days).toBe(0);
    expect(metrics.leaseExpirations.within60Days).toBe(1);
    expect(metrics.leaseExpirations.within90Days).toBe(1);
  });

  it('counts within90Days but not within60Days for a lease at day 61', async () => {
    const endDate = offsetDate(61);
    buildScopedMock({ leases: [activeLease({ endDate })] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

    expect(metrics.leaseExpirations.within30Days).toBe(0);
    expect(metrics.leaseExpirations.within60Days).toBe(0);
    expect(metrics.leaseExpirations.within90Days).toBe(1);
  });

  it('does not count a lease with an invalid endDate format', async () => {
    buildScopedMock({ leases: [activeLease({ endDate: 'invalid' })] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

    expect(metrics.leaseExpirations.within30Days).toBe(0);
    expect(metrics.leaseExpirations.within60Days).toBe(0);
    expect(metrics.leaseExpirations.within90Days).toBe(0);
  });

  it('returns all-zero expiration windows when there are no leases', async () => {
    buildScopedMock({ leases: [] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

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

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

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

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

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

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

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

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

    expect(metrics.totalMonthlyRevenue).toBe(3000);
  });

  it('coerces non-numeric rentAmount to 0 without crashing', async () => {
    const leaseRows = [activeLease({ rentAmount: 'NaN' })];
    buildScopedMock({ leases: leaseRows });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

    expect(metrics.totalMonthlyRevenue).toBe(0);
  });

  it('handles null rentAmount without crashing', async () => {
    const leaseRows = [activeLease({ rentAmount: null })];
    buildScopedMock({ leases: leaseRows });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

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

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

    expect(metrics.openMaintenanceRequests).toBe(2);
  });

  it('does NOT count soft-deleted open maintenance requests', async () => {
    const mrRows = [
      { id: 1, status: 'open', deletedAt: null },
      { id: 2, status: 'open', deletedAt: new Date() }, // soft-deleted
    ];
    buildScopedMock({ maintenanceRequests: mrRows });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

    expect(metrics.openMaintenanceRequests).toBe(1);
  });

  it('returns 0 when all open requests are soft-deleted', async () => {
    const mrRows = [
      { id: 1, status: 'open', deletedAt: new Date() },
      { id: 2, status: 'open', deletedAt: new Date() },
    ];
    buildScopedMock({ maintenanceRequests: mrRows });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

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

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

    expect(metrics.communityName).toBe('Palm Gardens');
  });

  it('falls back to "Community" when no matching community row is found', async () => {
    buildScopedMock({ communities: [] });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

    expect(metrics.communityName).toBe('Community');
  });

  it('extracts first name from user fullName', async () => {
    buildScopedMock({
      users: [{ id: USER_ID, fullName: 'Henry Higgins' }],
    });

    const metrics = await loadApartmentMetrics(COMMUNITY_ID, USER_ID);

    expect(metrics.firstName).toBe('Henry');
  });
});

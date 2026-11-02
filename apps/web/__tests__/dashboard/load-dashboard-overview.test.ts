/**
 * loadDashboardOverview: fail-soft per source (D21), audience gating (D10/D11)
 * and the 30-day window keyed to the community timezone (D16).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { AppError } from '@/lib/api/errors/AppError';

const {
  loadChecklistWithStatusMock,
  requireEntitledForAdminReadMock,
  listCommunityCalendarMeetingsMock,
  getViolationReadUnitIdsMock,
  selectFromMock,
} = vi.hoisted(() => ({
  loadChecklistWithStatusMock: vi.fn(),
  requireEntitledForAdminReadMock: vi.fn(),
  listCommunityCalendarMeetingsMock: vi.fn(),
  getViolationReadUnitIdsMock: vi.fn(),
  selectFromMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  announcements: {},
  demoSeedRegistry: {},
  maintenanceRequests: {},
  meetings: {},
  users: {},
  violations: {
    id: 'violations.id',
    unitId: 'violations.unit_id',
    status: 'violations.status',
    hearingDate: 'violations.hearing_date',
  },
  units: { id: 'units.id', unitNumber: 'units.unit_number', building: 'units.building' },
  createScopedClient: () => ({ selectFrom: selectFromMock }),
}));
vi.mock('@propertypro/db/filters', () => ({
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  asc: (col: unknown) => ({ __asc: col }),
  desc: (col: unknown) => ({ __desc: col }),
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  gte: (col: unknown, val: unknown) => ({ __gte: { col, val } }),
  lte: (col: unknown, val: unknown) => ({ __lte: { col, val } }),
  inArray: (col: unknown, vals: unknown) => ({ __inArray: { col, vals } }),
  isNull: vi.fn(),
  sql: () => 'sql',
}));
vi.mock('@/lib/compliance/load-checklist-with-status', () => ({
  loadChecklistWithStatus: loadChecklistWithStatusMock,
}));
vi.mock('@/lib/middleware/read-entitlement-guard', () => ({
  requireEntitledForAdminRead: requireEntitledForAdminReadMock,
}));
vi.mock('@/lib/services/calendar-data-service', () => ({
  listCommunityCalendarMeetings: listCommunityCalendarMeetingsMock,
}));
vi.mock('@/lib/violations/common', () => ({
  getViolationReadUnitIds: getViolationReadUnitIdsMock,
}));

import { loadDashboardOverview } from '@/lib/dashboard/load-dashboard-overview';
import type { CommunityMembership } from '@/lib/api/community-membership';

const NOW = new Date('2026-11-02T15:00:00.000Z');
const TIME_ZONE = 'America/New_York';

function membership(overrides: Partial<CommunityMembership> = {}): CommunityMembership {
  return {
    userId: 'user-1',
    communityId: 7,
    communityName: 'Sunset Condos',
    role: 'property_manager',
    communityType: 'condo_718',
    isUnitOwner: false,
    isAdmin: true,
    designation: null,
    ...overrides,
  } as CommunityMembership;
}

const MANAGER = membership();
const OWNER = membership({ role: 'resident', isAdmin: false, isUnitOwner: true });
const features = getFeaturesForCommunity('condo_718');

function run(m: CommunityMembership, f = features) {
  return loadDashboardOverview({
    communityId: 7,
    userId: 'user-1',
    membership: m,
    features: f,
    timeZone: TIME_ZONE,
    now: NOW,
  });
}

/** The scoped client's chain: selectFrom(...) -> orderBy(...) -> rows. */
function hearingRows(rows: unknown[]) {
  selectFromMock.mockImplementation((table: unknown) => {
    if (table && (table as { unitNumber?: unknown }).unitNumber) return [];
    return { orderBy: async () => rows };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  loadChecklistWithStatusMock.mockResolvedValue([{ id: 1, templateKey: 'a' }]);
  requireEntitledForAdminReadMock.mockResolvedValue(undefined);
  listCommunityCalendarMeetingsMock.mockResolvedValue([]);
  getViolationReadUnitIdsMock.mockResolvedValue(undefined);
  hearingRows([]);
});

describe('loadDashboardOverview', () => {
  it('one rejected source yields ok:false, others ok:true', async () => {
    listCommunityCalendarMeetingsMock.mockRejectedValue(new Error('db down'));

    const data = await run(MANAGER);

    expect(data.meetings30d).toEqual({ ok: false });
    expect(data.checklist).toEqual({ ok: true, value: [{ id: 1, templateKey: 'a' }] });
    expect(data.hearings).toEqual({ ok: true, value: [] });
    expect(console.error).toHaveBeenCalledWith('[dashboard-overview]', 'meetings30d', expect.any(Error));
  });

  it('a rejected hearings read is ok:false while checklist and meetings stay ok', async () => {
    selectFromMock.mockImplementation(() => {
      throw new Error('violations unreadable');
    });

    const data = await run(MANAGER);

    expect(data.hearings).toEqual({ ok: false });
    expect(data.checklist?.ok).toBe(true);
    expect(data.meetings30d.ok).toBe(true);
  });

  it('owner gets checklist null and hearings null and loadChecklistWithStatus is not called', async () => {
    const data = await run(OWNER);

    expect(data.checklist).toBeNull();
    expect(data.hearings).toBeNull();
    expect(data.meetings30d.ok).toBe(true);
    expect(loadChecklistWithStatusMock).not.toHaveBeenCalled();
    expect(requireEntitledForAdminReadMock).not.toHaveBeenCalled();
    expect(selectFromMock).not.toHaveBeenCalled();
  });

  it('entitlement failure gives checklist null', async () => {
    requireEntitledForAdminReadMock.mockRejectedValue(
      new AppError('lapsed', 403, 'SUBSCRIPTION_REQUIRED'),
    );

    const data = await run(MANAGER);

    expect(data.checklist).toBeNull();
    expect(loadChecklistWithStatusMock).not.toHaveBeenCalled();
    expect(data.meetings30d.ok).toBe(true);
  });

  it('an unexpected entitlement-lookup failure is a failed source, not a hidden one', async () => {
    requireEntitledForAdminReadMock.mockRejectedValue(new Error('connection reset'));

    const data = await run(MANAGER);

    expect(data.checklist).toEqual({ ok: false });
  });

  it('a board seat without write access still loads the checklist', async () => {
    const data = await run(
      membership({ role: 'resident', isAdmin: false, isUnitOwner: true, designation: 'board_member' }),
    );

    expect(data.checklist).toEqual({ ok: true, value: [{ id: 1, templateKey: 'a' }] });
    expect(loadChecklistWithStatusMock).toHaveBeenCalledWith(7, 'condo_718');
  });

  it('a community without hasCompliance gets checklist null', async () => {
    const data = await run(MANAGER, { ...features, hasCompliance: false });

    expect(data.checklist).toBeNull();
    expect(loadChecklistWithStatusMock).not.toHaveBeenCalled();
  });

  it('essentials (no hasViolations) gives hearings null', async () => {
    const data = await run(MANAGER, { ...features, hasViolations: false });

    expect(data.hearings).toBeNull();
    expect(selectFromMock).not.toHaveBeenCalled();
    expect(data.checklist?.ok).toBe(true);
  });

  it('hearing query filters hearing_scheduled', async () => {
    await run(MANAGER);

    const [, , where] = selectFromMock.mock.calls[0]!;
    const clauses = (where as { __and: unknown[] }).__and;
    expect(clauses).toContainEqual({
      __eq: { col: 'violations.status', val: 'hearing_scheduled' },
    });
    // [now, now + 30 + HEARING_NOTICE_DAYS (14) days]
    expect(clauses).toContainEqual({
      __gte: { col: 'violations.hearing_date', val: NOW },
    });
    expect(clauses).toContainEqual({
      __lte: {
        col: 'violations.hearing_date',
        val: new Date(NOW.getTime() + 44 * 86_400_000),
      },
    });
  });

  it('maps hearing rows to unit-labelled ISO hearings', async () => {
    const hearingDate = new Date('2026-11-20T18:00:00.000Z');
    selectFromMock.mockImplementation((table: unknown) => {
      if ((table as { unitNumber?: unknown })?.unitNumber) {
        return Promise.resolve([{ id: 4, unitNumber: '4B', building: null }]);
      }
      return { orderBy: async () => [{ id: 11, unitId: 4, hearingDate }] };
    });

    const data = await run(MANAGER);

    expect(data.hearings).toEqual({
      ok: true,
      value: [{ violationId: 11, unitLabel: expect.stringContaining('4B'), hearingDate: hearingDate.toISOString() }],
    });
  });

  it('asks for [today 00:00, +30 days) in the community timezone', async () => {
    await run(MANAGER);

    const [communityId, range] = listCommunityCalendarMeetingsMock.mock.calls[0]!;
    expect(communityId).toBe(7);
    // Mon 2 Nov 2026 10:00 New York (EST, UTC-5) -> window opens Mon 2 Nov 00:00 EST
    expect(range.startUtc.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    // Wed 2 Dec 00:00 EST: 30 calendar days later, exclusive
    expect(range.endUtcExclusive.toISOString()).toBe('2026-12-02T05:00:00.000Z');
  });
});

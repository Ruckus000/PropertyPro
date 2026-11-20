/**
 * Check-in of a pass that has been used before.
 *
 * Recurring, permanent and vendor passes are good for every visit in their
 * window; a one-time pass is finished once checked out. Check-in also refuses
 * a pass before it starts and on a day its recurrence rule leaves out, judged
 * in the community's timezone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createScopedClientMock, queueNotificationMock, visitorLogTable, communitiesTable } =
  vi.hoisted(() => ({
    createScopedClientMock: vi.fn(),
    queueNotificationMock: vi.fn(),
    visitorLogTable: {
      id: 'visitor_log.id',
      guestType: 'visitor_log.guest_type',
      checkedInAt: 'visitor_log.checked_in_at',
      checkedOutAt: 'visitor_log.checked_out_at',
      deletedAt: 'visitor_log.deleted_at',
    },
    communitiesTable: { id: 'communities.id', timezone: 'communities.timezone' },
  }));

vi.mock('@propertypro/db', () => ({
  packageLog: {},
  visitorLog: visitorLogTable,
  deniedVisitors: {},
  communities: communitiesTable,
  createScopedClient: createScopedClientMock,
  logAuditEvent: vi.fn(),
  units: {},
  userRoles: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...clauses: unknown[]) => ({ and: clauses }),
  desc: (col: unknown) => ({ desc: col }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  gte: (col: unknown, val: unknown) => ({ gte: [col, val] }),
  inArray: (col: unknown, vals: unknown[]) => ({ inArray: [col, vals] }),
  notInArray: (col: unknown, vals: unknown[]) => ({ notInArray: [col, vals] }),
  isNotNull: (col: unknown) => ({ isNotNull: col }),
  isNull: (col: unknown) => ({ isNull: col }),
  lt: (col: unknown, val: unknown) => ({ lt: [col, val] }),
  or: (...clauses: unknown[]) => ({ or: clauses }),
  sql: () => ({ sql: true }),
}));

vi.mock('@/lib/services/units-lookup', () => ({ getUnitLabelMap: vi.fn(async () => new Map()) }));
vi.mock('@/lib/units/actor-units', () => ({ listUnitResidentUserIds: vi.fn() }));
vi.mock('@/lib/services/notification-service', () => ({ queueNotification: queueNotificationMock }));

import { checkInVisitorForCommunity } from '../../src/lib/services/package-visitor-service';

const COMMUNITY_ID = 42;
// Wednesday 2026-11-18, 10:00 in New York.
const NOW = new Date('2026-11-18T15:00:00Z');

function pass(overrides: Record<string, unknown> = {}) {
  return {
    id: 12,
    communityId: COMMUNITY_ID,
    visitorName: 'Ana Ruiz',
    hostUnitId: 3,
    hostUserId: 'tenant-3',
    guestType: 'permanent',
    checkedInAt: null,
    checkedOutAt: null,
    revokedAt: null,
    validFrom: null,
    validUntil: null,
    recurrenceRule: null,
    ...overrides,
  };
}

/** `rows` answers the pass reads in order; a community read answers `timezone`. */
function mockDb(rows: unknown[], updated: unknown[], timezone = 'America/New_York') {
  const passReads = [...rows];
  const selectFrom = vi.fn(async (table: unknown) =>
    table === communitiesTable ? [{ timezone }] : [passReads.shift() ?? rows.at(-1)],
  );
  const update = vi.fn(async (_table: unknown, _values: unknown, _where: unknown) => updated);
  createScopedClientMock.mockReturnValue({ selectFrom, update });
  return { selectFrom, update };
}

const previousVisit = {
  checkedInAt: new Date('2026-11-17T15:00:00Z'),
  checkedOutAt: new Date('2026-11-17T16:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('checkInVisitorForCommunity — re-entry', () => {
  it('checks a used permanent pass in again and clears the previous check-out', async () => {
    const existing = pass(previousVisit);
    const { update } = mockDb([existing], [{ ...existing, checkedInAt: NOW, checkedOutAt: null }]);

    const row = await checkInVisitorForCommunity(COMMUNITY_ID, 12, 'staff-1');

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![1]).toEqual({
      checkedInAt: NOW,
      checkedOutAt: null,
      staffUserId: 'staff-1',
    });
    expect(row.checkedOutAt).toBeNull();
    expect(queueNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('leaves a used one-time pass alone', async () => {
    const { update } = mockDb([pass({ guestType: 'one_time', ...previousVisit })], []);

    await checkInVisitorForCommunity(COMMUNITY_ID, 12, 'staff-1');

    expect(update).not.toHaveBeenCalled();
    expect(queueNotificationMock).not.toHaveBeenCalled();
  });

  it('does not check in a visitor who is already on site', async () => {
    const { update } = mockDb([pass({ checkedInAt: previousVisit.checkedInAt })], []);

    await checkInVisitorForCommunity(COMMUNITY_ID, 12, 'staff-1');

    expect(update).not.toHaveBeenCalled();
  });

  it('returns the current row without a second notice when a concurrent check-in won', async () => {
    const existing = pass(previousVisit);
    const winner = { ...existing, checkedInAt: NOW, checkedOutAt: null };
    const { update } = mockDb([existing, winner], []);

    const row = await checkInVisitorForCommunity(COMMUNITY_ID, 12, 'staff-1');

    expect(update).toHaveBeenCalledTimes(1);
    expect(row.checkedInAt).toEqual(NOW);
    expect(queueNotificationMock).not.toHaveBeenCalled();
  });

  it('refuses when the pass was revoked between the read and the write', async () => {
    const existing = pass(previousVisit);
    mockDb([existing, { ...existing, revokedAt: NOW }], []);

    await expect(checkInVisitorForCommunity(COMMUNITY_ID, 12, 'staff-1')).rejects.toThrow(
      'This visitor pass has been revoked',
    );
    expect(queueNotificationMock).not.toHaveBeenCalled();
  });
});

describe('checkInVisitorForCommunity — validity window and schedule', () => {
  it('refuses a pass before it starts', async () => {
    const { update } = mockDb([pass({ validFrom: new Date('2026-11-25T14:00:00Z') })], []);

    await expect(checkInVisitorForCommunity(COMMUNITY_ID, 12, 'staff-1')).rejects.toThrow(
      'This visitor pass starts on Nov 25, 2026, 9:00 AM',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('ignores a start date left on a one-time pass', async () => {
    // The registration form used to keep a Recurring draft's dates after a
    // switch to One-Time; that pass must still work at the gate.
    const existing = pass({ guestType: 'one_time', validFrom: new Date('2026-11-25T14:00:00Z') });
    const { update } = mockDb([existing], [{ ...existing, checkedInAt: NOW }]);

    await checkInVisitorForCommunity(COMMUNITY_ID, 12, 'staff-1');

    expect(update).toHaveBeenCalledTimes(1);
  });

  it('refuses a recurring pass on a day its rule leaves out', async () => {
    const { update } = mockDb([pass({ guestType: 'recurring', recurrenceRule: 'tue_thu' })], []);

    await expect(checkInVisitorForCommunity(COMMUNITY_ID, 12, 'staff-1')).rejects.toThrow(
      'This visitor pass is valid on Tue and Thu only',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('allows a recurring pass on one of its days', async () => {
    const existing = pass({ guestType: 'recurring', recurrenceRule: 'mon_wed_fri' });
    const { update } = mockDb([existing], [{ ...existing, checkedInAt: NOW }]);

    await checkInVisitorForCommunity(COMMUNITY_ID, 12, 'staff-1');

    expect(update).toHaveBeenCalledTimes(1);
  });

  it('judges the day in the community timezone', async () => {
    // Wednesday 22:00 in Los Angeles is already Thursday in New York and UTC.
    vi.setSystemTime(new Date('2026-11-19T06:00:00Z'));
    const existing = pass({ guestType: 'recurring', recurrenceRule: 'mon_wed_fri' });
    const { update } = mockDb([existing], [{ ...existing, checkedInAt: NOW }], 'America/Los_Angeles');

    await checkInVisitorForCommunity(COMMUNITY_ID, 12, 'staff-1');

    expect(update).toHaveBeenCalledTimes(1);
  });

  it('does not read the community for a pass with no start date or day rule', async () => {
    const existing = pass({ recurrenceRule: 'custom' });
    const { selectFrom } = mockDb([existing], [{ ...existing, checkedInAt: NOW }]);

    await checkInVisitorForCommunity(COMMUNITY_ID, 12, 'staff-1');

    expect(selectFrom.mock.calls.some(([table]) => table === communitiesTable)).toBe(false);
  });
});

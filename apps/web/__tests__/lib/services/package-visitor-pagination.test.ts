import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  getUnitLabelMapMock,
  selectFromMock,
  orderByMock,
  limitMock,
  visitorLogTable,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  getUnitLabelMapMock: vi.fn(),
  selectFromMock: vi.fn(),
  orderByMock: vi.fn(),
  limitMock: vi.fn(),
  visitorLogTable: {
    id: Symbol('visitor_log.id'),
    hostUnitId: Symbol('visitor_log.host_unit_id'),
    hostUserId: Symbol('visitor_log.host_user_id'),
    expectedArrival: Symbol('visitor_log.expected_arrival'),
    checkedInAt: Symbol('visitor_log.checked_in_at'),
    checkedOutAt: Symbol('visitor_log.checked_out_at'),
    guestType: Symbol('visitor_log.guest_type'),
    validUntil: Symbol('visitor_log.valid_until'),
    revokedAt: Symbol('visitor_log.revoked_at'),
  },
}));

vi.mock('@propertypro/db', () => ({
  packageLog: {},
  visitorLog: visitorLogTable,
  deniedVisitors: {},
  communities: {},
  clampPageSize: (input: number | null | undefined) => {
    if (input === null || input === undefined) return 50;
    if (!Number.isFinite(input) || !Number.isInteger(input)) return 50;
    if (input < 1) return 1;
    if (input > 100) return 100;
    return input;
  },
  createScopedClient: createScopedClientMock,
  paginate: vi.fn(),
  logAuditEvent: vi.fn(),
  userRoles: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  desc: (col: unknown) => ({ __desc: col }),
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  gte: (col: unknown, val: unknown) => ({ __gte: { col, val } }),
  inArray: (col: unknown, vals: unknown[]) => ({ __inArray: { col, vals } }),
  isNotNull: (col: unknown) => ({ __isNotNull: col }),
  isNull: (col: unknown) => ({ __isNull: col }),
  lt: (col: unknown, val: unknown) => ({ __lt: { col, val } }),
  or: (...clauses: unknown[]) => ({ __or: clauses }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: { strings, values } }),
}));

vi.mock('@/lib/services/units-lookup', () => ({
  getUnitLabelMap: getUnitLabelMapMock,
}));

vi.mock('@/lib/services/notification-service', () => ({
  queueNotification: vi.fn(),
}));

import { paginateVisitorsForCommunity } from '../../../src/lib/services/package-visitor-service';

function encodeCursor(payload: { expectedArrival: string; id: number }) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function row(id: number, hostUnitId: number, expectedArrival: string) {
  return {
    id,
    communityId: 42,
    visitorName: `Visitor ${id}`,
    purpose: 'Guest',
    hostUnitId,
    hostUserId: 'resident-1',
    expectedArrival: new Date(expectedArrival),
    checkedInAt: null,
    checkedOutAt: null,
    passCode: `PASS-${id}`,
    staffUserId: null,
    notes: null,
    guestType: 'one_time',
    validFrom: null,
    validUntil: null,
    recurrenceRule: null,
    expectedDurationMinutes: null,
    vehicleMake: null,
    vehicleModel: null,
    vehicleColor: null,
    vehiclePlate: null,
    revokedByUserId: null,
    revokedAt: null,
    createdAt: new Date('2026-05-01T12:00:00.000Z'),
    updatedAt: new Date('2026-05-01T12:00:00.000Z'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  orderByMock.mockReturnValue({ limit: limitMock });
  selectFromMock.mockReturnValue({ orderBy: orderByMock });
  createScopedClientMock.mockReturnValue({ selectFrom: selectFromMock });
  getUnitLabelMapMock.mockResolvedValue(new Map([[10, 'A-101'], [11, 'B-202']]));
});

describe('paginateVisitorsForCommunity', () => {
  it('preserves expected-arrival order with id tiebreaker and hydrates unit labels', async () => {
    limitMock.mockResolvedValueOnce([
      row(10, 10, '2026-06-03T12:00:00.000Z'),
      row(9, 11, '2026-06-02T12:00:00.000Z'),
      row(8, 10, '2026-06-01T12:00:00.000Z'),
    ]);

    const result = await paginateVisitorsForCommunity(42, { pageSize: 2 });

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(selectFromMock).toHaveBeenCalledWith(visitorLogTable, {}, undefined);
    expect(orderByMock).toHaveBeenCalledWith(
      { __desc: visitorLogTable.expectedArrival },
      { __desc: visitorLogTable.id },
    );
    expect(limitMock).toHaveBeenCalledWith(3);
    expect(getUnitLabelMapMock).toHaveBeenCalledWith(42, [10, 11]);
    expect(result.data.map((visitor) => visitor.id)).toEqual([10, 9]);
    expect(result.data.map((visitor) => visitor.hostUnitLabel)).toEqual(['A-101', 'B-202']);
    expect(JSON.parse(Buffer.from(result.pagination.nextCursor!, 'base64url').toString('utf8'))).toEqual({
      expectedArrival: '2026-06-02T12:00:00.000Z',
      id: 9,
    });
  });

  it('combines membership filters and cursor predicate before pagination', async () => {
    limitMock.mockResolvedValueOnce([row(7, 10, '2026-06-01T12:00:00.000Z')]);

    await paginateVisitorsForCommunity(42, {
      cursor: encodeCursor({ expectedArrival: '2026-06-02T12:00:00.000Z', id: 9 }),
      pageSize: 10,
      allowedUnitIds: [10, 11],
      hostUnitId: 10,
      onlyActive: true,
      guestType: 'vendor',
      status: 'checked_in',
    });

    expect(selectFromMock.mock.calls[0]![2]).toEqual({
      __and: [
        {
          __and: [
            { __eq: { col: visitorLogTable.hostUnitId, val: 10 } },
            { __isNull: visitorLogTable.checkedOutAt },
            { __inArray: { col: visitorLogTable.hostUnitId, vals: [10, 11] } },
            { __eq: { col: visitorLogTable.guestType, val: 'vendor' } },
            { __isNotNull: visitorLogTable.checkedInAt },
            { __isNull: visitorLogTable.checkedOutAt },
            { __isNull: visitorLogTable.revokedAt },
            {
              __or: [
                { __isNull: visitorLogTable.validUntil },
                { __gte: { col: visitorLogTable.validUntil, val: expect.any(Date) } },
              ],
            },
          ],
        },
        {
          __or: [
            { __lt: { col: visitorLogTable.expectedArrival, val: new Date('2026-06-02T12:00:00.000Z') } },
            {
              __and: [
                { __eq: { col: visitorLogTable.expectedArrival, val: new Date('2026-06-02T12:00:00.000Z') } },
                { __lt: { col: visitorLogTable.id, val: 9 } },
              ],
            },
          ],
        },
      ],
    });
  });

  it('treats malformed cursors as first page and clamps page size', async () => {
    limitMock.mockResolvedValueOnce([row(1, 10, '2026-06-01T12:00:00.000Z')]);

    const result = await paginateVisitorsForCommunity(42, {
      cursor: 'not-json',
      pageSize: 500,
    });

    expect(selectFromMock).toHaveBeenCalledWith(visitorLogTable, {}, undefined);
    expect(limitMock).toHaveBeenCalledWith(101);
    expect(result.pagination).toEqual({
      nextCursor: null,
      hasMore: false,
      pageSize: 100,
    });
  });

  it('applies empty resident unit access as an impossible SQL predicate', async () => {
    limitMock.mockResolvedValueOnce([]);

    await paginateVisitorsForCommunity(42, {
      allowedUnitIds: [],
      pageSize: 5,
    });

    expect(selectFromMock.mock.calls[0]![2]).toEqual({ __sql: { strings: ['false'], values: [] } });
  });
});

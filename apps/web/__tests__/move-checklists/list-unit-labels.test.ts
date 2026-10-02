/**
 * The move-in/out list cards print the unit's NUMBER ("Unit 1B"), not its
 * database id: `listMoveChecklists` (the list GET's only read) attaches
 * `unitLabel` with one units lookup. The detail GET is labelled at the route
 * (see id-route.test.ts) because `getMoveChecklist` also serves the step writes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  selectFromMock: vi.fn(),
  createScopedClientMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  communities: {},
  createScopedClient: h.createScopedClientMock,
  leases: {},
  maintenanceRequests: {},
  moveChecklists: { name: 'move_checklists' },
  units: { name: 'units', id: 'units.id', unitNumber: 'units.unit_number', building: 'units.building' },
  logAuditEvent: vi.fn(),
  MOVE_IN_STEPS: [],
  MOVE_OUT_STEPS: [],
  STEP_LABELS: {},
  users: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  inArray: (col: unknown, vals: unknown[]) => ({ __inArray: { col, vals } }),
  isNull: (col: unknown) => ({ __isNull: col }),
  isNotNull: (col: unknown) => ({ __isNotNull: col }),
}));

import { listMoveChecklists } from '../../src/lib/services/move-checklist-service';

beforeEach(() => {
  vi.clearAllMocks();
  h.createScopedClientMock.mockReturnValue({ selectFrom: h.selectFromMock });
});

describe('listMoveChecklists', () => {
  it('labels each checklist by unit number, not unit id, in one units query', async () => {
    h.selectFromMock
      .mockResolvedValueOnce([
        { id: 1, unitId: 2, leaseId: 10, type: 'move_in' },
        { id: 2, unitId: 3, leaseId: 11, type: 'move_out' },
      ])
      .mockResolvedValueOnce([
        { id: 2, unitNumber: '1B', building: null },
        { id: 3, unitNumber: '2A', building: 'Bldg A' },
      ]);

    const rows = await listMoveChecklists(42);

    expect(rows.map((row) => [row.unitId, row.unitLabel])).toEqual([
      [2, 'Unit 1B'],
      [3, 'Bldg A • Unit 2A'],
    ]);
    expect(h.selectFromMock).toHaveBeenCalledTimes(2);
    expect(h.selectFromMock.mock.calls[1]![2]).toEqual({ __inArray: { col: 'units.id', vals: [2, 3] } });
  });
});

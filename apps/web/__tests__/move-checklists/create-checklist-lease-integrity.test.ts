/**
 * `createMoveChecklist` refuses a lease, unit or resident that do not belong
 * together in the checklist's community. Before this check a manager could
 * name another community's lease/unit/user: `send_welcome` then emailed that
 * user, an inspection step opened a maintenance request on the foreign unit,
 * and the restrict FKs blocked the other community from deleting them.
 *
 * The lease read goes through the community's scoped client, so a lease in
 * another community comes back as no row (scoping itself is covered by the
 * scoped-client integration tests); here the rule on top of it is pinned.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  selectFromMock: vi.fn(),
  insertMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  communities: {},
  createScopedClient: h.createScopedClientMock,
  leases: { id: 'leases.id', unitId: 'leases.unit_id', residentId: 'leases.resident_id', deletedAt: 'leases.deleted_at' },
  maintenanceRequests: {},
  moveChecklists: {},
  logAuditEvent: h.logAuditEventMock,
  MOVE_IN_STEPS: ['upload_lease'],
  MOVE_OUT_STEPS: ['final_inspection'],
  STEP_LABELS: {},
  users: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  isNull: (col: unknown) => ({ __isNull: col }),
  isNotNull: (col: unknown) => ({ __isNotNull: col }),
}));

import { createMoveChecklist } from '../../src/lib/services/move-checklist-service';

const INPUT = {
  communityId: 7,
  leaseId: 11,
  unitId: 22,
  residentId: '33333333-3333-4333-8333-333333333333',
  type: 'move_in' as const,
};

describe('createMoveChecklist lease integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.createScopedClientMock.mockReturnValue({ selectFrom: h.selectFromMock, insert: h.insertMock });
    h.insertMock.mockResolvedValue([{ id: 99 }]);
    h.selectFromMock.mockResolvedValue([{ unitId: 22, residentId: INPUT.residentId }]);
  });

  it('creates the checklist when the lease is this community’s and matches unit + resident', async () => {
    const row = await createMoveChecklist(INPUT, 'admin-1');

    expect(row).toEqual({ id: 99 });
    expect(h.createScopedClientMock).toHaveBeenCalledWith(7);
    expect(h.selectFromMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'leases.id' }),
      expect.anything(),
      { __and: [{ __eq: { col: 'leases.id', val: 11 } }, { __isNull: 'leases.deleted_at' }] },
    );
    expect(h.insertMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a lease this community cannot see (another community’s, or deleted)', async () => {
    h.selectFromMock.mockResolvedValue([]);

    await expect(createMoveChecklist(INPUT, 'admin-1')).rejects.toMatchObject({ statusCode: 400 });
    expect(h.insertMock).not.toHaveBeenCalled();
    expect(h.logAuditEventMock).not.toHaveBeenCalled();
  });

  it('refuses a unit that is not the lease’s unit', async () => {
    await expect(createMoveChecklist({ ...INPUT, unitId: 999 }, 'admin-1')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(h.insertMock).not.toHaveBeenCalled();
  });

  it('refuses a resident who is not the lease’s resident', async () => {
    await expect(
      createMoveChecklist({ ...INPUT, residentId: '44444444-4444-4444-8444-444444444444' }, 'admin-1'),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(h.insertMock).not.toHaveBeenCalled();
  });
});

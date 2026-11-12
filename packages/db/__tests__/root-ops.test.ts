import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit test for reassignRootOp (role-v3 Phase 2b) — the single source of truth
 * for platform-admin root reassignment, shared by the web service layer and the
 * admin route. Mocks ../src/drizzle (db.transaction), ../src/scoped-client
 * (createScopedClient), and ../src/utils/audit-logger so it runs without a DB.
 */

const { transactionMock, createScopedClientMock, logAuditEventMock, selectFromMock, updateMock } =
  vi.hoisted(() => ({
    transactionMock: vi.fn(),
    createScopedClientMock: vi.fn(),
    logAuditEventMock: vi.fn(),
    selectFromMock: vi.fn(),
    updateMock: vi.fn(),
  }));

vi.mock('../src/drizzle', () => ({
  db: { transaction: transactionMock },
}));
vi.mock('../src/scoped-client', () => ({
  createScopedClient: createScopedClientMock,
}));
vi.mock('../src/utils/audit-logger', () => ({
  logAuditEvent: logAuditEventMock,
}));

import { reassignRootOp, RoleOpForbiddenError, RootOpConflictError } from '../src/ops/root-ops';

/**
 * The billing step queries the transaction directly. Each `.limit()` answers
 * with the next queued rows: the community's group, then whether the owner
 * keeps it, then whether the new root owns another group.
 */
let txRows: unknown[][] = [];
const txUpdateSetMock = vi.fn();
function txStub() {
  const chain: Record<string, unknown> = {};
  for (const step of ['from', 'innerJoin', 'where']) chain[step] = () => chain;
  chain.limit = () => Promise.resolve(txRows.shift() ?? []);
  return {
    select: () => chain,
    update: () => ({
      set: (values: unknown) => {
        txUpdateSetMock(values);
        return { where: () => Promise.resolve() };
      },
    }),
  };
}

describe('reassignRootOp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // db.transaction(fn) runs fn with a tx stub.
    txRows = [];
    transactionMock.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txStub()));
    createScopedClientMock.mockReturnValue({ selectFrom: selectFromMock, update: updateMock });
    updateMock.mockResolvedValue(undefined);
  });

  it('happy path: verifies PM target, demote-then-promote, resolves disputes, audits', async () => {
    selectFromMock.mockResolvedValueOnce([{ userId: 'new-1', role: 'property_manager' }]);
    selectFromMock.mockResolvedValueOnce([{ userId: 'old-1', role: 'root_manager' }]);

    await reassignRootOp({ communityId: 7, newUserId: 'new-1', actingUserId: 'admin-1' });

    // demote current root + promote new + resolve disputes = 3 updates
    expect(updateMock).toHaveBeenCalledTimes(3);
    // No billing group: nothing to move, and the audit records only the root.
    expect(txUpdateSetMock).not.toHaveBeenCalled();
    const entry = logAuditEventMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(entry).toMatchObject({ action: 'root_reassigned', communityId: 7, newValues: { root: 'new-1' } });
    expect(entry).not.toHaveProperty('oldValues');
  });

  it('moves billing from the demoted root and audits the previous owner', async () => {
    selectFromMock.mockResolvedValueOnce([{ userId: 'new-1', role: 'property_manager' }]);
    selectFromMock.mockResolvedValueOnce([{ userId: 'old-1', role: 'root_manager' }]);
    txRows = [[{ id: 3, ownerUserId: 'old-1' }], [], []];

    await reassignRootOp({ communityId: 7, newUserId: 'new-1', actingUserId: 'admin-1' });

    expect(txUpdateSetMock).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: 'new-1' }));
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: { root: 'old-1', billingGroupOwner: 'old-1' },
        newValues: { root: 'new-1', billingGroupOwner: 'new-1', billingGroupId: 3 },
      }),
    );
  });

  it('throws RootOpConflictError, without auditing, when the new root owns another group', async () => {
    selectFromMock.mockResolvedValueOnce([{ userId: 'new-1', role: 'property_manager' }]);
    selectFromMock.mockResolvedValueOnce([{ userId: 'old-1', role: 'root_manager' }]);
    txRows = [[{ id: 3, ownerUserId: 'old-1' }], [], [{ id: 4 }]];

    await expect(
      reassignRootOp({ communityId: 7, newUserId: 'new-1', actingUserId: 'admin-1' }),
    ).rejects.toBeInstanceOf(RootOpConflictError);
    expect(txUpdateSetMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('throws RoleOpForbiddenError when the target is not a property_manager (never promotes a resident)', async () => {
    selectFromMock.mockResolvedValueOnce([]); // no property_manager row

    await expect(
      reassignRootOp({ communityId: 7, newUserId: 'resident-1', actingUserId: 'admin-1' }),
    ).rejects.toBeInstanceOf(RoleOpForbiddenError);
    expect(updateMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});

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

import { reassignRootOp, RoleOpForbiddenError } from '../src/ops/root-ops';

describe('reassignRootOp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // db.transaction(fn) runs fn with a tx stub.
    transactionMock.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({}));
    createScopedClientMock.mockReturnValue({ selectFrom: selectFromMock, update: updateMock });
    updateMock.mockResolvedValue(undefined);
  });

  it('happy path: verifies PM target, demote-then-promote, resolves disputes, audits', async () => {
    selectFromMock.mockResolvedValueOnce([{ userId: 'new-1', role: 'property_manager' }]);

    await reassignRootOp({ communityId: 7, newUserId: 'new-1', actingUserId: 'admin-1' });

    // demote current root + promote new + resolve disputes = 3 updates
    expect(updateMock).toHaveBeenCalledTimes(3);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'root_reassigned', communityId: 7 }),
    );
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

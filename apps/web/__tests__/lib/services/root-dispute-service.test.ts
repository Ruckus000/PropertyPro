import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '../../../src/lib/api/errors/ForbiddenError';

const {
  createScopedClientMock,
  createUnscopedClientMock,
  logAuditEventMock,
  scopedSelectFromMock,
  scopedInsertMock,
  scopedUpdateMock,
  userRolesTable,
  rootClaimDisputesTable,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  createUnscopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  scopedSelectFromMock: vi.fn(),
  scopedInsertMock: vi.fn().mockResolvedValue([]),
  scopedUpdateMock: vi.fn().mockResolvedValue(undefined),
  userRolesTable: Symbol('user_roles'),
  rootClaimDisputesTable: Symbol('root_claim_disputes'),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  userRoles: userRolesTable,
  rootClaimDisputes: rootClaimDisputesTable,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  and: (...clauses: unknown[]) => ({ __and: clauses }),
}));

import {
  openDispute,
  reassignRoot,
  transferRoot,
} from '../../../src/lib/services/root-dispute-service';

function scopedClient() {
  return {
    selectFrom: scopedSelectFromMock,
    insert: scopedInsertMock,
    update: scopedUpdateMock,
  };
}

describe('root-dispute-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scopedInsertMock.mockResolvedValue([]);
    scopedUpdateMock.mockResolvedValue(undefined);
    createScopedClientMock.mockReturnValue(scopedClient());
    // Unscoped client whose transaction just runs the callback with a fake tx.
    createUnscopedClientMock.mockReturnValue({
      transaction: (cb: (tx: unknown) => Promise<unknown>) => cb({}),
    });
  });

  describe('openDispute', () => {
    it('inserts an open dispute with the current root + audits', async () => {
      scopedSelectFromMock
        .mockResolvedValueOnce([{ userId: 'root-1' }]) // current root
        .mockResolvedValueOnce([]); // no existing open dispute

      const result = await openDispute(7, 'pm-disputer');

      expect(result).toEqual({ disputed: true });
      expect(scopedInsertMock).toHaveBeenCalledWith(rootClaimDisputesTable, {
        claimedUserId: 'root-1',
        disputedByUserId: 'pm-disputer',
        status: 'open',
      });
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'root_claim_disputed', communityId: 7 }),
      );
    });

    it('is idempotent — existing open dispute → no duplicate insert', async () => {
      scopedSelectFromMock
        .mockResolvedValueOnce([{ userId: 'root-1' }])
        .mockResolvedValueOnce([{ id: 1, status: 'open' }]);

      const result = await openDispute(7, 'pm-disputer');

      expect(result).toEqual({ disputed: true, alreadyOpen: true });
      expect(scopedInsertMock).not.toHaveBeenCalled();
    });

    it('no current root → no-op (no null insert)', async () => {
      scopedSelectFromMock.mockResolvedValueOnce([]); // no root_manager

      const result = await openDispute(7, 'pm-disputer');

      expect(result).toEqual({ disputed: false, reason: 'no_current_root' });
      expect(scopedInsertMock).not.toHaveBeenCalled();
      expect(logAuditEventMock).not.toHaveBeenCalled();
    });
  });

  describe('transferRoot', () => {
    it('demotes from then promotes to (target is a property_manager)', async () => {
      scopedSelectFromMock.mockResolvedValueOnce([{ userId: 'to-1', role: 'property_manager' }]);

      await transferRoot(7, 'from-1', 'to-1');

      expect(scopedUpdateMock).toHaveBeenCalledTimes(2);
      // First update demotes the current root.
      expect(scopedUpdateMock.mock.calls[0]?.[1]).toEqual({ role: 'property_manager' });
      // Second update promotes the target.
      expect(scopedUpdateMock.mock.calls[1]?.[1]).toEqual({ role: 'root_manager' });
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'root_transferred', communityId: 7 }),
      );
    });

    it('throws ForbiddenError when target is not a property_manager', async () => {
      scopedSelectFromMock.mockResolvedValueOnce([]);

      await expect(transferRoot(7, 'from-1', 'to-1')).rejects.toBeInstanceOf(ForbiddenError);
      expect(scopedUpdateMock).not.toHaveBeenCalled();
    });
  });

  describe('reassignRoot', () => {
    it('happy path: swaps both rows + resolves open disputes + audits', async () => {
      scopedSelectFromMock.mockResolvedValueOnce([{ userId: 'new-1', role: 'property_manager' }]);

      await reassignRoot(7, 'new-1', 'admin-1');

      // demote root, promote new, resolve disputes = 3 updates
      expect(scopedUpdateMock).toHaveBeenCalledTimes(3);
      const resolveCall = scopedUpdateMock.mock.calls[2];
      expect(resolveCall?.[0]).toBe(rootClaimDisputesTable);
      expect(resolveCall?.[1]).toMatchObject({ status: 'resolved', resolvedBy: 'admin-1' });
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'root_reassigned', communityId: 7 }),
      );
    });

    it('throws ForbiddenError when newUser has no property_manager row (never promote a resident)', async () => {
      scopedSelectFromMock.mockResolvedValueOnce([]); // no property_manager membership

      await expect(reassignRoot(7, 'resident-1', 'admin-1')).rejects.toBeInstanceOf(ForbiddenError);
      expect(scopedUpdateMock).not.toHaveBeenCalled();
    });
  });
});

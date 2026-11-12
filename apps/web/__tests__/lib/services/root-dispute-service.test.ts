import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '../../../src/lib/api/errors/ForbiddenError';

const {
  createScopedClientMock,
  createUnscopedClientMock,
  moveBillingMock,
  logAuditEventMock,
  scopedSelectFromMock,
  scopedInsertMock,
  scopedUpdateMock,
  userRolesTable,
  rootClaimDisputesTable,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  createUnscopedClientMock: vi.fn(),
  moveBillingMock: vi.fn(),
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
  moveBillingOwnershipWithRootTx: moveBillingMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  and: (...clauses: unknown[]) => ({ __and: clauses }),
}));

import {
  openDispute,
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
    moveBillingMock.mockResolvedValue({ outcome: 'kept' });
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

      expect(result).toEqual({ disputed: true, alreadyOpen: false });
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
      expect(moveBillingMock).not.toHaveBeenCalled();
    });

    describe('billing follows root', () => {
      it('moves billing in the same transaction, after the role swap', async () => {
        const tx = { marker: 'tx' };
        createUnscopedClientMock.mockReturnValue({
          transaction: (cb: (t: unknown) => Promise<unknown>) => cb(tx),
        });
        scopedSelectFromMock.mockResolvedValueOnce([{ userId: 'to-1', role: 'property_manager' }]);
        moveBillingMock.mockResolvedValue({ outcome: 'moved', billingGroupId: 9 });

        await transferRoot(7, 'from-1', 'to-1');

        expect(moveBillingMock).toHaveBeenCalledWith(tx, {
          communityId: 7,
          fromUserId: 'from-1',
          toUserId: 'to-1',
        });
        expect(moveBillingMock.mock.invocationCallOrder[0]).toBeGreaterThan(
          scopedUpdateMock.mock.invocationCallOrder[1]!,
        );
        expect(logAuditEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'root_transferred',
            oldValues: { root: 'from-1', billingGroupOwner: 'from-1' },
            newValues: { root: 'to-1', billingGroupOwner: 'to-1', billingGroupId: 9 },
          }),
        );
      });

      it('records only the root change when billing stays put', async () => {
        scopedSelectFromMock.mockResolvedValueOnce([{ userId: 'to-1', role: 'property_manager' }]);

        await transferRoot(7, 'from-1', 'to-1');

        expect(logAuditEventMock).toHaveBeenCalledWith(
          expect.objectContaining({ oldValues: { root: 'from-1' }, newValues: { root: 'to-1' } }),
        );
      });

      it('refuses the whole transfer when the new root already pays for another portfolio', async () => {
        scopedSelectFromMock.mockResolvedValueOnce([{ userId: 'to-1', role: 'property_manager' }]);
        moveBillingMock.mockResolvedValue({ outcome: 'target_owns_other_group', billingGroupId: 9 });

        const err = await transferRoot(7, 'from-1', 'to-1').catch((e: unknown) => e);

        expect(err).toMatchObject({ statusCode: 409, code: 'ROOT_TRANSFER_TARGET_OWNS_BILLING_GROUP' });
        expect(logAuditEventMock).not.toHaveBeenCalled();
      });
    });
  });

  // reassignRoot moved to @propertypro/db `reassignRootOp` (single source of
  // truth shared with the admin route) — covered by packages/db/__tests__/root-ops.test.ts.
});

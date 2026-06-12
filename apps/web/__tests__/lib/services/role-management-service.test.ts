import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '../../../src/lib/api/errors/ForbiddenError';
import { ValidationError } from '../../../src/lib/api/errors/ValidationError';

const {
  createScopedClientMock,
  logAuditEventMock,
  scopedQueryWhereMock,
  scopedUpdateMock,
  userRolesTable,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  scopedQueryWhereMock: vi.fn(),
  scopedUpdateMock: vi.fn().mockResolvedValue(undefined),
  userRolesTable: Symbol('user_roles'),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  userRoles: userRolesTable,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
}));

import {
  assignPropertyManager,
  revokePropertyManager,
  setDesignation,
  NonOwnerAckRequiredError,
} from '../../../src/lib/services/role-management-service';

function scopedClient() {
  return {
    queryWhere: scopedQueryWhereMock,
    update: scopedUpdateMock,
  };
}

describe('role-management-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scopedUpdateMock.mockResolvedValue(undefined);
    createScopedClientMock.mockReturnValue(scopedClient());
  });

  // ---------------------------------------------------------------------------
  // assignPropertyManager
  // ---------------------------------------------------------------------------
  describe('assignPropertyManager', () => {
    it('promotes a resident to property_manager + audits role_assigned', async () => {
      scopedQueryWhereMock.mockResolvedValueOnce([
        { role: 'resident', isUnitOwner: false },
      ]);

      const result = await assignPropertyManager(7, 'target-user', 'actor-user');

      expect(result).toEqual({ assigned: true, alreadyAssigned: false });
      expect(scopedUpdateMock).toHaveBeenCalledWith(
        userRolesTable,
        { role: 'property_manager', isUnitOwner: false, presetKey: null },
        expect.objectContaining({ __eq: expect.objectContaining({ val: 'target-user' }) }),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'role_assigned',
          communityId: 7,
          newValues: expect.objectContaining({ userId: 'target-user', role: 'property_manager' }),
        }),
      );
    });

    it('is idempotent — already property_manager returns alreadyAssigned', async () => {
      scopedQueryWhereMock.mockResolvedValueOnce([
        { role: 'property_manager', isUnitOwner: false },
      ]);

      const result = await assignPropertyManager(7, 'target-user', 'actor-user');

      expect(result).toEqual({ assigned: true, alreadyAssigned: true });
      expect(scopedUpdateMock).not.toHaveBeenCalled();
      expect(logAuditEventMock).not.toHaveBeenCalled();
    });

    it('rejects targeting the current root (ForbiddenError)', async () => {
      scopedQueryWhereMock.mockResolvedValueOnce([
        { role: 'root_manager', isUnitOwner: false },
      ]);

      await expect(
        assignPropertyManager(7, 'root-user', 'actor-user'),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(scopedUpdateMock).not.toHaveBeenCalled();
    });

    it('rejects a non-member target (ValidationError) + no update/audit', async () => {
      scopedQueryWhereMock.mockResolvedValueOnce([]);

      await expect(
        assignPropertyManager(7, 'non-member', 'actor-user'),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(scopedUpdateMock).not.toHaveBeenCalled();
      expect(logAuditEventMock).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // revokePropertyManager
  // ---------------------------------------------------------------------------
  describe('revokePropertyManager', () => {
    it('demotes a property_manager to resident (isUnitOwner false) + audits role_revoked', async () => {
      scopedQueryWhereMock.mockResolvedValueOnce([
        { role: 'property_manager', isUnitOwner: false },
      ]);

      const result = await revokePropertyManager(7, 'target-user', 'actor-user');

      expect(result).toEqual({ revoked: true });
      expect(scopedUpdateMock).toHaveBeenCalledWith(
        userRolesTable,
        { role: 'resident', isUnitOwner: false },
        expect.objectContaining({ __eq: expect.objectContaining({ val: 'target-user' }) }),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'role_revoked',
          communityId: 7,
          newValues: expect.objectContaining({ userId: 'target-user', role: 'resident' }),
        }),
      );
    });

    it('no-ops when target is not a property_manager', async () => {
      scopedQueryWhereMock.mockResolvedValueOnce([
        { role: 'resident', isUnitOwner: true },
      ]);

      const result = await revokePropertyManager(7, 'target-user', 'actor-user');

      expect(result).toEqual({ revoked: false, reason: 'not_a_property_manager' });
      expect(scopedUpdateMock).not.toHaveBeenCalled();
    });

    it('rejects revoking the root (ForbiddenError)', async () => {
      scopedQueryWhereMock.mockResolvedValueOnce([
        { role: 'root_manager', isUnitOwner: false },
      ]);

      await expect(
        revokePropertyManager(7, 'root-user', 'actor-user'),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(scopedUpdateMock).not.toHaveBeenCalled();
    });

    it('resolves { revoked: false, reason } for a non-member target + no update/audit', async () => {
      scopedQueryWhereMock.mockResolvedValueOnce([]);

      const result = await revokePropertyManager(7, 'non-member', 'actor-user');

      expect(result).toEqual({ revoked: false, reason: 'not_a_property_manager' });
      expect(scopedUpdateMock).not.toHaveBeenCalled();
      expect(logAuditEventMock).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // setDesignation
  // ---------------------------------------------------------------------------
  describe('setDesignation', () => {
    it('sets board_member on an owner-resident + audits designation_set', async () => {
      scopedQueryWhereMock.mockResolvedValueOnce([
        { role: 'resident', isUnitOwner: true },
      ]);

      const result = await setDesignation(7, 'condo_718', 'target-user', 'board_member', false, 'actor-user');

      expect(result).toEqual({ ok: true });
      expect(scopedUpdateMock).toHaveBeenCalledWith(
        userRolesTable,
        { designation: 'board_member' },
        expect.objectContaining({ __eq: expect.objectContaining({ val: 'target-user' }) }),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'designation_set',
          communityId: 7,
          newValues: expect.objectContaining({ userId: 'target-user', designation: 'board_member' }),
        }),
      );
    });

    it('clears designation (null) + audits designation_cleared', async () => {
      scopedQueryWhereMock.mockResolvedValueOnce([
        { role: 'resident', isUnitOwner: true },
      ]);

      const result = await setDesignation(7, 'condo_718', 'target-user', null, false, 'actor-user');

      expect(result).toEqual({ ok: true });
      expect(scopedUpdateMock).toHaveBeenCalledWith(
        userRolesTable,
        { designation: null },
        expect.objectContaining({ __eq: expect.objectContaining({ val: 'target-user' }) }),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'designation_cleared', communityId: 7 }),
      );
    });

    it('requires ack for a tenant target (NonOwnerAckRequiredError)', async () => {
      scopedQueryWhereMock.mockResolvedValueOnce([
        { role: 'resident', isUnitOwner: false },
      ]);

      await expect(
        setDesignation(7, 'condo_718', 'tenant-user', 'board_member', false, 'actor-user'),
      ).rejects.toBeInstanceOf(NonOwnerAckRequiredError);
      expect(scopedUpdateMock).not.toHaveBeenCalled();
    });

    it('allows a tenant target when acknowledgeNonOwner=true', async () => {
      scopedQueryWhereMock.mockResolvedValueOnce([
        { role: 'resident', isUnitOwner: false },
      ]);

      const result = await setDesignation(7, 'condo_718', 'tenant-user', 'board_member', true, 'actor-user');

      expect(result).toEqual({ ok: true });
      expect(scopedUpdateMock).toHaveBeenCalled();
    });

    it('reassigns board_president (clears prior president then sets)', async () => {
      scopedQueryWhereMock.mockResolvedValueOnce([
        { role: 'resident', isUnitOwner: true },
      ]);

      const result = await setDesignation(7, 'condo_718', 'target-user', 'board_president', false, 'actor-user');

      expect(result).toEqual({ ok: true });
      expect(scopedUpdateMock).toHaveBeenCalledTimes(2);
      // First call clears old president
      expect(scopedUpdateMock.mock.calls[0]?.[1]).toEqual({ designation: null });
      // Second call sets new president
      expect(scopedUpdateMock.mock.calls[1]?.[1]).toEqual({ designation: 'board_president' });
    });

    it('rejects designations on apartment communities (ValidationError)', async () => {
      await expect(
        setDesignation(7, 'apartment', 'target-user', 'board_member', false, 'actor-user'),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(scopedQueryWhereMock).not.toHaveBeenCalled();
    });

    it('rejects a non-member target on condo (ValidationError) + no update/audit', async () => {
      scopedQueryWhereMock.mockResolvedValueOnce([]);

      await expect(
        setDesignation(7, 'condo_718', 'non-member', 'board_member', false, 'actor-user'),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(scopedUpdateMock).not.toHaveBeenCalled();
      expect(logAuditEventMock).not.toHaveBeenCalled();
    });
  });
});

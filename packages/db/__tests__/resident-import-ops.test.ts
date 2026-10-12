import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `importResidentRowOp` — every write of a row goes through ONE transaction
 * handle. Whether Postgres actually rolls the row back is proven against a real
 * database in apps/web/__tests__/integration/import-residents-atomicity.integration.test.ts;
 * this file pins the wiring: no statement escapes to the package-level client.
 */

const { mockDb, tx, txInsert, unitRows, onConflictDoNothing } = vi.hoisted(() => {
  const inserts: unknown[] = [];
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const txInsert = vi.fn((table: unknown) => ({
    values: vi.fn((values: Record<string, unknown>) => {
      inserts.push(table);
      const result = Promise.resolve(undefined);
      Object.assign(result, {
        returning: vi.fn().mockResolvedValue([{ ...values, id: values['id'] ?? 1 }]),
        onConflictDoNothing,
      });
      return result;
    }),
  }));
  // The in-transaction unit check, through the scoped client's selectFrom:
  // tx.select(..).from(..).where(..).$dynamic() → an awaitable of rows.
  const unitRows: { value: unknown[] } = { value: [{ id: 7 }] };
  const txSelect = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ $dynamic: () => Promise.resolve(unitRows.value) })),
    })),
  }));
  const tx = { insert: txInsert, select: txSelect, __inserts: inserts };
  const mockDb = {
    insert: vi.fn(() => {
      throw new Error('wrote outside the transaction');
    }),
    transaction: vi.fn(async (fn: (handle: unknown) => Promise<unknown>) => fn(tx)),
  };
  return { mockDb, tx, txInsert, unitRows, onConflictDoNothing };
});

vi.mock('../src/drizzle', () => ({ db: mockDb }));

const { importResidentRowOp } = await import('../src/ops/resident-import-ops');
const { users } = await import('../src/schema/users');
const { userRoles } = await import('../src/schema/user-roles');
const { notificationPreferences } = await import('../src/schema/notification-preferences');
const { complianceAuditLog } = await import('../src/schema/compliance-audit-log');

const BASE = {
  communityId: 42,
  actorUserId: 'actor-1',
  email: 'ada@x.com',
  role: 'resident' as const,
  isUnitOwner: true,
  unitId: 7,
  displayTitle: 'Owner',
  legacyRole: 'owner',
};

beforeEach(() => {
  vi.clearAllMocks();
  (tx.__inserts as unknown[]).length = 0;
  unitRows.value = [{ id: 7 }];
});

describe('importResidentRowOp', () => {
  it('writes user, membership, preferences and audit in one transaction, in that order', async () => {
    const userId = await importResidentRowOp({ ...BASE, newUser: { fullName: 'Ada' } });

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(tx.__inserts).toEqual([users, userRoles, notificationPreferences, complianceAuditLog]);
    expect(typeof userId).toBe('string');
  });

  it('attaches an existing account without creating a user', async () => {
    const userId = await importResidentRowOp({ ...BASE, existingUserId: 'returning-1' });

    expect(userId).toBe('returning-1');
    expect(tx.__inserts).toEqual([userRoles, notificationPreferences, complianceAuditLog]);
    expect(txInsert).not.toHaveBeenCalledWith(users);
  });

  it('records the row email on the audit entry for an attached account too', async () => {
    await importResidentRowOp({ ...BASE, existingUserId: 'returning-1', auditMetadata: { bulkCount: 3 } });

    const auditCall = txInsert.mock.results.at(-1)!.value as { values: ReturnType<typeof vi.fn> };
    expect(auditCall.values).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: 'returning-1',
        newValues: { email: 'ada@x.com', role: 'resident', legacyRole: 'owner' },
        metadata: { bulkCount: 3, attachedExistingAccount: true },
      }),
    );
  });

  it('refuses anything but exactly one of newUser / existingUserId, before opening a transaction', async () => {
    await expect(importResidentRowOp({ ...BASE })).rejects.toThrow(/exactly one/);
    await expect(
      importResidentRowOp({ ...BASE, newUser: { fullName: 'A' }, existingUserId: 'x' }),
    ).rejects.toThrow(/exactly one/);
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('refuses a non-resident role (role-v3 invariant 3)', async () => {
    await expect(
      importResidentRowOp({ ...BASE, role: 'property_manager' as unknown as 'resident', existingUserId: 'x' }),
    ).rejects.toThrow(/refuses role/);
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('keeps an existing preferences row instead of failing the row on it', async () => {
    // A resident removed and re-imported still has their preferences row:
    // removal deletes only the membership.
    await importResidentRowOp({ ...BASE, existingUserId: 'returning-1' });
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
  });

  it('refuses a unit that is not in this community, inside the transaction', async () => {
    unitRows.value = [];
    await expect(importResidentRowOp({ ...BASE, newUser: { fullName: 'Ada' } })).rejects.toThrow(
      /unit is not in this community/,
    );
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });
});

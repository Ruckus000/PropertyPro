/**
 * `updateResidentInTransaction` (ponytail W-08): a resident PATCH's membership
 * write and `users` write commit together. Before, a failure writing `users`
 * left the membership changed and its version bumped, with no audit row.
 *
 * Real rollback against Postgres is proven in
 * `integration/unit-number-and-concurrency.integration.test.ts`; this pins that
 * both writes go through the transaction's client, in order.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { TX, scopedFor, updateMock, transactionMock } = vi.hoisted(() => {
  const TX = Symbol('tx');
  const updateMock = vi.fn();
  return {
    TX,
    updateMock,
    // Remembers which transaction (if any) each scoped client was bound to.
    scopedFor: vi.fn((communityId: number, tx?: unknown) => ({
      update: (table: unknown, values: unknown, where: unknown) => updateMock(tx, table, values, where),
    })),
    transactionMock: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(TX)),
  };
});

vi.mock('@propertypro/db', () => ({
  createScopedClient: scopedFor,
  users: { id: 'users.id', phone: 'users.phone', phoneVerifiedAt: 'users.phone_verified_at' },
  userRoles: { userId: 'user_roles.user_id', updatedAt: 'user_roles.updated_at' },
  communities: {},
  notificationPreferences: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  inArray: (col: unknown, vals: unknown) => ({ __inArray: { col, vals } }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: strings.join('?'), values }),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({ transaction: transactionMock }),
  findCommunityResidentPortalActivity: vi.fn(),
}));

import { updateResidentInTransaction } from '../../../src/lib/services/resident-service';

const tables = () => updateMock.mock.calls.map((call) => call[1]);

describe('updateResidentInTransaction', () => {
  beforeEach(() => {
    updateMock.mockReset();
    transactionMock.mockClear();
    scopedFor.mockClear();
  });

  it('writes the membership then the user, both through the transaction client', async () => {
    updateMock.mockResolvedValue([{ id: 1 }]);

    await expect(
      updateResidentInTransaction(7, 'user-1', { unitId: 9 }, { fullName: 'Pat' }, '2026-10-20T00:00:00.000Z'),
    ).resolves.toBe(true);

    expect(transactionMock).toHaveBeenCalledOnce();
    expect(scopedFor).toHaveBeenCalledWith(7, TX);
    // Every write ran on the transaction, membership first.
    expect(updateMock.mock.calls.map((call) => call[0])).toEqual([TX, TX]);
    expect(tables()).toEqual([
      expect.objectContaining({ userId: 'user_roles.user_id' }),
      expect.objectContaining({ id: 'users.id' }),
    ]);
  });

  it('returns false and writes no user row when the version token is stale', async () => {
    updateMock.mockResolvedValueOnce([]); // conditional membership update matched nothing

    await expect(
      updateResidentInTransaction(7, 'user-1', {}, { fullName: 'Pat' }, '2026-10-20T00:00:00.000Z'),
    ).resolves.toBe(false);
    expect(tables()).toHaveLength(1);
  });

  it('rejects when the user write fails, so the transaction rolls the membership back', async () => {
    updateMock.mockResolvedValueOnce([{ id: 1 }]).mockRejectedValueOnce(new Error('users write failed'));

    await expect(
      updateResidentInTransaction(7, 'user-1', { unitId: 9 }, { fullName: 'Pat' }),
    ).rejects.toThrow('users write failed');
    expect(updateMock.mock.calls.map((call) => call[0])).toEqual([TX, TX]);
  });

  it('skips the membership write for a contact-only edit with no token', async () => {
    updateMock.mockResolvedValue(undefined);

    await expect(updateResidentInTransaction(7, 'user-1', {}, { fullName: 'Pat' })).resolves.toBe(true);
    expect(tables()).toEqual([expect.objectContaining({ id: 'users.id' })]);
  });
});

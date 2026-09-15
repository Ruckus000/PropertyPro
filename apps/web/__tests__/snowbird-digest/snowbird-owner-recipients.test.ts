import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, selectFromMock, tables } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  selectFromMock: vi.fn(),
  tables: {
    userRoles: Symbol('user_roles'),
    users: { __table: 'users', id: Symbol('users.id') },
  },
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: vi.fn(() => ({ query: queryMock, selectFrom: selectFromMock })),
  communities: Symbol('communities'),
  snowbirdDigestSubscriptions: Symbol('snowbird_digest_subscriptions'),
  userRoles: tables.userRoles,
  users: tables.users,
}));
vi.mock('@propertypro/db/filters', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
  inArray: (col: unknown, vals: unknown[]) => ({ _type: 'inArray', col, vals }),
}));
vi.mock('@propertypro/db/unsafe', () => ({ createUnscopedClient: vi.fn() }));
vi.mock('@propertypro/email', () => ({ SnowbirdDigestEmail: vi.fn(), sendEmail: vi.fn() }));
vi.mock('../../src/lib/services/snowbird-digest-service', () => ({
  compileSnowbirdDigest: vi.fn(),
  isDigestEmpty: vi.fn(),
}));

import { resolveOwnerRecipients } from '../../src/lib/services/snowbird-digest-processor';

const USERS = [
  { id: 'u-owner', email: 'owner@example.com', fullName: 'Olive Owner' },
  { id: 'u-tenant', email: 'tenant@example.com', fullName: 'Ted Tenant' },
  { id: 'u-legacy', email: 'legacy@example.com', fullName: '' },
];

describe('resolveOwnerRecipients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockImplementation(async (table: unknown) => {
      if (table === tables.users) throw new Error('Unscoped query on table "users"');
      if (table === tables.userRoles) {
        return [
          { userId: 'u-owner', role: 'resident', isUnitOwner: true },
          { userId: 'u-tenant', role: 'resident', isUnitOwner: false },
          { userId: 'u-legacy', role: 'owner', isUnitOwner: false },
          { userId: 'u-owner', role: 'resident', isUnitOwner: true },
          { userId: 'u-no-user-row', role: 'resident', isUnitOwner: true },
        ];
      }
      return [];
    });
    selectFromMock.mockImplementation(async (_t: unknown, _c: unknown, where: { vals: string[] }) =>
      USERS.filter((u) => where.vals.includes(u.id)),
    );
  });

  it('reads only the owners from users, once each, and keeps role order', async () => {
    const recipients = await resolveOwnerRecipients(42);

    expect(recipients).toEqual([
      { userId: 'u-owner', email: 'owner@example.com', fullName: 'Olive Owner' },
      { userId: 'u-legacy', email: 'legacy@example.com', fullName: 'Neighbor' },
    ]);
    expect(selectFromMock).toHaveBeenCalledTimes(1);
    expect(selectFromMock.mock.calls[0]?.[2]).toEqual({
      _type: 'inArray',
      col: tables.users.id,
      vals: ['u-owner', 'u-legacy', 'u-no-user-row'],
    });
  });
});

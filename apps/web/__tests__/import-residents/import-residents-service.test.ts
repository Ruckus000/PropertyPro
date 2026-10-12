import { beforeEach, describe, expect, it, vi } from 'vitest';

const { selectFromMock, queryMock, usersTable, importResidentRowOpMock } = vi.hoisted(() => ({
  importResidentRowOpMock: vi.fn(),
  selectFromMock: vi.fn(),
  queryMock: vi.fn(),
  usersTable: { __table: 'users', id: Symbol('users.id'), email: Symbol('users.email') },
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: vi.fn(() => ({ query: queryMock, selectFrom: selectFromMock })),
  users: usersTable,
  units: Symbol('units'),
  userRoles: Symbol('user_roles'),
  notificationPreferences: Symbol('notification_preferences'),
}));

// The one-transaction row write; its own tests are in
// packages/db/__tests__/resident-import-ops.test.ts and on real Postgres in
// __tests__/integration/import-residents-atomicity.integration.test.ts.
vi.mock('@propertypro/db/unsafe', () => ({
  importResidentRowOp: importResidentRowOpMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  inArray: (col: unknown, vals: unknown[]) => ({ _type: 'inArray', col, vals }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    _type: 'sql',
    text: strings.join('?'),
    values,
  }),
}));

import { importResidentRow, loadUserEmailMapForImport } from '../../src/lib/services/import-residents-service';

/** The platform's users. The helper must only ever see the rows it names. */
const PLATFORM_USERS = [
  { id: 'u-ada', email: 'Ada@X.com' },
  { id: 'u-stranger', email: 'stranger@y.com' },
];

describe('loadUserEmailMapForImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockRejectedValue(new Error('Unscoped query on table "users"'));
    // Apply the lower(email) IN (...) predicate to the platform's users.
    selectFromMock.mockImplementation(
      async (_table: unknown, _columns: unknown, where: { vals: string[] }) =>
        PLATFORM_USERS.filter((u) => where.vals.includes(u.email.toLowerCase())),
    );
  });

  it('maps only the requested emails, matched on lower(email)', async () => {
    const map = await loadUserEmailMapForImport(42, ['ada@x.com', 'new@x.com']);

    expect(map).toEqual(new Map([['ada@x.com', 'u-ada']]));
    expect(queryMock).not.toHaveBeenCalled();
    expect(selectFromMock).toHaveBeenCalledWith(
      usersTable,
      { id: usersTable.id, email: usersTable.email },
      {
        _type: 'inArray',
        col: { _type: 'sql', text: 'lower(?)', values: [usersTable.email] },
        vals: ['ada@x.com', 'new@x.com'],
      },
    );
  });

  it('splits a large import into sequential lookups of at most 1000 emails', async () => {
    const emails = Array.from({ length: 2001 }, (_, i) => `person${i}@x.com`);

    await loadUserEmailMapForImport(42, emails);

    const sizes = selectFromMock.mock.calls.map(([, , where]) => (where as { vals: string[] }).vals.length);
    expect(sizes).toEqual([1000, 1000, 1]);
    expect(selectFromMock.mock.calls.flatMap(([, , where]) => (where as { vals: string[] }).vals)).toEqual(emails);
  });

  it('issues no lookup for an import with no valid rows', async () => {
    expect(await loadUserEmailMapForImport(42, [])).toEqual(new Map());
    expect(selectFromMock).not.toHaveBeenCalled();
  });
});

describe('importResidentRow', () => {
  const ROW = {
    communityId: 42,
    actorUserId: 'actor-1',
    email: 'ada@x.com',
    fullName: 'Ada',
    isUnitOwner: true,
    unitId: 7,
    displayTitle: 'Owner',
    legacyRole: 'owner',
    bulkCount: 3,
  };

  beforeEach(() => {
    importResidentRowOpMock.mockReset().mockResolvedValue('u-1');
  });

  it('creates the account for a new person, as a resident, with the import size on the audit', async () => {
    await importResidentRow({ ...ROW, existingUserId: null });
    expect(importResidentRowOpMock).toHaveBeenCalledWith({
      communityId: 42,
      actorUserId: 'actor-1',
      email: 'ada@x.com',
      newUser: { fullName: 'Ada' },
      role: 'resident',
      isUnitOwner: true,
      unitId: 7,
      displayTitle: 'Owner',
      legacyRole: 'owner',
      auditMetadata: { bulkCount: 3 },
    });
  });

  it('attaches an existing account and never asks for a new one', async () => {
    await importResidentRow({ ...ROW, existingUserId: 'returning-1' });
    const [params] = importResidentRowOpMock.mock.calls[0]!;
    expect(params).toEqual(expect.objectContaining({ existingUserId: 'returning-1' }));
    expect(params).not.toHaveProperty('newUser');
  });
});

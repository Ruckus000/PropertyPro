import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must precede all imports
// ---------------------------------------------------------------------------

const {
  createUnscopedClientMock,
  createAdminClientMock,
  emitConversionEventMock,
  communitiesTable,
  demoInstancesTable,
  usersTable,
  userRolesTable,
} = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  emitConversionEventMock: vi.fn().mockResolvedValue(undefined),
  communitiesTable: { id: 'communities.id', isDemo: 'communities.is_demo', communityType: 'communities.community_type' },
  demoInstancesTable: { id: 'demo_instances.id', demoResidentUserId: 'd.resident', demoBoardUserId: 'd.board' },
  usersTable: { id: 'users.id', email: 'users.email' },
  userRolesTable: { id: 'user_roles.id', communityId: 'user_roles.community_id', role: 'user_roles.role', presetKey: 'user_roles.preset_key' },
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@propertypro/db', () => ({
  accessRequests: {},
  communities: communitiesTable,
  demoInstances: demoInstancesTable,
  users: usersTable,
  userRoles: userRolesTable,
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...c: unknown[]) => ({ _and: c }),
  eq: (col: unknown, val: unknown) => ({ _eq: [col, val] }),
  gt: (col: unknown, val: unknown) => ({ _gt: [col, val] }),
  inArray: (col: unknown, vals: unknown[]) => ({ _inArray: [col, vals] }),
  isNull: (col: unknown) => ({ _isNull: col }),
  lt: (col: unknown, val: unknown) => ({ _lt: [col, val] }),
  sql: (s: TemplateStringsArray, ...v: unknown[]) => ({ _sql: [s, v] }),
}));

vi.mock('../../src/lib/services/conversion-events', () => ({
  emitConversionEvent: emitConversionEventMock,
}));

// Imported after mocks so the mocked deps are picked up.
import { handleDemoConversion } from '../../src/lib/services/demo-conversion';

// ---------------------------------------------------------------------------
// DB mock — records every userRoles insert payload
// ---------------------------------------------------------------------------

type Recorded = { table: unknown; values: unknown };

/**
 * Builds an unscoped-db mock for a happy-path conversion where no founding
 * user yet exists. Records all insert() payloads for assertion.
 *
 * Select call order across handleDemoConversion:
 *   1. banDemoUsers: select demo instance        → limit → [demo]
 *   2. ensureFoundingUser: existing root_manager → limit → []   (none yet)
 *   3. ensureFoundingUser: existing user by email → limit → []   (none yet)
 */
function buildDb(): { inserts: Recorded[] } {
  const inserts: Recorded[] = [];
  const selectQueue: unknown[][] = [
    [{ demoResidentUserId: 'res-1', demoBoardUserId: 'board-1' }], // banDemoUsers
    [],                                                            // existing root_manager → none
    [],                                                            // existing user → none
  ];

  const limitMock = vi.fn(() => Promise.resolve(selectQueue.shift() ?? []));
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  // convertCommunity: update().set().where().returning()
  const updReturningMock = vi.fn(() => Promise.resolve([{ id: 99 }]));
  const updWhereMock = vi.fn(() => ({ returning: updReturningMock }));
  const updSetMock = vi.fn(() => ({ where: updWhereMock }));
  const updateMock = vi.fn(() => ({ set: updSetMock }));

  const insertMock = vi.fn((table: unknown) => ({
    values: vi.fn((values: unknown) => {
      inserts.push({ table, values });
      return { onConflictDoNothing: vi.fn(() => Promise.resolve(undefined)) };
    }),
  }));

  createUnscopedClientMock.mockReturnValue({
    select: selectMock,
    update: updateMock,
    insert: insertMock,
  });

  createAdminClientMock.mockReturnValue({
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'founding-uuid' } }, error: null }),
        updateUserById: vi.fn().mockResolvedValue({ data: {}, error: null }),
        generateLink: vi.fn().mockResolvedValue({ data: {}, error: null }),
      },
    },
  });

  return { inserts };
}

const SESSION = {
  metadata: {
    demoId: '7',
    communityId: '99',
    planId: 'pro',
    customerEmail: 'founder@example.com',
    customerName: 'Founder Person',
  },
  customer: 'cus_123',
  subscription: 'sub_123',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('demo-conversion prerequisites', () => {
  describe('ensureFoundingUser (via handleDemoConversion)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('creates exactly ONE root_manager per converted community (creator-is-root)', async () => {
      const { inserts } = buildDb();

      await handleDemoConversion(SESSION, 'evt_001', 1_700_000_000);

      // Find the userRoles insert (founding memberships, inserted as an array).
      const roleInsert = inserts.find((i) => i.table === userRolesTable);
      expect(roleInsert).toBeDefined();

      const rows = roleInsert!.values as Array<{
        role: string;
        designation?: string;
        presetKey?: string;
      }>;
      expect(Array.isArray(rows)).toBe(true);

      // CRITICAL: exactly one root_manager per community (partial unique index).
      const roots = rows.filter((r) => r.role === 'root_manager');
      expect(roots).toHaveLength(1);
      expect(roots[0]!.designation).toBe('board_president');
      // role-v3: founding rows no longer carry a presetKey (column removed).
      expect(roots[0]!.presetKey).toBeUndefined();

      // The companion PM-portfolio row must NOT be a second root.
      const companions = rows.filter((r) => r.role !== 'root_manager');
      expect(companions).toHaveLength(1);
      expect(companions[0]!.role).toBe('property_manager');

      // No legacy pm_admin / manager founding rows survive.
      expect(rows.some((r) => r.role === 'pm_admin')).toBe(false);
    });
  });
});

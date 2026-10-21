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
import { handleDemoConversion, softDeleteExpiredDemo } from '../../src/lib/services/demo-conversion';

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

    // Logs ship to Vercel and Sentry breadcrumbs; a customer's address must not
    // ride along. Both the success and the failure branch of the login link.
    it.each([
      ['succeeds', vi.fn().mockResolvedValue({ data: {}, error: null })],
      ['fails', vi.fn().mockRejectedValue(new Error('link service down'))],
    ])('never logs the founding user email when generating the login link %s', async (_label, generateLink) => {
      buildDb();
      createAdminClientMock.mockReturnValue({
        auth: {
          admin: {
            createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'founding-uuid' } }, error: null }),
            updateUserById: vi.fn().mockResolvedValue({ data: {}, error: null }),
            generateLink,
          },
        },
      });
      const spies = (['info', 'warn', 'error', 'log'] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(() => undefined),
      );

      await handleDemoConversion(SESSION, 'evt_002', 1_700_000_000);

      expect(generateLink).toHaveBeenCalled();
      const logged = spies.flatMap((spy) => spy.mock.calls.map((call) => call.map(String).join(' ')));
      expect(logged.some((line) => line.includes('founding-uuid'))).toBe(true);
      expect(logged.filter((line) => line.includes('founder@example.com'))).toEqual([]);
      spies.forEach((spy) => spy.mockRestore());
    });
  });
});

// Onboarding audit F9: the expiry cron finds expired demos, then deletes them.
// A demo that converts in between is a paying customer's community.
describe('softDeleteExpiredDemo', () => {
  function mockDb(opts: { communityUpdated: boolean; currentIsDemo: boolean | null }) {
    const updates: Array<{ table: unknown; where: unknown }> = [];
    const db = {
      update: (table: unknown) => ({
        set: () => ({
          where: (where: unknown) => {
            updates.push({ table, where });
            const rows = table === communitiesTable && opts.communityUpdated ? [{ id: 9 }] : [];
            return Object.assign(Promise.resolve(rows), { returning: () => Promise.resolve(rows) });
          },
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(opts.currentIsDemo === null ? [] : [{ isDemo: opts.currentIsDemo }]),
          }),
        }),
      }),
    };
    createUnscopedClientMock.mockReturnValue(db);
    return updates;
  }
  const params = { communityId: 9, demoInstanceId: 3, now: new Date('2026-10-12T00:00:00Z') };

  it('deletes a community that is still a demo, and its demo record', async () => {
    const updates = mockDb({ communityUpdated: true, currentIsDemo: true });
    await expect(softDeleteExpiredDemo(params)).resolves.toBe(true);
    expect(updates.map((u) => u.table)).toEqual([communitiesTable, demoInstancesTable]);
    // The demo check is part of the write itself, not only of the earlier find.
    expect(JSON.stringify(updates[0]!.where)).toContain('["communities.is_demo",true]');
  });

  it('leaves a community that converted after the cron found it, and its demo record', async () => {
    const updates = mockDb({ communityUpdated: false, currentIsDemo: false });
    // false tells the cron to skip the ban, the event and the count too.
    await expect(softDeleteExpiredDemo(params)).resolves.toBe(false);
    expect(updates.map((u) => u.table)).toEqual([communitiesTable]);
  });

  it('still clears the demo record when the community was already deleted', async () => {
    const updates = mockDb({ communityUpdated: false, currentIsDemo: true });
    await expect(softDeleteExpiredDemo(params)).resolves.toBe(true);
    expect(updates.map((u) => u.table)).toEqual([communitiesTable, demoInstancesTable]);
  });
});

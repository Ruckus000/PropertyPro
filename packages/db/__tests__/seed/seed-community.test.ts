import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn(),
  };

  return { mockDb };
});

vi.mock('../../src/unsafe', () => ({
  createUnscopedClient: () => mockDb,
}));

vi.mock('../../src/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

const { seedCommunity, seedRoles, getDefaultPassword } = await import('../../src/seed/seed-community');

describe('getDefaultPassword', () => {
  const originalPw = process.env.DEMO_DEFAULT_PASSWORD;

  afterEach(() => {
    if (originalPw === undefined) {
      delete process.env.DEMO_DEFAULT_PASSWORD;
    } else {
      process.env.DEMO_DEFAULT_PASSWORD = originalPw;
    }
  });

  it('returns the env var when set', () => {
    process.env.DEMO_DEFAULT_PASSWORD = 'CorrectHorseBatteryStaple1!';
    expect(getDefaultPassword()).toBe('CorrectHorseBatteryStaple1!');
  });

  it('throws with a clear message when unset', () => {
    delete process.env.DEMO_DEFAULT_PASSWORD;
    expect(() => getDefaultPassword()).toThrow(
      /DEMO_DEFAULT_PASSWORD environment variable must be set/,
    );
  });
});

describe('seedCommunity config validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects missing name', async () => {
    await expect(seedCommunity(
      {
        name: '',
        slug: 'acme-condos',
        communityType: 'condo_718',
      },
      [],
    )).rejects.toThrow('config.name');
  });

  it('rejects missing slug', async () => {
    await expect(seedCommunity(
      {
        name: 'Acme Condos',
        slug: '',
        communityType: 'condo_718',
      },
      [],
    )).rejects.toThrow('config.slug');
  });

  it('rejects missing communityType', async () => {
    const invalidConfig = {
      name: 'Acme Condos',
      slug: 'acme-condos',
    };

    await expect(seedCommunity(
      invalidConfig as unknown as Parameters<typeof seedCommunity>[0],
      [],
    )).rejects.toThrow('communityType');
  });

  it('rejects invalid communityType value', async () => {
    const invalidConfig = {
      name: 'Acme Condos',
      slug: 'acme-condos',
      communityType: 'co_op',
    };

    await expect(seedCommunity(
      invalidConfig as unknown as Parameters<typeof seedCommunity>[0],
      [],
    )).rejects.toThrow('invalid communityType');
  });

  it('rejects invalid slug with path traversal characters', async () => {
    const invalidConfig = {
      name: 'Acme Condos',
      slug: '../evil',
      communityType: 'condo_718' as const,
    };

    await expect(seedCommunity(invalidConfig, [])).rejects.toThrow('config.slug');
  });

  it('rejects demo lifecycle configs with trial end after expiry', async () => {
    await expect(seedCommunity(
      {
        name: 'Acme Demo',
        slug: 'acme-demo',
        communityType: 'condo_718',
        isDemo: true,
        trialEndsAt: new Date('2026-05-01T00:00:00.000Z'),
        demoExpiresAt: new Date('2026-04-30T00:00:00.000Z'),
      },
      [
        {
          email: 'owner@example.com',
          fullName: 'Owner Example',
          role: 'owner',
        },
      ],
    )).rejects.toThrow('config.trialEndsAt');
  });

  it('rejects empty usersToSeed array', async () => {
    await expect(seedCommunity(
      {
        name: 'Acme Condos',
        slug: 'acme-condos',
        communityType: 'condo_718',
      },
      [],
    )).rejects.toThrow('at least one user');
  });
});

describe('seedRoles upsert', () => {
  afterEach(() => {
    mockDb.execute.mockReset();
  });

  async function renderSeedRolesSql(
    assignments: Parameters<typeof seedRoles>[0],
  ): Promise<{ text: string; params: unknown[] }> {
    mockDb.execute.mockResolvedValue([]);
    await seedRoles(assignments);
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
    const query = new PgDialect().sqlToQuery(mockDb.execute.mock.calls[0]![0] as SQL);
    return { text: query.sql.replace(/\s+/g, ' '), params: query.params };
  }

  it('keeps an existing unit link on conflict instead of overwriting it with NULL', async () => {
    const { text } = await renderSeedRolesSql([
      { communityId: 7, userId: '00000000-0000-4000-8000-000000000001', role: 'tenant' },
    ]);
    expect(text).toContain('unit_id = coalesce(excluded.unit_id, user_roles.unit_id)');
    expect(text).not.toMatch(/unit_id = excluded\.unit_id/);
  });

  it('writes the supplied unitId, and NULL when none is given', async () => {
    const { params } = await renderSeedRolesSql([
      { communityId: 7, userId: '00000000-0000-4000-8000-000000000001', role: 'tenant', unitId: 42 },
      { communityId: 7, userId: '00000000-0000-4000-8000-000000000002', role: 'property_manager' },
    ]);
    // (user_id, community_id, role, unit_id, is_unit_owner, designation, display_title) x2
    expect(params[3]).toBe(42);
    expect(params[10]).toBeNull();
  });

  it('keeps a board seat on a resident owner (the demo board.member persona)', async () => {
    const { params } = await renderSeedRolesSql([
      {
        communityId: 7,
        userId: '00000000-0000-4000-8000-000000000001',
        role: 'owner',
        designation: 'board_member',
      },
    ]);
    // (user_id, community_id, role, unit_id, is_unit_owner, designation, display_title)
    expect(params.slice(2, 7)).toEqual(['resident', null, true, 'board_member', 'Board Member']);
  });
});

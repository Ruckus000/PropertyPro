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

const { seedCommunity, getDefaultPassword } = await import('../../src/seed/seed-community');

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

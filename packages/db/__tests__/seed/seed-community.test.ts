import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const { seedCommunity } = await import('../../src/seed/seed-community');

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
});

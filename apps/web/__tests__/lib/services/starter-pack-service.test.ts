import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.importActual cannot be used here because the real @propertypro/db
// requires DATABASE_URL at module load. This is the established pattern
// across the test suite — see site-blocks-service.test.ts.
//
// Guard: every export consumed by the service is explicitly stubbed.
vi.mock('@propertypro/db', () => ({
  createScopedClient: vi.fn(),
  siteBlocks: Symbol('siteBlocks'),
  siteStarterPacks: Symbol('siteStarterPacks'),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(),
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: { col, val } })),
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
  isNull: vi.fn((col: unknown) => ({ __isNull: col })),
}));

import { applyStarterPackToCommunity } from '@/lib/services/starter-pack-service';
import { createScopedClient } from '@propertypro/db';
// AUTHZ: test file — mocks createUnscopedClient from @propertypro/db/unsafe; no real DB access occurs.
import { createUnscopedClient } from '@propertypro/db/unsafe';

const createScopedClientMock = vi.mocked(createScopedClient);
const createUnscopedClientMock = vi.mocked(createUnscopedClient);

const HERO_BLOCK = { blockType: 'hero', blockOrder: 1, content: { headline: 'Welcome' } };
const TEXT_BLOCK = { blockType: 'text', blockOrder: 2, content: { body: 'About us.' } };

function buildScopedClient(existingBlocks: unknown[] = []) {
  return {
    queryWhere: vi.fn().mockResolvedValue(existingBlocks),
    insert: vi.fn().mockResolvedValue([{ id: 1 }]),
  };
}

function buildUnscopedClient(packBlocks: unknown[] | null) {
  const rows = packBlocks !== null ? [{ blocks: packBlocks }] : [];
  const limitMock = vi.fn().mockResolvedValue(rows);
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  return { select: selectMock };
}

describe('applyStarterPackToCommunity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps condo_718 to florida-condo-v1 and inserts each block via scoped.insert', async () => {
    const scopedClient = buildScopedClient([]);
    createScopedClientMock.mockReturnValue(scopedClient as never);
    const unscopedClient = buildUnscopedClient([HERO_BLOCK, TEXT_BLOCK]);
    createUnscopedClientMock.mockReturnValue(unscopedClient as never);

    const result = await applyStarterPackToCommunity(10, 'condo_718');

    expect(result).toEqual({ applied: true, blockCount: 2, packSlug: 'florida-condo-v1' });
    expect(scopedClient.insert).toHaveBeenCalledTimes(2);
    expect(scopedClient.insert).toHaveBeenNthCalledWith(
      1,
      expect.anything(), // siteBlocks table ref
      expect.objectContaining({
        communityId: 10,
        blockType: 'hero',
        blockOrder: 1,
        isDraft: false,
        content: { headline: 'Welcome' },
      }),
    );
    expect(scopedClient.insert).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        blockType: 'text',
        blockOrder: 2,
      }),
    );
  });

  it('maps hoa_720 to florida-hoa-v1 and resolves with the correct packSlug', async () => {
    const scopedClient = buildScopedClient([]);
    createScopedClientMock.mockReturnValue(scopedClient as never);
    const unscopedClient = buildUnscopedClient([HERO_BLOCK]);
    createUnscopedClientMock.mockReturnValue(unscopedClient as never);

    const result = await applyStarterPackToCommunity(20, 'hoa_720');

    expect(result.packSlug).toBe('florida-hoa-v1');
    expect(result.applied).toBe(true);
    expect(result.blockCount).toBe(1);
  });

  it('maps apartment to apartment-v1 and resolves with the correct packSlug', async () => {
    const scopedClient = buildScopedClient([]);
    createScopedClientMock.mockReturnValue(scopedClient as never);
    const unscopedClient = buildUnscopedClient([HERO_BLOCK]);
    createUnscopedClientMock.mockReturnValue(unscopedClient as never);

    const result = await applyStarterPackToCommunity(30, 'apartment');

    expect(result.packSlug).toBe('apartment-v1');
    expect(result.applied).toBe(true);
    expect(result.blockCount).toBe(1);
    // Unscoped DB should NOT be called because there are no existing blocks
    // and the pack was fetched; scoped insert should have been called.
    expect(scopedClient.insert).toHaveBeenCalledTimes(1);
  });

  it('skips apply (applied:false) when community already has published site_blocks', async () => {
    const scopedClient = buildScopedClient([{ id: 99, isDraft: false }]);
    createScopedClientMock.mockReturnValue(scopedClient as never);

    const result = await applyStarterPackToCommunity(10, 'condo_718');

    expect(result).toEqual({ applied: false, blockCount: 0, packSlug: 'florida-condo-v1' });
    // createUnscopedClient should never be called — we bailed out before the pack lookup
    expect(createUnscopedClientMock).not.toHaveBeenCalled();
    expect(scopedClient.insert).not.toHaveBeenCalled();
  });

  it('no-ops when communityType is not mapped in STARTER_PACK_SLUG_BY_TYPE', async () => {
    // Bypass the TypeScript guard to simulate a future widening of CommunityType
    // without a matching pack entry.
    const result = await applyStarterPackToCommunity(99, 'unknown_type' as never);
    expect(result).toEqual({ applied: false, blockCount: 0, packSlug: null });
    expect(createScopedClientMock).not.toHaveBeenCalled();
    expect(createUnscopedClientMock).not.toHaveBeenCalled();
  });

  it('returns applied:false when the pack row does not exist in the catalog', async () => {
    const scopedClient = buildScopedClient([]);
    createScopedClientMock.mockReturnValue(scopedClient as never);
    // Empty rows — no pack found
    const unscopedClient = buildUnscopedClient(null);
    createUnscopedClientMock.mockReturnValue(unscopedClient as never);

    const result = await applyStarterPackToCommunity(10, 'condo_718');

    expect(result).toEqual({ applied: false, blockCount: 0, packSlug: 'florida-condo-v1' });
    expect(scopedClient.insert).not.toHaveBeenCalled();
  });
});

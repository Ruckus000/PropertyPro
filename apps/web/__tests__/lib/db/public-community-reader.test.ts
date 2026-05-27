import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @propertypro/db (schema + client exports) BEFORE importing the helper.
// This prevents drizzle.ts from being evaluated (which requires DATABASE_URL).
vi.mock('@propertypro/db', () => ({
  siteBlocks: {
    id: 'siteBlocks.id',
    communityId: 'siteBlocks.communityId',
    blockOrder: 'siteBlocks.blockOrder',
    blockType: 'siteBlocks.blockType',
    content: 'siteBlocks.content',
    isDraft: 'siteBlocks.isDraft',
    templateVariant: 'siteBlocks.templateVariant',
    deletedAt: 'siteBlocks.deletedAt',
  },
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  asc: (col: unknown) => ({ __asc: col }),
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  isNull: (col: unknown) => ({ __isNull: col }),
}));

// Mock the unscoped client BEFORE importing the helper
const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  // Terminal — returns a Promise of an array
  then: vi.fn((resolve) => Promise.resolve([]).then(resolve)),
};

const mockDb = {
  select: vi.fn(() => mockSelectChain),
};

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => mockDb,
}));

import { getPublicCommunityScopedReader } from '../../../src/lib/db/public-community-reader';

describe('getPublicCommunityScopedReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set up the chain after clearAllMocks
    mockDb.select.mockReturnValue(mockSelectChain);
    mockSelectChain.from.mockReturnValue(mockSelectChain);
    mockSelectChain.where.mockReturnValue(mockSelectChain);
    mockSelectChain.orderBy.mockReturnValue(mockSelectChain);
    mockSelectChain.then.mockImplementation((resolve) => Promise.resolve([]).then(resolve));
  });

  it('returns a reader bound to the supplied communityId', () => {
    const reader = getPublicCommunityScopedReader(42);
    expect(reader).toBeDefined();
    expect(reader.communityId).toBe(42);
  });

  it('exposes stubbed listSiteBlocks method', async () => {
    const reader = getPublicCommunityScopedReader(42);
    expect(typeof reader.listSiteBlocks).toBe('function');
  });

  it('exposes stubbed listDocuments method (real impl in PR #4)', async () => {
    const reader = getPublicCommunityScopedReader(42);
    expect(typeof reader.listDocuments).toBe('function');
  });

  it('exposes stubbed listMeetings method (real impl in PR #4)', async () => {
    const reader = getPublicCommunityScopedReader(42);
    expect(typeof reader.listMeetings).toBe('function');
  });

  it('exposes stubbed listAnnouncements method (real impl in PR #3)', async () => {
    const reader = getPublicCommunityScopedReader(42);
    expect(typeof reader.listAnnouncements).toBe('function');
  });

  it('exposes stubbed getContactInfo method (real impl in PR #4)', async () => {
    const reader = getPublicCommunityScopedReader(42);
    expect(typeof reader.getContactInfo).toBe('function');
  });

  it('rejects non-positive communityId', () => {
    expect(() => getPublicCommunityScopedReader(0)).toThrow();
    expect(() => getPublicCommunityScopedReader(-1)).toThrow();
    expect(() => getPublicCommunityScopedReader(1.5)).toThrow();
  });

  it('listSiteBlocks calls select on siteBlocks with the correct WHERE shape', async () => {
    const reader = getPublicCommunityScopedReader(42);
    await reader.listSiteBlocks();

    // The query should select FROM siteBlocks
    expect(mockSelectChain.from).toHaveBeenCalled();

    // The WHERE clause should include all four predicates
    expect(mockSelectChain.where).toHaveBeenCalledTimes(1);
    const whereCall = mockSelectChain.where.mock.calls[0][0];
    // Mock 'and' wraps its args in { __and: clauses[] }
    expect(whereCall).toHaveProperty('__and');
    expect(whereCall.__and).toHaveLength(4);
  });

  it('listSiteBlocks orders by blockOrder ascending', async () => {
    const reader = getPublicCommunityScopedReader(42);
    await reader.listSiteBlocks();

    expect(mockSelectChain.orderBy).toHaveBeenCalledTimes(1);
  });

  it('listSiteBlocks binds the communityId into the WHERE predicate', async () => {
    const reader = getPublicCommunityScopedReader(99);
    await reader.listSiteBlocks();

    const whereCall = mockSelectChain.where.mock.calls[0][0];
    // The first AND clause should be eq(communityId, 99). The mock factory
    // for eq returns { __eq: { col, val } }.
    const communityIdClause = whereCall.__and[0];
    expect(communityIdClause).toHaveProperty('__eq');
    expect(communityIdClause.__eq.val).toBe(99);
  });
});

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
  announcements: {
    id: 'announcements.id',
    communityId: 'announcements.communityId',
    title: 'announcements.title',
    body: 'announcements.body',
    audience: 'announcements.audience',
    isPinned: 'announcements.isPinned',
    archivedAt: 'announcements.archivedAt',
    deletedAt: 'announcements.deletedAt',
    publishedAt: 'announcements.publishedAt',
  },
  documents: {
    id: 'documents.id',
    communityId: 'documents.communityId',
    categoryId: 'documents.categoryId',
    title: 'documents.title',
    description: 'documents.description',
    filePath: 'documents.filePath',
    fileName: 'documents.fileName',
    createdAt: 'documents.createdAt',
    deletedAt: 'documents.deletedAt',
  },
  documentCategories: {
    id: 'documentCategories.id',
    communityId: 'documentCategories.communityId',
    name: 'documentCategories.name',
  },
  meetings: {
    id: 'meetings.id',
    communityId: 'meetings.communityId',
    title: 'meetings.title',
    meetingType: 'meetings.meetingType',
    startsAt: 'meetings.startsAt',
    endsAt: 'meetings.endsAt',
    location: 'meetings.location',
    deletedAt: 'meetings.deletedAt',
  },
  communities: {
    id: 'communities.id',
    contactName: 'communities.contactName',
    contactEmail: 'communities.contactEmail',
    contactPhone: 'communities.contactPhone',
    deletedAt: 'communities.deletedAt',
  },
  users: {
    id: 'users.id',
    fullName: 'users.fullName',
    deletedAt: 'users.deletedAt',
  },
  userRoles: {
    userId: 'userRoles.userId',
    communityId: 'userRoles.communityId',
    role: 'userRoles.role',
    displayTitle: 'userRoles.displayTitle',
    presetKey: 'userRoles.presetKey',
  },
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  asc: (col: unknown) => ({ __asc: col }),
  desc: (col: unknown) => ({ __desc: col }),
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  gte: (col: unknown, val: unknown) => ({ __gte: { col, val } }),
  inArray: (col: unknown, vals: unknown) => ({ __inArray: { col, vals } }),
  isNull: (col: unknown) => ({ __isNull: col }),
  lte: (col: unknown, val: unknown) => ({ __lte: { col, val } }),
}));

// Mock the unscoped client BEFORE importing the helper
const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  leftJoin: vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  // Terminal — returns a Promise of an array
  then: vi.fn((resolve) => Promise.resolve([]).then(resolve)),
};

const mockDb = {
  select: vi.fn(() => mockSelectChain),
};

let queuedQueryResults: unknown[][] = [];

function queueQueryResults(...results: unknown[][]) {
  queuedQueryResults = [...results];
  mockSelectChain.then.mockImplementation((resolve) =>
    Promise.resolve(queuedQueryResults.shift() ?? []).then(resolve),
  );
}

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => mockDb,
}));

import { getPublicCommunityScopedReader } from '../../../src/lib/db/public-community-reader';

describe('getPublicCommunityScopedReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set up the chain after clearAllMocks
    mockDb.select.mockReturnValue(mockSelectChain);
    queuedQueryResults = [];
    mockSelectChain.from.mockReturnValue(mockSelectChain);
    mockSelectChain.leftJoin.mockReturnValue(mockSelectChain);
    mockSelectChain.innerJoin.mockReturnValue(mockSelectChain);
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

  it('exposes listDocuments method', async () => {
    const reader = getPublicCommunityScopedReader(42);
    expect(typeof reader.listDocuments).toBe('function');
  });

  it('exposes listMeetings method', async () => {
    const reader = getPublicCommunityScopedReader(42);
    expect(typeof reader.listMeetings).toBe('function');
  });

  it('exposes listAnnouncements method', async () => {
    const reader = getPublicCommunityScopedReader(42);
    expect(typeof reader.listAnnouncements).toBe('function');
  });

  it('exposes getContactInfo method', async () => {
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

  it('listAnnouncements returns mapped rows with the expected shape', async () => {
    const fakeRow = {
      id: 1,
      title: 'Pool closure',
      body: '<p>Pool closed.</p>',
      isPinned: false,
      publishedAt: new Date('2026-05-01T10:00:00Z'),
    };
    mockSelectChain.then.mockImplementation((resolve) =>
      Promise.resolve([fakeRow]).then(resolve),
    );

    const reader = getPublicCommunityScopedReader(42);
    const results = await reader.listAnnouncements({ limit: 5 });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 1,
      title: 'Pool closure',
      body: '<p>Pool closed.</p>',
      isPinned: false,
    });
    expect(results[0].publishedAt).toBeInstanceOf(Date);
  });

  it('listAnnouncements includes a timeWindowDays gte predicate when supplied', async () => {
    mockSelectChain.then.mockImplementation((resolve) =>
      Promise.resolve([]).then(resolve),
    );

    const reader = getPublicCommunityScopedReader(42);
    await reader.listAnnouncements({ limit: 5, timeWindowDays: 30 });

    const whereCall = mockSelectChain.where.mock.calls[0][0];
    // With timeWindowDays, and() should receive 6 conditions
    expect(whereCall.__and).toHaveLength(6);
    // The 6th condition should be a gte (time window cutoff)
    const gteClause = whereCall.__and[5];
    expect(gteClause).toHaveProperty('__gte');
  });

  it('listAnnouncements omits the time filter when timeWindowDays is null/undefined', async () => {
    mockSelectChain.then.mockImplementation((resolve) =>
      Promise.resolve([]).then(resolve),
    );

    const reader = getPublicCommunityScopedReader(42);
    await reader.listAnnouncements({ limit: 5 });

    const whereCall = mockSelectChain.where.mock.calls[0][0];
    // Without timeWindowDays, and() should receive exactly 5 conditions
    expect(whereCall.__and).toHaveLength(5);
  });

  // ---------------------------------------------------------------------------
  // SoR security-boundary predicates (PR-C from /review on PR #499).
  //
  // Length-based assertions can pass even when one of the security-load-bearing
  // filters is silently dropped (e.g. audience='all' removed → board-only or
  // owner-only announcements leak to the unauthenticated public site). Assert
  // on specific predicate identity for each filter, so a regression breaks the
  // test with a clear signal rather than a misleading "expected 5, got 4".
  // ---------------------------------------------------------------------------

  it('listAnnouncements WHERE includes the audience=all filter (load-bearing SoR boundary)', async () => {
    mockSelectChain.then.mockImplementation((resolve) =>
      Promise.resolve([]).then(resolve),
    );
    const reader = getPublicCommunityScopedReader(42);
    await reader.listAnnouncements({ limit: 5 });

    const whereCall = mockSelectChain.where.mock.calls[0][0];
    const audienceClause = whereCall.__and.find(
      (c: unknown) =>
        (c as { __eq?: { col: string } }).__eq?.col === 'announcements.audience',
    );
    expect(audienceClause).toBeDefined();
    expect((audienceClause as { __eq: { val: string } }).__eq.val).toBe('all');
  });

  it('listAnnouncements WHERE includes archivedAt + deletedAt isNull guards', async () => {
    mockSelectChain.then.mockImplementation((resolve) =>
      Promise.resolve([]).then(resolve),
    );
    const reader = getPublicCommunityScopedReader(42);
    await reader.listAnnouncements({ limit: 5 });

    const whereCall = mockSelectChain.where.mock.calls[0][0];
    const isNullCols = whereCall.__and
      .filter((c: unknown) => (c as { __isNull?: string }).__isNull !== undefined)
      .map((c: unknown) => (c as { __isNull: string }).__isNull);
    expect(isNullCols).toContain('announcements.archivedAt');
    expect(isNullCols).toContain('announcements.deletedAt');
  });

  it('listAnnouncements WHERE includes publishedAt<=now (no scheduled-future leaks)', async () => {
    mockSelectChain.then.mockImplementation((resolve) =>
      Promise.resolve([]).then(resolve),
    );
    const reader = getPublicCommunityScopedReader(42);
    await reader.listAnnouncements({ limit: 5 });

    const whereCall = mockSelectChain.where.mock.calls[0][0];
    const lteClause = whereCall.__and.find(
      (c: unknown) =>
        (c as { __lte?: { col: string } }).__lte?.col === 'announcements.publishedAt',
    );
    expect(lteClause).toBeDefined();
    expect((lteClause as { __lte: { val: Date } }).__lte.val).toBeInstanceOf(Date);
  });

  it('listDocuments WHERE includes the deletedAt isNull guard', async () => {
    mockSelectChain.then.mockImplementation((resolve) =>
      Promise.resolve([]).then(resolve),
    );
    const reader = getPublicCommunityScopedReader(42);
    await reader.listDocuments({ limit: 5, includeCategories: ['budget'] });

    const whereCall = mockSelectChain.where.mock.calls[0][0];
    const isNullCols = whereCall.__and
      .filter((c: unknown) => (c as { __isNull?: string }).__isNull !== undefined)
      .map((c: unknown) => (c as { __isNull: string }).__isNull);
    expect(isNullCols).toContain('documents.deletedAt');
  });

  it('listMeetings WHERE includes the deletedAt isNull guard', async () => {
    mockSelectChain.then.mockImplementation((resolve) =>
      Promise.resolve([]).then(resolve),
    );
    const reader = getPublicCommunityScopedReader(42);
    await reader.listMeetings({ limit: 5, timeWindowDays: 14 });

    const whereCall = mockSelectChain.where.mock.calls[0][0];
    const isNullCols = whereCall.__and
      .filter((c: unknown) => (c as { __isNull?: string }).__isNull !== undefined)
      .map((c: unknown) => (c as { __isNull: string }).__isNull);
    expect(isNullCols).toContain('meetings.deletedAt');
  });

  // ---------------------------------------------------------------------------
  // listDocuments
  // ---------------------------------------------------------------------------

  it('listDocuments returns [] immediately when includeCategories is empty', async () => {
    const reader = getPublicCommunityScopedReader(42);
    const result = await reader.listDocuments({ limit: 5, includeCategories: [] });
    expect(result).toEqual([]);
    // No DB query should have been issued
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('listDocuments returns [] immediately when includeCategories is omitted', async () => {
    const reader = getPublicCommunityScopedReader(42);
    const result = await reader.listDocuments({ limit: 5 });
    expect(result).toEqual([]);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('listDocuments returns mapped rows with the expected shape', async () => {
    const fakeRow = {
      id: 10,
      title: 'Budget Report 2025',
      description: 'Annual budget',
      filePath: '42/documents/budget-2025.pdf',
      fileName: 'budget-2025.pdf',
      categoryName: 'budget',
      createdAt: new Date('2026-01-15T10:00:00Z'),
    };
    mockSelectChain.then.mockImplementation((resolve) =>
      Promise.resolve([fakeRow]).then(resolve),
    );

    const reader = getPublicCommunityScopedReader(42);
    const results = await reader.listDocuments({ limit: 5, includeCategories: ['budget'] });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 10,
      title: 'Budget Report 2025',
      description: 'Annual budget',
      filePath: '42/documents/budget-2025.pdf',
      fileName: 'budget-2025.pdf',
      categoryName: 'budget',
    });
    expect(results[0].createdAt).toBeInstanceOf(Date);
  });

  it('listDocuments issues a leftJoin against documentCategories', async () => {
    mockSelectChain.then.mockImplementation((resolve) =>
      Promise.resolve([]).then(resolve),
    );
    const reader = getPublicCommunityScopedReader(42);
    await reader.listDocuments({ limit: 5, includeCategories: ['minutes', 'rules'] });

    // The query should use leftJoin
    expect(mockSelectChain.leftJoin).toHaveBeenCalledTimes(1);
    // The WHERE predicate should include the inArray filter
    const whereCall = mockSelectChain.where.mock.calls[0][0];
    expect(whereCall).toHaveProperty('__and');
    const inArrayClause = whereCall.__and.find(
      (c: unknown) => (c as { __inArray?: unknown }).__inArray !== undefined,
    );
    expect(inArrayClause).toBeDefined();
    expect((inArrayClause as { __inArray: { vals: string[] } }).__inArray.vals).toEqual(['minutes', 'rules']);
  });

  // ---------------------------------------------------------------------------
  // listMeetings
  // ---------------------------------------------------------------------------

  it('listMeetings returns mapped rows with the expected shape', async () => {
    const fakeRow = {
      id: 5,
      title: 'March Board Meeting',
      meetingType: 'board',
      startsAt: new Date('2026-03-10T18:00:00Z'),
      endsAt: new Date('2026-03-10T20:00:00Z'),
      location: '123 Main St',
    };
    mockSelectChain.then.mockImplementation((resolve) =>
      Promise.resolve([fakeRow]).then(resolve),
    );

    const reader = getPublicCommunityScopedReader(42);
    const results = await reader.listMeetings({ limit: 10, timeWindowDays: 30 });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 5,
      title: 'March Board Meeting',
      meetingType: 'board',
      location: '123 Main St',
    });
    expect(results[0].startsAt).toBeInstanceOf(Date);
  });

  it('listMeetings returns [] when no upcoming meetings are in the window', async () => {
    mockSelectChain.then.mockImplementation((resolve) =>
      Promise.resolve([]).then(resolve),
    );
    const reader = getPublicCommunityScopedReader(42);
    const results = await reader.listMeetings({ limit: 10, timeWindowDays: 7 });
    expect(results).toEqual([]);
  });

  it('listMeetings WHERE predicate includes communityId, deletedAt, gte, lte conditions', async () => {
    mockSelectChain.then.mockImplementation((resolve) =>
      Promise.resolve([]).then(resolve),
    );
    const reader = getPublicCommunityScopedReader(42);
    await reader.listMeetings({ limit: 5, timeWindowDays: 14 });

    const whereCall = mockSelectChain.where.mock.calls[0][0];
    expect(whereCall).toHaveProperty('__and');
    // 4 conditions: communityId eq, deletedAt isNull, startsAt gte, startsAt lte
    expect(whereCall.__and).toHaveLength(4);
    const gteClause = whereCall.__and.find(
      (c: unknown) => (c as { __gte?: unknown }).__gte !== undefined,
    );
    expect(gteClause).toBeDefined();
    const lteClause = whereCall.__and.find(
      (c: unknown) => (c as { __lte?: unknown }).__lte !== undefined,
    );
    expect(lteClause).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // getContactInfo
  // ---------------------------------------------------------------------------

  it('getContactInfo returns management contact and board names/titles only', async () => {
    queueQueryResults(
      [{ contactName: 'Harbor Management', contactEmail: 'desk@example.com', contactPhone: '555-0100' }],
      [
        { fullName: 'Ava Nguyen', displayTitle: 'Board President', presetKey: 'board_president' },
        { fullName: 'Miles Carter', displayTitle: null, presetKey: 'board_member' },
      ],
    );

    const reader = getPublicCommunityScopedReader(42);
    const result = await reader.getContactInfo({ showBoard: true, showManagement: true });

    expect(result).toEqual({
      management: {
        name: 'Harbor Management',
        email: 'desk@example.com',
        phone: '555-0100',
      },
      board: [
        { name: 'Ava Nguyen', title: 'Board President' },
        { name: 'Miles Carter', title: 'Board Member' },
      ],
    });
    expect(result.board[0]).not.toHaveProperty('email');
    expect(result.board[0]).not.toHaveProperty('phone');
    expect(mockSelectChain.innerJoin).toHaveBeenCalledTimes(1);
  });

  it('getContactInfo returns null management when community contact fields are empty', async () => {
    queueQueryResults(
      [{ contactName: null, contactEmail: null, contactPhone: null }],
      [],
    );

    const reader = getPublicCommunityScopedReader(42);
    const result = await reader.getContactInfo({ showBoard: true, showManagement: true });

    expect(result).toEqual({ management: null, board: [] });
  });

  it('getContactInfo skips disabled sections without issuing their queries', async () => {
    const reader = getPublicCommunityScopedReader(42);
    const result = await reader.getContactInfo({ showBoard: false, showManagement: false });

    expect(result).toEqual({ management: null, board: [] });
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

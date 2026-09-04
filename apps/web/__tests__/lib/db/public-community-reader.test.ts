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
    publicAccess: 'documents.publicAccess',
    createdAt: 'documents.createdAt',
    updatedAt: 'documents.updatedAt',
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
  sitePages: {
    id: 'sitePages.id',
    communityId: 'sitePages.communityId',
    name: 'sitePages.name',
    slug: 'sitePages.slug',
    inNav: 'sitePages.inNav',
    sortOrder: 'sitePages.sortOrder',
    isHome: 'sitePages.isHome',
    isDraft: 'sitePages.isDraft',
    publishedAt: 'sitePages.publishedAt',
    deleteStagedAt: 'sitePages.deleteStagedAt',
    // Selected by listPublishedPagesForSitemap. Was missing here, which made
    // that column resolve to `undefined` under the mock — a projection
    // assertion would have compared undefined to undefined and passed.
    updatedAt: 'sitePages.updatedAt',
    deletedAt: 'sitePages.deletedAt',
  },
  sitePageRedirects: {
    id: 'sitePageRedirects.id',
    communityId: 'sitePageRedirects.communityId',
    fromSlug: 'sitePageRedirects.fromSlug',
    pageId: 'sitePageRedirects.pageId',
    deletedAt: 'sitePageRedirects.deletedAt',
  },
  userRoles: {
    userId: 'userRoles.userId',
    communityId: 'userRoles.communityId',
    role: 'userRoles.role',
    displayTitle: 'userRoles.displayTitle',
    presetKey: 'userRoles.presetKey',
    designation: 'userRoles.designation',
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

import { BOARD_DESIGNATIONS } from '@propertypro/shared';
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
    mockSelectChain.limit.mockReturnValue(mockSelectChain);
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

    // The WHERE clause should include all three predicates (post-#9e:
    // template_variant column dropped from the schema).
    expect(mockSelectChain.where).toHaveBeenCalledTimes(1);
    const whereCall = mockSelectChain.where.mock.calls[0][0];
    // Mock 'and' wraps its args in { __and: clauses[] }
    expect(whereCall).toHaveProperty('__and');
    expect(whereCall.__and).toHaveLength(3);
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

  // ---------------------------------------------------------------------------
  // PR #8c — preview workflow: listSiteBlocks({ includeDrafts: true })
  // ---------------------------------------------------------------------------

  it('listSiteBlocks default WHERE includes the is_draft=false predicate', async () => {
    const reader = getPublicCommunityScopedReader(42);
    await reader.listSiteBlocks();
    const whereCall = mockSelectChain.where.mock.calls[0][0];
    // 3 predicates: communityId, deletedAt isNull, isDraft=false
    // (template_variant column was dropped in PR #9e.)
    expect(whereCall.__and).toHaveLength(3);
    // The is_draft=false predicate is appended last
    const isDraftClause = whereCall.__and[2];
    expect(isDraftClause).toHaveProperty('__eq');
    expect(isDraftClause.__eq.col).toBe('siteBlocks.isDraft');
    expect(isDraftClause.__eq.val).toBe(false);
  });

  it('listSiteBlocks({ includeDrafts: true }) drops the is_draft predicate', async () => {
    const reader = getPublicCommunityScopedReader(42);
    await reader.listSiteBlocks({ includeDrafts: true });
    const whereCall = mockSelectChain.where.mock.calls[0][0];
    // Only 2 predicates: communityId, deletedAt isNull
    expect(whereCall.__and).toHaveLength(2);
    // None of the remaining predicates target isDraft
    const targetsIsDraft = whereCall.__and.some(
      (c: { __eq?: { col: unknown } }) => c?.__eq?.col === 'siteBlocks.isDraft',
    );
    expect(targetsIsDraft).toBe(false);
  });

  it('listSiteBlocks({ includeDrafts: true }) prefers draft rows over published at the same block_order', async () => {
    queueQueryResults([
      { id: 1, blockType: 'hero', blockOrder: 0, content: { v: 'published' }, isDraft: false },
      { id: 2, blockType: 'hero', blockOrder: 0, content: { v: 'draft' }, isDraft: true },
      { id: 3, blockType: 'docs', blockOrder: 1, content: { v: 'published-1' }, isDraft: false },
    ]);
    const reader = getPublicCommunityScopedReader(42);
    const results = await reader.listSiteBlocks({ includeDrafts: true });
    // Expect block_order 0 returned ONCE (draft wins), block_order 1 returned as published
    expect(results).toHaveLength(2);
    const order0 = results.find((r) => r.blockOrder === 0);
    expect(order0?.id).toBe(2);
    expect(order0?.content).toEqual({ v: 'draft' });
    const order1 = results.find((r) => r.blockOrder === 1);
    expect(order1?.id).toBe(3);
  });

  it('listSiteBlocks({ includeDrafts: true }) returns draft rows when no published twin exists', async () => {
    queueQueryResults([
      { id: 7, blockType: 'docs', blockOrder: 2, content: { v: 'draft-only' }, isDraft: true, publishedAt: null },
    ]);
    const reader = getPublicCommunityScopedReader(42);
    const results = await reader.listSiteBlocks({ includeDrafts: true });
    expect(results).toEqual([
      { id: 7, blockType: 'docs', blockOrder: 2, content: { v: 'draft-only' }, isDraft: true, publishedAt: null },
    ]);
  });

  it('listSiteBlocks({ includeDrafts: true }) drops a tombstoned slot — the tombstone wins the merge over its published row, then is filtered (slice 8f)', async () => {
    queueQueryResults([
      { id: 1, blockType: 'text', blockOrder: 2, content: { v: 'published' }, isDraft: false },
      { id: 2, blockType: 'tombstone', blockOrder: 2, content: {}, isDraft: true },
      { id: 3, blockType: 'docs', blockOrder: 3, content: { v: 'kept' }, isDraft: false },
    ]);
    const reader = getPublicCommunityScopedReader(42);
    const results = await reader.listSiteBlocks({ includeDrafts: true });
    // The staged deletion at order 2 renders as ABSENT in preview — neither
    // the published row (shadowed) nor the tombstone (filtered) appears.
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(3);
  });

  it('listSiteBlocks({ includeDrafts: true, includeTombstones: true }) surfaces the tombstone for the editor', async () => {
    queueQueryResults([
      { id: 1, blockType: 'text', blockOrder: 2, content: { v: 'published' }, isDraft: false },
      { id: 2, blockType: 'tombstone', blockOrder: 2, content: {}, isDraft: true, publishedAt: null },
    ]);
    const reader = getPublicCommunityScopedReader(42);
    const results = await reader.listSiteBlocks({ includeDrafts: true, includeTombstones: true });
    expect(results).toHaveLength(1);
    expect(results[0]?.blockType).toBe('tombstone');
    expect(results[0]?.isDraft).toBe(true);
  });

  it('listSiteBlocks default returns rows unchanged when no draft option supplied', async () => {
    const publishedAt = new Date('2026-05-01T00:00:00Z');
    queueQueryResults([
      { id: 1, blockType: 'hero', blockOrder: 0, content: { v: 'p' }, isDraft: false, publishedAt },
    ]);
    const reader = getPublicCommunityScopedReader(42);
    const results = await reader.listSiteBlocks();
    expect(results).toEqual([
      { id: 1, blockType: 'hero', blockOrder: 0, content: { v: 'p' }, isDraft: false, publishedAt },
    ]);
  });

  it('getLatestPublishedAt returns the max published_at (authoritative publish token)', async () => {
    const latest = new Date('2026-07-01T09:00:00Z');
    queueQueryResults([{ publishedAt: latest }]);
    const reader = getPublicCommunityScopedReader(42);
    expect(await reader.getLatestPublishedAt()).toEqual(latest);
    // Queries only published (is_draft=false), non-deleted rows, newest first.
    const whereCall = mockSelectChain.where.mock.calls.at(-1)![0] as { __and: Array<{ __eq?: { col: unknown; val: unknown } }> };
    const draftClause = whereCall.__and.find((c) => c.__eq?.col === 'siteBlocks.isDraft');
    expect(draftClause?.__eq?.val).toBe(false);
  });

  it('getLatestPublishedAt returns null before the first publish (no published rows)', async () => {
    queueQueryResults([]);
    const reader = getPublicCommunityScopedReader(42);
    expect(await reader.getLatestPublishedAt()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Phase 11b-2 — public multi-page reader: getPageBySlug / resolveRedirect /
  // listNavPages
  // ---------------------------------------------------------------------------

  type Clause = {
    __eq?: { col: string; val: unknown };
    __isNull?: string;
    __asc?: string;
    __desc?: string;
  };

  function lastWhereClauses(): Clause[] {
    const whereCall = mockSelectChain.where.mock.calls.at(-1)![0] as { __and: Clause[] };
    expect(whereCall).toHaveProperty('__and');
    return whereCall.__and;
  }

  function eqClause(clauses: Clause[], col: string): Clause | undefined {
    return clauses.find((c) => c.__eq?.col === col);
  }

  it('getPageBySlug binds communityId + slug + deletedAt isNull and defaults to published-only', async () => {
    queueQueryResults([]);
    const reader = getPublicCommunityScopedReader(42);
    await reader.getPageBySlug('about');

    const clauses = lastWhereClauses();
    expect(eqClause(clauses, 'sitePages.communityId')?.__eq?.val).toBe(42);
    expect(eqClause(clauses, 'sitePages.slug')?.__eq?.val).toBe('about');
    expect(clauses.map((c) => c.__isNull)).toContain('sitePages.deletedAt');
    // is_draft = false unless includeDrafts — mirrors the anon RLS predicate.
    expect(eqClause(clauses, 'sitePages.isDraft')?.__eq?.val).toBe(false);
    expect(mockSelectChain.limit).toHaveBeenCalledWith(1);
  });

  it('getPageBySlug returns null for a draft page (published-only predicate, no row)', async () => {
    queueQueryResults([]);
    const reader = getPublicCommunityScopedReader(42);
    expect(await reader.getPageBySlug('draft-page')).toBeNull();
    expect(eqClause(lastWhereClauses(), 'sitePages.isDraft')?.__eq?.val).toBe(false);
  });

  it('getPageBySlug({ includeDrafts: true }) drops the is_draft predicate (preview)', async () => {
    queueQueryResults([
      {
        id: 9,
        name: 'Draft Page',
        slug: 'draft-page',
        isHome: false,
        isDraft: true,
        inNav: true,
        sortOrder: 1,
        deleteStagedAt: null,
      },
    ]);
    const reader = getPublicCommunityScopedReader(42);
    const page = await reader.getPageBySlug('draft-page', { includeDrafts: true });
    expect(page?.id).toBe(9);
    expect(eqClause(lastWhereClauses(), 'sitePages.isDraft')).toBeUndefined();
  });

  it('getPageBySlug RETURNS a page staged for deletion and never filters delete_staged_at (D8 / migration 0047)', async () => {
    const stagedAt = new Date('2026-07-30T12:00:00Z');
    queueQueryResults([
      {
        id: 12,
        name: 'Amenities',
        slug: 'amenities',
        isHome: false,
        isDraft: false,
        inNav: true,
        sortOrder: 2,
        deleteStagedAt: stagedAt,
      },
    ]);
    const reader = getPublicCommunityScopedReader(42);
    const page = await reader.getPageBySlug('amenities');
    // A page staged for deletion stays publicly live until the PM publishes.
    expect(page).toMatchObject({ id: 12, slug: 'amenities', deleteStagedAt: stagedAt });
    const clauses = lastWhereClauses();
    expect(clauses.some((c) => c.__eq?.col === 'sitePages.deleteStagedAt')).toBe(false);
    expect(clauses.map((c) => c.__isNull)).not.toContain('sitePages.deleteStagedAt');
  });

  it("getPageBySlug resolves home as the empty slug", async () => {
    queueQueryResults([
      {
        id: 1,
        name: 'Home',
        slug: '',
        isHome: true,
        isDraft: false,
        inNav: true,
        sortOrder: 0,
        deleteStagedAt: null,
      },
    ]);
    const reader = getPublicCommunityScopedReader(42);
    const page = await reader.getPageBySlug('');
    expect(page).toMatchObject({ id: 1, isHome: true, slug: '' });
    expect(eqClause(lastWhereClauses(), 'sitePages.slug')?.__eq?.val).toBe('');
  });

  it('getPageBySlug returns null when no page matches', async () => {
    queueQueryResults([]);
    const reader = getPublicCommunityScopedReader(42);
    expect(await reader.getPageBySlug('nope')).toBeNull();
  });

  it('resolveRedirect joins the target page and returns its CURRENT slug', async () => {
    queueQueryResults([{ pageId: 5, toSlug: 'amenities' }]);
    const reader = getPublicCommunityScopedReader(42);
    const result = await reader.resolveRedirect('pool');
    expect(result).toEqual({ pageId: 5, toSlug: 'amenities' });
    expect(mockSelectChain.innerJoin).toHaveBeenCalledTimes(1);

    const clauses = lastWhereClauses();
    expect(eqClause(clauses, 'sitePageRedirects.communityId')?.__eq?.val).toBe(42);
    expect(eqClause(clauses, 'sitePageRedirects.fromSlug')?.__eq?.val).toBe('pool');
    expect(clauses.map((c) => c.__isNull)).toContain('sitePageRedirects.deletedAt');
    // The target page must belong to the same community.
    expect(eqClause(clauses, 'sitePages.communityId')?.__eq?.val).toBe(42);
  });

  it('resolveRedirect returns null when the target page is deleted (deletedAt isNull is in the join predicate)', async () => {
    queueQueryResults([]);
    const reader = getPublicCommunityScopedReader(42);
    expect(await reader.resolveRedirect('pool')).toBeNull();
    expect(lastWhereClauses().map((c) => c.__isNull)).toContain('sitePages.deletedAt');
  });

  it('resolveRedirect returns null when the target page is a draft (is_draft=false is in the join predicate)', async () => {
    queueQueryResults([]);
    const reader = getPublicCommunityScopedReader(42);
    expect(await reader.resolveRedirect('pool')).toBeNull();
    expect(eqClause(lastWhereClauses(), 'sitePages.isDraft')?.__eq?.val).toBe(false);
  });

  it('resolveRedirect takes exactly ONE hop — it never re-queries redirects with the resolved slug', async () => {
    queueQueryResults([{ pageId: 5, toSlug: 'amenities' }]);
    const reader = getPublicCommunityScopedReader(42);
    await reader.resolveRedirect('pool');
    // Redirects point at page ids, so a chain is unrepresentable: one select.
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('listNavPages filters to published + in_nav + not-deleted rows', async () => {
    queueQueryResults([]);
    const reader = getPublicCommunityScopedReader(7);
    await reader.listNavPages();

    const clauses = lastWhereClauses();
    expect(eqClause(clauses, 'sitePages.communityId')?.__eq?.val).toBe(7);
    expect(eqClause(clauses, 'sitePages.isDraft')?.__eq?.val).toBe(false);
    expect(eqClause(clauses, 'sitePages.inNav')?.__eq?.val).toBe(true);
    expect(clauses.map((c) => c.__isNull)).toContain('sitePages.deletedAt');
  });

  it('listNavPages orders home first, then sort_order, then id', async () => {
    queueQueryResults([]);
    const reader = getPublicCommunityScopedReader(42);
    await reader.listNavPages();

    expect(mockSelectChain.orderBy).toHaveBeenCalledTimes(1);
    const orderArgs = mockSelectChain.orderBy.mock.calls[0] as unknown as Clause[];
    expect(orderArgs).toHaveLength(3);
    expect(orderArgs[0].__desc).toBe('sitePages.isHome');
    expect(orderArgs[1].__asc).toBe('sitePages.sortOrder');
    expect(orderArgs[2].__asc).toBe('sitePages.id');
  });

  it('listNavPages returns the { id, name, slug, isHome } projection home-first', async () => {
    queueQueryResults([
      { id: 1, name: 'Home', slug: '', isHome: true },
      { id: 4, name: 'Amenities', slug: 'amenities', isHome: false },
      { id: 9, name: 'Documents Hub', slug: 'docs-hub', isHome: false },
    ]);
    const reader = getPublicCommunityScopedReader(42);
    const nav = await reader.listNavPages();
    expect(nav).toEqual([
      { id: 1, name: 'Home', slug: '', isHome: true },
      { id: 4, name: 'Amenities', slug: 'amenities', isHome: false },
      { id: 9, name: 'Documents Hub', slug: 'docs-hub', isHome: false },
    ]);
    expect(nav[0].isHome).toBe(true);
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

  it('listDocuments WHERE includes publicAccess=true (migration 0007 access gate)', async () => {
    // Migration 0007 introduced documents.public_access as the authoritative
    // public-site access boundary. Existing category-filter assertions could
    // pass even if a regression silently dropped this gate, so we explicitly
    // assert the publicAccess=true equality clause is present.
    mockSelectChain.then.mockImplementation((resolve) =>
      Promise.resolve([]).then(resolve),
    );
    const reader = getPublicCommunityScopedReader(42);
    await reader.listDocuments({ limit: 5, includeCategories: ['budget'] });

    const whereCall = mockSelectChain.where.mock.calls[0][0];
    const publicAccessClause = whereCall.__and.find(
      (c: unknown) =>
        (c as { __eq?: { col: string } }).__eq?.col === 'documents.publicAccess',
    );
    expect(publicAccessClause).toBeDefined();
    expect((publicAccessClause as { __eq: { val: boolean } }).__eq.val).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // listPublicDocumentsForSitemap (migration 0007 follow-up)
  // ---------------------------------------------------------------------------

  it('listPublicDocumentsForSitemap returns mapped { id, updatedAt } rows', async () => {
    const fakeRow = {
      id: 10,
      updatedAt: new Date('2026-01-15T10:00:00Z'),
    };
    mockSelectChain.then.mockImplementation((resolve) =>
      Promise.resolve([fakeRow]).then(resolve),
    );
    const reader = getPublicCommunityScopedReader(42);
    const result = await reader.listPublicDocumentsForSitemap({ limit: 100 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 10 });
    expect(result[0].updatedAt).toBeInstanceOf(Date);
  });

  it('listPublicDocumentsForSitemap WHERE binds communityId + deletedAt isNull + publicAccess=true', async () => {
    mockSelectChain.then.mockImplementation((resolve) =>
      Promise.resolve([]).then(resolve),
    );
    const reader = getPublicCommunityScopedReader(7);
    await reader.listPublicDocumentsForSitemap({ limit: 100 });

    const whereCall = mockSelectChain.where.mock.calls[0][0];
    // communityId eq
    const cidClause = whereCall.__and.find(
      (c: unknown) => (c as { __eq?: { col: string } }).__eq?.col === 'documents.communityId',
    );
    expect((cidClause as { __eq: { val: number } }).__eq.val).toBe(7);
    // deletedAt isNull
    const isNullCols = whereCall.__and
      .filter((c: unknown) => (c as { __isNull?: string }).__isNull !== undefined)
      .map((c: unknown) => (c as { __isNull: string }).__isNull);
    expect(isNullCols).toContain('documents.deletedAt');
    // publicAccess=true
    const paClause = whereCall.__and.find(
      (c: unknown) => (c as { __eq?: { col: string } }).__eq?.col === 'documents.publicAccess',
    );
    expect((paClause as { __eq: { val: boolean } }).__eq.val).toBe(true);
  });

  it('listPublicDocumentsForSitemap is NOT category-filtered (sitemap surfaces every public doc)', async () => {
    mockSelectChain.then.mockImplementation((resolve) =>
      Promise.resolve([]).then(resolve),
    );
    const reader = getPublicCommunityScopedReader(42);
    await reader.listPublicDocumentsForSitemap({ limit: 100 });

    const whereCall = mockSelectChain.where.mock.calls[0][0];
    const hasInArray = whereCall.__and.some(
      (c: unknown) => (c as { __inArray?: unknown }).__inArray !== undefined,
    );
    expect(hasInArray).toBe(false);
    expect(mockSelectChain.leftJoin).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // listPublishedPagesForSitemap (Phase 11b-2 / D16)
  //
  // sitemap.test.ts mocks this reader wholesale, so it can only assert URL
  // ASSEMBLY — every predicate below is invisible to it. These are the tests
  // that actually pin the query.
  // ---------------------------------------------------------------------------

  /** The four predicates, extracted from the single WHERE call as `col -> val`. */
  function sitemapPagesEqClauses() {
    const whereCall = mockSelectChain.where.mock.calls[0][0];
    return {
      eqs: whereCall.__and
        .filter((c: unknown) => (c as { __eq?: unknown }).__eq !== undefined)
        .map((c: unknown) => (c as { __eq: { col: string; val: unknown } }).__eq),
      isNulls: whereCall.__and
        .filter((c: unknown) => (c as { __isNull?: string }).__isNull !== undefined)
        .map((c: unknown) => (c as { __isNull: string }).__isNull),
    };
  }

  it('listPublishedPagesForSitemap binds communityId and excludes deleted, draft and home rows', async () => {
    mockSelectChain.then.mockImplementation((resolve) => Promise.resolve([]).then(resolve));
    const reader = getPublicCommunityScopedReader(7);
    await reader.listPublishedPagesForSitemap({ limit: 200 });

    const { eqs, isNulls } = sitemapPagesEqClauses();
    expect(isNulls).toContain('sitePages.deletedAt');
    expect(eqs).toContainEqual({ col: 'sitePages.communityId', val: 7 });
    // Draft pages must never reach a public sitemap.
    expect(eqs).toContainEqual({ col: 'sitePages.isDraft', val: false });
    // Home is excluded here because sitemap.ts emits `/` as a static entry; home's
    // slug is '' so including it would produce a duplicate `/` URL.
    expect(eqs).toContainEqual({ col: 'sitePages.isHome', val: false });
  });

  it('listPublishedPagesForSitemap does NOT filter on in_nav (D16) or delete_staged_at', async () => {
    // The two DELIBERATE absences, and the reason this test exists: `listNavPages`
    // DOES filter on `in_nav`, so the two methods are one copy-paste from
    // converging and nothing else would catch it. `in_nav` is presentation — an
    // unlisted-but-published page is still a public URL. `delete_staged_at` is
    // omitted for the same reason as getPageBySlug: a page staged for deletion is
    // still live to the public until the PM publishes (D8 / migration 0047).
    mockSelectChain.then.mockImplementation((resolve) => Promise.resolve([]).then(resolve));
    const reader = getPublicCommunityScopedReader(42);
    await reader.listPublishedPagesForSitemap({ limit: 200 });

    const { eqs, isNulls } = sitemapPagesEqClauses();
    expect(eqs.map((e: { col: string }) => e.col)).not.toContain('sitePages.inNav');
    expect(eqs.map((e: { col: string }) => e.col)).not.toContain('sitePages.deleteStagedAt');
    expect(isNulls).not.toContain('sitePages.deleteStagedAt');
  });

  it('listPublishedPagesForSitemap orders by id ascending for a stable crawl order', async () => {
    mockSelectChain.then.mockImplementation((resolve) => Promise.resolve([]).then(resolve));
    const reader = getPublicCommunityScopedReader(42);
    await reader.listPublishedPagesForSitemap({ limit: 200 });
    expect(mockSelectChain.orderBy).toHaveBeenCalledWith({ __asc: 'sitePages.id' });
  });

  it('listPublishedPagesForSitemap forwards the caller-supplied limit to the query', async () => {
    // The cap lives entirely at the call site (SITEMAP_PAGE_LIMIT); the reader has
    // none of its own, so "the argument was passed" and "the query is capped" are
    // different claims. sitemap.test.ts can only make the first.
    mockSelectChain.then.mockImplementation((resolve) => Promise.resolve([]).then(resolve));
    const reader = getPublicCommunityScopedReader(42);
    await reader.listPublishedPagesForSitemap({ limit: 200 });
    expect(mockSelectChain.limit).toHaveBeenCalledWith(200);
  });

  it('listPublishedPagesForSitemap returns the { id, slug, updatedAt } projection', async () => {
    const fakeRow = { id: 9, slug: 'amenities', updatedAt: new Date('2026-05-02T00:00:00Z') };
    mockSelectChain.then.mockImplementation((resolve) => Promise.resolve([fakeRow]).then(resolve));
    const reader = getPublicCommunityScopedReader(42);
    const result = await reader.listPublishedPagesForSitemap({ limit: 200 });
    expect(result).toEqual([fakeRow]);

    const projection = mockDb.select.mock.calls[0][0];
    expect(projection).toEqual({
      id: 'sitePages.id',
      slug: 'sitePages.slug',
      updatedAt: 'sitePages.updatedAt',
    });
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
        { fullName: 'Ava Nguyen', displayTitle: 'Board President', designation: 'board_president' },
        { fullName: 'Miles Carter', displayTitle: null, designation: 'board_member' },
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

  // ---------------------------------------------------------------------------
  // Phase 3.2 (§3.2) — board roster sources from designation, not presetKey/role
  // ---------------------------------------------------------------------------

  it('getContactInfo board WHERE filters on designation ∈ BOARD_DESIGNATIONS and NOT on role or presetKey', async () => {
    queueQueryResults([], []);
    const reader = getPublicCommunityScopedReader(42);
    await reader.getContactInfo({ showBoard: true, showManagement: false });

    const whereCall = mockSelectChain.where.mock.calls[0][0];
    expect(whereCall).toHaveProperty('__and');
    // designation inArray predicate present with BOARD_DESIGNATIONS values
    const designationClause = whereCall.__and.find(
      (c: unknown) =>
        (c as { __inArray?: { col: string } }).__inArray?.col === 'userRoles.designation',
    );
    expect(designationClause).toBeDefined();
    expect((designationClause as { __inArray: { vals: string[] } }).__inArray.vals).toEqual([
      ...BOARD_DESIGNATIONS,
    ]);
    // No predicate targets role or presetKey (statutory board is the set of
    // designation holders regardless of role)
    const targetsRoleOrPreset = whereCall.__and.some((c: unknown) => {
      const clause = c as {
        __inArray?: { col: string };
        __eq?: { col: string };
      };
      const col = clause.__inArray?.col ?? clause.__eq?.col;
      return col === 'userRoles.role' || col === 'userRoles.presetKey';
    });
    expect(targetsRoleOrPreset).toBe(false);
  });

  it('getContactInfo title falls back from designation when displayTitle is null (no presetKey)', async () => {
    // showManagement=false → the board query is the only query issued,
    // so its rows are the FIRST queued result.
    queueQueryResults([
      { fullName: 'Pat Prez', displayTitle: null, designation: 'board_president' },
      { fullName: 'Mel Member', displayTitle: null, designation: 'board_member' },
      { fullName: 'Tia Treasurer', displayTitle: 'Treasurer', designation: 'board_member' },
    ]);
    const reader = getPublicCommunityScopedReader(42);
    const result = await reader.getContactInfo({ showBoard: true, showManagement: false });

    expect(result.board).toEqual([
      { name: 'Pat Prez', title: 'Board President' },
      { name: 'Mel Member', title: 'Board Member' },
      // displayTitle wins when present
      { name: 'Tia Treasurer', title: 'Treasurer' },
    ]);
  });

  it('getContactInfo skips disabled sections without issuing their queries', async () => {
    const reader = getPublicCommunityScopedReader(42);
    const result = await reader.getContactInfo({ showBoard: false, showManagement: false });

    expect(result).toEqual({ management: null, board: [] });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  describe('getPublicDocumentFile', () => {
    /**
     * This filter is the entire authorization for the product's only
     * unauthenticated read of the private documents bucket. If a predicate goes
     * missing, a private association record is on the open internet — so each
     * one is asserted by name rather than by a single shape snapshot.
     */
    it('demands public_access, a live row, and this community', async () => {
      mockSelectChain.then.mockImplementation((resolve) =>
        Promise.resolve([]).then(resolve),
      );
      const reader = getPublicCommunityScopedReader(42);
      await reader.getPublicDocumentFile(7);

      const where = mockSelectChain.where.mock.calls[0][0];
      const clauses = where.__and as unknown[];

      const equals = clauses
        .filter((c) => (c as { __eq?: unknown }).__eq !== undefined)
        .map((c) => (c as { __eq: { col: string; val: unknown } }).__eq);
      const isNulls = clauses
        .filter((c) => (c as { __isNull?: string }).__isNull !== undefined)
        .map((c) => (c as { __isNull: string }).__isNull);

      expect(equals).toEqual(
        expect.arrayContaining([
          { col: 'documents.publicAccess', val: true },
          { col: 'documents.communityId', val: 42 },
          { col: 'documents.id', val: 7 },
        ]),
      );
      expect(isNulls).toContain('documents.deletedAt');
      // The community must still be live. Soft-deleting a community sets
      // `communities.deleted_at` and touches nothing on `documents`, so without
      // this predicate a deleted association's published records stay
      // anonymously downloadable — including after the 6-month purge.
      expect(isNulls).toContain('communities.deletedAt');
    });

    /**
     * The download route reads `communityId` off the query string, so it never
     * passes through the middleware RPC (`pp_public_community_id_by_slug`,
     * migration 0045) that filters `deleted_at IS NULL` for every other public
     * surface. This join is the only thing standing in for that gate.
     */
    it('joins communities so a soft-deleted community cannot serve its documents', async () => {
      mockSelectChain.then.mockImplementation((resolve) =>
        Promise.resolve([]).then(resolve),
      );
      const reader = getPublicCommunityScopedReader(42);
      await reader.getPublicDocumentFile(7);

      expect(mockSelectChain.innerJoin).toHaveBeenCalledTimes(1);
      expect(mockSelectChain.innerJoin).toHaveBeenCalledWith(
        expect.anything(),
        { __eq: { col: 'communities.id', val: 'documents.communityId' } },
      );

      // One WHERE per method — the liveness predicate rides in the same flat
      // and(...) as the document predicates (the `resolveRedirect` shape),
      // never as a second lookup.
      expect(mockSelectChain.where).toHaveBeenCalledTimes(1);
    });

    it('never queries for a non-positive id', async () => {
      const reader = getPublicCommunityScopedReader(42);

      await expect(reader.getPublicDocumentFile(0)).resolves.toBeNull();
      await expect(reader.getPublicDocumentFile(-1)).resolves.toBeNull();
      await expect(reader.getPublicDocumentFile(1.5)).resolves.toBeNull();
    });
  });
});

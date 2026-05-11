import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  announcementsTableMock,
  communitiesTableMock,
  demoSeedRegistryTableMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  announcementsTableMock: {
    id: Symbol('announcements.id'),
    title: Symbol('announcements.title'),
    body: Symbol('announcements.body'),
    audience: Symbol('announcements.audience'),
    isPinned: Symbol('announcements.isPinned'),
    archivedAt: Symbol('announcements.archivedAt'),
    publishedAt: Symbol('announcements.publishedAt'),
  },
  communitiesTableMock: {
    id: Symbol('communities.id'),
    isDemo: Symbol('communities.isDemo'),
    trialEndsAt: Symbol('communities.trialEndsAt'),
    demoExpiresAt: Symbol('communities.demoExpiresAt'),
  },
  demoSeedRegistryTableMock: {
    communityId: Symbol('demoSeedRegistry.communityId'),
    entityId: Symbol('demoSeedRegistry.entityId'),
    entityType: Symbol('demoSeedRegistry.entityType'),
  },
}));

vi.mock('@propertypro/db', () => ({
  announcements: announcementsTableMock,
  communities: communitiesTableMock,
  demoSeedRegistry: demoSeedRegistryTableMock,
  createScopedClient: createScopedClientMock,
  clampPageSize: (input: number | null | undefined) => {
    if (input === null || input === undefined) return 50;
    if (input < 1) return 1;
    if (input > 100) return 100;
    return input;
  },
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  desc: (col: unknown) => ({ __desc: col }),
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  inArray: (col: unknown, vals: unknown[]) => ({ __inArray: { col, vals } }),
  isNull: (col: unknown) => ({ __isNull: col }),
  lt: (col: unknown, val: unknown) => ({ __lt: { col, val } }),
  notInArray: (col: unknown, vals: unknown[]) => ({ __notInArray: { col, vals } }),
  or: (...clauses: unknown[]) => ({ __or: clauses }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: { strings: [...strings], values },
  }),
}));

import {
  filterVisibleAnnouncements,
  listVisibleAnnouncements,
} from '../../src/lib/announcements/read-visibility';

const membership = {
  userId: 'user-1',
  communityId: 42,
  role: 'resident',
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Resident',
  presetKey: 'owner',
  permissions: {
    resources: {
      announcements: { read: true, write: false },
    },
  },
  communityType: 'condo_718',
};

const community = {
  id: 77,
  isDemo: false,
  trialEndsAt: null,
  demoExpiresAt: null,
};

function announcement(id: number, audience: 'all' | 'owners_only' | 'board_only' | 'tenants_only') {
  return {
    id,
    title: `Announcement ${id}`,
    body: `Body ${id}`,
    audience,
    isPinned: false,
    archivedAt: null,
    deletedAt: null,
    publishedAt: new Date(`2026-02-0${id}T12:00:00.000Z`),
  } as never;
}

function mockScopedRows({
  community = {
    id: 42,
    isDemo: false,
    trialEndsAt: null,
    demoExpiresAt: null,
  },
  announcements = [],
  seededIds = [],
}: {
  community?: Record<string, unknown>;
  announcements?: Record<string, unknown>[];
  seededIds?: Array<string | number>;
}) {
  const limit = vi.fn().mockResolvedValue(announcements);
  const orderBy = vi.fn(() => ({ limit }));
  const selectFrom = vi.fn((table: unknown) => {
    if (table === communitiesTableMock) {
      return Promise.resolve([community]);
    }
    if (table === demoSeedRegistryTableMock) {
      return Promise.resolve(seededIds.map((entityId) => ({ entityId: String(entityId) })));
    }
    return { orderBy };
  });
  createScopedClientMock.mockReturnValue({ selectFrom });
  return { selectFrom, orderBy, limit };
}

describe('listVisibleAnnouncements ordered-keyset path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns pinned/newest/id ordered pages and encodes all sort keys in the next cursor', async () => {
    const publishedAt = new Date('2026-05-11T15:00:00.000Z');
    const { selectFrom, orderBy, limit } = mockScopedRows({
      announcements: [
        { id: 10, isPinned: true, publishedAt, title: 'Pinned newest' },
        { id: 9, isPinned: true, publishedAt: new Date('2026-05-10T15:00:00.000Z'), title: 'Pinned older' },
        { id: 8, isPinned: false, publishedAt: new Date('2026-05-11T16:00:00.000Z'), title: 'Unpinned' },
      ],
    });

    const result = await listVisibleAnnouncements(42, membership as never, { pageSize: 2 });

    expect(result.rows.map((row) => row.id)).toEqual([10, 9]);
    expect(result.pagination).toEqual({
      nextCursor: expect.any(String),
      hasMore: true,
      pageSize: 2,
    });
    expect(JSON.parse(Buffer.from(result.pagination!.nextCursor!, 'base64url').toString('utf8'))).toEqual({
      isPinned: true,
      publishedAt: '2026-05-10T15:00:00.000Z',
      id: 9,
    });
    expect(selectFrom).toHaveBeenCalledWith(
      announcementsTableMock,
      {},
      expect.objectContaining({ __and: expect.any(Array) }),
    );
    expect(orderBy).toHaveBeenCalledWith(
      { __desc: announcementsTableMock.isPinned },
      { __desc: announcementsTableMock.publishedAt },
      { __desc: announcementsTableMock.id },
    );
    expect(limit).toHaveBeenCalledWith(3);
  });

  it('pushes archive, owner audience, query, and ordered cursor predicates into SQL before pagination', async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        isPinned: true,
        publishedAt: '2026-05-11T15:00:00.000Z',
        id: 10,
      }),
      'utf8',
    ).toString('base64url');
    const { selectFrom } = mockScopedRows({ announcements: [] });

    await listVisibleAnnouncements(42, membership as never, {
      cursor,
      pageSize: 10,
      query: 'board_%',
    });

    expect(selectFrom.mock.calls[1]?.[2]).toEqual({
      __and: [
        { __isNull: announcementsTableMock.archivedAt },
        {
          __inArray: {
            col: announcementsTableMock.audience,
            vals: ['all', 'owners_only'],
          },
        },
        {
          __or: [
            {
              __sql: {
                strings: ['', ' ILIKE ', " ESCAPE '\\'"],
                values: [announcementsTableMock.title, '%board\\_\\%%'],
              },
            },
            {
              __sql: {
                strings: ['', ' ILIKE ', " ESCAPE '\\'"],
                values: [announcementsTableMock.body, '%board\\_\\%%'],
              },
            },
          ],
        },
        {
          __or: [
            { __lt: { col: announcementsTableMock.isPinned, val: true } },
            {
              __and: [
                { __eq: { col: announcementsTableMock.isPinned, val: true } },
                {
                  __or: [
                    {
                      __lt: {
                        col: announcementsTableMock.publishedAt,
                        val: new Date('2026-05-11T15:00:00.000Z'),
                      },
                    },
                    {
                      __and: [
                        {
                          __eq: {
                            col: announcementsTableMock.publishedAt,
                            val: new Date('2026-05-11T15:00:00.000Z'),
                          },
                        },
                        { __lt: { col: announcementsTableMock.id, val: 10 } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('treats malformed cursors as first-page requests', async () => {
    const { selectFrom } = mockScopedRows({ announcements: [] });

    await listVisibleAnnouncements(42, membership as never, {
      cursor: 'not-valid-base64',
      pageSize: 10,
    });

    expect(selectFrom.mock.calls[1]?.[2]).toEqual({
      __and: [
        { __isNull: announcementsTableMock.archivedAt },
        {
          __inArray: {
            col: announcementsTableMock.audience,
            vals: ['all', 'owners_only'],
          },
        },
      ],
    });
  });

  it('fails closed for demo-lineage communities when seeded announcement ids are unavailable', async () => {
    const { selectFrom } = mockScopedRows({
      community: {
        id: 42,
        isDemo: true,
        trialEndsAt: null,
        demoExpiresAt: null,
      },
      seededIds: [],
    });

    const result = await listVisibleAnnouncements(42, membership as never, { pageSize: 5 });

    expect(result).toEqual({
      rows: [],
      totalCount: 0,
      pagination: { nextCursor: null, hasMore: false, pageSize: 5 },
    });
    expect(selectFrom).toHaveBeenCalledTimes(2);
  });

  it('excludes seeded demo announcements in SQL when registry ids exist', async () => {
    const { selectFrom } = mockScopedRows({
      community: {
        id: 42,
        isDemo: true,
        trialEndsAt: null,
        demoExpiresAt: null,
      },
      seededIds: [7, 8],
    });

    await listVisibleAnnouncements(42, membership as never, { pageSize: 5 });

    expect(selectFrom.mock.calls[2]?.[2]).toEqual({
      __and: [
        { __isNull: announcementsTableMock.archivedAt },
        {
          __inArray: {
            col: announcementsTableMock.audience,
            vals: ['all', 'owners_only'],
          },
        },
        { __notInArray: { col: announcementsTableMock.id, vals: [7, 8] } },
      ],
    });
  });
});

describe('filterVisibleAnnouncements full-list visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows owners-only announcements to owner residents but not tenant-only or board-only rows', async () => {
    const result = await filterVisibleAnnouncements(
      community,
      membership as never,
      [
        announcement(1, 'all'),
        announcement(2, 'owners_only'),
        announcement(3, 'tenants_only'),
        announcement(4, 'board_only'),
      ],
    );

    expect(result.rows.map((row) => row.id)).toEqual([2, 1]);
    expect(result.totalCount).toBe(2);
  });

  it('shows tenant-only announcements to tenant residents and honors query filtering', async () => {
    const result = await filterVisibleAnnouncements(
      community,
      { ...membership, isUnitOwner: false } as never,
      [
        { ...announcement(1, 'all'), title: 'General update' },
        { ...announcement(2, 'tenants_only'), title: 'Tenant reminder' },
        { ...announcement(3, 'owners_only'), title: 'Owner budget' },
      ] as never,
      { query: 'tenant' },
    );

    expect(result.rows.map((row) => row.id)).toEqual([2]);
    expect(result.totalCount).toBe(1);
  });

  it('lets admins read board-only and archived rows when requested', async () => {
    const result = await filterVisibleAnnouncements(
      community,
      { ...membership, role: 'manager', isAdmin: true, isUnitOwner: false } as never,
      [
        announcement(1, 'all'),
        { ...announcement(2, 'board_only'), archivedAt: new Date() },
      ] as never,
      { includeArchived: true },
    );

    expect(result.rows.map((row) => row.id)).toEqual([2, 1]);
    expect(result.totalCount).toBe(2);
  });
});

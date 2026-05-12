/**
 * Service-level tests for forum ordered-keyset pagination.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  selectFromMock,
  orderByMock,
  limitMock,
  forumThreadsTable,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  selectFromMock: vi.fn(),
  orderByMock: vi.fn(),
  limitMock: vi.fn(),
  forumThreadsTable: {
    id: Symbol('forum_threads.id'),
    isPinned: Symbol('forum_threads.is_pinned'),
    createdAt: Symbol('forum_threads.created_at'),
  },
}));

vi.mock('@propertypro/db', () => ({
  clampPageSize: (input: number | null | undefined) => {
    if (input === null || input === undefined) return 50;
    if (!Number.isFinite(input) || !Number.isInteger(input)) return 50;
    if (input < 1) return 1;
    if (input > 100) return 100;
    return input;
  },
  createScopedClient: createScopedClientMock,
  forumThreads: forumThreadsTable,
  forumReplies: {},
  listDeletedForumRepliesForThread: vi.fn(),
  logAuditEvent: vi.fn(),
  paginate: vi.fn(),
  polls: {},
  pollVotes: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  asc: (col: unknown) => ({ __asc: col }),
  desc: (col: unknown) => ({ __desc: col }),
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  gt: (col: unknown, val: unknown) => ({ __gt: { col, val } }),
  isNull: (col: unknown) => ({ __isNull: { col } }),
  lt: (col: unknown, val: unknown) => ({ __lt: { col, val } }),
  or: (...clauses: unknown[]) => ({ __or: clauses }),
}));

import { paginateForumThreadsForCommunity } from '../../src/lib/services/polls-service';

function encodeCursor(payload: { isPinned: boolean; createdAt: string; id: number }) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function row(id: number, isPinned: boolean, createdAt: string) {
  return {
    id,
    communityId: 42,
    title: `Thread ${id}`,
    body: 'Body',
    authorUserId: 'user-1',
    isPinned,
    isLocked: false,
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  orderByMock.mockReturnValue({ limit: limitMock });
  selectFromMock.mockReturnValue({ orderBy: orderByMock });
  createScopedClientMock.mockReturnValue({ selectFrom: selectFromMock });
});

describe('paginateForumThreadsForCommunity', () => {
  it('preserves isPinned desc, createdAt desc, id desc order and emits an opaque ordered cursor', async () => {
    limitMock.mockResolvedValueOnce([
      row(9, true, '2026-05-01T12:00:00.000Z'),
      row(8, false, '2026-05-01T12:00:00.000Z'),
      row(7, false, '2026-04-30T12:00:00.000Z'),
    ]);

    const result = await paginateForumThreadsForCommunity({
      communityId: 42,
      pageSize: 2,
    });

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(selectFromMock).toHaveBeenCalledWith(forumThreadsTable, {}, undefined);
    expect(orderByMock).toHaveBeenCalledWith(
      { __desc: forumThreadsTable.isPinned },
      { __desc: forumThreadsTable.createdAt },
      { __desc: forumThreadsTable.id },
    );
    expect(limitMock).toHaveBeenCalledWith(3);
    expect(result.data.map((thread) => thread.id)).toEqual([9, 8]);
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.pageSize).toBe(2);

    const decoded = JSON.parse(
      Buffer.from(result.pagination.nextCursor!, 'base64url').toString('utf8'),
    );
    expect(decoded).toEqual({
      isPinned: false,
      createdAt: '2026-05-01T12:00:00.000Z',
      id: 8,
    });
  });

  it('uses a lexicographic cursor predicate that exactly matches the order keys', async () => {
    const cursor = encodeCursor({
      isPinned: true,
      createdAt: '2026-05-02T10:00:00.000Z',
      id: 12,
    });
    limitMock.mockResolvedValueOnce([row(11, true, '2026-05-02T10:00:00.000Z')]);

    await paginateForumThreadsForCommunity({
      communityId: 42,
      cursor,
      pageSize: 10,
    });

    const where = selectFromMock.mock.calls[0]![2];
    expect(where).toEqual({
      __or: [
        { __lt: { col: forumThreadsTable.isPinned, val: true } },
        {
          __and: [
            { __eq: { col: forumThreadsTable.isPinned, val: true } },
            {
              __or: [
                {
                  __lt: {
                    col: forumThreadsTable.createdAt,
                    val: new Date('2026-05-02T10:00:00.000Z'),
                  },
                },
                {
                  __and: [
                    {
                      __eq: {
                        col: forumThreadsTable.createdAt,
                        val: new Date('2026-05-02T10:00:00.000Z'),
                      },
                    },
                    { __lt: { col: forumThreadsTable.id, val: 12 } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('treats malformed cursors as first page and clamps page size', async () => {
    limitMock.mockResolvedValueOnce([row(1, false, '2026-05-01T12:00:00.000Z')]);

    const result = await paginateForumThreadsForCommunity({
      communityId: 42,
      cursor: 'not-json',
      pageSize: 500,
    });

    expect(selectFromMock).toHaveBeenCalledWith(forumThreadsTable, {}, undefined);
    expect(limitMock).toHaveBeenCalledWith(101);
    expect(result.pagination).toEqual({
      nextCursor: null,
      hasMore: false,
      pageSize: 100,
    });
  });
});

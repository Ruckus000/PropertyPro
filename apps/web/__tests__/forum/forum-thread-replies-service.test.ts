/**
 * getForumThreadWithRepliesForCommunity reply read (roadmap 3.7, PAG-02).
 *
 * The replies used to come from two reads — a scoped selectFrom of live rows
 * and a raw-`db` helper for the soft-deleted ones — merged and re-sorted in JS.
 * They now come from ONE scoped `queryWhere(forumReplies, thread = ?,
 * { includeSoftDeleted: true })`, ordered (createdAt, id). The reply list is
 * deliberately NOT capped (the thread view renders every reply and the response
 * has no cursor); see the service comment.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createScopedClientMock, selectFromMock, queryWhereMock, tables } = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  selectFromMock: vi.fn(),
  queryWhereMock: vi.fn(),
  tables: {
    forumThreads: { __table: 'forum_threads', id: Symbol('forum_threads.id') },
    forumReplies: {
      __table: 'forum_replies',
      id: Symbol('forum_replies.id'),
      threadId: Symbol('forum_replies.thread_id'),
      createdAt: Symbol('forum_replies.created_at'),
    },
  },
}));

vi.mock('@propertypro/db', () => ({
  clampPageSize: (n: number | undefined) => n ?? 50,
  createScopedClient: createScopedClientMock,
  forumThreads: tables.forumThreads,
  forumReplies: tables.forumReplies,
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

import { getForumThreadWithRepliesForCommunity } from '../../src/lib/services/polls-service';

const THREAD = {
  id: 7,
  communityId: 42,
  title: 'Pool hours',
  body: 'Body',
  authorUserId: 'u-1',
  isPinned: false,
  isLocked: false,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
};

function reply(id: number, createdAt: string, deleted = false) {
  return {
    id,
    communityId: 42,
    threadId: 7,
    body: `reply ${id}`,
    authorUserId: 'u-2',
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
    deletedAt: deleted ? new Date('2026-09-20T00:00:00Z') : null,
  };
}

// Returned in a deliberately scrambled order: queryWhere has no ORDER BY.
const REPLIES = [
  reply(14, '2026-09-03T00:00:00Z'), // same instant as 12 — id breaks the tie
  reply(11, '2026-09-02T00:00:00Z', true),
  reply(12, '2026-09-03T00:00:00Z'),
  reply(10, '2026-09-01T12:00:00Z'),
];

beforeEach(() => {
  vi.clearAllMocks();
  selectFromMock.mockResolvedValue([THREAD]);
  queryWhereMock.mockResolvedValue(REPLIES.map((r) => ({ ...r })));
  createScopedClientMock.mockReturnValue({
    selectFrom: selectFromMock,
    queryWhere: queryWhereMock,
  });
});

describe('getForumThreadWithRepliesForCommunity', () => {
  it('reads the thread replies once, scoped, soft-deleted rows included', async () => {
    await getForumThreadWithRepliesForCommunity(42, 7);

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(queryWhereMock).toHaveBeenCalledTimes(1);
    expect(queryWhereMock).toHaveBeenCalledWith(
      tables.forumReplies,
      { __eq: { col: tables.forumReplies.threadId, val: 7 } },
      { includeSoftDeleted: true },
    );
    // The only selectFrom left is the thread lookup; replies no longer go
    // through a second live-rows read.
    expect(selectFromMock).toHaveBeenCalledTimes(1);
    expect(selectFromMock).toHaveBeenCalledWith(tables.forumThreads, {}, {
      __eq: { col: tables.forumThreads.id, val: 7 },
    });
  });

  it('orders replies by createdAt then id and tombstones deleted ones', async () => {
    const result = await getForumThreadWithRepliesForCommunity(42, 7);

    expect(result.replies.map((r) => r.id)).toEqual([10, 11, 12, 14]);
    const tombstone = result.replies.find((r) => r.id === 11)!;
    expect(tombstone.body).toBe('');
    expect(tombstone.deletedAt).toEqual(new Date('2026-09-20T00:00:00Z'));
    expect(result.replies.find((r) => r.id === 10)!.body).toBe('reply 10');
    expect(result.replies.find((r) => r.id === 10)!.deletedAt).toBeNull();
  });

  it('matches the legacy two-list merge for replies with distinct timestamps', async () => {
    const distinct = REPLIES.filter((r) => r.id !== 14);
    queryWhereMock.mockResolvedValue(distinct.map((r) => ({ ...r })));

    const result = await getForumThreadWithRepliesForCommunity(42, 7);

    const live = distinct.filter((r) => !r.deletedAt);
    const deleted = distinct.filter((r) => r.deletedAt);
    const legacy = [...live, ...deleted].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    expect(result.replies.map((r) => r.id)).toEqual(legacy.map((r) => r.id));
  });
});

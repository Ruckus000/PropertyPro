import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { db } from '../drizzle';
import { forumReplies } from '../schema/forum-replies';

export interface DeletedForumReplyRow {
  [key: string]: unknown;
  id: number;
  communityId: number;
  threadId: number;
  body: string;
  authorUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
}

/**
 * Narrow helper for forum thread detail reads that must preserve chronology
 * after moderation without weakening the default scoped-client soft-delete
 * contract for every table.
 */
export async function listDeletedForumRepliesForThread(
  communityId: number,
  threadId: number,
): Promise<DeletedForumReplyRow[]> {
  return db
    .select({
      id: forumReplies.id,
      communityId: forumReplies.communityId,
      threadId: forumReplies.threadId,
      body: forumReplies.body,
      authorUserId: forumReplies.authorUserId,
      createdAt: forumReplies.createdAt,
      updatedAt: forumReplies.updatedAt,
      deletedAt: forumReplies.deletedAt,
    })
    .from(forumReplies)
    .where(
      and(
        eq(forumReplies.communityId, communityId),
        eq(forumReplies.threadId, threadId),
        isNotNull(forumReplies.deletedAt),
      ),
    )
    .orderBy(asc(forumReplies.createdAt)) as Promise<DeletedForumReplyRow[]>;
}

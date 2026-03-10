import {
  bigint,
  bigserial,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { forumThreads } from './forum-threads';
import { users } from './users';

export const forumReplies = pgTable('forum_replies', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  threadId: bigint('thread_id', { mode: 'number' })
    .notNull()
    .references(() => forumThreads.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  authorUserId: uuid('author_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

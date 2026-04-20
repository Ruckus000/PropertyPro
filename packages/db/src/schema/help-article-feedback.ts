import {
  pgTable,
  bigserial,
  bigint,
  text,
  timestamp,
  smallint,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

export const helpArticleFeedback = pgTable('help_article_feedback', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  articleSlug: text('article_slug').notNull(),
  articleCategory: text('article_category').notNull(),
  rating: smallint('rating').notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const helpArticleViews = pgTable('help_article_views', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  articleSlug: text('article_slug').notNull(),
  articleCategory: text('article_category').notNull(),
  viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
});

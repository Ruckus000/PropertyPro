/**
 * Announcements table — community-scoped announcements for the resident portal.
 *
 * Supports pinning (pinned announcements appear first in the feed),
 * archiving (soft-hides from default view), and target audience filtering.
 *
 * Email delivery is handled separately in P1-17c.
 */
import {
  bigint,
  bigserial,
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

export const announcements = pgTable('announcements', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  /** Title displayed in the feed and notification subject */
  title: text('title').notNull(),
  /** Rich-text body content (stored as HTML) */
  body: text('body').notNull(),
  /** Target audience: all, owners_only, board_only, tenants_only */
  audience: text('audience').notNull().default('all'),
  /** When true, the announcement is pinned to the top of the feed */
  isPinned: boolean('is_pinned').notNull().default(false),
  /** When non-null, the announcement is archived and hidden from the default feed */
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  /** The user who published the announcement */
  publishedBy: uuid('published_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  /** When the announcement was published (allows scheduling) */
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

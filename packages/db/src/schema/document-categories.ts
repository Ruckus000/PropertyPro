/**
 * Document categories table — defines document classification per community.
 * System categories (is_system = true) cannot be deleted by users.
 */
import { bigint, bigserial, boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { communities } from './communities';

export const documentCategories = pgTable('document_categories', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  /** System categories can't be deleted by users */
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

/**
 * Units table — individual units/lots within a community.
 */
import { bigint, bigserial, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

export const units = pgTable('units', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  unitNumber: text('unit_number').notNull(),
  building: text('building'),
  floor: integer('floor'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

/**
 * Units table — individual units/lots within a community.
 * P2-38: Extended with apartment-specific metadata (bedrooms, bathrooms, sqft, rentAmount).
 */
import { bigint, bigserial, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
  /** P2-38: Apartment unit metadata */
  bedrooms: integer('bedrooms'),
  bathrooms: integer('bathrooms'),
  sqft: integer('sqft'),
  rentAmount: numeric('rent_amount', { precision: 10, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

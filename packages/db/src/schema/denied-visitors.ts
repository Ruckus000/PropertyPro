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

export const deniedVisitors = pgTable('denied_visitors', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  reason: text('reason').notNull(),
  deniedByUserId: uuid('denied_by_user_id')
    .references(() => users.id, { onDelete: 'set null' }),
  vehiclePlate: text('vehicle_plate'),
  isActive: boolean('is_active').notNull().default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

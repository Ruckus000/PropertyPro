import {
  bigint,
  bigserial,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { units } from './units';
import { users } from './users';

export const visitorLog = pgTable('visitor_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  visitorName: text('visitor_name').notNull(),
  purpose: text('purpose').notNull(),
  hostUnitId: bigint('host_unit_id', { mode: 'number' })
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  hostUserId: uuid('host_user_id').references(() => users.id, { onDelete: 'set null' }),
  expectedArrival: timestamp('expected_arrival', { withTimezone: true }).notNull(),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
  checkedOutAt: timestamp('checked_out_at', { withTimezone: true }),
  passCode: text('pass_code').notNull(),
  staffUserId: uuid('staff_user_id').references(() => users.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

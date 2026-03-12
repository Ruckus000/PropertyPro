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

export type PackageLogStatus = 'received' | 'notified' | 'picked_up';

export const packageLog = pgTable('package_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  unitId: bigint('unit_id', { mode: 'number' })
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  recipientName: text('recipient_name').notNull(),
  carrier: text('carrier').notNull(),
  trackingNumber: text('tracking_number'),
  status: text('status').$type<PackageLogStatus>().notNull().default('received'),
  receivedByStaffId: uuid('received_by_staff_id').references(() => users.id, { onDelete: 'set null' }),
  pickedUpAt: timestamp('picked_up_at', { withTimezone: true }),
  pickedUpByName: text('picked_up_by_name'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

import {
  bigint,
  bigserial,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { amenities } from './amenities';
import { communities } from './communities';
import { units } from './units';
import { users } from './users';

export type AmenityReservationStatus = 'confirmed' | 'cancelled';

export const amenityReservations = pgTable('amenity_reservations', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  amenityId: bigint('amenity_id', { mode: 'number' })
    .notNull()
    .references(() => amenities.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  unitId: bigint('unit_id', { mode: 'number' }).references(() => units.id, { onDelete: 'set null' }),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  status: text('status').$type<AmenityReservationStatus>().notNull().default('confirmed'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

import {
  bigint,
  bigserial,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';

export interface AmenityBookingRules {
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  advanceBookingDays?: number;
  blackoutDates?: string[];
}

export const amenities = pgTable('amenities', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  location: text('location'),
  capacity: integer('capacity'),
  isBookable: boolean('is_bookable').notNull().default(true),
  bookingRules: jsonb('booking_rules').$type<AmenityBookingRules>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

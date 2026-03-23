import { bigint, bigserial, boolean, integer, pgTable, timestamp, uuid, varchar, text } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { units } from './units';
import { users } from './users';

export const accessRequests = pgTable('access_requests', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' }).notNull().references(() => communities.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  unitId: bigint('unit_id', { mode: 'number' }).references(() => units.id, { onDelete: 'set null' }),
  claimedUnitNumber: varchar('claimed_unit_number', { length: 100 }),
  roleRequested: varchar('role_requested', { length: 20 }).notNull().default('resident'),
  isUnitOwner: boolean('is_unit_owner').notNull().default(false),
  status: varchar('status', { length: 20 }).notNull().default('pending_verification'),
  otpHash: varchar('otp_hash', { length: 255 }),
  otpExpiresAt: timestamp('otp_expires_at', { withTimezone: true }),
  otpAttempts: integer('otp_attempts').notNull().default(0),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  denialReason: text('denial_reason'),
  refCode: varchar('ref_code', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
// NOTE: Partial indexes (WHERE deleted_at IS NULL) and the unique partial index
// are defined in the migration SQL only. Drizzle's index() builder does not
// support WHERE clauses. The Drizzle schema omits these indexes — they are
// migration-managed.

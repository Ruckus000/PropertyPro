/**
 * Users table — mirrors Supabase auth.users.
 * id is UUID to match Supabase auth.users.id.
 */
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  /** UUID matching Supabase auth.users.id */
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  /** Phase 1B: When phone was verified via OTP (null = unverified) */
  phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
  avatarUrl: text('avatar_url'),
  /** Phase 1B: OTP rate-limiting — when last OTP was sent (cooldown check) */
  otpLastSentAt: timestamp('otp_last_sent_at', { withTimezone: true }),
  /** Phase 1B: OTP rate-limiting — consecutive failed verification attempts */
  otpFailedAttempts: integer('otp_failed_attempts').notNull().default(0),
  /** Phase 1B: OTP rate-limiting — lockout expiry after too many failed attempts */
  otpLockedUntil: timestamp('otp_locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

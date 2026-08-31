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
  /**
   * When this user accepted the Terms of Service, and WHICH version they accepted.
   *
   * Deliberately on `users` rather than per-flow: there are two entry points into
   * the product — self-signup (via `pending_signups`) and invitation acceptance
   * (via Supabase Auth) — and terms are a global agreement, not a per-community
   * one. Recording acceptance here is the only place both paths converge, and it
   * survives community deletion, which an invitation row does not.
   *
   * `termsVersion` matters because ToS §11 makes continued use acceptance of
   * revised terms; without it we can prove WHEN someone agreed but not WHAT they
   * agreed to. Nullable because users predating this column exist.
   * See docs/audits/2026-08-09-legal-risk-audit.md F-18.
   */
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
  termsVersion: text('terms_version'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

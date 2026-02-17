/**
 * Pending signups table.
 *
 * Stores pre-payment signup intent and checkout handoff context.
 * P2-33 boundary: this table captures intent only and must not provision
 * communities or role assignments.
 */
import {
  bigserial,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { communityTypeEnum } from './enums';

export const pendingSignups = pgTable(
  'pending_signups',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    signupRequestId: text('signup_request_id').notNull(),
    authUserId: uuid('auth_user_id'),
    primaryContactName: text('primary_contact_name').notNull(),
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    communityName: text('community_name').notNull(),
    address: text('address').notNull(),
    county: text('county').notNull(),
    unitCount: integer('unit_count').notNull(),
    communityType: communityTypeEnum('community_type').notNull(),
    planKey: text('plan_key').notNull(),
    candidateSlug: text('candidate_slug').notNull(),
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }).notNull(),
    verificationEmailSentAt: timestamp('verification_email_sent_at', { withTimezone: true }),
    verificationEmailId: text('verification_email_id'),
    status: text('status').notNull().default('pending_verification'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('pending_signups_signup_request_unique').on(table.signupRequestId),
    uniqueIndex('pending_signups_email_normalized_unique').on(table.emailNormalized),
    uniqueIndex('pending_signups_candidate_slug_unique').on(table.candidateSlug),
    index('pending_signups_status_idx').on(table.status, table.createdAt),
    index('pending_signups_auth_user_id_idx').on(table.authUserId),
    check('pending_signups_status_check', sql`${table.status} IN ('pending_verification','email_verified','checkout_started','payment_completed','provisioning','completed','expired')`),
  ],
);

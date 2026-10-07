/**
 * Owner consent to receive official association notices electronically
 * (§718.112(2)(d) for condominiums, §720.303 for HOAs).
 *
 * A record, not a switch: nothing reads this table to decide how a notice is
 * delivered. It exists so an association can show which owners consented, to
 * what wording, at which email address and when — and that an owner who
 * withdrew did so.
 *
 * Append-only history. Withdrawing stamps `revoked_at`; consenting again
 * inserts a new row, so every version of the wording an owner agreed to stays
 * on file. The partial unique index allows at most one active row per owner
 * per community.
 */
import { sql } from 'drizzle-orm';
import { bigint, bigserial, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

export const noticeConsent = pgTable(
  'notice_consent',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The exact wording shown, so a later edit to the copy cannot rewrite what was agreed. */
    consentText: text('consent_text').notNull(),
    consentVersion: text('consent_version').notNull(),
    /** The address the owner consented to receive notices at. */
    email: text('email').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    givenAt: timestamp('given_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('notice_consent_active_uq')
      .on(table.communityId, table.userId)
      .where(sql`${table.revokedAt} is null and ${table.deletedAt} is null`),
  ],
);

/**
 * Platform support inbox — conversation threads.
 *
 * One row per conversation with one external person on one mailbox
 * (`support@` / `privacy@` / `contact@getpropertypro.com`). Messages hang off
 * this row; see `support-inbox-messages.ts`.
 *
 * Platform-level, NOT tenant-scoped: whoever writes to `support@` is usually
 * not a member of any community — often not a user at all — so there is no
 * `community_id`, no write-scope trigger, and no way to express this as tenant
 * data. Access is limited to platform admins through the service-role client;
 * RLS denies anon/authenticated outright, following the `marketing_leads`
 * posture (ENABLE + FORCE, zero policies, REVOKE from anon/authenticated).
 *
 * The `mailbox` and `status` vocabularies are single-sourced in
 * `@propertypro/shared` (`packages/shared/src/support-inbox.ts`). The CHECK
 * constraints below are the unavoidable second copy — SQL cannot import
 * TypeScript — so changing either set means changing both.
 */
import { bigserial, check, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const supportInboxThreads = pgTable(
  'support_inbox_threads',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** Which published address this conversation arrived on. See SUPPORT_MAILBOXES. */
    mailbox: text('mailbox').notNull(),
    /** The subject as first seen, kept verbatim for display. */
    subject: text('subject').notNull(),
    /**
     * `subject` with `Re:`/`Fwd:`/`[EXTERNAL]` prefixes stripped, whitespace
     * collapsed and lowercased.
     *
     * Stored rather than computed at query time because it is a matching key:
     * when a reply arrives with no `In-Reply-To`/`References` headers — which
     * happens whenever someone forwards from a phone, or their client drops
     * them — this is one of the four columns that re-finds the thread. A
     * computed expression could not be compared without a functional index, and
     * the normalization rule lives in TypeScript, not SQL.
     */
    normalizedSubject: text('normalized_subject').notNull(),
    /** The external correspondent, lowercased. Half of the fallback match key. */
    participantEmail: text('participant_email').notNull(),
    participantName: text('participant_name'),
    /** Operator triage state. See SUPPORT_THREAD_STATUSES. */
    status: text('status').notNull().default('open'),
    firstMessageAt: timestamp('first_message_at', { withTimezone: true }).notNull(),
    /**
     * Timestamp of the newest message, inbound or outbound. The inbox list
     * sorts on this, so it is updated in the same transaction as every insert
     * rather than derived — a lagging value would silently reorder the queue.
     */
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull(),
    messageCount: integer('message_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** The inbox list: one mailbox, one status, newest first. */
    index('support_inbox_threads_mailbox_status_idx').on(
      table.mailbox,
      table.status,
      table.lastMessageAt.desc(),
    ),
    /**
     * "Everything from this person", and the seek that serves the fallback
     * thread match. Deliberately NOT a four-column composite covering the whole
     * heuristic: at launch volume this index narrows to a handful of rows and
     * the remaining predicates filter in memory. Add the wider index when a
     * measurement says to, not before.
     */
    index('support_inbox_threads_participant_idx').on(table.participantEmail),
    check(
      'support_inbox_threads_mailbox_check',
      sql`${table.mailbox} IN ('support','privacy','contact')`,
    ),
    check(
      'support_inbox_threads_status_check',
      sql`${table.status} IN ('open','pending','closed','spam')`,
    ),
    check('support_inbox_threads_message_count_check', sql`${table.messageCount} >= 0`),
  ],
);

export type SupportInboxThread = typeof supportInboxThreads.$inferSelect;
export type NewSupportInboxThread = typeof supportInboxThreads.$inferInsert;

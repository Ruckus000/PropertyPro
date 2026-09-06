/**
 * Platform support inbox — messages and internal notes.
 *
 * Three row shapes share this table, discriminated by `kind`/`direction`:
 *   - `kind='email'`, `direction='inbound'`  — received via the Forward Email webhook
 *   - `kind='email'`, `direction='outbound'` — a reply sent from the admin console
 *   - `kind='note'`,  `direction='internal'` — an operator's private note
 *
 * One table rather than a separate notes table, because the dominant read is a
 * single chronological thread timeline. Two tables would make that a UNION ALL
 * re-sorted on every render, and cursor pagination over a merged feed is the
 * case `.claude/rules/api-patterns.md` flags as hard-tier. One table is one
 * index scan on `(thread_id, id)`.
 *
 * The risk that buys — a private note accidentally emailed to the customer —
 * is closed by `support_inbox_messages_kind_shape_check` rather than by
 * convention: a `kind='note'` row structurally cannot carry `from_email`,
 * `to_emails` or an `rfc_message_id`, so there is no address for a sender to
 * use. The reply path additionally selects `WHERE kind = 'email'`.
 *
 * Platform-level, NOT tenant-scoped — see `support-inbox-threads.ts` for the
 * RLS posture and the shared-vocabulary note.
 */
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { supportInboxThreads } from './support-inbox-threads';

export const supportInboxMessages = pgTable(
  'support_inbox_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    threadId: bigint('thread_id', { mode: 'number' })
      .notNull()
      .references(() => supportInboxThreads.id, { onDelete: 'cascade' }),
    /** 'email' | 'note' — see the shape CHECK below. */
    kind: text('kind').notNull().default('email'),
    /** 'inbound' | 'outbound' | 'internal'. */
    direction: text('direction').notNull(),
    /**
     * The idempotency fence. UNIQUE, and the single most load-bearing
     * constraint in the feature: it is what makes a provider redelivery a
     * no-op.
     *
     * sha256 over NORMALIZED fields — mailbox, plus the RFC Message-ID when the
     * sender supplied one, else a digest of from/subject/date/body. Never over
     * the raw payload, so a provider that starts stamping a per-delivery
     * timestamp into its JSON does not silently start producing duplicates.
     *
     * Deliberately a separate column rather than `UNIQUE (rfc_message_id)`:
     * `Message-ID` is optional, Postgres treats NULLs as distinct in a unique
     * index, and a header-less message would therefore defeat that constraint
     * silently — precisely the messages most likely to be mis-threaded already.
     * Keeping the two apart also keeps the jobs apart: `rfc_message_id` exists
     * to thread, `dedupe_key` exists to deduplicate, and folding a synthetic id
     * into the former would make it visible to the threading lookup.
     */
    dedupeKey: text('dedupe_key').notNull(),
    /**
     * The sender's RFC 5322 `Message-ID`, angle brackets stripped. NULL on
     * outbound rows: Resend does not return the Message-ID it stamps, so we
     * cannot know our own. Threading survives that by matching on the
     * `References` chain instead — see `references_ids`.
     *
     * Never lowercased. RFC 5322 local parts are case-sensitive and folding
     * merges distinct ids.
     */
    rfcMessageId: text('rfc_message_id'),
    inReplyTo: text('in_reply_to'),
    /**
     * The full `References` chain, oldest first. An array rather than the
     * wire-format space-joined string because both readers treat it as a list:
     * ingestion scans it for a known ancestor, the reply builder appends to it.
     */
    referencesIds: text('references_ids').array(),
    /**
     * The literal address the provider matched, e.g. `hello@getpropertypro.com`.
     * Kept alongside the thread's `mailbox` so an alias stays distinguishable
     * without needing a mailbox of its own.
     */
    deliveredTo: text('delivered_to'),
    fromEmail: text('from_email'),
    fromName: text('from_name'),
    toEmails: text('to_emails').array(),
    ccEmails: text('cc_emails').array(),
    subject: text('subject'),
    textBody: text('text_body'),
    /**
     * The sender's HTML, stored RAW and UNSANITIZED.
     *
     * Sanitizing on the way in would destroy the only copy of what was actually
     * received; sanitizing is therefore the reader's job, every time
     * (`apps/admin/src/lib/server/sanitize-inbound-html.ts`), and this column
     * must never be interpolated into a page or an email.
     */
    htmlBody: text('html_body'),
    /** The `Date:` header when present — sender-controlled, so possibly absurd. */
    sentAt: timestamp('sent_at', { withTimezone: true }),
    /** When we accepted it. Trustworthy, unlike `sent_at`. */
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Whether the original carried attachments, inferred from a
     * `content-type: multipart/mixed` header line.
     *
     * The webhook URL sets `?attachments=false` so bodies never reach us — a
     * JSON-encoded Buffer inflates 4-6x and Vercel rejects request bodies over
     * 4.5 MB before the handler runs. This flag is what lets the thread say so
     * honestly instead of rendering a message that looks complete.
     */
    hasAttachments: boolean('has_attachments').notNull().default(false),
    /**
     * The provider payload, written ONLY when `normalization_status <> 'ok'`.
     *
     * This is the quarantine channel and the fixture-capture mechanism in one:
     * Forward Email's payload shape is documented thinly, so the first message
     * that fails to normalize lands here to be read out of Postgres and frozen
     * as a test fixture. Deliberately in the database and not in logs — it
     * holds third parties' email bodies.
     */
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>(),
    /** 'ok' | 'failed'. A 'failed' row is a quarantine record, not a message. */
    normalizationStatus: text('normalization_status').notNull().default('ok'),
    /** Resend's send id on outbound rows. Not an RFC Message-ID; support only. */
    providerMessageId: text('provider_message_id'),
    /** The platform admin who wrote a note or sent a reply. NULL on inbound. */
    authorUserId: uuid('author_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('support_inbox_messages_dedupe_key_key').on(table.dedupeKey),
    /** The thread timeline, in insertion order. */
    index('support_inbox_messages_thread_idx').on(table.threadId, table.id),
    /** The RFC threading lookup. Partial — most rows in a busy thread are ours. */
    index('support_inbox_messages_rfc_message_id_idx')
      .on(table.rfcMessageId)
      .where(sql`${table.rfcMessageId} IS NOT NULL`),
    /**
     * The whole notes invariant as one constraint. See the file docblock: this
     * is what makes "a private note cannot be emailed to the customer" a
     * property of the database rather than a promise about the code.
     */
    check(
      'support_inbox_messages_kind_shape_check',
      sql`(
        ${table.kind} = 'email'
        AND ${table.direction} IN ('inbound','outbound')
        AND ${table.fromEmail} IS NOT NULL
      ) OR (
        ${table.kind} = 'note'
        AND ${table.direction} = 'internal'
        AND ${table.fromEmail} IS NULL
        AND ${table.rfcMessageId} IS NULL
        AND ${table.toEmails} IS NULL
        AND ${table.authorUserId} IS NOT NULL
      )`,
    ),
    check(
      'support_inbox_messages_normalization_status_check',
      sql`${table.normalizationStatus} IN ('ok','failed')`,
    ),
    /** sha256 hex. A malformed key is a bug we want loud, not stored. */
    check(
      'support_inbox_messages_dedupe_key_check',
      sql`char_length(${table.dedupeKey}) = 64`,
    ),
  ],
);

export type SupportInboxMessage = typeof supportInboxMessages.$inferSelect;
export type NewSupportInboxMessage = typeof supportInboxMessages.$inferInsert;

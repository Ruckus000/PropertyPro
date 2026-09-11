/**
 * Platform support tickets — the operator work queue.
 *
 * One row per tracked piece of work. Distinct from `support_inbox_threads`,
 * which is a conversation with one external person: a thread is what someone
 * said, a ticket is what we are going to do. `thread_id` links the two when a
 * ticket was escalated out of mail, and is NULL for the many tickets nobody
 * wrote in about.
 *
 * Platform-level, NOT tenant-scoped — the same reason as the inbox, plus a
 * second one. `community_id` is nullable and is CONTEXT, not scope: a ticket
 * may be about a community, but the people who read and act on it are platform
 * admins with no membership in it, and plenty of tickets (a billing webhook
 * backlog, a broken deploy) belong to no community at all. Scoping the table on
 * that column would therefore hide rows from the only role allowed to see any
 * of them. `ON DELETE SET NULL` rather than `cascade` for the same reason: a
 * deleted community must not silently erase the record of work done about it.
 *
 * RLS posture is 0068's verbatim (which is 0053's, which is 0038's): enabled
 * and FORCEd, ZERO policies — the deny-everyone default — with REVOKE ALL from
 * anon/authenticated on both the table and its sequence and service_role
 * retaining CRUD. The only reader is apps/admin behind `requirePlatformAdmin`,
 * over the service-role client. The anon key ships in the browser bundle, and a
 * ticket description is free text an operator will paste customer details into,
 * so the REVOKE is not ceremony.
 *
 * The `priority`/`category`/`status` vocabularies are single-sourced in
 * `@propertypro/shared` (`packages/shared/src/support-tickets.ts`). The CHECK
 * constraints below are the unavoidable second copy — SQL cannot import
 * TypeScript — so changing either set means changing both.
 */
import {
  bigint,
  bigserial,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { communities } from './communities';
import { supportInboxThreads } from './support-inbox-threads';

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** One line, shown in the queue. Bounded by a CHECK — see below. */
    title: text('title').notNull(),
    description: text('description'),
    /** 'low' | 'medium' | 'high'. See SUPPORT_TICKET_PRIORITIES. */
    priority: text('priority').notNull().default('medium'),
    /** 'billing' | 'compliance' | 'site' | 'access' | 'other'. */
    category: text('category').notNull().default('other'),
    /** 'open' | 'waiting' | 'resolved'. See SUPPORT_TICKET_STATUSES. */
    status: text('status').notNull().default('open'),
    /**
     * The community this ticket is ABOUT, when there is one. Context, not
     * scope — see the file docblock. `set null` so deleting a community does
     * not erase the ticket that recorded what we did about it.
     */
    communityId: bigint('community_id', { mode: 'number' }).references(() => communities.id, {
      onDelete: 'set null',
    }),
    /**
     * The inbox thread this was escalated from, when it was. Nullable because
     * most tickets are opened by an operator noticing something, not by mail
     * arriving; `set null` because deleting a thread must not take the work
     * item with it.
     */
    threadId: bigint('thread_id', { mode: 'number' }).references(() => supportInboxThreads.id, {
      onDelete: 'set null',
    }),
    /**
     * A free-text pointer OUT of the platform — a Sentry issue short-id, a
     * Stripe dispute id, a GitHub PR. Deliberately untyped and unindexed: it is
     * for a human to paste and a human to read, and constraining it would mean
     * predicting every system we ever escalate into.
     */
    externalRef: text('external_ref'),
    /** The platform admin who owns it, or NULL for unassigned. */
    assigneeUserId: uuid('assignee_user_id'),
    /** The platform admin who opened it. NOT NULL — every ticket has an author. */
    createdBy: uuid('created_by').notNull(),
    /**
     * Stamped when `status` first becomes 'resolved'.
     *
     * Stored rather than derived from the event log because "how long was this
     * open" is a queue-level read, and reconstructing it would mean scanning
     * `support_ticket_events` for every row on the page.
     */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * The queue's only sort: open work first, most urgent, most recently
     * touched. `updated_at` descending is part of the index rather than a
     * re-sort because it is the tiebreaker on every page of the list.
     */
    index('support_tickets_status_priority_idx').on(
      table.status,
      table.priority,
      table.updatedAt.desc(),
    ),
    /**
     * "Does this thread already have a ticket?", asked once per thread render.
     * Partial — the great majority of tickets have no thread, and those rows
     * would be dead weight in it.
     */
    index('support_tickets_thread_idx')
      .on(table.threadId)
      .where(sql`${table.threadId} IS NOT NULL`),
    /** "Everything about this community." Partial for the same reason. */
    index('support_tickets_community_idx')
      .on(table.communityId)
      .where(sql`${table.communityId} IS NOT NULL`),
    check('support_tickets_priority_check', sql`${table.priority} IN ('low','medium','high')`),
    check(
      'support_tickets_category_check',
      sql`${table.category} IN ('billing','compliance','site','access','other')`,
    ),
    check('support_tickets_status_check', sql`${table.status} IN ('open','waiting','resolved')`),
    /**
     * A bound, not decoration. `title` is NOT NULL but an empty string
     * satisfies that, and a queue row with no title is unclickable and
     * unsearchable; the upper bound keeps one pasted stack trace from making
     * every row in the list 400px tall.
     */
    check('support_tickets_title_check', sql`char_length(${table.title}) BETWEEN 1 AND 200`),
  ],
);

export type SupportTicket = typeof supportTickets.$inferSelect;
export type NewSupportTicket = typeof supportTickets.$inferInsert;

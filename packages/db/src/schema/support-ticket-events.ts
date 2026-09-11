/**
 * Platform support tickets — the timeline.
 *
 * Append-only in intent: operator notes and machine-written state transitions
 * share one table so a ticket's history is a single index scan on
 * `(ticket_id, id)` rather than a UNION of a notes table and an audit table
 * re-sorted on every render. That is the same call `support_inbox_messages`
 * makes, for the same reason.
 *
 * `kind` discriminates, and the CHECK pins the closed set. `body` carries an
 * operator's prose on a `note`, and a short machine sentence on the transition
 * kinds ("open -> waiting"); it is nullable because `created` carries neither.
 *
 * `ON DELETE CASCADE` on `ticket_id` — unlike the ticket's own two nullable
 * FKs. An event has no meaning without the ticket it describes, so a deleted
 * ticket takes its timeline with it rather than leaving orphan rows that no
 * query can reach.
 *
 * `actor_user_id` is NOT NULL: every row here was caused by a platform admin,
 * including the machine-written ones, because nothing in this subsystem moves a
 * ticket without a person asking it to. If a cron ever does, that is a schema
 * change and a deliberate one, not a NULL slipped in.
 *
 * Platform-level, NOT tenant-scoped — see `support-tickets.ts` for the RLS
 * posture and the shared-vocabulary note.
 */
import { bigint, bigserial, check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { supportTickets } from './support-tickets';

export const supportTicketEvents = pgTable(
  'support_ticket_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ticketId: bigint('ticket_id', { mode: 'number' })
      .notNull()
      .references(() => supportTickets.id, { onDelete: 'cascade' }),
    /**
     * 'created' | 'note' | 'status_changed' | 'priority_changed' | 'assigned'
     * | 'linked'. See SUPPORT_TICKET_EVENT_KINDS.
     */
    kind: text('kind').notNull(),
    body: text('body'),
    /** The platform admin who caused this row. */
    actorUserId: uuid('actor_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** The timeline, in insertion order. The only read this table serves. */
    index('support_ticket_events_ticket_idx').on(table.ticketId, table.id),
    check(
      'support_ticket_events_kind_check',
      sql`${table.kind} IN ('created','note','status_changed','priority_changed','assigned','linked')`,
    ),
  ],
);

export type SupportTicketEvent = typeof supportTicketEvents.$inferSelect;
export type NewSupportTicketEvent = typeof supportTicketEvents.$inferInsert;

/**
 * Meetings table — stores community meetings with UTC timestamps.
 *
 * Meeting types are enforced at the application layer via Zod unions.
 * Dates are stored as UTC and displayed in the community timezone (AGENTS #16-19).
 */
import { bigserial, bigint, boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { communities } from './communities';

export const meetings = pgTable('meetings', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  /** Human-readable title, e.g., "February Board Meeting" */
  title: text('title').notNull(),
  /** Meeting type: board, annual, special, budget, committee */
  meetingType: text('meeting_type').notNull(),
  /** UTC start datetime */
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  /** Optional end datetime; consumers fall back to startsAt + 1hr when null. */
  endsAt: timestamp('ends_at', { withTimezone: true }),
  /** Location string (address or virtual link text) */
  location: text('location').notNull(),
  /**
   * The agenda, as plain text. §718.111(12)(g)2.m–n / §720.303(4)(b)1.l–m
   * require a meeting's agenda to be posted with its notice; the public
   * Meetings block shows it beside the meeting. Null when none was entered.
   */
  agenda: text('agenda'),
  /**
   * Whether the agenda shows on the PUBLIC association website. Default on,
   * because the statute posts it with the notice. A manager turns it off for a
   * meeting whose agenda must not be public (a closed session with the
   * association's attorney, a personnel matter). Signed-in members still see
   * it in the portal; the meeting itself stays listed either way.
   */
  agendaPublished: boolean('agenda_published').notNull().default(true),

  /** Optional metadata for operational workflows */
  noticePostedAt: timestamp('notice_posted_at', { withTimezone: true }),
  minutesApprovedAt: timestamp('minutes_approved_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

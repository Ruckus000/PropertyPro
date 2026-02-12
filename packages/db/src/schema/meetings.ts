/**
 * Meetings table — stores community meetings with UTC timestamps.
 *
 * Meeting types are enforced at the application layer via Zod unions.
 * Dates are stored as UTC and displayed in the community timezone (AGENTS #16-19).
 */
import { bigserial, bigint, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
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
  /** Location string (address or virtual link text) */
  location: text('location').notNull(),

  /** Optional metadata for operational workflows */
  noticePostedAt: timestamp('notice_posted_at', { withTimezone: true }),
  minutesApprovedAt: timestamp('minutes_approved_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});


/**
 * Scheduled community-site publishes — "go live at…".
 *
 * Half of launch blocker #7 (gap audit G-07). Meeting materials that must
 * appear a fixed number of days before a meeting depended on a person
 * remembering to press Publish at the right moment. Under §718 that is a
 * statutory clock resting on somebody's calendar.
 *
 * ── Why a table rather than a column on `communities` ──
 *
 * The cron's scan is CROSS-TENANT: it looks for every schedule anywhere that is
 * due, so its index must be status-and-time-first, not community-first. A
 * column on `communities` would make that a full scan of the tenant table, and
 * would leave nowhere to record what happened — which attempt failed, when it
 * ran, and why. A schedule that fires and fails silently would be worse than
 * no schedule at all, since the PM would believe their notice went out.
 *
 * ── Invariants worth knowing before you change this ──
 *
 * - `site_publish_schedules_one_pending_idx` (partial unique on community_id
 *   where status = 'pending') is what makes "the next scheduled publish"
 *   singular. A publish is atomic and community-wide, so two pending schedules
 *   for one community have no coherent meaning — the second would silently
 *   republish whatever the first left.
 * - `requested_by` is ON DELETE SET NULL, not restrict: a departing manager's
 *   account must not be undeletable because they once scheduled a publish, and
 *   the schedule itself is still valid work. The actor is preserved in the
 *   audit log regardless.
 * - `notify_summary` carries the resident-notification opt-in through the wait.
 *   Null means the scheduled publish is quiet — the same default as an
 *   immediate one.
 * - Status is text + CHECK, not a pgEnum, so the vocabulary can grow without an
 *   enum rebuild (same rationale as storm_damage_reports 0032 and
 *   community_export_jobs 0058).
 */
import {
  bigint,
  bigserial,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

export const sitePublishSchedules = pgTable(
  'site_publish_schedules',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /** The instant the publish should run. Compared against now() by the cron. */
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    /** Who scheduled it. Null once that account is deleted — see the note above. */
    requestedBy: uuid('requested_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    /**
     * pending | running | published | nothing_to_publish | canceled | failed
     *
     * `running` is the cron's atomic claim: the worker moves a row off
     * `pending` with a conditional UPDATE, so two overlapping ticks cannot both
     * publish the same schedule.
     */
    status: text('status').notNull().default('pending'),
    /**
     * The resident-notification summary to use when this fires, or null for a
     * quiet publish. Mirrors the immediate publish's opt-in.
     */
    notifySummary: text('notify_summary'),
    /** Incremented per attempt so a permanently failing schedule cannot loop. */
    attemptCount: integer('attempt_count').notNull().default(0),
    /** When the cron actually ran it, whatever the outcome. */
    executedAt: timestamp('executed_at', { withTimezone: true }),
    /** Why it failed, for the PM to read. Never a secret — see below. */
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // The cron's claim scan, cross-tenant: status first, then due time.
    index('site_publish_schedules_due_idx').on(table.status, table.scheduledFor),
    // The per-community read the editor does when it opens the publish sheet.
    index('site_publish_schedules_community_idx').on(table.communityId, table.status),
  ],
);

export type SitePublishSchedule = typeof sitePublishSchedules.$inferSelect;
export type NewSitePublishSchedule = typeof sitePublishSchedules.$inferInsert;

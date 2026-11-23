/**
 * Emergency broadcasts table — community-scoped emergency alert records.
 * Phase 1B: Emergency Notifications.
 *
 * Lifecycle: draft (POST) → confirmed (POST /send) → completed (all sends initiated)
 * Optional: canceled (POST /cancel within 10-second undo window)
 *
 * Scheduled ("send later") broadcasts carry `scheduledFor`. The
 * scheduled-emergency-broadcasts cron claims a due one (`sendClaimedAt`) and
 * sends it, or records why it did not (`sendOutcome`). A scheduled broadcast
 * can be canceled any time before its claim.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

export const emergencyBroadcasts = pgTable('emergency_broadcasts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),

  /** Alert title (shown in email subject + broadcast history) */
  title: text('title').notNull(),
  /** Full message body (used in email) */
  body: text('body').notNull(),
  /** SMS-optimized body (≤160 chars for single part) */
  smsBody: text('sms_body'),

  /** Severity level: emergency (red), urgent (orange), info (blue) */
  severity: text('severity').notNull().default('emergency'),
  /** Template key if created from a pre-built template, null if custom */
  templateKey: text('template_key'),
  /** Target audience: 'all' | 'owners_only' (v1.1: 'building:X' | 'floor:N') */
  targetAudience: text('target_audience').notNull().default('all'),
  /** Delivery channels selected: '{sms,email}' stored as comma-separated text */
  channels: text('channels').notNull().default('sms,email'),

  /** Aggregate delivery counts (updated by webhook handler) */
  recipientCount: integer('recipient_count').notNull().default(0),
  sentCount: integer('sent_count').notNull().default(0),
  deliveredCount: integer('delivered_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),

  /** Who initiated the broadcast */
  initiatedBy: uuid('initiated_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  /** When the broadcast was confirmed and sending started */
  initiatedAt: timestamp('initiated_at', { withTimezone: true }).notNull().defaultNow(),
  /** When all sends were initiated (not when all delivered — delivery is async) */
  completedAt: timestamp('completed_at', { withTimezone: true }),
  /** If admin canceled within the undo window */
  canceledAt: timestamp('canceled_at', { withTimezone: true }),

  /** Set means "send later at this time". Null for immediate alerts. */
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  /** Set by the cron's atomic claim. Null until then. */
  sendClaimedAt: timestamp('send_claimed_at', { withTimezone: true }),
  /** Null, or why a scheduled alert did not send: 'missed' | 'failed'. */
  sendOutcome: text('send_outcome'),
  /**
   * Short machine reason, one of a fixed list: 'late', 'community_deleted',
   * 'no_recipients', 'interrupted' or 'send_error'. Never an error's class
   * name or message, a message body or an address.
   */
  sendOutcomeReason: text('send_outcome_reason'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  check(
    'emergency_broadcasts_send_outcome_check',
    sql`${table.sendOutcome} IS NULL OR ${table.sendOutcome} IN ('missed', 'failed')`,
  ),
  // Serves the cron's cross-tenant scan for due, unclaimed scheduled alerts.
  index('emergency_broadcasts_scheduled_due_idx')
    .on(table.scheduledFor)
    .where(
      sql`${table.scheduledFor} IS NOT NULL AND ${table.sendClaimedAt} IS NULL AND ${table.canceledAt} IS NULL AND ${table.sendOutcome} IS NULL`,
    ),
]);

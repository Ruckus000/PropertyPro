/**
 * Emergency broadcasts table — community-scoped emergency alert records.
 * Phase 1B: Emergency Notifications.
 *
 * Lifecycle: draft (POST) → confirmed (POST /send) → completed (all sends initiated)
 * Optional: canceled (POST /cancel within 10-second undo window)
 */
import { bigint, bigserial, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

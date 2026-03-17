/**
 * Emergency broadcast recipients — per-recipient delivery tracking.
 * Phase 1B: Emergency Notifications.
 *
 * One row per recipient per broadcast. Tracks SMS and email delivery status
 * independently. SMS status updated via Twilio webhook callbacks.
 */
import { bigint, bigserial, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { emergencyBroadcasts } from './emergency-broadcasts';
import { users } from './users';

export const emergencyBroadcastRecipients = pgTable(
  'emergency_broadcast_recipients',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    broadcastId: bigint('broadcast_id', { mode: 'number' })
      .notNull()
      .references(() => emergencyBroadcasts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** Recipient contact info (snapshot at send time) */
    email: text('email'),
    phone: text('phone'),

    // ── SMS delivery tracking ──────────────────────────────────────────────
    /** SMS status: pending → queued → sent → delivered | failed | undelivered | skipped */
    smsStatus: text('sms_status').notNull().default('pending'),
    /** Twilio message SID (for status lookups and dedup) */
    smsProviderSid: text('sms_provider_sid'),
    /** Twilio error code if failed */
    smsErrorCode: text('sms_error_code'),
    /** Human-readable error message */
    smsErrorMessage: text('sms_error_message'),
    /** When SMS was accepted by Twilio */
    smsSentAt: timestamp('sms_sent_at', { withTimezone: true }),
    /** When SMS was confirmed delivered to handset */
    smsDeliveredAt: timestamp('sms_delivered_at', { withTimezone: true }),

    // ── Email delivery tracking ────────────────────────────────────────────
    /** Email status: pending → sent | failed | skipped */
    emailStatus: text('email_status').notNull().default('pending'),
    /** Resend message ID */
    emailProviderId: text('email_provider_id'),
    /** When email was sent */
    emailSentAt: timestamp('email_sent_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('emergency_broadcast_recipients_broadcast_user_unique').on(
      table.broadcastId,
      table.userId,
    ),
  ],
);

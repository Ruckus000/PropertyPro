/**
 * SMS service types.
 *
 * Provider-agnostic types for SMS sending and delivery tracking.
 * All phone numbers must be in E.164 format (+1XXXXXXXXXX).
 */

// ── Send types ──────────────────────────────────────────────────────────────

export interface SmsRecipient {
  /** User ID for linking back to the broadcast recipient row */
  userId: string;
  /** E.164 phone number */
  phone: string;
}

export interface SmsSendRequest {
  /** E.164 phone number */
  to: string;
  /** SMS body (≤160 chars for single part, ≤1600 chars multi-part) */
  body: string;
  /** Optional webhook URL for delivery status callbacks */
  statusCallbackUrl?: string;
}

export interface SmsSendResult {
  success: boolean;
  /** Provider message ID (e.g. Twilio SID) — null on failure */
  providerMessageId: string | null;
  /** Provider status string (e.g. 'queued', 'sent') */
  status: SmsDeliveryStatus;
  /** Error code from provider (null on success) */
  errorCode: string | null;
  /** Human-readable error message (null on success) */
  errorMessage: string | null;
}

export interface SmsBulkSendRequest {
  recipients: SmsRecipient[];
  body: string;
  statusCallbackUrl?: string;
}

export interface SmsBulkSendResult {
  /** Per-recipient results keyed by userId */
  results: Map<string, SmsSendResult>;
  /** Total successfully queued */
  successCount: number;
  /** Total failed */
  failureCount: number;
}

// ── Delivery status ─────────────────────────────────────────────────────────

/**
 * SMS delivery status lifecycle:
 *   pending → queued → sent → delivered
 *                           → failed
 *                           → undelivered
 *   skipped (no verified phone or no consent)
 */
export type SmsDeliveryStatus =
  | 'pending'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'undelivered'
  | 'skipped';

/**
 * Status progression order — used to ensure idempotent webhook updates
 * only advance status forward.
 */
export const SMS_STATUS_ORDER: Record<SmsDeliveryStatus, number> = {
  pending: 0,
  queued: 1,
  sent: 2,
  delivered: 3,
  failed: 3, // terminal — same rank as delivered
  undelivered: 3, // terminal — same rank as delivered
  skipped: -1, // outside normal lifecycle
};

/**
 * Returns true if transitioning from oldStatus to newStatus is a valid
 * forward progression (used for idempotent webhook processing).
 */
export function isStatusAdvancement(
  oldStatus: SmsDeliveryStatus,
  newStatus: SmsDeliveryStatus,
): boolean {
  return SMS_STATUS_ORDER[newStatus] > SMS_STATUS_ORDER[oldStatus];
}

// ── Webhook types ───────────────────────────────────────────────────────────

export interface SmsWebhookPayload {
  /** Provider message ID */
  providerMessageId: string;
  /** New delivery status */
  status: SmsDeliveryStatus;
  /** Error code (if failed) */
  errorCode?: string;
  /** Error message (if failed) */
  errorMessage?: string;
  /** Timestamp of status change */
  timestamp: Date;
}

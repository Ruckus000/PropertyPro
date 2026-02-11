/**
 * Audit Logger — logs compliance and security events.
 *
 * P1-27a stub: console.log only. P1-27b upgrades this to actual DB inserts.
 */

/** Widened action union covering generic CRUD, user lifecycle, meeting, and domain events. */
export type AuditAction =
  | 'create' | 'update' | 'delete'                             // Generic CRUD
  | 'user_invited' | 'settings_changed'                        // User lifecycle
  | 'meeting_notice_posted' | 'meeting_minutes_approved'       // Meeting events
  | 'announcement_email_sent' | 'document_deleted';            // Domain events

export interface AuditEventParams {
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  communityId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Log an audit event. Called from mutation handlers across the application.
 *
 * P1-27a: console-log stub only. P1-27b will upgrade to INSERT into compliance_audit_log.
 */
export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  // P1-27a stub: console.log only. P1-27b upgrades this to actual DB inserts.
  console.log('[AUDIT]', params);
}

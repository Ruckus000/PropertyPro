/**
 * Audit Logger — logs compliance and security events to compliance_audit_log.
 *
 * P1-27b: Upgraded from console.log stub to actual DB inserts.
 * Uses raw db directly (not scoped client) since communityId is explicitly provided.
 */

import { db } from '../drizzle';
import { complianceAuditLog } from '../schema/compliance-audit-log';

/** Widened action union covering generic CRUD, user lifecycle, meeting, and domain events. */
export type AuditAction =
  | 'create' | 'update' | 'delete'                             // Generic CRUD
  | 'user_invited' | 'settings_changed'                        // User lifecycle
  | 'meeting_notice_posted' | 'meeting_minutes_approved'       // Meeting events
  | 'announcement_email_sent' | 'document_deleted'             // Domain events
  | 'document_accessed';                                       // Read-path audit

export interface AuditEventParams {
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  communityId: number;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Log an audit event by INSERTing into compliance_audit_log.
 *
 * Called from mutation handlers across the application.
 * Throws on database error — callers should handle or let it propagate
 * so that unaudited mutations do not silently succeed.
 */
export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  await db.insert(complianceAuditLog).values({
    userId: params.userId,
    communityId: params.communityId,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    oldValues: params.oldValues ?? null,
    newValues: params.newValues ?? null,
    metadata: params.metadata ?? null,
  });
}

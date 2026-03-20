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
  | 'document_accessed' | 'validation_failed'                  // Read-path + validation audit
  | 'notification_sent'                                        // Email notification dispatch (P2-41)
  // E-sign audit actions — retained for native e-signature builder
  | 'esign_template_created' | 'esign_template_updated'        // E-sign template lifecycle
  | 'esign_template_archived' | 'esign_template_cloned'       // E-sign template actions
  | 'esign_submission_created' | 'esign_submission_completed'  // E-sign submission lifecycle
  | 'esign_submission_cancelled' | 'esign_reminder_sent'       // E-sign submission actions
  | 'esign_document_verified' | 'esign_consent_revoked'        // E-sign verification + consent
  // Emergency broadcast audit actions (Phase 1B)
  | 'emergency_broadcast_created' | 'emergency_broadcast_sent'  // Broadcast lifecycle
  | 'emergency_broadcast_canceled'                               // Broadcast cancellation
  // Election audit actions (Phase 1D)
  | 'election_created' | 'election_updated'                      // Election lifecycle
  | 'election_opened' | 'election_closed'                        // Election state transitions
  | 'election_certified' | 'election_canceled'                   // Election finalization
  | 'ballot_cast'                                                // Vote recorded
  | 'proxy_designated' | 'proxy_approved'                        // Proxy workflow
  | 'proxy_rejected' | 'proxy_revoked'                           // Proxy denial/revocation
  // FAQ & profile audit actions (Mobile Settings & Help)
  | 'faq.created' | 'faq.updated' | 'faq.deleted' | 'faq.reordered'
  | 'community.contact_updated' | 'profile.updated';

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
 *
 * @invariant Requires a privileged DB connection (postgres or service_role) to satisfy
 * the pp_audit_insert RLS policy, which blocks INSERT for authenticated-role connections.
 * This invariant is satisfied by the `db` instance (drizzle.ts), which connects via
 * DATABASE_URL as the postgres superuser. Do NOT call from a Supabase anon/authenticated
 * client — the INSERT will be blocked by RLS with no error surfaced to the caller.
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

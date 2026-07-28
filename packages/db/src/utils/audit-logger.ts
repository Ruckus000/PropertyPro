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
  | 'notification_delivery_partial'                            // Partial recipient delivery telemetry
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
  | 'election_candidate_added' | 'election_candidate_removed'    // Candidate lifecycle
  | 'election_eligibility_snapshotted'                            // Eligibility snapshot
  | 'ballot_cast'                                                // Vote recorded
  | 'proxy_designated' | 'proxy_approved'                        // Proxy workflow
  | 'proxy_rejected' | 'proxy_revoked'                           // Proxy denial/revocation
  // FAQ & profile audit actions (Mobile Settings & Help)
  | 'faq.created' | 'faq.updated' | 'faq.deleted' | 'faq.reordered'
  | 'community.contact_updated' | 'profile.updated'
  // Access request audit actions (self-service resident signup)
  | 'access_request.approved' | 'access_request.denied'
  // Community join request audit actions (self-service community linking)
  | 'join_request.approved' | 'join_request.denied'
  // Support access audit actions
  | 'support_session_started' | 'support_session_ended'
  | 'support_consent_granted' | 'support_consent_revoked'
  // Compliance checklist audit actions
  | 'link_document' | 'unlink_document'                          // Document linking
  | 'mark_not_applicable' | 'mark_applicable'                    // Applicability toggling
  // Custom domain audit actions
  | 'custom_domain_set' | 'custom_domain_verified' | 'custom_domain_removed'
  // Website editor v3 Phase 7 — the urgent notice banner. This is the one
  // write in the product that goes public with no review step, so who posted
  // what, and when it came down, is the only after-the-fact record there is.
  | 'urgent_notice_set' | 'urgent_notice_cleared'
  // Website editor v3 Phase 8 — site settings + footer. Two actions, not one,
  // because these are two different decisions with two different reviewers: SEO
  // is a marketing choice, while the footer's opt-in statutory records line is
  // one an association's counsel may need to account for.
  | 'site_settings_updated' | 'site_footer_updated'
  // Portfolio template audit actions
  | 'portfolio_template_created' | 'portfolio_template_renamed' | 'portfolio_template_deleted'
  | 'portfolio_template_applied'
  // Role-simplification (v3): root-offboarding flag (Phase 2a)
  | 'root_pending_deletion'
  // Role-simplification (v3): claim-root flow (Phase 2b)
  | 'root_claimed' | 'root_claim_disputed' | 'root_reassigned' | 'root_transferred'
  // Role-simplification (v3): role-management actions (Phase 2c)
  | 'role_assigned' | 'role_revoked' | 'designation_set' | 'designation_cleared';

export interface AuditEventParams {
  userId: string | null;
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

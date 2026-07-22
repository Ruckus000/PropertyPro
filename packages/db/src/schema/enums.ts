/**
 * PostgreSQL enum definitions for PropertyPro.
 *
 * Role model (v3 / ADR-006): community-scoped roles live in `userRoleV2Enum`
 * (`resident` / `property_manager` / `root_manager`), with board status carried
 * by an orthogonal `designation`. `platform_admin` is system-scoped (stored
 * separately in `platformAdminRoleEnum`, not in `user_roles`).
 *
 * The legacy 7-role `user_role` enum (ADR-001) was retired: dropped from prod in
 * the pre-squash role-simplification cleanup and removed from the schema here
 * (role-v3 R3-06). Migration 0031 drops it from any from-disk database so the
 * squashed baseline's `CREATE TYPE user_role` is reconciled with prod.
 */
import { pgEnum } from 'drizzle-orm/pg-core';

/** Community type: Florida condo (§718), HOA (§720), or apartment */
export const communityTypeEnum = pgEnum('community_type', [
  'condo_718',
  'hoa_720',
  'apartment',
]);

/** Contract lifecycle status for vendor contract tracking (P3-52). */
export const contractStatusEnum = pgEnum('contract_status', [
  'draft',
  'active',
  'expired',
  'terminated',
]);

/** Lease lifecycle status for apartment lease tracking (P2-37). */
export const leaseStatusEnum = pgEnum('lease_status', [
  'active',
  'expired',
  'renewed',
  'terminated',
]);

/** Maintenance request lifecycle status (P2-36, extended for P3-50 lifecycle). */
export const maintenanceStatusEnum = pgEnum('maintenance_status', [
  'open',
  'submitted',
  'acknowledged',
  'in_progress',
  'resolved',
  'closed',
]);

/** Maintenance request priority level (P2-36). */
export const maintenancePriorityEnum = pgEnum('maintenance_priority', [
  'low',
  'normal',
  'high',
  'urgent',
]);

/** PDF text extraction status for document records. */
export const extractionStatusEnum = pgEnum('extraction_status', [
  'pending',
  'completed',
  'failed',
  'not_applicable',
  'skipped',
]);

/** Document visibility/origin within the shared documents table. */
export const documentSourceTypeEnum = pgEnum('document_source_type', [
  'library',
  'violation_evidence',
  'authored',
]);

/**
 * Notification email delivery cadence.
 *
 * NOTE: notification_preferences.email_frequency was migrated to TEXT in 0008
 * (P1-26), but notification_digest_queue.frequency still uses this enum.
 * Do NOT drop this enum until the digest queue column is also migrated.
 */
export const emailFrequencyEnum = pgEnum('email_frequency', [
  'immediate',
  'daily_digest',
  'weekly_digest',
  'never',
]);

/**
 * Simplified community-scoped roles (v3 end state).
 * - resident: owner or tenant (distinguished by is_unit_owner flag)
 * - property_manager: v3 operational manager (assigned by root)
 * - root_manager: v3 root (≤1 per community, partial unique index)
 * Spec: docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md
 */
export const userRoleV2Enum = pgEnum('user_role_v2', [
  'resident',
  'property_manager',
  'root_manager',
]);

/** Platform admin role. Only 'super_admin' exists today; enum enforces type safety and makes future roles explicit. */
export const platformAdminRoleEnum = pgEnum('platform_admin_role', ['super_admin']);

/** Support access level for impersonation sessions. */
export const supportAccessLevelEnum = pgEnum('support_access_level', ['read_only', 'read_write']);

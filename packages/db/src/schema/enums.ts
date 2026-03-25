/**
 * PostgreSQL enum definitions for PropertyPro.
 *
 * Role model follows ADR-001 canonical role decisions:
 * - userRoleEnum contains 7 canonical community-scoped domain roles
 * - platform_admin is system-scoped (stored separately, not in user_roles)
 * - auditor excluded from v1 (deferred to v2 per ADR-001)
 * - One active canonical role per (user_id, community_id)
 */
import { pgEnum } from 'drizzle-orm/pg-core';

/** Community type: Florida condo (§718), HOA (§720), or apartment */
export const communityTypeEnum = pgEnum('community_type', [
  'condo_718',
  'hoa_720',
  'apartment',
]);

/**
 * Canonical community-scoped roles per ADR-001.
 * [AGENTS #2: roles are per-community, not global]
 *
 * Note: platform_admin is system-scoped (stored separately, not in user_roles).
 * Note: auditor excluded from v1, deferred to v2 per ADR-001.
 *
 * Community-type constraints (enforced at application layer):
 * - condo_718/hoa_720: owner, tenant, board_member, board_president, cam, property_manager_admin
 * - apartment: tenant, site_manager, property_manager_admin
 */
export const userRoleEnum = pgEnum('user_role', [
  'owner',
  'tenant',
  'board_member',
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
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
 * Simplified community-scoped roles (hybrid 4-role model).
 * - resident: owner or tenant (distinguished by is_unit_owner flag)
 * - manager: configurable permissions via JSONB (replaces board_member, board_president, cam, site_manager)
 * - pm_admin: property manager admin (full access)
 */
export const userRoleV2Enum = pgEnum('user_role_v2', [
  'resident',
  'manager',
  'pm_admin',
]);

/** Platform admin role. Only 'super_admin' exists today; enum enforces type safety and makes future roles explicit. */
export const platformAdminRoleEnum = pgEnum('platform_admin_role', ['super_admin']);

/** Support access level for impersonation sessions. */
export const supportAccessLevelEnum = pgEnum('support_access_level', ['read_only', 'read_write']);

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

/** Lease lifecycle status for apartment lease tracking (P2-37). */
export const leaseStatusEnum = pgEnum('lease_status', [
  'active',
  'expired',
  'renewed',
  'terminated',
]);

/** PDF text extraction status for document records. */
export const extractionStatusEnum = pgEnum('extraction_status', [
  'pending',
  'completed',
  'failed',
  'not_applicable',
  'skipped',
]);

/** Notification email delivery cadence. */
export const emailFrequencyEnum = pgEnum('email_frequency', [
  'immediate',
  'daily_digest',
  'weekly_digest',
  'never',
]);

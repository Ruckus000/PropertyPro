/**
 * Declarative RBAC matrix — canonical source of truth for P4-57.
 *
 * Defines which role can perform which action on which resource within a
 * given community type. This is a pure module — no I/O, no side effects.
 *
 * Policy decisions per ADR-001:
 * - meetings / compliance: condo/HOA only (apartment → false for all roles)
 * - audit write: always false (logAuditEvent() is internal-only)
 * - settings write: board_president and property_manager_admin only
 * - maintenance write: both residents (own requests) and admins (all requests)
 *   → both get `true` here; DB query scoping enforces data boundaries
 * - leases: NOT in this matrix (separate apartment feature gate)
 * - Invalid role/community combos (per ROLE_COMMUNITY_CONSTRAINTS): all false
 *   e.g. site_manager in condo_718, owner in apartment
 *
 * The `satisfies` operator on RBAC_MATRIX enforces exhaustiveness:
 * adding a new CommunityType, CommunityRole, RbacResource, or RbacAction
 * to the respective const arrays will cause a TypeScript compile error
 * until the matrix is updated.
 */

import type { CommunityRole, CommunityType } from './index';

// ---------------------------------------------------------------------------
// Resource and action enumerations
// ---------------------------------------------------------------------------

export const RBAC_RESOURCES = [
  'documents',
  'meetings',
  'announcements',
  'residents',
  'settings',
  'audit',
  'compliance',
  'maintenance',
  'contracts',
] as const;

export type RbacResource = (typeof RBAC_RESOURCES)[number];

export const RBAC_ACTIONS = ['read', 'write'] as const;
export type RbacAction = (typeof RBAC_ACTIONS)[number];

// ---------------------------------------------------------------------------
// Matrix type
// ---------------------------------------------------------------------------

type RbacMatrix = Record<
  CommunityType,
  Record<CommunityRole, Record<RbacResource, Record<RbacAction, boolean>>>
>;

// ---------------------------------------------------------------------------
// Canonical RBAC matrix
// ---------------------------------------------------------------------------

/**
 * RBAC_MATRIX[communityType][role][resource][action] → boolean
 *
 * false encodes both "no permission" and "invalid role/community combo".
 * hoa_720 is written explicitly (not referenced from condo_718) to allow
 * future policy divergence without structural refactoring.
 */
export const RBAC_MATRIX = {
  condo_718: {
    owner: {
      documents:     { read: true,  write: false },
      meetings:      { read: true,  write: false },
      announcements: { read: true,  write: false },
      residents:     { read: true,  write: false },
      settings:      { read: true,  write: false },
      audit:         { read: false, write: false },
      compliance:    { read: true,  write: false },
      maintenance:   { read: true,  write: true  },
      contracts:     { read: false, write: false },
    },
    tenant: {
      documents:     { read: true,  write: false },
      meetings:      { read: true,  write: false },
      announcements: { read: true,  write: false },
      residents:     { read: true,  write: false },
      settings:      { read: false, write: false },
      audit:         { read: false, write: false },
      compliance:    { read: false, write: false },
      maintenance:   { read: true,  write: true  },
      contracts:     { read: false, write: false },
    },
    board_member: {
      documents:     { read: true,  write: true  },
      meetings:      { read: true,  write: true  },
      announcements: { read: true,  write: true  },
      residents:     { read: true,  write: true  },
      settings:      { read: true,  write: false },
      audit:         { read: true,  write: false },
      compliance:    { read: true,  write: true  },
      maintenance:   { read: true,  write: true  },
      contracts:     { read: true,  write: true  },
    },
    board_president: {
      documents:     { read: true,  write: true  },
      meetings:      { read: true,  write: true  },
      announcements: { read: true,  write: true  },
      residents:     { read: true,  write: true  },
      settings:      { read: true,  write: true  },
      audit:         { read: true,  write: false },
      compliance:    { read: true,  write: true  },
      maintenance:   { read: true,  write: true  },
      contracts:     { read: true,  write: true  },
    },
    cam: {
      documents:     { read: true,  write: true  },
      meetings:      { read: true,  write: true  },
      announcements: { read: true,  write: true  },
      residents:     { read: true,  write: true  },
      settings:      { read: true,  write: false },
      audit:         { read: true,  write: false },
      compliance:    { read: true,  write: true  },
      maintenance:   { read: true,  write: true  },
      contracts:     { read: true,  write: true  },
    },
    // site_manager is not a valid role for condo_718 per ADR-001
    // ROLE_COMMUNITY_CONSTRAINTS — all false to prevent any access
    site_manager: {
      documents:     { read: false, write: false },
      meetings:      { read: false, write: false },
      announcements: { read: false, write: false },
      residents:     { read: false, write: false },
      settings:      { read: false, write: false },
      audit:         { read: false, write: false },
      compliance:    { read: false, write: false },
      maintenance:   { read: false, write: false },
      contracts:     { read: false, write: false },
    },
    property_manager_admin: {
      documents:     { read: true,  write: true  },
      meetings:      { read: true,  write: true  },
      announcements: { read: true,  write: true  },
      residents:     { read: true,  write: true  },
      settings:      { read: true,  write: true  },
      audit:         { read: true,  write: false },
      compliance:    { read: true,  write: true  },
      maintenance:   { read: true,  write: true  },
      contracts:     { read: true,  write: true  },
    },
  },

  // hoa_720 has the same role set and policy as condo_718.
  // Written as a distinct entry to allow future divergence.
  hoa_720: {
    owner: {
      documents:     { read: true,  write: false },
      meetings:      { read: true,  write: false },
      announcements: { read: true,  write: false },
      residents:     { read: true,  write: false },
      settings:      { read: true,  write: false },
      audit:         { read: false, write: false },
      compliance:    { read: true,  write: false },
      maintenance:   { read: true,  write: true  },
      contracts:     { read: false, write: false },
    },
    tenant: {
      documents:     { read: true,  write: false },
      meetings:      { read: true,  write: false },
      announcements: { read: true,  write: false },
      residents:     { read: true,  write: false },
      settings:      { read: false, write: false },
      audit:         { read: false, write: false },
      compliance:    { read: false, write: false },
      maintenance:   { read: true,  write: true  },
      contracts:     { read: false, write: false },
    },
    board_member: {
      documents:     { read: true,  write: true  },
      meetings:      { read: true,  write: true  },
      announcements: { read: true,  write: true  },
      residents:     { read: true,  write: true  },
      settings:      { read: true,  write: false },
      audit:         { read: true,  write: false },
      compliance:    { read: true,  write: true  },
      maintenance:   { read: true,  write: true  },
      contracts:     { read: true,  write: true  },
    },
    board_president: {
      documents:     { read: true,  write: true  },
      meetings:      { read: true,  write: true  },
      announcements: { read: true,  write: true  },
      residents:     { read: true,  write: true  },
      settings:      { read: true,  write: true  },
      audit:         { read: true,  write: false },
      compliance:    { read: true,  write: true  },
      maintenance:   { read: true,  write: true  },
      contracts:     { read: true,  write: true  },
    },
    cam: {
      documents:     { read: true,  write: true  },
      meetings:      { read: true,  write: true  },
      announcements: { read: true,  write: true  },
      residents:     { read: true,  write: true  },
      settings:      { read: true,  write: false },
      audit:         { read: true,  write: false },
      compliance:    { read: true,  write: true  },
      maintenance:   { read: true,  write: true  },
      contracts:     { read: true,  write: true  },
    },
    // site_manager is not a valid role for hoa_720 per ADR-001
    site_manager: {
      documents:     { read: false, write: false },
      meetings:      { read: false, write: false },
      announcements: { read: false, write: false },
      residents:     { read: false, write: false },
      settings:      { read: false, write: false },
      audit:         { read: false, write: false },
      compliance:    { read: false, write: false },
      maintenance:   { read: false, write: false },
      contracts:     { read: false, write: false },
    },
    property_manager_admin: {
      documents:     { read: true,  write: true  },
      meetings:      { read: true,  write: true  },
      announcements: { read: true,  write: true  },
      residents:     { read: true,  write: true  },
      settings:      { read: true,  write: true  },
      audit:         { read: true,  write: false },
      compliance:    { read: true,  write: true  },
      maintenance:   { read: true,  write: true  },
      contracts:     { read: true,  write: true  },
    },
  },

  apartment: {
    // owner is not a valid role for apartment per ADR-001
    owner: {
      documents:     { read: false, write: false },
      meetings:      { read: false, write: false },
      announcements: { read: false, write: false },
      residents:     { read: false, write: false },
      settings:      { read: false, write: false },
      audit:         { read: false, write: false },
      compliance:    { read: false, write: false },
      maintenance:   { read: false, write: false },
      contracts:     { read: false, write: false },
    },
    tenant: {
      documents:     { read: true,  write: false },
      meetings:      { read: false, write: false }, // apartments have no meetings
      announcements: { read: true,  write: false },
      residents:     { read: false, write: false },
      settings:      { read: false, write: false },
      audit:         { read: false, write: false },
      compliance:    { read: false, write: false }, // apartments have no compliance
      maintenance:   { read: true,  write: true  },
      contracts:     { read: false, write: false },
    },
    // board_member is not a valid role for apartment per ADR-001
    board_member: {
      documents:     { read: false, write: false },
      meetings:      { read: false, write: false },
      announcements: { read: false, write: false },
      residents:     { read: false, write: false },
      settings:      { read: false, write: false },
      audit:         { read: false, write: false },
      compliance:    { read: false, write: false },
      maintenance:   { read: false, write: false },
      contracts:     { read: false, write: false },
    },
    // board_president is not a valid role for apartment per ADR-001
    board_president: {
      documents:     { read: false, write: false },
      meetings:      { read: false, write: false },
      announcements: { read: false, write: false },
      residents:     { read: false, write: false },
      settings:      { read: false, write: false },
      audit:         { read: false, write: false },
      compliance:    { read: false, write: false },
      maintenance:   { read: false, write: false },
      contracts:     { read: false, write: false },
    },
    // cam is not a valid role for apartment per ADR-001
    cam: {
      documents:     { read: false, write: false },
      meetings:      { read: false, write: false },
      announcements: { read: false, write: false },
      residents:     { read: false, write: false },
      settings:      { read: false, write: false },
      audit:         { read: false, write: false },
      compliance:    { read: false, write: false },
      maintenance:   { read: false, write: false },
      contracts:     { read: false, write: false },
    },
    site_manager: {
      documents:     { read: true,  write: true  },
      meetings:      { read: false, write: false }, // apartments have no meetings
      announcements: { read: true,  write: true  },
      residents:     { read: true,  write: true  },
      settings:      { read: true,  write: false },
      audit:         { read: true,  write: false },
      compliance:    { read: false, write: false }, // apartments have no compliance
      maintenance:   { read: true,  write: true  },
      contracts:     { read: true,  write: true  },
    },
    property_manager_admin: {
      documents:     { read: true,  write: true  },
      meetings:      { read: false, write: false }, // apartments have no meetings
      announcements: { read: true,  write: true  },
      residents:     { read: true,  write: true  },
      settings:      { read: true,  write: true  },
      audit:         { read: true,  write: false },
      compliance:    { read: false, write: false }, // apartments have no compliance
      maintenance:   { read: true,  write: true  },
      contracts:     { read: true,  write: true  },
    },
  },
} as const satisfies RbacMatrix;

// ---------------------------------------------------------------------------
// checkPermission — pure policy query
// ---------------------------------------------------------------------------

/**
 * Returns true when the given role is permitted to perform the action
 * on the resource within the given community type.
 *
 * Returns false for invalid role/communityType combinations per ADR-001
 * ROLE_COMMUNITY_CONSTRAINTS (e.g. site_manager in condo_718).
 *
 * This is a pure function — no I/O, no side effects.
 */
export function checkPermission(
  role: CommunityRole,
  communityType: CommunityType,
  resource: RbacResource,
  action: RbacAction,
): boolean {
  return RBAC_MATRIX[communityType][role][resource][action];
}

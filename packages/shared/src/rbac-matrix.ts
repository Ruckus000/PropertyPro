/**
 * Declarative RBAC matrix — role × community_type × resource × action.
 *
 * Source of truth for authorization expectations across the platform.
 * Route handlers enforce these rules via inline checks; this matrix
 * codifies the expected behaviour so test suites can verify alignment.
 *
 * Complements (does not replace) the document-category sub-matrix in
 * access-policies.ts which governs per-category document visibility.
 *
 * ADR-001 aligned: 7 canonical roles, 3 community types.
 */

import {
  COMMUNITY_TYPES,
  COMMUNITY_ROLES,
  ROLE_COMMUNITY_CONSTRAINTS,
  type CommunityRole,
  type CommunityType,
} from './roles';

// ---------------------------------------------------------------------------
// Resource enum
// ---------------------------------------------------------------------------

export const RBAC_RESOURCES = [
  'documents',
  'meetings',
  'announcements',
  'residents',
  'audit_trail',
  'compliance',
  'contracts',
  'maintenance',
  'leases',
  'settings',
] as const;

export type RbacResource = (typeof RBAC_RESOURCES)[number];

// ---------------------------------------------------------------------------
// Access levels
// ---------------------------------------------------------------------------

/**
 * - 'none'  — no access
 * - 'read'  — can read (all records in scope)
 * - 'write' — can read and write (all records in scope)
 * - 'own'   — can read/write own records only (e.g. maintenance for residents)
 */
export type AccessLevel = 'none' | 'read' | 'write' | 'own';

// ---------------------------------------------------------------------------
// Matrix type
// ---------------------------------------------------------------------------

export type ResourceAccessMap = Record<RbacResource, AccessLevel>;
export type RoleAccessMap = Record<CommunityRole, ResourceAccessMap>;
export type RbacMatrix = Record<CommunityType, RoleAccessMap>;

// ---------------------------------------------------------------------------
// Admin / elevated role sets (canonical, matches route handler patterns)
// ---------------------------------------------------------------------------

/** Roles that get admin-level access to management endpoints (contracts, audit trail, etc.) */
export const ADMIN_ROLES: ReadonlySet<CommunityRole> = new Set([
  'board_member',
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
]);

/** Roles that get elevated document access (all categories + write) */
export const ELEVATED_DOCUMENT_ROLES: ReadonlySet<CommunityRole> = new Set([
  'owner',
  'board_member',
  'board_president',
  'property_manager_admin',
]);

/** Resident roles (own-resource scoping for maintenance, etc.) */
export const RESIDENT_ROLES: ReadonlySet<CommunityRole> = new Set([
  'owner',
  'tenant',
]);

// ---------------------------------------------------------------------------
// Access-level helper (no access for disallowed role/community combos)
// ---------------------------------------------------------------------------

const NONE_ACCESS: ResourceAccessMap = {
  documents: 'none',
  meetings: 'none',
  announcements: 'none',
  residents: 'none',
  audit_trail: 'none',
  compliance: 'none',
  contracts: 'none',
  maintenance: 'none',
  leases: 'none',
  settings: 'none',
};

// ---------------------------------------------------------------------------
// Per-role access builders
// ---------------------------------------------------------------------------

/**
 * Build access map for a valid role in a condo_718 or hoa_720 community.
 * Meetings, compliance, and contracts are enabled. Leases are disabled.
 */
function condoHoaAccess(role: CommunityRole): ResourceAccessMap {
  const isAdmin = ADMIN_ROLES.has(role);
  const isElevatedDoc = ELEVATED_DOCUMENT_ROLES.has(role);
  const isResident = RESIDENT_ROLES.has(role);

  return {
    documents: isElevatedDoc ? 'write' : 'read',
    meetings: 'write', // all condo/hoa members can manage meetings
    announcements: 'write', // all members can manage announcements
    residents: 'write', // all members can manage residents
    audit_trail: isAdmin ? 'read' : 'none',
    compliance: 'write', // all members can access compliance
    contracts: isAdmin ? 'write' : 'none',
    maintenance: isAdmin ? 'write' : isResident ? 'own' : 'none',
    leases: 'none', // leases are apartment-only
    settings: isAdmin ? 'write' : 'none',
  };
}

/**
 * Build access map for a valid role in an apartment community.
 * Leases are enabled. Meetings (blocked by route), compliance, and contracts are disabled.
 */
function apartmentAccess(role: CommunityRole): ResourceAccessMap {
  const isAdmin = ADMIN_ROLES.has(role);
  const isElevatedDoc = ELEVATED_DOCUMENT_ROLES.has(role);
  const isResident = RESIDENT_ROLES.has(role);

  return {
    documents: isElevatedDoc ? 'write' : 'read',
    meetings: 'none', // meetings route blocks apartment community type
    announcements: 'write',
    residents: 'write',
    audit_trail: isAdmin ? 'read' : 'none',
    compliance: 'none', // compliance is condo/hoa only
    contracts: 'none', // contracts is condo/hoa only
    maintenance: isAdmin ? 'write' : isResident ? 'own' : 'none',
    leases: 'write', // all apartment members can manage leases
    settings: isAdmin ? 'write' : 'none',
  };
}

// ---------------------------------------------------------------------------
// Build the complete matrix
// ---------------------------------------------------------------------------

function buildMatrix(): RbacMatrix {
  const matrix = {} as Record<CommunityType, RoleAccessMap>;

  for (const communityType of COMMUNITY_TYPES) {
    const roleMap = {} as Record<CommunityRole, ResourceAccessMap>;
    const allowedRoles = ROLE_COMMUNITY_CONSTRAINTS[communityType];

    for (const role of COMMUNITY_ROLES) {
      if (!allowedRoles.includes(role)) {
        roleMap[role] = { ...NONE_ACCESS };
      } else if (communityType === 'apartment') {
        roleMap[role] = apartmentAccess(role);
      } else {
        roleMap[role] = condoHoaAccess(role);
      }
    }

    matrix[communityType] = roleMap;
  }

  return matrix;
}

/**
 * The declarative RBAC matrix — single source of truth.
 *
 * Indexed as: RBAC_MATRIX[communityType][role][resource] → AccessLevel
 */
export const RBAC_MATRIX: RbacMatrix = buildMatrix();

// ---------------------------------------------------------------------------
// Checker functions
// ---------------------------------------------------------------------------

/**
 * Get the access level for a role in a community type for a specific resource.
 */
export function getAccessLevel(
  role: CommunityRole,
  communityType: CommunityType,
  resource: RbacResource,
): AccessLevel {
  return RBAC_MATRIX[communityType][role][resource];
}

/**
 * Check whether a role in a community type can perform an action on a resource.
 *
 * - 'read'  succeeds if access is 'read', 'write', or 'own'
 * - 'write' succeeds if access is 'write' or 'own'
 */
export function canAccessResource(
  role: CommunityRole,
  communityType: CommunityType,
  resource: RbacResource,
  action: 'read' | 'write',
): boolean {
  const level = getAccessLevel(role, communityType, resource);
  if (level === 'none') return false;
  if (action === 'read') return true; // read/write/own all grant read
  // action === 'write'
  return level === 'write' || level === 'own';
}

/**
 * Check whether a role is valid for a community type per ADR-001 constraints.
 */
export function isRoleValidForCommunity(
  role: CommunityRole,
  communityType: CommunityType,
): boolean {
  return ROLE_COMMUNITY_CONSTRAINTS[communityType].includes(role);
}

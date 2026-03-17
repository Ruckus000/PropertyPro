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

import type { CommunityRole, CommunityType, NewCommunityRole } from './index';
import type { ManagerPermissions } from './manager-permissions';

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
  'finances',
  'violations',
  'arc_submissions',
  'polls',
  'work_orders',
  'amenities',
  'packages',
  'visitors',
  'calendar_sync',
  'accounting',
  'esign',
  'emergency_broadcasts',
  'elections',
] as const;

export type RbacResource = (typeof RBAC_RESOURCES)[number];

export const RBAC_ACTIONS = ['read', 'write'] as const;
export type RbacAction = (typeof RBAC_ACTIONS)[number];

const LEGACY_RBAC_RESOURCES = [
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
type LegacyRbacResource = (typeof LEGACY_RBAC_RESOURCES)[number];

const PHASE5_DEFAULT_RESOURCES = [
  'finances',
  'violations',
  'arc_submissions',
  'polls',
  'work_orders',
  'amenities',
  'packages',
  'visitors',
  'calendar_sync',
  'accounting',
  'esign',
  'emergency_broadcasts',
  'elections',
] as const;
type Phase5Resource = (typeof PHASE5_DEFAULT_RESOURCES)[number];

// ---------------------------------------------------------------------------
// Matrix type
// ---------------------------------------------------------------------------

type RbacCell = Record<RbacAction, boolean>;

type RbacMatrix = Record<
  CommunityType,
  Record<CommunityRole, Record<RbacResource, RbacCell>>
>;

type BaseRbacMatrix = Record<
  CommunityType,
  Record<CommunityRole, Record<LegacyRbacResource, RbacCell>>
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
/**
 * Shared base policy for condo_718 and hoa_720.
 * Both community types have identical RBAC policies (verified cell-by-cell).
 * Defined once here and referenced by both entries to eliminate duplication.
 * If policies need to diverge in the future, clone this into separate objects.
 */
const CONDO_HOA_BASE_POLICY: Record<CommunityRole, Record<LegacyRbacResource, RbacCell>> = {
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
  // site_manager is not a valid role for condo/hoa per ADR-001
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
};

const BASE_RBAC_MATRIX = {
  condo_718: CONDO_HOA_BASE_POLICY,
  hoa_720: CONDO_HOA_BASE_POLICY,
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
} as const satisfies BaseRbacMatrix;

// ---------------------------------------------------------------------------
// Phase 5 resource policies — single table-driven structure
// ---------------------------------------------------------------------------

interface Phase5PolicyEntry {
  policy: Record<CommunityRole, RbacCell>;
  /** Community types where this resource is excluded (defaults to no exclusions). */
  excludedCommunityTypes?: readonly CommunityType[];
}

/**
 * All Phase 5 resource RBAC policies in one table. Each entry maps every
 * role to {read, write} and optionally excludes certain community types
 * (e.g. violations/arc_submissions are not available for apartments).
 *
 * E-sign note: read=true for all roles (own vs all scoping is enforced at
 * the query layer); write=true only for elevated roles.
 */
const PHASE5_POLICIES: Record<Phase5Resource, Phase5PolicyEntry> = {
  finances: {
    policy: {
      owner:                  { read: true,  write: true  },
      tenant:                 { read: false, write: false },
      board_member:           { read: true,  write: false },
      board_president:        { read: true,  write: true  },
      cam:                    { read: true,  write: true  },
      site_manager:           { read: true,  write: true  },
      property_manager_admin: { read: true,  write: true  },
    },
  },
  violations: {
    policy: {
      owner:                  { read: true,  write: true  },
      tenant:                 { read: true,  write: true  },
      board_member:           { read: true,  write: true  },
      board_president:        { read: true,  write: true  },
      cam:                    { read: true,  write: true  },
      site_manager:           { read: true,  write: true  },
      property_manager_admin: { read: true,  write: true  },
    },
    excludedCommunityTypes: ['apartment'],
  },
  arc_submissions: {
    policy: {
      owner:                  { read: true,  write: true  },
      tenant:                 { read: true,  write: true  },
      board_member:           { read: true,  write: false },
      board_president:        { read: true,  write: true  },
      cam:                    { read: true,  write: true  },
      site_manager:           { read: true,  write: true  },
      property_manager_admin: { read: true,  write: true  },
    },
    excludedCommunityTypes: ['apartment'],
  },
  polls: {
    policy: {
      owner:                  { read: true,  write: true  },
      tenant:                 { read: true,  write: true  },
      board_member:           { read: true,  write: true  },
      board_president:        { read: true,  write: true  },
      cam:                    { read: true,  write: true  },
      site_manager:           { read: true,  write: true  },
      property_manager_admin: { read: true,  write: true  },
    },
  },
  work_orders: {
    policy: {
      owner:                  { read: true,  write: false },
      tenant:                 { read: true,  write: false },
      board_member:           { read: true,  write: true  },
      board_president:        { read: true,  write: true  },
      cam:                    { read: true,  write: true  },
      site_manager:           { read: true,  write: true  },
      property_manager_admin: { read: true,  write: true  },
    },
  },
  amenities: {
    policy: {
      owner:                  { read: true,  write: true  },
      tenant:                 { read: true,  write: true  },
      board_member:           { read: true,  write: false },
      board_president:        { read: true,  write: true  },
      cam:                    { read: true,  write: true  },
      site_manager:           { read: true,  write: true  },
      property_manager_admin: { read: true,  write: true  },
    },
  },
  packages: {
    policy: {
      owner:                  { read: true,  write: false },
      tenant:                 { read: true,  write: false },
      board_member:           { read: false, write: false },
      board_president:        { read: true,  write: true  },
      cam:                    { read: true,  write: true  },
      site_manager:           { read: true,  write: true  },
      property_manager_admin: { read: true,  write: true  },
    },
  },
  visitors: {
    policy: {
      owner:                  { read: true,  write: true  },
      tenant:                 { read: true,  write: true  },
      board_member:           { read: false, write: false },
      board_president:        { read: true,  write: true  },
      cam:                    { read: true,  write: true  },
      site_manager:           { read: true,  write: true  },
      property_manager_admin: { read: true,  write: true  },
    },
  },
  calendar_sync: {
    policy: {
      owner:                  { read: false, write: false },
      tenant:                 { read: false, write: false },
      board_member:           { read: false, write: false },
      board_president:        { read: true,  write: true  },
      cam:                    { read: true,  write: true  },
      site_manager:           { read: true,  write: true  },
      property_manager_admin: { read: true,  write: true  },
    },
  },
  accounting: {
    policy: {
      owner:                  { read: false, write: false },
      tenant:                 { read: false, write: false },
      board_member:           { read: false, write: false },
      board_president:        { read: false, write: false },
      cam:                    { read: true,  write: true  },
      site_manager:           { read: true,  write: true  },
      property_manager_admin: { read: true,  write: true  },
    },
  },
  esign: {
    policy: {
      owner:                  { read: true,  write: false },
      tenant:                 { read: true,  write: false },
      board_member:           { read: true,  write: true  },
      board_president:        { read: true,  write: true  },
      cam:                    { read: true,  write: true  },
      site_manager:           { read: true,  write: true  },
      property_manager_admin: { read: true,  write: true  },
    },
  },
  emergency_broadcasts: {
    policy: {
      owner:                  { read: true,  write: false },
      tenant:                 { read: true,  write: false },
      board_member:           { read: true,  write: true  },
      board_president:        { read: true,  write: true  },
      cam:                    { read: true,  write: true  },
      site_manager:           { read: true,  write: true  },
      property_manager_admin: { read: true,  write: true  },
    },
  },
  elections: {
    policy: {
      owner:                  { read: true,  write: true  },
      tenant:                 { read: false, write: false },
      board_member:           { read: true,  write: true  },
      board_president:        { read: true,  write: true  },
      cam:                    { read: true,  write: true  },
      site_manager:           { read: false, write: false },
      property_manager_admin: { read: true,  write: true  },
    },
    excludedCommunityTypes: ['apartment'],
  },
};

const PHASE5_DENY: RbacCell = { read: false, write: false };

const ROLE_CONSTRAINTS: Record<CommunityType, readonly CommunityRole[]> = {
  condo_718: ['owner', 'tenant', 'board_member', 'board_president', 'cam', 'property_manager_admin'],
  hoa_720: ['owner', 'tenant', 'board_member', 'board_president', 'cam', 'property_manager_admin'],
  apartment: ['tenant', 'site_manager', 'property_manager_admin'],
};

function withPhase5Defaults(
  communityType: CommunityType,
  role: CommunityRole,
  permissions: Record<LegacyRbacResource, RbacCell>,
): Record<RbacResource, RbacCell> {
  const allowedRoles = ROLE_CONSTRAINTS[communityType];
  const roleAllowed = allowedRoles.includes(role);

  const phase5: Record<string, RbacCell> = {};
  for (const [resource, entry] of Object.entries(PHASE5_POLICIES) as [Phase5Resource, Phase5PolicyEntry][]) {
    if (!roleAllowed || entry.excludedCommunityTypes?.includes(communityType)) {
      phase5[resource] = PHASE5_DENY;
    } else {
      phase5[resource] = entry.policy[role];
    }
  }

  return {
    ...permissions,
    ...phase5,
  } as Record<RbacResource, RbacCell>;
}

export const RBAC_MATRIX: RbacMatrix = {
  condo_718: {
    owner: withPhase5Defaults('condo_718', 'owner', BASE_RBAC_MATRIX.condo_718.owner),
    tenant: withPhase5Defaults('condo_718', 'tenant', BASE_RBAC_MATRIX.condo_718.tenant),
    board_member: withPhase5Defaults('condo_718', 'board_member', BASE_RBAC_MATRIX.condo_718.board_member),
    board_president: withPhase5Defaults('condo_718', 'board_president', BASE_RBAC_MATRIX.condo_718.board_president),
    cam: withPhase5Defaults('condo_718', 'cam', BASE_RBAC_MATRIX.condo_718.cam),
    site_manager: withPhase5Defaults('condo_718', 'site_manager', BASE_RBAC_MATRIX.condo_718.site_manager),
    property_manager_admin: withPhase5Defaults('condo_718', 'property_manager_admin', BASE_RBAC_MATRIX.condo_718.property_manager_admin),
  },
  hoa_720: {
    owner: withPhase5Defaults('hoa_720', 'owner', BASE_RBAC_MATRIX.hoa_720.owner),
    tenant: withPhase5Defaults('hoa_720', 'tenant', BASE_RBAC_MATRIX.hoa_720.tenant),
    board_member: withPhase5Defaults('hoa_720', 'board_member', BASE_RBAC_MATRIX.hoa_720.board_member),
    board_president: withPhase5Defaults('hoa_720', 'board_president', BASE_RBAC_MATRIX.hoa_720.board_president),
    cam: withPhase5Defaults('hoa_720', 'cam', BASE_RBAC_MATRIX.hoa_720.cam),
    site_manager: withPhase5Defaults('hoa_720', 'site_manager', BASE_RBAC_MATRIX.hoa_720.site_manager),
    property_manager_admin: withPhase5Defaults('hoa_720', 'property_manager_admin', BASE_RBAC_MATRIX.hoa_720.property_manager_admin),
  },
  apartment: {
    owner: withPhase5Defaults('apartment', 'owner', BASE_RBAC_MATRIX.apartment.owner),
    tenant: withPhase5Defaults('apartment', 'tenant', BASE_RBAC_MATRIX.apartment.tenant),
    board_member: withPhase5Defaults('apartment', 'board_member', BASE_RBAC_MATRIX.apartment.board_member),
    board_president: withPhase5Defaults('apartment', 'board_president', BASE_RBAC_MATRIX.apartment.board_president),
    cam: withPhase5Defaults('apartment', 'cam', BASE_RBAC_MATRIX.apartment.cam),
    site_manager: withPhase5Defaults('apartment', 'site_manager', BASE_RBAC_MATRIX.apartment.site_manager),
    property_manager_admin: withPhase5Defaults('apartment', 'property_manager_admin', BASE_RBAC_MATRIX.apartment.property_manager_admin),
  },
};

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
  role: CommunityRole | NewCommunityRole,
  communityType: CommunityType,
  resource: RbacResource,
  action: RbacAction,
  opts?: { isUnitOwner?: boolean; permissions?: ManagerPermissions },
): boolean {
  // Handle new roles
  if (role === 'pm_admin') {
    return RBAC_MATRIX[communityType]['property_manager_admin'][resource][action];
  }
  if (role === 'resident') {
    const legacyRole = opts?.isUnitOwner ? 'owner' : 'tenant';
    return RBAC_MATRIX[communityType][legacyRole][resource][action];
  }
  if (role === 'manager') {
    if (!opts?.permissions) return false;
    const perm = opts.permissions.resources[resource];
    return action === 'read' ? perm.read : perm.write;
  }
  // Legacy role passthrough
  return RBAC_MATRIX[communityType][role as CommunityRole][resource][action];
}

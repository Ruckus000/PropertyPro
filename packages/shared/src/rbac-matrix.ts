/**
 * Declarative RBAC matrix — canonical source of truth for RBAC policy.
 *
 * Defines which matrix row can perform which action on which resource within a
 * given community type. This is a pure module — no I/O, no side effects.
 *
 * Keyed by the 3 rows the v3 choke point `checkPermissionV2` can ever read
 * (`owner` / `tenant` / `manager`, see `MatrixRole`). The legacy
 * `board_member` / `board_president` / `cam` / `site_manager` columns were
 * unreachable and were removed in the role-v3 RBAC_MATRIX collapse
 * (ADR-006 / R3-01).
 *
 * Policy decisions:
 * - compliance: condo/HOA only (apartment → false for all roles)
 * - audit write: always false (logAuditEvent() is internal-only)
 * - settings write: management tier (manager) only
 * - maintenance write: both residents (own requests) and management (all)
 *   → both get `true` here; DB query scoping enforces data boundaries
 * - leases: NOT in this matrix (separate apartment feature gate)
 * - `owner` in apartment: all false (apartments have no unit owners)
 *
 * The `satisfies` operator on RBAC_MATRIX enforces exhaustiveness:
 * adding a new CommunityType, MatrixRole, RbacResource, or RbacAction
 * to the respective const arrays will cause a TypeScript compile error
 * until the matrix is updated.
 */

import type { CommunityType } from './index';

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
  'elections',
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
  'units',
  'insurance',
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
  'elections',
  'work_orders',
  'amenities',
  'packages',
  'visitors',
  'calendar_sync',
  'accounting',
  'esign',
  'emergency_broadcasts',
  'units',
  'insurance',
] as const;
type Phase5Resource = (typeof PHASE5_DEFAULT_RESOURCES)[number];

// ---------------------------------------------------------------------------
// Matrix type
// ---------------------------------------------------------------------------

type RbacCell = Record<RbacAction, boolean>;

/**
 * The three matrix rows the v3 choke point (`checkPermissionV2`) can ever read:
 * `owner` / `tenant` (the `resident` sub-roles, split by `isUnitOwner`) and
 * `manager` (the uniform management-tier row for
 * `property_manager` / `root_manager`). The legacy `board_member` /
 * `board_president` / `cam` / `site_manager` columns were unreachable and were
 * removed in the role-v3 RBAC_MATRIX collapse (ADR-006 / R3-01). This is the
 * matrix key vocabulary only — distinct from the global 7-role `CommunityRole`.
 */
export const MATRIX_ROLES = ['owner', 'tenant', 'manager'] as const;
export type MatrixRole = (typeof MATRIX_ROLES)[number];

type RbacMatrix = Record<
  CommunityType,
  Record<MatrixRole, Record<RbacResource, RbacCell>>
>;

type BaseRbacMatrix = Record<
  CommunityType,
  Record<MatrixRole, Record<LegacyRbacResource, RbacCell>>
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
const CONDO_HOA_BASE_POLICY: Record<MatrixRole, Record<LegacyRbacResource, RbacCell>> = {
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
  manager: {
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
      meetings:      { read: true,  write: false },
      announcements: { read: true,  write: false },
      residents:     { read: false, write: false },
      settings:      { read: false, write: false },
      audit:         { read: false, write: false },
      compliance:    { read: false, write: false }, // apartments have no compliance
      maintenance:   { read: true,  write: true  },
      contracts:     { read: false, write: false },
    },
    manager: {
      documents:     { read: true,  write: true  },
      meetings:      { read: true,  write: true  },
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
  policy: Record<MatrixRole, RbacCell>;
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
      manager:                { read: true,  write: true  },
    },
  },
  violations: {
    // Two-tier permission model:
    // - write: true allows residents to self-report violations (POST /api/v1/violations)
    // - Admin-only mutations (update, resolve, dismiss, fine) additionally check
    //   requireViolationAdminWrite() at the route layer
    policy: {
      owner:                  { read: true,  write: true  },
      tenant:                 { read: true,  write: true  },
      manager:                { read: true,  write: true  },
    },
    excludedCommunityTypes: ['apartment'],
  },
  arc_submissions: {
    policy: {
      owner:                  { read: true,  write: true  },
      tenant:                 { read: true,  write: true  },
      manager:                { read: true,  write: true  },
    },
    excludedCommunityTypes: ['apartment'],
  },
  polls: {
    policy: {
      owner:                  { read: true,  write: true  },
      tenant:                 { read: true,  write: true  },
      manager:                { read: true,  write: true  },
    },
  },
  // Two-tier permission model (same pattern as violations):
  // - write: true for all roles = eligible voters can cast ballots (POST /vote)
  // - Admin-only mutations (open/close/certify/cancel, proxy approve/reject)
  //   additionally check requireElectionsAdminRole() at the route layer.
  elections: {
    policy: {
      owner:                  { read: true,  write: true  },
      tenant:                 { read: true,  write: true  },
      manager:                { read: true,  write: true  },
    },
    excludedCommunityTypes: ['apartment'],
  },
  work_orders: {
    policy: {
      owner:                  { read: true,  write: false },
      tenant:                 { read: true,  write: false },
      manager:                { read: true,  write: true  },
    },
  },
  amenities: {
    policy: {
      owner:                  { read: true,  write: true  },
      tenant:                 { read: true,  write: true  },
      manager:                { read: true,  write: true  },
    },
  },
  packages: {
    policy: {
      owner:                  { read: true,  write: false },
      tenant:                 { read: true,  write: false },
      manager:                { read: true,  write: true  },
    },
  },
  visitors: {
    policy: {
      owner:                  { read: true,  write: true  },
      tenant:                 { read: true,  write: true  },
      manager:                { read: true,  write: true  },
    },
  },
  calendar_sync: {
    policy: {
      owner:                  { read: true,  write: false },
      tenant:                 { read: true,  write: false },
      manager:                { read: true,  write: true  },
    },
  },
  accounting: {
    policy: {
      owner:                  { read: false, write: false },
      tenant:                 { read: false, write: false },
      manager:                { read: true,  write: true  },
    },
  },
  esign: {
    policy: {
      owner:                  { read: true,  write: false },
      tenant:                 { read: true,  write: false },
      manager:                { read: true,  write: true  },
    },
  },
  emergency_broadcasts: {
    policy: {
      owner:                  { read: true,  write: false },
      tenant:                 { read: false, write: false },
      manager:                { read: true,  write: true  },
    },
  },
  units: {
    policy: {
      owner:                  { read: true,  write: false },
      tenant:                 { read: true,  write: false },
      manager:                { read: true,  write: true  },
    },
  },
  // Insurance hub: wind-mitigation reports and master-policy summary.
  // Read is open to OWNERS (they retrieve the building's report for their own
  // insurer) and admin-tier; TENANTS are excluded. Legal review (2026-07-17)
  // ruled tenant read a §718.111(12)(c)/(g) breach — that records section is
  // statutorily "unit owners and employees only", and the report carries an
  // unredacted notes field + inspector license number. Write is admin-tier
  // (same shape as contracts). Apartments are excluded at the feature-flag
  // layer (hasInsuranceHub), so the matrix stays uniform across community types.
  insurance: {
    policy: {
      owner:                  { read: true,  write: false },
      tenant:                 { read: false, write: false },
      manager:                { read: true,  write: true  },
    },
  },
};

const PHASE5_DENY: RbacCell = { read: false, write: false };

const ROLE_CONSTRAINTS: Record<CommunityType, readonly MatrixRole[]> = {
  condo_718: ['owner', 'tenant', 'manager'],
  hoa_720: ['owner', 'tenant', 'manager'],
  apartment: ['tenant', 'manager'],
};

function withPhase5Defaults(
  communityType: CommunityType,
  role: MatrixRole,
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
    manager: withPhase5Defaults('condo_718', 'manager', BASE_RBAC_MATRIX.condo_718.manager),
  },
  hoa_720: {
    owner: withPhase5Defaults('hoa_720', 'owner', BASE_RBAC_MATRIX.hoa_720.owner),
    tenant: withPhase5Defaults('hoa_720', 'tenant', BASE_RBAC_MATRIX.hoa_720.tenant),
    manager: withPhase5Defaults('hoa_720', 'manager', BASE_RBAC_MATRIX.hoa_720.manager),
  },
  apartment: {
    owner: withPhase5Defaults('apartment', 'owner', BASE_RBAC_MATRIX.apartment.owner),
    tenant: withPhase5Defaults('apartment', 'tenant', BASE_RBAC_MATRIX.apartment.tenant),
    manager: withPhase5Defaults('apartment', 'manager', BASE_RBAC_MATRIX.apartment.manager),
  },
};

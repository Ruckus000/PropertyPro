/**
 * Document access policies shared across API/UI/query layers.
 *
 * Policy source: P1-25 strict role x community_type x document_category matrix.
 * Unknown/unmapped categories remain visible only to elevated roles.
 */

import type { CommunityRole, CommunityType } from './index';
import type { MatrixRole } from './rbac-matrix';
import {
  KNOWN_DOCUMENT_CATEGORY_KEYS,
  DOCUMENT_CATEGORY_KEYS,
} from './document-categories';
import type { KnownDocumentCategoryKey, DocumentCategoryKey } from './document-categories';

export { KNOWN_DOCUMENT_CATEGORY_KEYS, DOCUMENT_CATEGORY_KEYS };
export type { KnownDocumentCategoryKey, DocumentCategoryKey };

type CategoryAccess = 'all' | readonly KnownDocumentCategoryKey[];

const CATEGORY_ALIAS_MAP: Record<string, KnownDocumentCategoryKey> = {
  declaration: 'declaration',
  declarations: 'declaration',
  governing_documents: 'declaration',
  governing_docs: 'declaration',
  governing: 'declaration',
  bylaws: 'declaration',
  by_laws: 'declaration',
  articles: 'declaration',

  rules: 'rules',
  rules_and_regulations: 'rules',
  rules_regulations: 'rules',
  regulations: 'rules',
  community_rules: 'rules',

  inspection_reports: 'inspection_reports',
  inspections: 'inspection_reports',
  inspection: 'inspection_reports',
  safety_inspections: 'inspection_reports',
  milestone_reports: 'inspection_reports',

  meeting_minutes: 'meeting_minutes',
  minutes: 'meeting_minutes',
  board_minutes: 'meeting_minutes',
  meeting_notes: 'meeting_minutes',
  meeting_records: 'meeting_minutes',
  meeting_record: 'meeting_minutes',

  announcements: 'announcements',
  announcement: 'announcements',
  notices: 'announcements',
  notice: 'announcements',
  correspondence: 'announcements',
  communication: 'announcements',
  communications: 'announcements',

  maintenance_records: 'maintenance_records',
  maintenance: 'maintenance_records',
  maintenance_logs: 'maintenance_records',
  work_orders: 'maintenance_records',

  lease_docs: 'lease_docs',
  lease_documents: 'lease_docs',
  lease_agreement: 'lease_docs',
  lease_agreements: 'lease_docs',
  lease: 'lease_docs',
  leases: 'lease_docs',

  community_handbook: 'community_handbook',
  handbook: 'community_handbook',
  resident_handbook: 'community_handbook',
  resident_guide: 'community_handbook',

  move_in_out_docs: 'move_in_out_docs',
  move_in_docs: 'move_in_out_docs',
  move_out_docs: 'move_in_out_docs',
  move_in_out: 'move_in_out_docs',
  moving_documents: 'move_in_out_docs',

  financial_records: 'financial_records',
  financials: 'financial_records',
  financial: 'financial_records',

  contracts: 'contracts',
  contract: 'contracts',

  insurance: 'insurance',
  insurance_certificates: 'insurance',
  coverage: 'insurance',

  elections: 'elections',
  election: 'elections',
  voting_records: 'elections',

  compliance: 'inspection_reports',
};

/**
 * READ-access tier: these roles may VIEW documents in unknown/unmapped
 * categories (and, via buildDocumentAccessFilter, uncategorized rows). This is
 * deliberately NOT a write/delete authority. `owner` is included so unit owners
 * get full §718 read transparency even though the RBAC matrix gives `owner`
 * `documents:write:false` — the two are consistent because they govern
 * different axes (read breadth vs. write permission).
 *
 * Document upload AND delete are gated on `documents:write` via
 * requirePermission()/checkPermissionV2 (issue #734). Do NOT reuse this
 * predicate to authorize mutations.
 */
export const ELEVATED_ROLES: readonly MatrixRole[] = [
  'owner',
  'manager',
] as const;

/**
 * Management roles that can access admin pages (compliance, audit trail,
 * contracts, maintenance inbox). Excludes owner and tenant.
 *
 * Not the same as ELEVATED_ROLES (which includes owner for document access).
 *
 * v3 (ADR-006): board status is an orthogonal `designation`, never a role, and
 * must not grant general permissions — so `board_member`/`board_president` are
 * NOT admin roles here. Management access comes from the v3 role via
 * `isAdminRole` (property_manager / root_manager); this array only covers the
 * management-tier matrix row.
 */
export const ADMIN_ROLES: readonly MatrixRole[] = [
  'manager',
] as const;

export const RESTRICTED_ROLES: readonly MatrixRole[] = [
  'tenant',
] as const;

// Keyed by the 3 MatrixRole rows (role-v3 collapse, R3-01). `resolveMatrixRole`
// only ever yields owner/tenant/manager from the 3 v3 roles.
const DOCUMENT_ACCESS_POLICY: Record<CommunityType, Record<MatrixRole, CategoryAccess>> = {
  condo_718: {
    owner: 'all',
    manager: 'all',
    tenant: ['declaration', 'rules', 'inspection_reports'],
  },
  hoa_720: {
    owner: 'all',
    manager: 'all',
    tenant: ['declaration', 'rules', 'inspection_reports'],
  },
  apartment: {
    owner: 'all',
    manager: 'all',
    tenant: ['lease_docs', 'rules', 'community_handbook', 'move_in_out_docs'],
  },
};

export function normalizeCategoryName(name: string | null | undefined): DocumentCategoryKey {
  if (!name) {
    return 'unknown';
  }

  const normalized = name
    .toLowerCase()
    .trim()
    .replace(/[&/\-\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  const alias = CATEGORY_ALIAS_MAP[normalized];
  if (alias) {
    return alias;
  }

  if (KNOWN_DOCUMENT_CATEGORY_KEYS.includes(normalized as KnownDocumentCategoryKey)) {
    return normalized as KnownDocumentCategoryKey;
  }

  return 'unknown';
}

/** Options for document access functions when using a v3 CommunityRole. */
export interface DocumentAccessOpts {
  isUnitOwner?: boolean;
}

/**
 * Resolve a v3 role to the `MatrixRole` row used for document-policy lookup.
 *
 * v3 (ADR-006): property_manager + root_manager are uniformly elevated and map
 * onto the `manager` row; resident splits owner/tenant via `isUnitOwner`. The
 * three v3 roles are exhaustive, so the defensive `return null` is unreachable —
 * it exists only to satisfy control-flow analysis for any future enum member.
 */
function resolveMatrixRole(
  role: CommunityRole,
  opts?: DocumentAccessOpts,
): MatrixRole | null {
  if (role === 'property_manager' || role === 'root_manager') {
    return 'manager';
  }
  if (role === 'resident') return opts?.isUnitOwner ? 'owner' : 'tenant';
  return null;
}

export function isElevatedRole(
  role: CommunityRole,
  opts?: DocumentAccessOpts,
): boolean {
  const matrixRole = resolveMatrixRole(role, opts);
  return matrixRole ? ELEVATED_ROLES.includes(matrixRole) : false;
}

export function isAdminRole(
  role: CommunityRole,
): boolean {
  // Resolve to the MatrixRole row first (same path isElevatedRole/isRestrictedRole
  // take) so the management tier (property_manager / root_manager) collapses onto
  // the single `manager` admin row. resident (owner or tenant) is non-admin.
  const matrixRole = resolveMatrixRole(role);
  return matrixRole ? ADMIN_ROLES.includes(matrixRole) : false;
}

export function isRestrictedRole(
  role: CommunityRole,
  opts?: DocumentAccessOpts,
): boolean {
  const matrixRole = resolveMatrixRole(role, opts);
  if (matrixRole) return RESTRICTED_ROLES.includes(matrixRole);
  return false;
}

export function getCategoryAccessForRole(
  role: CommunityRole,
  communityType: CommunityType,
  opts?: DocumentAccessOpts,
): CategoryAccess {
  const matrixRole = resolveMatrixRole(role, opts);
  if (matrixRole) return DOCUMENT_ACCESS_POLICY[communityType][matrixRole];
  return [];
}

export function getAccessibleKnownCategories(
  role: CommunityRole,
  communityType: CommunityType,
  opts?: DocumentAccessOpts,
): KnownDocumentCategoryKey[] {
  if (isElevatedRole(role, opts)) {
    return [...KNOWN_DOCUMENT_CATEGORY_KEYS];
  }

  const access = getCategoryAccessForRole(role, communityType, opts);
  if (access === 'all') {
    return [...KNOWN_DOCUMENT_CATEGORY_KEYS];
  }
  return [...access];
}

export function canAccessCategory(
  role: CommunityRole,
  communityType: CommunityType,
  categoryKey: DocumentCategoryKey,
  opts?: DocumentAccessOpts,
): boolean {
  if (isElevatedRole(role, opts)) {
    return true;
  }

  if (categoryKey === 'unknown') {
    return false;
  }

  const access = getCategoryAccessForRole(role, communityType, opts);
  if (access === 'all') {
    return true;
  }

  return access.includes(categoryKey);
}

export function canAccessDocument(
  role: CommunityRole,
  communityType: CommunityType,
  categoryName: string | null | undefined,
  opts?: DocumentAccessOpts,
): boolean {
  const normalizedKey = normalizeCategoryName(categoryName);
  return canAccessCategory(role, communityType, normalizedKey, opts);
}

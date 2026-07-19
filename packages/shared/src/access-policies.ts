/**
 * Document access policies shared across API/UI/query layers.
 *
 * Policy source: P1-25 strict role x community_type x document_category matrix.
 * Unknown/unmapped categories remain visible only to elevated roles.
 */

import type { CommunityRole, CommunityType } from './index';
import type { TransitionRole } from './role-transition';
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
export const ELEVATED_ROLES: readonly CommunityRole[] = [
  'owner',
  'board_member',
  'board_president',
  'property_manager_admin',
] as const;

/**
 * Management roles that can access admin pages (compliance, audit trail,
 * contracts, maintenance inbox). Excludes owner and tenant.
 *
 * Not the same as ELEVATED_ROLES (which includes owner for document access).
 */
export const ADMIN_ROLES: readonly CommunityRole[] = [
  'board_member',
  'board_president',
  'property_manager_admin',
] as const;

export const RESTRICTED_ROLES: readonly CommunityRole[] = [
  'tenant',
] as const;

/** Board-level roles (fiduciary duty, board-only meeting access). */
export const BOARD_ROLES: readonly CommunityRole[] = [
  'board_member',
  'board_president',
] as const;

// Keyed by the 3 reachable MatrixRole rows only (role-v3 collapse, R3-01). The
// legacy board_member/board_president/cam/site_manager rows were unreachable —
// `resolveLegacyRole` only ever yields owner/tenant/property_manager_admin — and
// were dropped alongside the RBAC_MATRIX collapse.
const DOCUMENT_ACCESS_POLICY: Record<CommunityType, Record<MatrixRole, CategoryAccess>> = {
  condo_718: {
    owner: 'all',
    property_manager_admin: 'all',
    tenant: ['declaration', 'rules', 'inspection_reports'],
  },
  hoa_720: {
    owner: 'all',
    property_manager_admin: 'all',
    tenant: ['declaration', 'rules', 'inspection_reports'],
  },
  apartment: {
    owner: 'all',
    property_manager_admin: 'all',
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

/** Options for document access functions when using a v3 TransitionRole. */
export interface DocumentAccessOpts {
  isUnitOwner?: boolean;
}

/**
 * Resolve a role (legacy 7-role or v3 TransitionRole) to the legacy
 * CommunityRole for policy lookup.
 *
 * v3 (ADR-006): property_manager + root_manager are uniformly elevated and map
 * onto property_manager_admin. resident splits owner/tenant via isUnitOwner.
 * A final defensive `return null` remains for exhaustiveness; no live role
 * reaches it.
 */
function resolveLegacyRole(
  role: CommunityRole | TransitionRole,
  opts?: DocumentAccessOpts,
): MatrixRole | null {
  // Resolve to one of the 3 reachable matrix rows. v3 roles map here; the
  // owner/tenant/property_manager_admin legacy names pass through. The 4 dropped
  // legacy admin names (board_member/board_president/cam/site_manager) are
  // unreachable in production and return null.
  if (role === 'owner' || role === 'tenant' || role === 'property_manager_admin') {
    return role;
  }
  if (role === 'property_manager' || role === 'root_manager') {
    return 'property_manager_admin';
  }
  if (role === 'resident') return opts?.isUnitOwner ? 'owner' : 'tenant';
  return null;
}

export function isElevatedRole(
  role: CommunityRole | TransitionRole,
  opts?: DocumentAccessOpts,
): boolean {
  const legacy = resolveLegacyRole(role, opts);
  return legacy ? ELEVATED_ROLES.includes(legacy) : false;
}

export function isAdminRole(
  role: CommunityRole | TransitionRole,
): boolean {
  if (role === 'property_manager' || role === 'root_manager') {
    return true;
  }
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

export function isRestrictedRole(
  role: CommunityRole | TransitionRole,
  opts?: DocumentAccessOpts,
): boolean {
  const legacy = resolveLegacyRole(role, opts);
  if (legacy) return RESTRICTED_ROLES.includes(legacy);
  return false;
}

export function getCategoryAccessForRole(
  role: CommunityRole | TransitionRole,
  communityType: CommunityType,
  opts?: DocumentAccessOpts,
): CategoryAccess {
  const legacy = resolveLegacyRole(role, opts);
  if (legacy) return DOCUMENT_ACCESS_POLICY[communityType][legacy];
  return [];
}

export function getAccessibleKnownCategories(
  role: CommunityRole | TransitionRole,
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
  role: CommunityRole | TransitionRole,
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
  role: CommunityRole | TransitionRole,
  communityType: CommunityType,
  categoryName: string | null | undefined,
  opts?: DocumentAccessOpts,
): boolean {
  const normalizedKey = normalizeCategoryName(categoryName);
  return canAccessCategory(role, communityType, normalizedKey, opts);
}

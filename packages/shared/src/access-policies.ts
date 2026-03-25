/**
 * Document access policies shared across API/UI/query layers.
 *
 * Policy source: P1-25 strict role x community_type x document_category matrix.
 * Unknown/unmapped categories remain visible only to elevated roles.
 */

import type { CommunityRole, CommunityType, NewCommunityRole } from './index';
import type { ManagerPermissions } from './manager-permissions';
import { COMMUNITY_ROLES } from './index';

export const KNOWN_DOCUMENT_CATEGORY_KEYS = [
  'declaration',
  'rules',
  'inspection_reports',
  'meeting_minutes',
  'announcements',
  'maintenance_records',
  'lease_docs',
  'community_handbook',
  'move_in_out_docs',
] as const;

export const DOCUMENT_CATEGORY_KEYS = [
  ...KNOWN_DOCUMENT_CATEGORY_KEYS,
  'unknown',
] as const;

export type KnownDocumentCategoryKey = (typeof KNOWN_DOCUMENT_CATEGORY_KEYS)[number];
export type DocumentCategoryKey = (typeof DOCUMENT_CATEGORY_KEYS)[number];

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
};

/**
 * Elevated roles can view unknown/unmapped categories.
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
  'cam',
  'site_manager',
  'property_manager_admin',
] as const;

export const RESTRICTED_ROLES: readonly CommunityRole[] = [
  'tenant',
  'cam',
  'site_manager',
] as const;

/** Board-level roles (fiduciary duty, board-only meeting access). */
export const BOARD_ROLES: readonly CommunityRole[] = [
  'board_member',
  'board_president',
] as const;

/** Non-admin resident roles. */
export const RESIDENT_ROLES: readonly CommunityRole[] = [
  'owner',
  'tenant',
] as const;

/** Staff/management roles (board_president, cam, site_manager, property_manager_admin). */
export const STAFF_ROLES: readonly CommunityRole[] = [
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
] as const;

const DOCUMENT_ACCESS_POLICY: Record<CommunityType, Record<CommunityRole, CategoryAccess>> = {
  condo_718: {
    owner: 'all',
    board_member: 'all',
    board_president: 'all',
    property_manager_admin: 'all',
    cam: ['rules', 'inspection_reports', 'announcements', 'meeting_minutes'],
    tenant: ['declaration', 'rules', 'inspection_reports'],
    site_manager: [],
  },
  hoa_720: {
    owner: 'all',
    board_member: 'all',
    board_president: 'all',
    property_manager_admin: 'all',
    cam: ['rules', 'inspection_reports', 'announcements', 'meeting_minutes'],
    tenant: ['declaration', 'rules', 'inspection_reports'],
    site_manager: [],
  },
  apartment: {
    owner: 'all',
    board_member: 'all',
    board_president: 'all',
    cam: [],
    property_manager_admin: 'all',
    site_manager: ['rules', 'announcements', 'maintenance_records'],
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

/** Options for document access functions when using NewCommunityRole. */
export interface DocumentAccessOpts {
  isUnitOwner?: boolean;
  permissions?: ManagerPermissions;
}

/**
 * Resolve a role (old or new) to the legacy CommunityRole for policy lookup.
 * Returns null for 'manager' role (which uses JSONB permissions).
 */
function resolveLegacyRole(
  role: CommunityRole | NewCommunityRole,
  opts?: DocumentAccessOpts,
): CommunityRole | null {
  if ((COMMUNITY_ROLES as readonly string[]).includes(role)) {
    return role as CommunityRole;
  }
  if (role === 'pm_admin') return 'property_manager_admin';
  if (role === 'resident') return opts?.isUnitOwner ? 'owner' : 'tenant';
  return null; // manager → uses JSONB
}

export function isElevatedRole(
  role: CommunityRole | NewCommunityRole,
  opts?: DocumentAccessOpts,
): boolean {
  const legacy = resolveLegacyRole(role, opts);
  if (legacy) return ELEVATED_ROLES.includes(legacy);
  // manager: elevated if document_categories === 'all'
  return opts?.permissions?.document_categories === 'all';
}

export function isAdminRole(
  role: CommunityRole | NewCommunityRole,
): boolean {
  if (role === 'manager' || role === 'pm_admin') return true;
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

export function isRestrictedRole(
  role: CommunityRole | NewCommunityRole,
  opts?: DocumentAccessOpts,
): boolean {
  const legacy = resolveLegacyRole(role, opts);
  if (legacy) return RESTRICTED_ROLES.includes(legacy);
  return false;
}

export function getCategoryAccessForRole(
  role: CommunityRole | NewCommunityRole,
  communityType: CommunityType,
  opts?: DocumentAccessOpts,
): CategoryAccess {
  const legacy = resolveLegacyRole(role, opts);
  if (legacy) return DOCUMENT_ACCESS_POLICY[communityType][legacy];
  // manager: derive from JSONB
  if (!opts?.permissions) return [];
  const cats = opts.permissions.document_categories;
  return cats === 'all' ? 'all' : cats;
}

export function getAccessibleKnownCategories(
  role: CommunityRole | NewCommunityRole,
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
  role: CommunityRole | NewCommunityRole,
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
  role: CommunityRole | NewCommunityRole,
  communityType: CommunityType,
  categoryName: string | null | undefined,
  opts?: DocumentAccessOpts,
): boolean {
  const normalizedKey = normalizeCategoryName(categoryName);
  return canAccessCategory(role, communityType, normalizedKey, opts);
}

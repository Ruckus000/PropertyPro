/**
 * Document access policies shared across API/UI/query layers.
 *
 * Policy source: P1-25 strict role x community_type x document_category matrix.
 * Unknown/unmapped categories remain visible only to elevated roles.
 */

import type { CommunityRole, CommunityType } from './index';

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

  announcements: 'announcements',
  announcement: 'announcements',
  notices: 'announcements',
  notice: 'announcements',

  maintenance_records: 'maintenance_records',
  maintenance: 'maintenance_records',
  maintenance_logs: 'maintenance_records',
  work_orders: 'maintenance_records',

  lease_docs: 'lease_docs',
  lease_documents: 'lease_docs',
  lease_agreement: 'lease_docs',
  lease_agreements: 'lease_docs',
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

export function isElevatedRole(role: CommunityRole): boolean {
  return ELEVATED_ROLES.includes(role);
}

export function isAdminRole(role: CommunityRole): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

export function isRestrictedRole(role: CommunityRole): boolean {
  return RESTRICTED_ROLES.includes(role);
}

export function getCategoryAccessForRole(
  role: CommunityRole,
  communityType: CommunityType,
): CategoryAccess {
  return DOCUMENT_ACCESS_POLICY[communityType][role];
}

export function getAccessibleKnownCategories(
  role: CommunityRole,
  communityType: CommunityType,
): KnownDocumentCategoryKey[] {
  if (isElevatedRole(role)) {
    return [...KNOWN_DOCUMENT_CATEGORY_KEYS];
  }

  const access = getCategoryAccessForRole(role, communityType);
  if (access === 'all') {
    return [...KNOWN_DOCUMENT_CATEGORY_KEYS];
  }
  return [...access];
}

export function canAccessCategory(
  role: CommunityRole,
  communityType: CommunityType,
  categoryKey: DocumentCategoryKey,
): boolean {
  if (isElevatedRole(role)) {
    return true;
  }

  if (categoryKey === 'unknown') {
    return false;
  }

  const access = getCategoryAccessForRole(role, communityType);
  if (access === 'all') {
    return true;
  }

  return access.includes(categoryKey);
}

export function canAccessDocument(
  role: CommunityRole,
  communityType: CommunityType,
  categoryName: string | null | undefined,
): boolean {
  const normalizedKey = normalizeCategoryName(categoryName);
  return canAccessCategory(role, communityType, normalizedKey);
}

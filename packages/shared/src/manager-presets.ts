/**
 * Manager preset definitions — pre-configured permission bundles
 * that map to the legacy roles (board_president, board_member, cam, site_manager).
 *
 * Presets are community-type-aware: an apartment site_manager has different
 * resource access and document categories than a condo cam.
 *
 * Usage:
 * - When creating a manager with a preset_key, use getPresetPermissions()
 *   to get the full ManagerPermissions object.
 * - pm_admin can update presets for all managers with a given preset_key
 *   in bulk (future feature).
 */

import type { CommunityType } from './index';
import { RBAC_RESOURCES, RBAC_MATRIX, type RbacResource } from './rbac-matrix';
import type { ManagerPermissions, ResourcePermission } from './manager-permissions';
import type { KnownDocumentCategoryKey } from './access-policies';

// ---------------------------------------------------------------------------
// Preset metadata
// ---------------------------------------------------------------------------

export type PresetKey = 'board_president' | 'board_member' | 'cam' | 'site_manager';

export const PRESET_KEYS: readonly PresetKey[] = [
  'board_president',
  'board_member',
  'cam',
  'site_manager',
] as const;

interface PresetMeta {
  displayTitle: string;
  /** The legacy CommunityRole this preset maps from. */
  legacyRole: string;
}

export const PRESET_METADATA: Record<PresetKey, PresetMeta> = {
  board_president: {
    displayTitle: 'Board President',
    legacyRole: 'board_president',
  },
  board_member: {
    displayTitle: 'Board Member',
    legacyRole: 'board_member',
  },
  cam: {
    displayTitle: 'Community Association Manager',
    legacyRole: 'cam',
  },
  site_manager: {
    displayTitle: 'Site Manager',
    legacyRole: 'site_manager',
  },
};

// ---------------------------------------------------------------------------
// Document category access per preset + community type
// (Derived from DOCUMENT_ACCESS_POLICY in access-policies.ts)
// ---------------------------------------------------------------------------

const PRESET_DOC_CATEGORIES: Record<PresetKey, Record<CommunityType, 'all' | KnownDocumentCategoryKey[]>> = {
  board_president: {
    condo_718: 'all',
    hoa_720: 'all',
    apartment: 'all',
  },
  board_member: {
    condo_718: 'all',
    hoa_720: 'all',
    apartment: 'all',
  },
  cam: {
    condo_718: ['rules', 'inspection_reports', 'announcements', 'meeting_minutes'],
    hoa_720: ['rules', 'inspection_reports', 'announcements', 'meeting_minutes'],
    apartment: [],
  },
  site_manager: {
    condo_718: [],
    hoa_720: [],
    apartment: ['rules', 'announcements', 'maintenance_records'],
  },
};

// ---------------------------------------------------------------------------
// Meta-permissions per preset
// ---------------------------------------------------------------------------

const PRESET_META_PERMISSIONS: Record<PresetKey, {
  can_manage_roles: boolean;
  can_manage_settings: boolean;
  is_board_member: boolean;
}> = {
  board_president: {
    can_manage_roles: true,
    can_manage_settings: true,
    is_board_member: true,
  },
  board_member: {
    can_manage_roles: false,
    can_manage_settings: false,
    is_board_member: true,
  },
  cam: {
    can_manage_roles: true,
    can_manage_settings: false,
    is_board_member: false,
  },
  site_manager: {
    can_manage_roles: true,
    can_manage_settings: false,
    is_board_member: false,
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the full ManagerPermissions object for a given preset + community type.
 * Resource permissions are derived from the current RBAC_MATRIX for the
 * preset's legacy role.
 */
export function getPresetPermissions(
  presetKey: PresetKey,
  communityType: CommunityType,
): ManagerPermissions {
  const meta = PRESET_METADATA[presetKey];
  const legacyRole = meta.legacyRole as keyof (typeof RBAC_MATRIX)[typeof communityType];
  const rbacRow = RBAC_MATRIX[communityType][legacyRole];

  const resources = {} as Record<RbacResource, ResourcePermission>;
  for (const r of RBAC_RESOURCES) {
    resources[r] = {
      read: rbacRow[r].read,
      write: rbacRow[r].write,
    };
  }

  const metaPerms = PRESET_META_PERMISSIONS[presetKey];

  return {
    resources,
    document_categories: PRESET_DOC_CATEGORIES[presetKey][communityType],
    can_manage_roles: metaPerms.can_manage_roles,
    can_manage_settings: metaPerms.can_manage_settings,
    is_board_member: metaPerms.is_board_member,
  };
}

/**
 * Returns true if the given key is a valid preset key.
 */
export function isPresetKey(key: string): key is PresetKey {
  return (PRESET_KEYS as readonly string[]).includes(key);
}

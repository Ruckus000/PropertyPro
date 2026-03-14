import type { NewCommunityRole, ManagerPermissions } from '@propertypro/shared';
import { getPresetPermissions } from '@propertypro/shared';
import type { MultiTenantCommunityKey } from './multi-tenant-communities';

export type MultiTenantUserKey =
  | 'actorA'
  | 'actorB'
  | 'residentA'
  | 'residentB'
  | 'tenantA'
  | 'camA'
  | 'actorC'
  | 'tenantC'
  | 'siteManagerA'
  | 'siteManagerC';

// Derived from board_president preset (highest access level) — auto-syncs with RBAC_RESOURCES.
const FULL_PERMISSIONS: ManagerPermissions = getPresetPermissions('board_president', 'condo_718');

export interface MultiTenantUserFixture {
  key: MultiTenantUserKey;
  communityKey: MultiTenantCommunityKey;
  role: NewCommunityRole;
  isUnitOwner: boolean;
  displayTitle: string;
  presetKey?: string;
  permissions?: ManagerPermissions;
  emailPrefix: string;
  fullName: string;
}

export const MULTI_TENANT_USERS: readonly MultiTenantUserFixture[] = [
  {
    key: 'actorA',
    communityKey: 'communityA',
    role: 'manager',
    isUnitOwner: false,
    displayTitle: 'Board President',
    presetKey: 'board_president',
    permissions: FULL_PERMISSIONS,
    emailPrefix: 'p243-actor-a',
    fullName: 'P2-43 Actor A',
  },
  {
    key: 'actorB',
    communityKey: 'communityB',
    role: 'manager',
    isUnitOwner: false,
    displayTitle: 'Board President',
    presetKey: 'board_president',
    permissions: FULL_PERMISSIONS,
    emailPrefix: 'p243-actor-b',
    fullName: 'P2-43 Actor B',
  },
  {
    key: 'residentA',
    communityKey: 'communityA',
    role: 'manager',
    isUnitOwner: false,
    displayTitle: 'Board Member',
    presetKey: 'board_member',
    permissions: getPresetPermissions('board_member', 'condo_718'),
    emailPrefix: 'p243-resident-a',
    fullName: 'P2-43 Resident A',
  },
  {
    key: 'residentB',
    communityKey: 'communityB',
    role: 'manager',
    isUnitOwner: false,
    displayTitle: 'Board Member',
    presetKey: 'board_member',
    permissions: getPresetPermissions('board_member', 'hoa_720'),
    emailPrefix: 'p243-resident-b',
    fullName: 'P2-43 Resident B',
  },
  {
    key: 'tenantA',
    communityKey: 'communityA',
    role: 'resident',
    isUnitOwner: false,
    displayTitle: 'Tenant',
    emailPrefix: 'p243-tenant-a',
    fullName: 'P2-43 Tenant A',
  },
  {
    key: 'camA',
    communityKey: 'communityA',
    role: 'manager',
    isUnitOwner: false,
    displayTitle: 'Community Manager',
    presetKey: 'cam',
    permissions: getPresetPermissions('cam', 'condo_718'),
    emailPrefix: 'p243-cam-a',
    fullName: 'P2-43 CAM A',
  },
  {
    key: 'siteManagerA',
    communityKey: 'communityA',
    role: 'manager',
    isUnitOwner: false,
    displayTitle: 'Site Manager',
    presetKey: 'site_manager',
    permissions: getPresetPermissions('site_manager', 'condo_718'),
    emailPrefix: 'p243-sitemgr-a',
    fullName: 'P2-43 Site Mgr A',
  },
  {
    key: 'actorC',
    communityKey: 'communityC',
    role: 'pm_admin',
    isUnitOwner: false,
    displayTitle: 'Property Manager Admin',
    emailPrefix: 'p243-actor-c',
    fullName: 'P2-43 Actor C',
  },
  {
    key: 'tenantC',
    communityKey: 'communityC',
    role: 'resident',
    isUnitOwner: false,
    displayTitle: 'Tenant',
    emailPrefix: 'p243-tenant-c',
    fullName: 'P2-43 Tenant C',
  },
  {
    key: 'siteManagerC',
    communityKey: 'communityC',
    role: 'manager',
    isUnitOwner: false,
    displayTitle: 'Site Manager',
    presetKey: 'site_manager',
    permissions: getPresetPermissions('site_manager', 'apartment'),
    emailPrefix: 'p243-sitemgr-c',
    fullName: 'P2-43 Site Mgr C',
  },
] as const;

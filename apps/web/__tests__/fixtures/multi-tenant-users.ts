import type { CommunityRole, BoardDesignation } from '@propertypro/shared';
import { BOARD_DESIGNATIONS } from '@propertypro/shared';
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

export interface MultiTenantUserFixture {
  key: MultiTenantUserKey;
  communityKey: MultiTenantCommunityKey;
  role: CommunityRole;
  isUnitOwner: boolean;
  displayTitle: string;
  /** Board designation (role-v3): statutory marker, independent of role. Null when not a board member. */
  designation?: BoardDesignation | null;
  emailPrefix: string;
  fullName: string;
}

// role-v3 (Phase 4.2): management-tier actors are stored as `property_manager`
// (checkPermissionV2 resolves them to the uniform property_manager_admin matrix);
// the legacy presetKey/permissions JSONB columns are dropped, so the former
// "restricted" actors (cam / site_manager) are now plain property_managers.
// Board members additionally carry a `designation` (matches prod).
export const MULTI_TENANT_USERS: readonly MultiTenantUserFixture[] = [
  {
    key: 'actorA',
    communityKey: 'communityA',
    role: 'property_manager',
    isUnitOwner: false,
    displayTitle: 'Board President',
    designation: BOARD_DESIGNATIONS[0],
    emailPrefix: 'p243-actor-a',
    fullName: 'P2-43 Actor A',
  },
  {
    key: 'actorB',
    communityKey: 'communityB',
    role: 'property_manager',
    isUnitOwner: false,
    displayTitle: 'Board President',
    designation: BOARD_DESIGNATIONS[0],
    emailPrefix: 'p243-actor-b',
    fullName: 'P2-43 Actor B',
  },
  {
    key: 'residentA',
    communityKey: 'communityA',
    role: 'property_manager',
    isUnitOwner: false,
    displayTitle: 'Board Member',
    designation: BOARD_DESIGNATIONS[1],
    emailPrefix: 'p243-resident-a',
    fullName: 'P2-43 Resident A',
  },
  {
    key: 'residentB',
    communityKey: 'communityB',
    role: 'property_manager',
    isUnitOwner: false,
    displayTitle: 'Board Member',
    designation: BOARD_DESIGNATIONS[1],
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
    role: 'property_manager',
    isUnitOwner: false,
    displayTitle: 'Community Manager',
    emailPrefix: 'p243-cam-a',
    fullName: 'P2-43 CAM A',
  },
  {
    key: 'siteManagerA',
    communityKey: 'communityA',
    role: 'property_manager',
    isUnitOwner: false,
    displayTitle: 'Site Manager',
    emailPrefix: 'p243-sitemgr-a',
    fullName: 'P2-43 Site Mgr A',
  },
  {
    // The "full PM admin" actor — a plain property_manager (uniform matrix).
    key: 'actorC',
    communityKey: 'communityC',
    role: 'property_manager',
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
    role: 'property_manager',
    isUnitOwner: false,
    displayTitle: 'Site Manager',
    emailPrefix: 'p243-sitemgr-c',
    fullName: 'P2-43 Site Mgr C',
  },
] as const;

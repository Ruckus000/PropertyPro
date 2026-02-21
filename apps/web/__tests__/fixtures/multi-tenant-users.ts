import type { CommunityRole } from '@propertypro/shared';
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
  emailPrefix: string;
  fullName: string;
}

export const MULTI_TENANT_USERS: readonly MultiTenantUserFixture[] = [
  {
    key: 'actorA',
    communityKey: 'communityA',
    role: 'board_president',
    emailPrefix: 'p243-actor-a',
    fullName: 'P2-43 Actor A',
  },
  {
    key: 'actorB',
    communityKey: 'communityB',
    role: 'board_president',
    emailPrefix: 'p243-actor-b',
    fullName: 'P2-43 Actor B',
  },
  {
    key: 'residentA',
    communityKey: 'communityA',
    role: 'board_member',
    emailPrefix: 'p243-resident-a',
    fullName: 'P2-43 Resident A',
  },
  {
    key: 'residentB',
    communityKey: 'communityB',
    role: 'board_member',
    emailPrefix: 'p243-resident-b',
    fullName: 'P2-43 Resident B',
  },
  {
    key: 'tenantA',
    communityKey: 'communityA',
    role: 'tenant',
    emailPrefix: 'p243-tenant-a',
    fullName: 'P2-43 Tenant A',
  },
  {
    key: 'camA',
    communityKey: 'communityA',
    role: 'cam',
    emailPrefix: 'p243-cam-a',
    fullName: 'P2-43 CAM A',
  },
  {
    key: 'siteManagerA',
    communityKey: 'communityA',
    role: 'site_manager',
    emailPrefix: 'p243-sitemgr-a',
    fullName: 'P2-43 Site Mgr A',
  },
  {
    key: 'actorC',
    communityKey: 'communityC',
    role: 'property_manager_admin',
    emailPrefix: 'p243-actor-c',
    fullName: 'P2-43 Actor C',
  },
  {
    key: 'tenantC',
    communityKey: 'communityC',
    role: 'tenant',
    emailPrefix: 'p243-tenant-c',
    fullName: 'P2-43 Tenant C',
  },
  {
    key: 'siteManagerC',
    communityKey: 'communityC',
    role: 'site_manager',
    emailPrefix: 'p243-sitemgr-c',
    fullName: 'P2-43 Site Mgr C',
  },
] as const;

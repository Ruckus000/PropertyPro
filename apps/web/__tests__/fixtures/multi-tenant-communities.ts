import type { CommunityType } from '@propertypro/shared';

export type MultiTenantCommunityKey = 'communityA' | 'communityB' | 'communityC';

export interface MultiTenantCommunityFixture {
  key: MultiTenantCommunityKey;
  slugBase: string;
  name: string;
  communityType: CommunityType;
  timezone: string;
}

export const MULTI_TENANT_COMMUNITIES: readonly MultiTenantCommunityFixture[] = [
  {
    key: 'communityA',
    slugBase: 'p2-43-sunset-condos',
    name: 'P2-43 Sunset Condos',
    communityType: 'condo_718',
    timezone: 'America/New_York',
  },
  {
    key: 'communityB',
    slugBase: 'p2-43-palm-shores-hoa',
    name: 'P2-43 Palm Shores HOA',
    communityType: 'hoa_720',
    timezone: 'America/Chicago',
  },
  {
    key: 'communityC',
    slugBase: 'p2-43-metro-apartments',
    name: 'P2-43 Metro Apartments',
    communityType: 'apartment',
    timezone: 'America/New_York',
  },
] as const;

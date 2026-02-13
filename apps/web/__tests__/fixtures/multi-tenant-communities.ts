export interface MultiTenantCommunityFixture {
  id: number;
  slug: string;
  name: string;
}

export const MULTI_TENANT_COMMUNITIES: readonly MultiTenantCommunityFixture[] = [
  {
    id: 101,
    slug: 'sunset-condos',
    name: 'Sunset Condos',
  },
  {
    id: 202,
    slug: 'palm-shores-hoa',
    name: 'Palm Shores HOA',
  },
] as const;

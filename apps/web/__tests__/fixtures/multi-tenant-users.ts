export interface MultiTenantUserFixture {
  id: string;
  communityId: number;
  role: string;
}

export const MULTI_TENANT_USERS: readonly MultiTenantUserFixture[] = [
  {
    id: 'user-community-a',
    communityId: 101,
    role: 'board_president',
  },
  {
    id: 'user-community-b',
    communityId: 202,
    role: 'board_president',
  },
] as const;

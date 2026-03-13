import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  scopedSelectFromMock,
  communitiesTable,
  userRolesTable,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  scopedSelectFromMock: vi.fn(),
  communitiesTable: Symbol('communities'),
  userRolesTable: Symbol('user_roles'),
}));

vi.mock('@propertypro/db', () => ({
  communities: communitiesTable,
  createScopedClient: createScopedClientMock,
  userRoles: userRolesTable,
}));

import { requireCommunityMembership } from '../../src/lib/api/community-membership';

describe('requireCommunityMembership', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createScopedClientMock.mockReturnValue({
      selectFrom: scopedSelectFromMock,
    });
  });

  it('returns typed membership when role and community type are valid', async () => {
    scopedSelectFromMock.mockImplementation(async (table: unknown) => {
      if (table === userRolesTable) {
        return [{ userId: 'user-1', role: 'resident', isUnitOwner: true, displayTitle: 'Owner' }];
      }

      if (table === communitiesTable) {
        return [{ id: 42, communityType: 'condo_718', timezone: 'America/New_York' }];
      }

      return [];
    });

    const membership = await requireCommunityMembership(42, 'user-1');

    expect(membership).toEqual({
      userId: 'user-1',
      communityId: 42,
      communityName: '',
      role: 'resident',
      isAdmin: false,
      isUnitOwner: true,
      displayTitle: 'Owner',
      communityType: 'condo_718',
      timezone: 'America/New_York',
      permissions: undefined,
      presetKey: undefined,
    });
  });

  it('throws DATA_INTEGRITY_ERROR when role is invalid', async () => {
    scopedSelectFromMock.mockImplementation(async (table: unknown) => {
      if (table === userRolesTable) {
        return [{ userId: 'user-1', role: 'superadmin' }];
      }

      if (table === communitiesTable) {
        return [{ id: 42, communityType: 'condo_718' }];
      }

      return [];
    });

    await expect(requireCommunityMembership(42, 'user-1')).rejects.toMatchObject({
      code: 'DATA_INTEGRITY_ERROR',
      statusCode: 500,
    });
  });

  it('throws DATA_INTEGRITY_ERROR when community type is invalid', async () => {
    scopedSelectFromMock.mockImplementation(async (table: unknown) => {
      if (table === userRolesTable) {
        return [{ userId: 'user-1', role: 'resident', isUnitOwner: true, displayTitle: 'Owner' }];
      }

      if (table === communitiesTable) {
        return [{ id: 42, communityType: 'invalid_type' }];
      }

      return [];
    });

    await expect(requireCommunityMembership(42, 'user-1')).rejects.toMatchObject({
      code: 'DATA_INTEGRITY_ERROR',
      statusCode: 500,
    });
  });
});

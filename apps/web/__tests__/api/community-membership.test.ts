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
import { requirePermission } from '../../src/lib/db/access-control';
import { getPresetPermissions } from '@propertypro/shared';

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
        return [{ id: 42, communityType: 'condo_718', timezone: 'America/New_York', isDemo: false }];
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
      subscriptionPlan: null,
      subscriptionStatus: null,
      freeAccessExpiresAt: null,
      timezone: 'America/New_York',
      permissions: undefined,
      presetKey: undefined,
      city: null,
      state: null,
      isDemo: false,
      trialEndsAt: null,
      demoExpiresAt: null,
      electionsAttorneyReviewed: false,
    });
  });

  // BILINGUAL (role-v3): ex-pm_admin backfilled to property_manager.
  // Real-path regression guard for the bug where normalizeManagerPermissions(null, undefined)
  // returned a DEFINED all-DENY object, which skipped checkPermissionV2's fallback and locked
  // the user out. The fix leaves permissions undefined so the matrix fallback engages.
  it('leaves permissions undefined for an ex-pm_admin property_manager (null perms, no preset)', async () => {
    scopedSelectFromMock.mockImplementation(async (table: unknown) => {
      if (table === userRolesTable) {
        return [{
          userId: 'pm-1',
          role: 'property_manager',
          isUnitOwner: false,
          permissions: null,
          presetKey: null,
        }];
      }
      if (table === communitiesTable) {
        return [{ id: 7, communityType: 'condo_718' }];
      }
      return [];
    });

    const membership = await requireCommunityMembership(7, 'pm-1');

    // The load-bearing assertion: undefined, not a populated all-DENY object.
    expect(membership.permissions).toBeUndefined();
    expect(membership.role).toBe('property_manager');

    // Through the real requirePermission → checkPermissionV2 matrix fallback:
    // resolves to the property_manager_admin row, so a write is allowed (matches pm_admin).
    expect(() => requirePermission(membership, 'documents', 'write')).not.toThrow();
    expect(() => requirePermission(membership, 'announcements', 'write')).not.toThrow();
  });

  it('uses preset JSONB defaults for a board property_manager (board_president preset)', async () => {
    scopedSelectFromMock.mockImplementation(async (table: unknown) => {
      if (table === userRolesTable) {
        return [{
          userId: 'board-1',
          role: 'property_manager',
          isUnitOwner: false,
          permissions: null,
          presetKey: 'board_president',
        }];
      }
      if (table === communitiesTable) {
        return [{ id: 9, communityType: 'condo_718' }];
      }
      return [];
    });

    const membership = await requireCommunityMembership(9, 'board-1');

    // A usable preset means permissions are populated (NOT undefined) from the preset.
    expect(membership.permissions).toBeDefined();
    const expected = getPresetPermissions('board_president', 'condo_718');
    expect(membership.permissions?.resources).toEqual(expected.resources);
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

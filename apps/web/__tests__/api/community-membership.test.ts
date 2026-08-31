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
      subscriptionCanceledAt: null,
      subscriptionCurrentPeriodEndAt: null,
      freeAccessExpiresAt: null,
      timezone: 'America/New_York',
      designation: null,
      city: null,
      state: null,
      isDemo: false,
      trialEndsAt: null,
      demoExpiresAt: null,
      electionsAttorneyReviewed: false,
      // Resolved from `community_settings` at hydration. Absent keys mean the
      // STATUTORY defaults, not "uncapped" — see resolveFineCaps (F-04).
      fineCaps: { perFineCents: 10000, aggregateCents: 100000 },
      // Legal gates default to FALSE when the key is absent from
      // community_settings, which is every community until a platform admin
      // turns one on. See docs/audits/2026-08-09-legal-risk-audit.md §2a.
      violationFinesEnabled: false,
      assessmentPaymentsEnabled: false,
      smsDispatchEnabled: false,
      noticePdfGenerationEnabled: false,
    });
  });

  // ── Legal-gate hydration ──────────────────────────────────────────────────
  //
  // These gates read with a strict `=== true`. That is not defensive style:
  // community_settings is untyped JSONB written by an admin API, so a malformed
  // write must read as DISABLED rather than silently enabling a legally-exposed
  // feature. The string case below is the one that actually matters — JSON round
  // trips and form serialisation are exactly how `true` becomes `"true"`.
  describe('legal gate hydration', () => {
    const GATES = [
      'violationFinesEnabled',
      'assessmentPaymentsEnabled',
      'smsDispatchEnabled',
      'noticePdfGenerationEnabled',
    ] as const;

    async function membershipWithSettings(communitySettings: unknown) {
      scopedSelectFromMock.mockImplementation(async (table: unknown) => {
        if (table === userRolesTable) {
          return [{
            userId: 'user-1',
            role: 'resident',
            isUnitOwner: true,
            displayTitle: 'Owner',
            designation: null,
          }];
        }
        return [{ communityType: 'condo_718', communitySettings }];
      });
      return requireCommunityMembership(42, 'user-1');
    }

    it('enables a gate only for boolean true', async () => {
      const membership = await membershipWithSettings({
        violationFinesEnabled: true,
        assessmentPaymentsEnabled: true,
        smsDispatchEnabled: true,
        noticePdfGenerationEnabled: true,
      });
      for (const gate of GATES) {
        expect(membership[gate], gate).toBe(true);
      }
    });

    it.each([
      ['the string "true"', 'true'],
      ['the number 1', 1],
      ['a truthy object', {}],
      ['the string "yes"', 'yes'],
      ['null', null],
      ['false', false],
    ])('treats %s as disabled', async (_label, value) => {
      const membership = await membershipWithSettings(
        Object.fromEntries(GATES.map((g) => [g, value])),
      );
      for (const gate of GATES) {
        expect(membership[gate], gate).toBe(false);
      }
    });

    it('defaults every gate to false when community_settings is empty or malformed', async () => {
      for (const settings of [{}, null, undefined, 'not-an-object', 42]) {
        const membership = await membershipWithSettings(settings);
        for (const gate of GATES) {
          expect(membership[gate], `${gate} with settings=${JSON.stringify(settings)}`).toBe(false);
        }
      }
    });

    it('resolves each gate independently', async () => {
      const membership = await membershipWithSettings({ violationFinesEnabled: true });
      expect(membership.violationFinesEnabled).toBe(true);
      expect(membership.assessmentPaymentsEnabled).toBe(false);
      expect(membership.smsDispatchEnabled).toBe(false);
      expect(membership.noticePdfGenerationEnabled).toBe(false);
    });
  });

  it('surfaces designation for a board-designated row', async () => {
    scopedSelectFromMock.mockImplementation(async (table: unknown) => {
      if (table === userRolesTable) {
        return [{
          userId: 'user-1',
          role: 'property_manager',
          isUnitOwner: false,
          displayTitle: 'Board President',
          designation: 'board_president',
        }];
      }
      if (table === communitiesTable) {
        return [{ id: 42, communityType: 'condo_718', timezone: 'America/New_York', isDemo: false }];
      }
      return [];
    });

    const membership = await requireCommunityMembership(42, 'user-1');

    expect(membership.designation).toBe('board_president');
    expect(membership.isAdmin).toBe(true);
  });

  it('surfaces designation for a board_member-designated row', async () => {
    scopedSelectFromMock.mockImplementation(async (table: unknown) => {
      if (table === userRolesTable) {
        return [{
          userId: 'user-1',
          role: 'property_manager',
          isUnitOwner: false,
          displayTitle: 'Board Member',
          designation: 'board_member',
        }];
      }
      if (table === communitiesTable) {
        return [{ id: 42, communityType: 'condo_718', timezone: 'America/New_York', isDemo: false }];
      }
      return [];
    });

    const membership = await requireCommunityMembership(42, 'user-1');

    expect(membership.designation).toBe('board_member');
    expect(membership.isAdmin).toBe(true);
  });

  it('coerces an invalid designation value to null (whitelist fallback)', async () => {
    scopedSelectFromMock.mockImplementation(async (table: unknown) => {
      if (table === userRolesTable) {
        return [{
          userId: 'user-1',
          role: 'property_manager',
          isUnitOwner: false,
          displayTitle: 'Treasurer',
          designation: 'treasurer',
        }];
      }
      if (table === communitiesTable) {
        return [{ id: 42, communityType: 'condo_718', timezone: 'America/New_York', isDemo: false }];
      }
      return [];
    });

    const membership = await requireCommunityMembership(42, 'user-1');

    expect(membership.designation).toBeNull();
  });

  // role-v3: a property_manager row resolves to the property_manager_admin matrix row.
  // Regression guard for the original lockout bug — with permissions/presetKey columns
  // removed, checkPermissionV2's role-matrix fallback must grant management-tier writes.
  it('grants management-tier writes for a property_manager via the matrix fallback', async () => {
    scopedSelectFromMock.mockImplementation(async (table: unknown) => {
      if (table === userRolesTable) {
        return [{
          userId: 'pm-1',
          role: 'property_manager',
          isUnitOwner: false,
        }];
      }
      if (table === communitiesTable) {
        return [{ id: 7, communityType: 'condo_718' }];
      }
      return [];
    });

    const membership = await requireCommunityMembership(7, 'pm-1');

    expect(membership.role).toBe('property_manager');
    expect(membership.isAdmin).toBe(true);

    // Through the real requirePermission → checkPermissionV2 matrix fallback:
    // resolves to the property_manager_admin row, so a write is allowed.
    expect(() => requirePermission(membership, 'documents', 'write')).not.toThrow();
    expect(() => requirePermission(membership, 'announcements', 'write')).not.toThrow();
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

/**
 * Security regression tests — residents POST + PATCH manager-tier lockdown.
 *
 * Proves that the `isResidentTierRole` guard in residents/route.ts blocks
 * manager-tier role assignments even when the actor holds full `residents:write`
 * permission. `requirePermission` is mocked to PASS (never throws), so any 403
 * returned here comes exclusively from the new manager-tier guard.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  logAuditEventMock,
  getResidentRoleByUserIdMock,
  getResidentUserByEmailMock,
  getResidentCommunityTypeValueMock,
  createResidentRoleMock,
  createResidentUserMock,
  createResidentNotificationPreferencesMock,
  updateResidentRoleMock,
  updateResidentUserMock,
  getResidentUserByIdMock,
  listResidentsForCommunityMock,
  deleteResidentRoleMock,
  revokeVisitorPassesForUserMock,
  requireCommunityTypeMock,
  requireCommunityRoleMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(), // mocked to PASS (no-op) — 403 must come from new guard
  assertNotDemoGraceMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  getResidentRoleByUserIdMock: vi.fn(),
  getResidentUserByEmailMock: vi.fn(),
  getResidentCommunityTypeValueMock: vi.fn(),
  createResidentRoleMock: vi.fn(),
  createResidentUserMock: vi.fn(),
  createResidentNotificationPreferencesMock: vi.fn(),
  updateResidentRoleMock: vi.fn(),
  updateResidentUserMock: vi.fn(),
  getResidentUserByIdMock: vi.fn(),
  listResidentsForCommunityMock: vi.fn(),
  deleteResidentRoleMock: vi.fn(),
  revokeVisitorPassesForUserMock: vi.fn(),
  requireCommunityTypeMock: vi.fn(),
  requireCommunityRoleMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

// requirePermission is mocked to be a no-op — the actor IS a fully-permitted admin.
// The 403 on manager-tier roles must come from the isResidentTierRole guard, not here.
vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/services/resident-service', () => ({
  getResidentRoleByUserId: getResidentRoleByUserIdMock,
  getResidentUserByEmail: getResidentUserByEmailMock,
  getResidentCommunityTypeValue: getResidentCommunityTypeValueMock,
  createResidentRole: createResidentRoleMock,
  createResidentUser: createResidentUserMock,
  createResidentNotificationPreferences: createResidentNotificationPreferencesMock,
  updateResidentRole: updateResidentRoleMock,
  updateResidentUser: updateResidentUserMock,
  getResidentUserById: getResidentUserByIdMock,
  listResidentsForCommunity: listResidentsForCommunityMock,
  deleteResidentRole: deleteResidentRoleMock,
}));

vi.mock('@/lib/services/package-visitor-service', () => ({
  revokeVisitorPassesForUser: revokeVisitorPassesForUserMock,
}));

vi.mock('@/lib/utils/community-validators', () => ({
  requireCommunityType: requireCommunityTypeMock,
  requireCommunityRole: requireCommunityRoleMock,
}));

import { POST, PATCH } from '../../../src/app/api/v1/residents/route';

const COMMUNITY_ID = 42;

const ACTOR_MEMBERSHIP = {
  userId: 'admin-1',
  communityId: COMMUNITY_ID,
  role: 'manager',
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board Member',
  presetKey: 'board_member',
  communityType: 'condo_718' as const,
};

function postReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/residents', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-community-id': String(COMMUNITY_ID),
    },
    body: JSON.stringify(body),
  });
}

function patchReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/residents', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-community-id': String(COMMUNITY_ID),
    },
    body: JSON.stringify(body),
  });
}

describe('residents manager-tier lockdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('admin-1');
    requireCommunityMembershipMock.mockResolvedValue(ACTOR_MEMBERSHIP);
    // resolveEffectiveCommunityId: reconcile body communityId with header — return it
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    // requirePermission is a no-op — actor has residents:write
    requirePermissionMock.mockReturnValue(undefined);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    logAuditEventMock.mockResolvedValue(undefined);
    // requireCommunityType returns a valid type
    requireCommunityTypeMock.mockImplementation((_type: string) => 'condo_718');
    // requireCommunityRole returns its first arg
    requireCommunityRoleMock.mockImplementation((role: string) => role);
  });

  // -----------------------------------------------------------------------
  // PATCH: manager-tier role → 403
  // role='property_manager' is valid per the contract schema (COMMUNITY_ROLES
  // includes it) but must be blocked by the isResidentTierRole guard before any
  // DB write.
  // -----------------------------------------------------------------------
  describe('PATCH with manager-tier role', () => {
    it('returns 403 and does NOT call updateResidentRole', async () => {
      // Existing resident row so the handler would proceed past the not-found check
      getResidentRoleByUserIdMock.mockResolvedValue({
        role: 'resident',
        unitId: 1,
        isUnitOwner: false,
        presetKey: null,
      });

      const res = await PATCH(
        patchReq({
          communityId: COMMUNITY_ID,
          userId: 'b0476f53-6f95-4493-b329-13ff1a2334e6',
          role: 'property_manager',
        }),
      );

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.message).toMatch(/Manager roles/i);

      // The write must NOT have been called — escalation blocked
      expect(updateResidentRoleMock).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // PATCH on an EXISTING manager-tier row with NO `role` (the escalation vector)
  // A non-root admin must not be able to mutate a property_manager row's
  // unit/owner config via the residents path. The guard fires on the EXISTING
  // role whenever a role-config field (role/unitId/isUnitOwner) is present, even
  // when `role` itself is omitted.
  // -----------------------------------------------------------------------
  describe('PATCH unit/owner on an existing property_manager (escalation vector)', () => {
    it('returns 403 and does NOT call updateResidentRole when role is omitted', async () => {
      // Existing manager-tier row (post-2a backfill: board/CAM members are
      // property_manager rows).
      getResidentRoleByUserIdMock.mockResolvedValue({
        role: 'property_manager',
        unitId: null,
        isUnitOwner: false,
      });

      const res = await PATCH(
        patchReq({
          communityId: COMMUNITY_ID,
          userId: 'b0476f53-6f95-4493-b329-13ff1a2334e6',
          // No `role` — only a unit-config change. The guard must still fire on
          // the existing property_manager role before any role-row write.
          unitId: 5,
        }),
      );

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.message).toMatch(/Manager roles/i);

      // The role-config write must NOT have happened.
      expect(updateResidentRoleMock).not.toHaveBeenCalled();
    });

    it('still allows contact-only (fullName/phone) edits on a manager-tier row', async () => {
      getResidentRoleByUserIdMock.mockResolvedValue({
        role: 'property_manager',
        unitId: null,
        isUnitOwner: false,
      });
      getResidentUserByIdMock.mockResolvedValue({ fullName: 'Old', phone: null });
      updateResidentUserMock.mockResolvedValue(undefined);

      const res = await PATCH(
        patchReq({
          communityId: COMMUNITY_ID,
          userId: 'b0476f53-6f95-4493-b329-13ff1a2334e6',
          fullName: 'New Name',
        }),
      );

      // Contact-only edit has no access impact → not blocked by the guard.
      expect(res.status).not.toBe(403);
      // The role-config write must NOT have run; only the user (contact) update.
      expect(updateResidentRoleMock).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST: manager-tier role → 403
  // role='property_manager' passes Zod (COMMUNITY_ROLES includes it) but
  // must be blocked by the isResidentTierRole guard before any DB write.
  // -----------------------------------------------------------------------
  describe('POST with manager-tier role', () => {
    it('returns 403 and does NOT call createResidentRole or createResidentUser', async () => {
      const res = await POST(
        postReq({
          communityId: COMMUNITY_ID,
          email: 'pm@example.com',
          fullName: 'Property Manager',
          role: 'property_manager',
          unitId: null,
        }),
      );

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.message).toMatch(/Manager roles/i);

      // Neither the user row nor the role row should be created
      expect(createResidentRoleMock).not.toHaveBeenCalled();
      expect(createResidentUserMock).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Positive control: PATCH with resident-tier role does NOT 403
  // -----------------------------------------------------------------------
  describe('PATCH with resident-tier role (positive control)', () => {
    it('does not 403 when role is resident', async () => {
      // Existing row
      getResidentRoleByUserIdMock.mockResolvedValue({
        role: 'resident',
        unitId: 1,
        isUnitOwner: false,
        presetKey: null,
      });
      // Let the rest of the handler proceed — mock updateResidentRole
      updateResidentRoleMock.mockResolvedValue(undefined);

      const res = await PATCH(
        patchReq({
          communityId: COMMUNITY_ID,
          userId: 'b0476f53-6f95-4493-b329-13ff1a2334e6',
          role: 'resident',
          unitId: 5,
        }),
      );

      // Must NOT be 403 from the manager-tier guard
      expect(res.status).not.toBe(403);
    });
  });
});

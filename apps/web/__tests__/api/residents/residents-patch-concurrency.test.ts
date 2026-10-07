/**
 * PATCH /api/v1/residents: unchanged fields are neither written nor audited,
 * and an `expectedUpdatedAt` token refuses a save over someone else's change.
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

vi.mock('@/lib/middleware/read-entitlement-guard', () => ({
  requireEntitledForAdminRead: vi.fn(async () => undefined),
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
  createScopedClient: vi.fn(() => ({})),
}));

// The route reaches @propertypro/db/unsafe through user-linking, which loads
// drizzle.ts and throws without DATABASE_URL. No test here takes the
// existing-user branch that calls it, so the factory is empty: a future call
// fails naming the export instead of querying.
vi.mock('@propertypro/db/unsafe', () => ({}));

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

vi.mock('@/lib/services/scoped-fk-validators', () => ({ assertUnitInCommunity: vi.fn(async () => undefined) }));

vi.mock('@/lib/services/package-visitor-service', () => ({
  revokeVisitorPassesForUser: revokeVisitorPassesForUserMock,
}));

vi.mock('@/lib/utils/community-validators', () => ({
  requireCommunityType: requireCommunityTypeMock,
  requireCommunityRole: requireCommunityRoleMock,
}));

vi.mock('@/lib/services/notice-consent-service', () => ({
  withdrawNoticeConsent: vi.fn().mockResolvedValue(false),
}));

import { PATCH } from '../../../src/app/api/v1/residents/route';

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

function deleteReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/residents', {
    method: 'DELETE',
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

describe('PATCH /api/v1/residents — only real changes, and no silent overwrites', () => {
  const USER = '11111111-1111-4111-8111-111111111111';
  const TOKEN = '2026-10-01T09:00:00.456Z';

  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('admin-1');
    requireCommunityMembershipMock.mockResolvedValue(ACTOR_MEMBERSHIP);
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    requirePermissionMock.mockReturnValue(undefined);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    logAuditEventMock.mockResolvedValue(undefined);
    requireCommunityTypeMock.mockImplementation(() => 'condo_718');
    requireCommunityRoleMock.mockImplementation((role: string) => role);
    getResidentCommunityTypeValueMock.mockResolvedValue('condo_718');
    getResidentRoleByUserIdMock.mockResolvedValue({ role: 'resident', unitId: 4, isUnitOwner: true });
    getResidentUserByIdMock.mockResolvedValue({ fullName: 'Ana Ruiz', phone: '555-0100' });
    updateResidentRoleMock.mockResolvedValue(true);
  });

  const patch = (body: Record<string, unknown>) =>
    PATCH(patchReq({ communityId: COMMUNITY_ID, userId: USER, ...body }));

  it('re-saving the form unchanged writes and audits nothing (no "unit 4 → 4" rows)', async () => {
    const res = await patch({ fullName: 'Ana Ruiz', phone: '555-0100', unitId: 4, isUnitOwner: true, expectedUpdatedAt: TOKEN });
    expect(res.status).toBe(200);
    expect(updateResidentRoleMock).not.toHaveBeenCalled();
    expect(updateResidentUserMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('audits only the field that changed', async () => {
    await patch({ fullName: 'Ana Ruiz', phone: '555-0100', unitId: 9, isUnitOwner: true });
    expect(updateResidentRoleMock).toHaveBeenCalledWith(COMMUNITY_ID, USER, { unitId: 9 });
    expect(updateResidentUserMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ oldValues: { unitId: 4 }, newValues: { unitId: 9 } }),
    );
  });

  it('with a token, a name-only edit still claims the membership row first (bumping its version)', async () => {
    await patch({ fullName: 'Ana R. Ruiz', expectedUpdatedAt: TOKEN });
    expect(updateResidentRoleMock).toHaveBeenCalledWith(COMMUNITY_ID, USER, {}, TOKEN);
    expect(updateResidentUserMock).toHaveBeenCalledWith(COMMUNITY_ID, USER, { fullName: 'Ana R. Ruiz' });
    expect(updateResidentRoleMock.mock.invocationCallOrder[0]!).toBeLessThan(
      updateResidentUserMock.mock.invocationCallOrder[0]!,
    );
  });

  it('a stale token is a 409 and nothing else is written or audited', async () => {
    updateResidentRoleMock.mockResolvedValue(false);
    const res = await patch({ fullName: 'Ana R. Ruiz', unitId: 9, expectedUpdatedAt: TOKEN });
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toMatch(/someone else changed this resident/i);
    expect(updateResidentUserMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});

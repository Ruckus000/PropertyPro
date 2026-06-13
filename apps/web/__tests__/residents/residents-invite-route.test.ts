/**
 * Unit tests — `POST /api/v1/residents/invite` (A1 drain #140).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  assertNotDemoGraceMock,
  requireActiveSubscriptionForMutationMock,
  requirePermissionMock,
  createOnboardingResidentMock,
  createOnboardingInvitationMock,
  getCommunityTypeForOnboardingMock,
  logAuditEventMock,
  tryAutoCompleteMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  createOnboardingResidentMock: vi.fn(),
  createOnboardingInvitationMock: vi.fn(),
  getCommunityTypeForOnboardingMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  tryAutoCompleteMock: vi.fn(),
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

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/services/onboarding-service', () => ({
  createOnboardingResident: createOnboardingResidentMock,
  createOnboardingInvitation: createOnboardingInvitationMock,
  getCommunityTypeForOnboarding: getCommunityTypeForOnboardingMock,
}));

vi.mock('@/lib/services/onboarding-checklist-service', () => ({
  tryAutoComplete: tryAutoCompleteMock,
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
}));

import { POST } from '../../src/app/api/v1/residents/invite/route';

const MEMBERSHIP = {
  userId: 'actor-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'President',
  communityType: 'condo_718' as const,
};

function inviteRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/residents/invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const BASE_BODY = {
  communityId: 42,
  email: 'new@example.com',
  fullName: 'New Resident',
  role: 'resident',
  unitId: 10,
  isUnitOwner: false,
  sendInvitation: true,
};

describe('POST /api/v1/residents/invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('actor-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    getCommunityTypeForOnboardingMock.mockResolvedValue('condo_718');
    createOnboardingResidentMock.mockResolvedValue({ userId: 'user-new', isNewUser: true });
    createOnboardingInvitationMock.mockResolvedValue({
      token: 'tok',
      expiresAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    logAuditEventMock.mockResolvedValue(undefined);
    tryAutoCompleteMock.mockResolvedValue(undefined);
  });

  it('creates resident and invitation on happy path', async () => {
    const res = await POST(inviteRequest(BASE_BODY));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({
      userId: 'user-new',
      isNewUser: true,
      invitationFailed: false,
      token: 'tok',
      expiresAt: '2026-06-01T00:00:00.000Z',
    });
    expect(createOnboardingResidentMock).toHaveBeenCalled();
    expect(createOnboardingInvitationMock).toHaveBeenCalled();
  });

  it('returns invitationFailed when email send fails', async () => {
    createOnboardingInvitationMock.mockRejectedValueOnce(new Error('smtp down'));

    const res = await POST(inviteRequest(BASE_BODY));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.invitationFailed).toBe(true);
    expect(logAuditEventMock).toHaveBeenCalled();
  });

  it('returns 403 when residents write permission denied', async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('Forbidden');
    });

    const res = await POST(inviteRequest(BASE_BODY));
    expect(res.status).toBe(403);
    expect(createOnboardingResidentMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Security regression — manager-tier lockdown (role-v3 invariant 3).
  // `requirePermission` is mocked to PASS, so the actor IS a fully-permitted
  // admin with residents:write. Manager-tier roles must still be rejected:
  // the contract narrows `role` to 'resident', and the handler carries an
  // isResidentTierRole guard behind it. Only root mints property_manager.
  // -------------------------------------------------------------------------
  describe('manager-tier lockdown', () => {
    it.each(['manager', 'pm_admin'])(
      'rejects role=%s and never creates the resident, even with a presetKey',
      async (role) => {
        const res = await POST(
          inviteRequest({
            ...BASE_BODY,
            role,
            presetKey: 'cam',
          }),
        );

        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error.code).toBe('VALIDATION_ERROR');
        // No user row, no role row, no invitation — escalation blocked.
        expect(createOnboardingResidentMock).not.toHaveBeenCalled();
        expect(createOnboardingInvitationMock).not.toHaveBeenCalled();
      },
    );

    it.each(['board_president', 'board_member', 'cam', 'site_manager', 'property_manager_admin'])(
      'rejects legacy admin role=%s',
      async (role) => {
        const res = await POST(inviteRequest({ ...BASE_BODY, role }));

        expect(res.status).toBe(400);
        expect(createOnboardingResidentMock).not.toHaveBeenCalled();
      },
    );

    it('ignores a stray presetKey on a resident invite (stripped by the contract)', async () => {
      const res = await POST(inviteRequest({ ...BASE_BODY, presetKey: 'cam' }));

      expect(res.status).toBe(200);
      // presetKey must not reach the service — resident rows never carry presets.
      const callArgs = createOnboardingResidentMock.mock.calls[0]![0];
      expect(callArgs).not.toHaveProperty('presetKey');
    });
  });

  it('returns 400 for unit owner in apartment community', async () => {
    getCommunityTypeForOnboardingMock.mockResolvedValueOnce('apartment');

    const res = await POST(
      inviteRequest({
        ...BASE_BODY,
        role: 'resident',
        isUnitOwner: true,
      }),
    );

    expect(res.status).toBe(400);
    expect(createOnboardingResidentMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid email', async () => {
    const res = await POST(
      inviteRequest({
        ...BASE_BODY,
        email: 'not-an-email',
      }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });
});

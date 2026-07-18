import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  logAuditEventMock,
  sendEmailMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  assertNotDemoGraceMock,
  createInvitationMock,
  getCommunityNameForInvitationMock,
  getUserForInvitationMock,
  getUserRoleForInvitationMock,
  findInvitationByTokenMock,
  createSupabaseAuthUserFromInvitationMock,
  markInvitationConsumedMock,
} = vi.hoisted(() => ({
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  sendEmailMock: vi.fn().mockResolvedValue({ id: 'test_1' }),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn().mockResolvedValue(undefined),
  resolveEffectiveCommunityIdMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn().mockResolvedValue(undefined),
  createInvitationMock: vi.fn().mockResolvedValue(undefined),
  getCommunityNameForInvitationMock: vi.fn(),
  getUserForInvitationMock: vi.fn(),
  getUserRoleForInvitationMock: vi.fn(),
  findInvitationByTokenMock: vi.fn(),
  createSupabaseAuthUserFromInvitationMock: vi.fn(),
  markInvitationConsumedMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
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

vi.mock('@propertypro/email', () => ({
  sendEmail: sendEmailMock,
  InvitationEmail: (props: unknown) => ({ type: 'InvitationEmail', props }) as { type: string; props: unknown },
}));

vi.mock('@/lib/services/invitations-service', () => ({
  createInvitation: createInvitationMock,
  getCommunityNameForInvitation: getCommunityNameForInvitationMock,
  getUserForInvitation: getUserForInvitationMock,
  getUserRoleForInvitation: getUserRoleForInvitationMock,
  findInvitationByToken: findInvitationByTokenMock,
  createSupabaseAuthUserFromInvitation: createSupabaseAuthUserFromInvitationMock,
  markInvitationConsumed: markInvitationConsumedMock,
}));

import { PATCH, POST } from '../../src/app/api/v1/invitations/route';

// requirePermission (from @/lib/db/access-control) is NOT mocked — it runs for
// real against the static RBAC matrix — so the mocked membership must be a
// realistic management-tier row for the happy path to clear residents:write.
const adminMembership = {
  communityId: 99,
  userId: 'inviter-uuid',
  role: 'property_manager' as const,
  communityType: 'condo_718' as const,
  isUnitOwner: false,
  isAdmin: true,
  roleTitle: 'Property Manager',
  designation: null,
};

describe('p1-20 invitation auth flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('inviter-uuid');
    requireCommunityMembershipMock.mockResolvedValue(adminMembership);
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
  });

  it('POST sends invitation email with correct link and community name', async () => {
    getCommunityNameForInvitationMock.mockResolvedValueOnce({ id: 99, name: 'Sunset Condos' });
    getUserForInvitationMock.mockResolvedValueOnce({
      id: 'user-1',
      email: 'resident@example.com',
      fullName: 'Jane Resident',
    });
    getUserRoleForInvitationMock.mockResolvedValueOnce('resident');

    const req = new NextRequest('http://localhost:3000/api/v1/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 99, userId: 'user-1', ttlDays: 7 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(99, 'inviter-uuid');
    expect(createInvitationMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 99, userId: 'user-1', invitedBy: 'inviter-uuid' }),
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const emailArgs = sendEmailMock.mock.calls[0]?.[0];
    expect(emailArgs.to).toBe('resident@example.com');
    expect(emailArgs.subject).toContain('Sunset Condos');

    const reactEl = emailArgs.react as { props: { branding: { communityName: string }; inviteUrl: string } };
    expect(reactEl.props.branding.communityName).toBe('Sunset Condos');
    expect(reactEl.props.inviteUrl).toContain('/auth/accept-invite?token=');
    expect(reactEl.props.inviteUrl).toContain('communityId=99');

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user_invited', communityId: 99 }),
    );

    const json = (await res.json()) as { data: { success: boolean } };
    expect(json.data.success).toBe(true);
  });

  it('POST returns 403 for authenticated non-member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const req = new NextRequest('http://localhost:3000/api/v1/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 99, userId: 'user-1', ttlDays: 7 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('POST returns 403 for a non-admin member (residents:write gate)', async () => {
    // A member with a resident (tenant) role must not be able to invite (AZ-01).
    requireCommunityMembershipMock.mockResolvedValueOnce({
      ...adminMembership,
      role: 'resident' as const,
      isUnitOwner: false,
      isAdmin: false,
      roleTitle: 'Resident',
    });

    const req = new NextRequest('http://localhost:3000/api/v1/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 99, userId: 'user-1', ttlDays: 7 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    // The invitation must not be created or emailed when the gate rejects.
    expect(createInvitationMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('PATCH consumes token, creates auth user, and returns email', async () => {
    const token = 'tok123';
    findInvitationByTokenMock.mockResolvedValueOnce({
      id: 1,
      token,
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    getUserForInvitationMock.mockResolvedValueOnce({
      id: 'user-1',
      email: 'resident@example.com',
      fullName: 'Jane Resident',
    });
    createSupabaseAuthUserFromInvitationMock.mockResolvedValueOnce({ ok: true });

    const req = new NextRequest('http://localhost:3000/api/v1/invitations', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 55, token, password: 'Strongpass123!' }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { email: string } };
    expect(json.data.email).toBe('resident@example.com');
    expect(markInvitationConsumedMock).toHaveBeenCalledWith(55, token, expect.any(Date));
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update', communityId: 55 }),
    );
  });

  it('PATCH rejects already used token', async () => {
    const token = 'used123';
    findInvitationByTokenMock.mockResolvedValueOnce({
      id: 1,
      token,
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 1000),
      consumedAt: new Date(),
    });

    const req = new NextRequest('http://localhost:3000/api/v1/invitations', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 5, token, password: 'Pass123456!' }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('TOKEN_USED');
  });

  it('PATCH rejects expired token', async () => {
    const token = 'exp123';
    findInvitationByTokenMock.mockResolvedValueOnce({
      id: 1,
      token,
      userId: 'user-1',
      expiresAt: new Date(Date.now() - 1000),
      consumedAt: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/invitations', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 9, token, password: 'Pass123456!' }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('TOKEN_EXPIRED');
  });
});

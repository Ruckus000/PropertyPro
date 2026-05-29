/**
 * Unit tests for POST /api/v1/move-checklists/[id]/steps/[stepKey]/action (A1 drain #150).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  isAdminRoleMock,
  getMoveChecklistMock,
  updateChecklistStepMock,
  createOnboardingInvitationMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  isAdminRoleMock: vi.fn(),
  getMoveChecklistMock: vi.fn(),
  updateChecklistStepMock: vi.fn(),
  createOnboardingInvitationMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@propertypro/shared', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  isAdminRole: isAdminRoleMock,
}));

vi.mock('@/lib/services/move-checklist-service', () => ({
  getMoveChecklist: getMoveChecklistMock,
  updateChecklistStep: updateChecklistStepMock,
  getResidentAndCommunityForWelcomeEmail: vi.fn().mockResolvedValue(null),
  createInspectionRequestForChecklist: vi.fn(),
}));

vi.mock('@/lib/services/onboarding-service', () => ({
  createOnboardingInvitation: createOnboardingInvitationMock,
}));

vi.mock('@propertypro/db', () => ({
  ACTIONABLE_STEPS: {
    portal_account: { action: 'send_invite', label: 'Send Portal Invite' },
    welcome_packet: { action: 'send_welcome', label: 'Send Welcome Packet' },
    move_in_inspection: { action: 'create_inspection', label: 'Schedule Inspection' },
  },
}));

vi.mock('@propertypro/email', () => ({
  WelcomeEmail: () => null,
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '../../src/app/api/v1/move-checklists/[id]/steps/[stepKey]/action/route';

const ADMIN_MEMBERSHIP = {
  userId: 'admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const CHECKLIST = {
  id: 7,
  communityId: 42,
  leaseId: 10,
  unitId: 20,
  residentId: '00000000-0000-4000-8000-000000000001',
  type: 'move_in' as const,
  checklistData: {},
};

const UPDATED_STEP = { completed: true, completedAt: '2026-05-01T00:00:00.000Z' };

function buildRequest(
  checklistId: number,
  stepKey: string,
  body: Record<string, unknown>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/move-checklists/${checklistId}/steps/${stepKey}/action`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

describe('POST /api/v1/move-checklists/[id]/steps/[stepKey]/action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('admin-1');
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    isAdminRoleMock.mockReturnValue(true);
    getMoveChecklistMock.mockResolvedValue(CHECKLIST);
    updateChecklistStepMock.mockResolvedValue(UPDATED_STEP);
    createOnboardingInvitationMock.mockResolvedValue({ id: 99 });
  });

  it('send_invite completes step and returns nested action payload', async () => {
    const res = await POST(buildRequest(7, 'portal_account', { communityId: 42, action: 'send_invite' }), {
      params: Promise.resolve({ id: '7', stepKey: 'portal_account' }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { data: unknown; action: { triggered: string; stepKey: string } };
    };
    expect(json.data.action).toEqual({ triggered: 'send_invite', stepKey: 'portal_account' });
    expect(createOnboardingInvitationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 42,
        userId: CHECKLIST.residentId,
        actorUserId: 'admin-1',
      }),
    );
    expect(updateChecklistStepMock).toHaveBeenCalledWith(
      42,
      7,
      'portal_account',
      expect.objectContaining({
        completed: true,
        linkedEntityType: 'invitation',
        linkedEntityId: 99,
      }),
      'admin-1',
    );
  });

  it('rejects non-admin with 403', async () => {
    isAdminRoleMock.mockReturnValue(false);
    const res = await POST(
      buildRequest(7, 'portal_account', { communityId: 42, action: 'send_invite' }),
      { params: Promise.resolve({ id: '7', stepKey: 'portal_account' }) },
    );
    expect(res.status).toBe(403);
    expect(getMoveChecklistMock).not.toHaveBeenCalled();
  });

  it('returns 404 when checklist is missing', async () => {
    getMoveChecklistMock.mockResolvedValue(null);
    const res = await POST(
      buildRequest(7, 'portal_account', { communityId: 42, action: 'send_invite' }),
      { params: Promise.resolve({ id: '7', stepKey: 'portal_account' }) },
    );
    expect(res.status).toBe(404);
  });

  it('rejects mismatched action for step key', async () => {
    const res = await POST(
      buildRequest(7, 'portal_account', { communityId: 42, action: 'send_welcome' }),
      { params: Promise.resolve({ id: '7', stepKey: 'portal_account' }) },
    );
    expect(res.status).toBe(400);
    expect(createOnboardingInvitationMock).not.toHaveBeenCalled();
  });

  it('rejects invalid checklist id in path', async () => {
    const res = await POST(
      buildRequest(0, 'portal_account', { communityId: 42, action: 'send_invite' }),
      { params: Promise.resolve({ id: '0', stepKey: 'portal_account' }) },
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(getMoveChecklistMock).not.toHaveBeenCalled();
  });
});

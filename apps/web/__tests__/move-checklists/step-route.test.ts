import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  isAdminRoleMock,
  updateChecklistStepMock,
  assertNotDemoGraceMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  isAdminRoleMock: vi.fn(),
  updateChecklistStepMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/move-checklist-service', () => ({
  updateChecklistStep: updateChecklistStepMock,
}));

import { PATCH } from '../../src/app/api/v1/move-checklists/[id]/steps/[stepKey]/route';

const ADMIN_MEMBERSHIP = {
  userId: 'admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const UPDATED_STEP = { key: 'upload_lease', completed: true };

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('admin-1');
  requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
  isAdminRoleMock.mockReturnValue(true);
  updateChecklistStepMock.mockResolvedValue(UPDATED_STEP);
});

describe('PATCH /api/v1/move-checklists/[id]/steps/[stepKey]', () => {
  it('updates a checklist step for admin', async () => {
    const res = await PATCH(
      new NextRequest('http://localhost:3000/api/v1/move-checklists/1/steps/upload_lease', {
        method: 'PATCH',
        body: JSON.stringify({ communityId: 42, completed: true }),
      }),
      { params: Promise.resolve({ id: '1', stepKey: 'upload_lease' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ data: UPDATED_STEP });
    expect(updateChecklistStepMock).toHaveBeenCalledWith(
      42,
      1,
      'upload_lease',
      { completed: true },
      'admin-1',
    );
  });

  it('returns 403 for non-admin', async () => {
    isAdminRoleMock.mockReturnValueOnce(false);

    const res = await PATCH(
      new NextRequest('http://localhost:3000/api/v1/move-checklists/1/steps/upload_lease', {
        method: 'PATCH',
        body: JSON.stringify({ communityId: 42, completed: true }),
      }),
      { params: Promise.resolve({ id: '1', stepKey: 'upload_lease' }) },
    );

    expect(res.status).toBe(403);
    expect(updateChecklistStepMock).not.toHaveBeenCalled();
  });
});

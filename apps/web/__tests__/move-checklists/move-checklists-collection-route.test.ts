import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  isAdminRoleMock,
  listMoveChecklistsMock,
  createMoveChecklistMock,
  assertNotDemoGraceMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  isAdminRoleMock: vi.fn(),
  listMoveChecklistsMock: vi.fn(),
  createMoveChecklistMock: vi.fn(),
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
  listMoveChecklists: listMoveChecklistsMock,
  createMoveChecklist: createMoveChecklistMock,
}));

import { GET, POST } from '../../src/app/api/v1/move-checklists/route';

const ADMIN_MEMBERSHIP = {
  userId: 'admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const CHECKLIST_FIXTURE = {
  id: 1,
  communityId: 42,
  leaseId: 10,
  unitId: 20,
  residentId: '00000000-0000-4000-8000-000000000001',
  type: 'move_in' as const,
  checklistData: {},
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  completedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('admin-1');
  requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
  isAdminRoleMock.mockReturnValue(true);
  listMoveChecklistsMock.mockResolvedValue([CHECKLIST_FIXTURE]);
  createMoveChecklistMock.mockResolvedValue(CHECKLIST_FIXTURE);
});

describe('GET /api/v1/move-checklists', () => {
  it('lists checklists for admin', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/move-checklists?communityId=42'),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown[] };
    expect(json.data).toHaveLength(1);
    expect(listMoveChecklistsMock).toHaveBeenCalledWith(42, {});
  });

  it('forwards filters to the service', async () => {
    await GET(
      new NextRequest(
        'http://localhost:3000/api/v1/move-checklists?communityId=42&leaseId=10&type=move_in&completed=false',
      ),
    );
    expect(listMoveChecklistsMock).toHaveBeenCalledWith(42, {
      leaseId: 10,
      type: 'move_in',
      completed: false,
    });
  });

  it('returns 403 for non-admin members', async () => {
    isAdminRoleMock.mockReturnValue(false);
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/move-checklists?communityId=42'),
    );
    expect(res.status).toBe(403);
    expect(listMoveChecklistsMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/move-checklists?communityId=42'),
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/move-checklists', () => {
  it('creates a checklist for admin', async () => {
    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/move-checklists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 42,
          leaseId: 10,
          unitId: 20,
          residentId: '00000000-0000-4000-8000-000000000001',
          type: 'move_in',
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(createMoveChecklistMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 42, type: 'move_in' }),
      'admin-1',
    );
  });

  it('returns 403 for non-admin members', async () => {
    isAdminRoleMock.mockReturnValue(false);
    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/move-checklists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 42,
          leaseId: 10,
          unitId: 20,
          residentId: '00000000-0000-4000-8000-000000000001',
          type: 'move_out',
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(createMoveChecklistMock).not.toHaveBeenCalled();
  });
});

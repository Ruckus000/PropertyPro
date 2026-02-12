import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  createScopedClientMock,
  logAuditEventMock,
  scopedQueryMock,
  scopedInsertMock,
  scopedUpdateMock,
  scopedHardDeleteMock,
  communitiesTable,
  usersTable,
  userRolesTable,
  notificationPreferencesTable,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  scopedQueryMock: vi.fn(),
  scopedInsertMock: vi.fn(),
  scopedUpdateMock: vi.fn(),
  scopedHardDeleteMock: vi.fn(),
  communitiesTable: Symbol('communities'),
  usersTable: Symbol('users'),
  userRolesTable: Symbol('user_roles'),
  notificationPreferencesTable: Symbol('notification_preferences'),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@propertypro/db', () => ({
  communities: communitiesTable,
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  notificationPreferences: notificationPreferencesTable,
  userRoles: userRolesTable,
  users: usersTable,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, value: unknown) => ({ col, value })),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

import { POST } from '../../src/app/api/v1/residents/route';

describe('p1-18 residents route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('actor-1');

    createScopedClientMock.mockReturnValue({
      query: scopedQueryMock,
      insert: scopedInsertMock,
      update: scopedUpdateMock,
      hardDelete: scopedHardDeleteMock,
    });
  });

  it('POST creates user role and notification preferences with scoped client', async () => {
    scopedQueryMock
      .mockResolvedValueOnce([
        {
          id: 42,
          communityType: 'condo_718',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    scopedInsertMock
      .mockResolvedValueOnce([
        {
          id: 'b0476f53-6f95-4493-b329-13ff1a2334e6',
          email: 'owner@example.com',
          fullName: 'Owner One',
          phone: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 900,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 901,
        },
      ]);

    const req = new NextRequest('http://localhost:3000/api/v1/residents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        email: 'owner@example.com',
        fullName: 'Owner One',
        phone: null,
        role: 'owner',
        unitId: 12,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'actor-1');
    expect(scopedInsertMock).toHaveBeenNthCalledWith(
      2,
      userRolesTable,
      expect.objectContaining({
        role: 'owner',
        unitId: 12,
      }),
    );

    expect(scopedInsertMock).toHaveBeenNthCalledWith(
      3,
      notificationPreferencesTable,
      expect.objectContaining({
        userId: expect.any(String),
      }),
    );

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        resourceType: 'resident',
        communityId: 42,
        userId: 'actor-1',
      }),
    );
  });

  it('POST keeps tenant context scoped by request communityId', async () => {
    scopedQueryMock
      .mockResolvedValueOnce([
        {
          id: 777,
          communityType: 'hoa_720',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    scopedInsertMock
      .mockResolvedValueOnce([
        {
          id: 'b0476f53-6f95-4493-b329-13ff1a2334e6',
          email: 'board@example.com',
          fullName: 'Board One',
          phone: null,
        },
      ])
      .mockResolvedValueOnce([{ id: 901 }])
      .mockResolvedValueOnce([{ id: 902 }]);

    const req = new NextRequest('http://localhost:3000/api/v1/residents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 777,
        email: 'board@example.com',
        fullName: 'Board One',
        phone: null,
        role: 'board_member',
        unitId: null,
      }),
    });

    await POST(req);

    expect(createScopedClientMock).toHaveBeenCalledWith(777);
  });

  it('POST returns 403 for authenticated non-member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const req = new NextRequest('http://localhost:3000/api/v1/residents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        email: 'owner@example.com',
        fullName: 'Owner One',
        role: 'owner',
        unitId: 12,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});

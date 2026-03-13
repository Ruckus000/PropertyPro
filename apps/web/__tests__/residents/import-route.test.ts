import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  createScopedClientMock,
  logAuditEventMock,
  scopedQueryMock,
  scopedInsertMock,
  communitiesTable,
  usersTable,
  userRolesTable,
  unitsTable,
  notificationPreferencesTable,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  scopedQueryMock: vi.fn(),
  scopedInsertMock: vi.fn(),
  communitiesTable: Symbol('communities'),
  usersTable: Symbol('users'),
  userRolesTable: Symbol('user_roles'),
  unitsTable: Symbol('units'),
  notificationPreferencesTable: Symbol('notification_preferences'),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@propertypro/db', () => ({
  communities: communitiesTable,
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  notificationPreferences: notificationPreferencesTable,
  units: unitsTable,
  userRoles: userRolesTable,
  users: usersTable,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/user-communities', () => ({
  listCommunitiesForUser: vi.fn().mockResolvedValue([]),
}));

import { POST } from '../../src/app/api/v1/import-residents/route';

describe('p1-19 import-residents route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('95c454d2-9728-4f1f-8b75-5b9549fb9679');

    createScopedClientMock.mockReturnValue({
      query: scopedQueryMock,
      insert: scopedInsertMock,
    });
  });

  it('dryRun returns preview and detects duplicate emails', async () => {
    const csv = 'name,email,role\nOwner,dup@example.com,owner\nTenant,dup@example.com,tenant';
    const req = new NextRequest('http://localhost:3000/api/v1/import-residents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 42, csv, dryRun: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { preview: Array<unknown>; errors: Array<{ rowNumber: number; column: string | null; message: string }>; header: string[] } };
    expect(json.data.preview).toHaveLength(1);
    expect(json.data.errors).toEqual([
      { rowNumber: 3, column: 'email', message: "Duplicate email 'dup@example.com' in import" },
    ]);
    expect(json.data.header).toEqual(['name', 'email', 'role']);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(
      42,
      '95c454d2-9728-4f1f-8b75-5b9549fb9679',
    );
  });

  it('imports valid rows, creates users/roles, and logs audit events with bulk count', async () => {
    // Community type
    scopedQueryMock
      .mockResolvedValueOnce([{ id: 42, communityType: 'hoa_720' }]) // communities
      .mockResolvedValueOnce([{ id: 100, unitNumber: '12A' }]) // units
      .mockResolvedValueOnce([]) // users
      .mockResolvedValueOnce([]); // user_roles

    // Insert users, roles, notification preferences
    scopedInsertMock
      .mockResolvedValueOnce([{ id: 'u1', email: 'owner1@example.com' }]) // users
      .mockResolvedValueOnce([{ id: 900 }]) // user_roles
      .mockResolvedValueOnce([{ id: 901 }]) // notification_preferences
      .mockResolvedValueOnce([{ id: 'u2', email: 'board@example.com' }]) // users
      .mockResolvedValueOnce([{ id: 902 }]) // user_roles
      .mockResolvedValueOnce([{ id: 903 }]); // notification_preferences

    const csv = 'name,email,role,unit_number\nOwner One,owner1@example.com,owner,12A\nBoard One,board@example.com,board_member,';
    const req = new NextRequest('http://localhost:3000/api/v1/import-residents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 42, csv, dryRun: false }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { importedCount: number; skippedCount: number; errors: unknown[] } };
    expect(json.data.importedCount).toBe(2);
    expect(json.data.skippedCount).toBe(0);
    expect(json.data.errors).toHaveLength(0);

    // Audit for both users, with bulkCount = 2
    expect(logAuditEventMock).toHaveBeenCalledTimes(2);
    for (const call of logAuditEventMock.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          action: 'user_invited',
          communityId: 42,
          metadata: { bulkCount: 2 },
        }),
      );
    }
  });

  it('skips rows when unit is not found and reports errors with row numbers', async () => {
    scopedQueryMock
      .mockResolvedValueOnce([{ id: 42, communityType: 'hoa_720' }]) // communities
      .mockResolvedValueOnce([]) // units
      .mockResolvedValueOnce([]) // users
      .mockResolvedValueOnce([]); // user_roles

    const csv = 'name,email,role,unit_number\nOwner One,owner1@example.com,owner,99';
    const req = new NextRequest('http://localhost:3000/api/v1/import-residents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 42, csv }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { importedCount: number; skippedCount: number; errors: Array<{ rowNumber: number; column: string | null; message: string }> } };
    expect(json.data.importedCount).toBe(0);
    expect(json.data.skippedCount).toBe(1);
    expect(json.data.errors).toEqual([
      { rowNumber: 2, column: 'unit_number', message: "Unit '99' not found" },
    ]);
  });

  it('returns 403 for authenticated non-member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const csv = 'name,email,role\nOwner,owner@example.com,owner';
    const req = new NextRequest('http://localhost:3000/api/v1/import-residents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 42, csv }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});

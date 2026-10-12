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
  requirePermissionMock,
  importResidentRowOpMock,
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
  requireCommunityMembershipMock: vi.fn().mockResolvedValue({ role: 'cam' }),
  requirePermissionMock: vi.fn(),
  importResidentRowOpMock: vi.fn(),
}));

// Row writes go through one transaction per row (onboarding audit F2). The op
// itself is tested in packages/db/__tests__/resident-import-ops.test.ts and on
// real Postgres in __tests__/integration/import-residents-atomicity.integration.test.ts.
// The setup-checklist write is fire-and-forget and covered in
// __tests__/import-residents/import-residents-route.test.ts.
vi.mock('@/lib/services/onboarding-checklist-service', () => ({ tryAutoComplete: vi.fn() }));

vi.mock('@propertypro/db/unsafe', () => ({
  importResidentRowOp: importResidentRowOpMock,
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

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/api/user-communities', () => ({
  listCommunitiesForUser: vi.fn().mockResolvedValue([]),
}));


// The cross-tenant guard runs for rows matching a PRE-EXISTING platform user.
// This file's subject is CSV mapping and validation; the guard's own behaviour is
// covered by __tests__/services/user-linking.test.ts and the wiring by
// __tests__/import-residents/import-residents-route.test.ts.
vi.mock('@/lib/services/user-linking', () => ({
  assertActorMayAttachExistingUser: vi.fn().mockResolvedValue(undefined),
  loadActorCommunitiesForLinking: vi.fn().mockResolvedValue([]),
  EXISTING_ACCOUNT_REMEDY:
    'Someone who shares a community with them can add them, or they can request access themselves.',
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '../../src/app/api/v1/import-residents/route';

describe('p1-19 import-residents route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('95c454d2-9728-4f1f-8b75-5b9549fb9679');

    createScopedClientMock.mockReturnValue({
      query: scopedQueryMock,
      // After A3 drain #64, the route uses getCommunityTypeForOnboarding
      // (drain #52) which calls scoped.selectFrom for the one-row community
      // type lookup. Alias to scopedQueryMock so the test's
      // mockResolvedValueOnce queue feeds it the same way it fed the prior
      // scoped.query(communities) call.
      selectFrom: scopedQueryMock,
      insert: scopedInsertMock,
    });
  });

  it('dryRun returns preview and detects duplicate emails', async () => {
    // Since onboarding audit F1 the preview runs the import's eligibility
    // checks, so it reads the same four tables the import does. The row also
    // needs a unit now: a resident without one used to show as ready in the
    // preview and was then skipped by the import ("requires a unit assignment").
    scopedQueryMock
      .mockResolvedValueOnce([{ id: 42, communityType: 'hoa_720' }]) // communities
      .mockResolvedValueOnce([{ id: 100, unitNumber: '12A' }]) // units
      .mockResolvedValueOnce([]) // users
      .mockResolvedValueOnce([]); // user_roles
    const csv = 'name,email,role,unit_number\nOwner,dup@example.com,owner,12A\nTenant,dup@example.com,tenant,12A';
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
    expect(json.data.header).toEqual(['name', 'email', 'role', 'unit_number']);
    expect(scopedInsertMock).not.toHaveBeenCalled();
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(
      42,
      '95c454d2-9728-4f1f-8b75-5b9549fb9679',
    );
  });

  it('imports valid rows, creates users/roles, and logs audit events with bulk count', async () => {
    // Community type
    scopedQueryMock
      .mockResolvedValueOnce([{ id: 42, communityType: 'hoa_720' }]) // communities
      .mockResolvedValueOnce([
        { id: 100, unitNumber: '12A' },
        { id: 101, unitNumber: '12B' },
      ]) // units
      .mockResolvedValueOnce([]) // users
      .mockResolvedValueOnce([]); // user_roles

    importResidentRowOpMock.mockResolvedValueOnce('u1').mockResolvedValueOnce('u2');

    const csv = 'name,email,role,unit_number\nOwner One,owner1@example.com,owner,12A\nTenant One,tenant1@example.com,tenant,12B';
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

    // One transactional write per row; each row's audit carries the import's
    // size (the op writes the audit inside that row's transaction).
    expect(importResidentRowOpMock).toHaveBeenCalledTimes(2);
    expect(importResidentRowOpMock.mock.calls.map(([p]) => [p.email, p.newUser, p.unitId, p.legacyRole])).toEqual([
      ['owner1@example.com', { fullName: 'Owner One' }, 100, 'owner'],
      ['tenant1@example.com', { fullName: 'Tenant One' }, 101, 'tenant'],
    ]);
    for (const [p] of importResidentRowOpMock.mock.calls) {
      expect(p).toEqual(
        expect.objectContaining({ communityId: 42, role: 'resident', auditMetadata: { bulkCount: 2 } }),
      );
    }
    expect(scopedInsertMock).not.toHaveBeenCalled();
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

  it('rejects manager/board CSV roles at validation — no users or roles are created (role-v3 invariant 3)', async () => {
    scopedQueryMock
      .mockResolvedValueOnce([{ id: 42, communityType: 'hoa_720' }]) // communities
      .mockResolvedValueOnce([]) // units
      .mockResolvedValueOnce([]) // users
      .mockResolvedValueOnce([]); // user_roles

    const csv = [
      'name,email,role,unit_number',
      'Board One,board@example.com,board_member,',
      'Prez,prez@example.com,board_president,',
      'Cam,cam@example.com,cam,',
      'Site,site@example.com,site_manager,',
      'PM,pm@example.com,property_manager_admin,',
    ].join('\n');
    const req = new NextRequest('http://localhost:3000/api/v1/import-residents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 42, csv }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { importedCount: number; skippedCount: number; errors: Array<{ column: string | null; message: string }> };
    };
    expect(json.data.importedCount).toBe(0);
    expect(json.data.skippedCount).toBe(5);
    for (const err of json.data.errors) {
      expect(err.column).toBe('role');
      expect(err.message).toContain('Invalid role');
    }
    expect(scopedInsertMock).not.toHaveBeenCalled();
    expect(importResidentRowOpMock).not.toHaveBeenCalled();
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

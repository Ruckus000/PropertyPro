import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  createScopedClientMock,
  logAuditEventMock,
  scopedQueryMock,
  scopedSelectFromMock,
  scopedInsertMock,
  scopedUpdateMock,
  scopedHardDeleteMock,
  scopedQueryByIdMock,
  communitiesTable,
  usersTable,
  userRolesTable,
  notificationPreferencesTable,
  unitsTable,
  documentsTable,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  findUserCommunitiesUnscopedMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  scopedQueryMock: vi.fn(),
  scopedSelectFromMock: vi.fn(),
  scopedInsertMock: vi.fn(),
  scopedUpdateMock: vi.fn(),
  scopedHardDeleteMock: vi.fn(),
  scopedQueryByIdMock: vi.fn(),
  communitiesTable: Symbol('communities'),
  usersTable: Symbol('users'),
  userRolesTable: Symbol('user_roles'),
  notificationPreferencesTable: Symbol('notification_preferences'),
  unitsTable: Symbol('units'),
  documentsTable: Symbol('documents'),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  findUserCommunitiesUnscopedMock: vi.fn(),
}));

// The cross-tenant guard (user-linking.ts) compares the actor's memberships
// against the target's whenever an EXISTING platform user is matched by email.
vi.mock('@propertypro/db/unsafe', () => ({
  findUserCommunitiesUnscoped: findUserCommunitiesUnscopedMock,
}));

vi.mock('@propertypro/db', () => ({
  communities: communitiesTable,
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  notificationPreferences: notificationPreferencesTable,
  userRoles: userRolesTable,
  users: usersTable,
  units: unitsTable,
  documents: documentsTable,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, value: unknown) => ({ col, value })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));


vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));
import { GET, POST } from '../../src/app/api/v1/residents/route';

describe('p1-18 residents route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('actor-1');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'actor-1',
      communityId: 777,
      role: 'property_manager',
      isAdmin: true,
      isUnitOwner: false,
      displayTitle: 'Board Member',
      designation: 'board_member',
      communityType: 'condo_718',
    });

    createScopedClientMock.mockReturnValue({
      query: scopedQueryMock,
      selectFrom: scopedSelectFromMock,
      insert: scopedInsertMock,
      update: scopedUpdateMock,
      hardDelete: scopedHardDeleteMock,
      // Cross-tenant FK guard resolves referenced ids through queryById; default
      // to "found" so unit lookups succeed unless a test overrides it.
      queryById: scopedQueryByIdMock,
    });
    scopedQueryByIdMock.mockResolvedValue({ id: 1 });
  });

  it('POST creates user role and notification preferences with scoped client', async () => {
    scopedSelectFromMock
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
        role: 'resident',
        isUnitOwner: true,
        unitId: 12,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'actor-1');
    expect(scopedInsertMock).toHaveBeenNthCalledWith(
      2,
      userRolesTable,
      expect.objectContaining({
        role: 'resident',
        unitId: 12,
        isUnitOwner: true,
        displayTitle: 'Owner',
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

  it('POST refuses an existing user the actor shares no community with', async () => {
    // Issue #940. `users` has no `community_id`, so the email lookup in this
    // route is NOT tenant-filtered — it matches across the whole platform. A
    // manager of community 42 typing the address of a resident of community 999
    // would otherwise bind that person's id here, and the residents list would
    // then hand back their real name, email and phone.
    scopedSelectFromMock
      .mockResolvedValueOnce([{ id: 42, communityType: 'condo_718' }])
      // assertUnitInCommunity
      .mockResolvedValueOnce([{ id: 12 }])
      // getResidentUserByEmail — a stranger from another association
      .mockResolvedValueOnce([
        { id: 'ffffffff-0000-0000-0000-00000000dead', email: 'stranger@example.com' },
      ]);

    findUserCommunitiesUnscopedMock.mockImplementation(async (userId: string) =>
      userId === 'actor-1' ? [{ communityId: 42 }] : [{ communityId: 999 }],
    );

    const req = new NextRequest('http://localhost:3000/api/v1/residents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        email: 'stranger@example.com',
        fullName: 'Whoever They Say',
        phone: null,
        role: 'resident',
        isUnitOwner: true,
        unitId: 12,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);

    // Nothing written: no role row, no notification preferences, no audit entry.
    expect(scopedInsertMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('POST returns 403 when role is property_manager (manager-tier lockdown)', async () => {
    // Manager roles must be assigned via the root-only Roles & Access endpoints.
    // The residents POST path is locked to resident-tier roles only.
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
        role: 'property_manager',
        unitId: null,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(scopedInsertMock).not.toHaveBeenCalled();
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
        role: 'resident',
        isUnitOwner: true,
        unitId: 12,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('GET returns 403 for apartment tenant (RBAC residents.read denied)', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      userId: 'actor-1',
      communityId: 42,
      role: 'resident',
      isAdmin: false,
      isUnitOwner: false,
      displayTitle: 'Tenant',
      communityType: 'apartment',
    });

    const req = new NextRequest('http://localhost:3000/api/v1/residents?communityId=42');
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(createScopedClientMock).not.toHaveBeenCalled();
    expect(scopedQueryMock).not.toHaveBeenCalled();
  });
});

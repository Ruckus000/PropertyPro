import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

const {
  mockScopedQuery,
  mockScopedInsert,
  mockLogAuditEvent,
  mockFindUserCommunitiesUnscoped,
} = vi.hoisted(() => ({
  mockScopedQuery: vi.fn(),
  mockScopedInsert: vi.fn(),
  mockLogAuditEvent: vi.fn(),
  mockFindUserCommunitiesUnscoped: vi.fn(),
}));

// The cross-tenant guard (user-linking.ts) reads BOTH users' memberships when an
// existing platform user is matched by email. Unmocked, it reaches for a real
// database. Default: the target already belongs to this community, which is the
// ordinary "admin re-adds someone who is already here" shape.
vi.mock('@propertypro/db/unsafe', () => ({
  findUserCommunitiesUnscoped: mockFindUserCommunitiesUnscoped,
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: vi.fn(() => ({
    query: mockScopedQuery,
    insert: mockScopedInsert,
  })),
  users: Symbol('users'),
  userRoles: Symbol('userRoles'),
  invitations: Symbol('invitations'),
  communities: Symbol('communities'),
  notificationPreferences: Symbol('notificationPreferences'),
  logAuditEvent: mockLogAuditEvent,
}));

vi.mock('@propertypro/email', () => ({
  InvitationEmail: vi.fn(),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('react', () => ({
  createElement: vi.fn((_comp, props) => ({ props })),
}));

// importOriginal keeps RBAC_MATRIX real — the cross-tenant guard resolves the
// actor's `residents:read` through checkPermissionV2, which reads it.
vi.mock('@propertypro/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@propertypro/shared')>()),
  getPresetPermissions: vi.fn(() => ({ docs: 'read' })),
  hasBoardDesignation: vi.fn(
    (value: unknown) => value === 'board_president' || value === 'board_member',
  ),
  PRESET_METADATA: {
    board_president: { displayTitle: 'Board President', legacyRole: 'board_president' },
    board_member: { displayTitle: 'Board Member', legacyRole: 'board_member' },
    cam: { displayTitle: 'Community Association Manager', legacyRole: 'cam' },
    site_manager: { displayTitle: 'Site Manager', legacyRole: 'site_manager' },
  },
}));

vi.mock('@/lib/utils/role-validator', () => ({
  validateRoleAssignment: vi.fn(() => ({ valid: true })),
}));

vi.mock('@/lib/api/errors', () => ({
  NotFoundError: class NotFoundError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'NotFoundError';
    }
  },
  // Thrown by the cross-tenant guard in user-linking.ts.
  ForbiddenError: class ForbiddenError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'ForbiddenError';
    }
  },
  ValidationError: class ValidationError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'ValidationError';
    }
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are in place)
// ---------------------------------------------------------------------------

import { createScopedClient, users, userRoles, communities } from '@propertypro/db';
import { sendEmail } from '@propertypro/email';
import { validateRoleAssignment } from '@/lib/utils/role-validator';
import {
  createOnboardingResident,
  createOnboardingInvitation,
} from '../../src/lib/services/onboarding-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COMMUNITY_ID = 42;

/**
 * A membership row as `findUserCommunitiesUnscoped` returns it. The cross-tenant
 * guard reads role + communityType + isUnitOwner to resolve `residents:read`, so
 * a bare `{ communityId }` is not a faithful fixture.
 */
const membershipRow = (communityId: number) => ({
  communityId,
  communityType: 'condo_718' as const,
  role: 'property_manager' as const,
  isUnitOwner: false,
});
const ACTOR_USER_ID = 'actor-uuid-000';
const INVITER_NAME = 'Acting Manager';
const USER_ID = 'user-uuid-123';

function resetMocks() {
  mockScopedQuery.mockReset();
  mockScopedInsert.mockReset();
  mockLogAuditEvent.mockReset().mockResolvedValue(undefined);
  (sendEmail as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(undefined);
  (validateRoleAssignment as ReturnType<typeof vi.fn>).mockReset().mockReturnValue({ valid: true });
  // Default: the matched user is already a member of THIS community, so the
  // cross-tenant guard permits the attach. Tests that model a stranger override
  // this per-user.
  mockFindUserCommunitiesUnscoped.mockReset().mockResolvedValue([membershipRow(COMMUNITY_ID)]);
}

/**
 * Set up query mocks for createOnboardingResident.
 * Call order: query(users) -> query(userRoles)
 */
function setupResidentQueryMocks(opts: {
  existingUsers?: Record<string, unknown>[];
  existingRoles?: Record<string, unknown>[];
}) {
  mockScopedQuery
    .mockResolvedValueOnce(opts.existingUsers ?? []) // query(users)
    .mockResolvedValueOnce(opts.existingRoles ?? []); // query(userRoles)
  mockScopedInsert.mockResolvedValue([{ id: USER_ID, email: 'test@example.com', fullName: 'Test User' }]);
}

// ---------------------------------------------------------------------------
// Tests: createOnboardingResident
// ---------------------------------------------------------------------------

describe('createOnboardingResident', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it('creates a new user and assigns role in community', async () => {
    setupResidentQueryMocks({ existingUsers: [], existingRoles: [] });

    const result = await createOnboardingResident({
      communityId: COMMUNITY_ID,
      email: 'Jane@Example.com',
      fullName: 'Jane Doe',
      phone: '555-0100',
      role: 'resident',
      unitId: 10,
      actorUserId: ACTOR_USER_ID,
      communityType: 'condo_718',
      isUnitOwner: true,
    });

    expect(result.isNewUser).toBe(true);
    expect(result.userId).toEqual(expect.any(String));

    // Should create scoped client
    expect(createScopedClient).toHaveBeenCalledWith(COMMUNITY_ID);

    // Should validate role assignment
    expect(validateRoleAssignment).toHaveBeenCalledWith('resident', 'condo_718', 10);

    // Should insert user (normalized email)
    expect(mockScopedInsert).toHaveBeenCalledWith(
      users,
      expect.objectContaining({
        email: 'jane@example.com',
        fullName: 'Jane Doe',
        phone: '555-0100',
      }),
    );

    // Should insert role with displayTitle = 'Owner' for resident + isUnitOwner
    expect(mockScopedInsert).toHaveBeenCalledWith(
      userRoles,
      expect.objectContaining({
        role: 'resident',
        unitId: 10,
        isUnitOwner: true,
        displayTitle: 'Owner',
      }),
    );

    // Should log audit event
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ACTOR_USER_ID,
        action: 'create',
        resourceType: 'user',
        communityId: COMMUNITY_ID,
      }),
    );
  });

  it('validates required fields — rejects resident without unitId', async () => {
    (validateRoleAssignment as ReturnType<typeof vi.fn>).mockReturnValue({
      valid: false,
      error: 'Role "resident" requires a unit assignment',
    });

    await expect(
      createOnboardingResident({
        communityId: COMMUNITY_ID,
        email: 'test@example.com',
        fullName: 'Test User',
        phone: null,
        role: 'resident',
        unitId: null,
        actorUserId: ACTOR_USER_ID,
        communityType: 'condo_718',
      }),
    ).rejects.toThrow('Role "resident" requires a unit assignment');

    // Should not insert anything
    expect(mockScopedInsert).not.toHaveBeenCalled();
  });

  it('throws when user already has a role in the community', async () => {
    const existingUser = { id: USER_ID, email: 'dup@example.com' };
    const existingRole = { userId: USER_ID, role: 'resident' };

    setupResidentQueryMocks({
      existingUsers: [existingUser],
      existingRoles: [existingRole],
    });

    await expect(
      createOnboardingResident({
        communityId: COMMUNITY_ID,
        email: 'dup@example.com',
        fullName: 'Dup User',
        phone: null,
        role: 'resident',
        unitId: 4,
        actorUserId: ACTOR_USER_ID,
        communityType: 'condo_718',
      }),
    ).rejects.toThrow('User already has role "resident" in this community');
  });

  it('resolves displayTitle as "Tenant" for resident without isUnitOwner', async () => {
    setupResidentQueryMocks({ existingUsers: [], existingRoles: [] });

    await createOnboardingResident({
      communityId: COMMUNITY_ID,
      email: 'tenant@example.com',
      fullName: 'Tenant User',
      phone: null,
      role: 'resident',
      unitId: 5,
      actorUserId: ACTOR_USER_ID,
      communityType: 'apartment',
      isUnitOwner: false,
    });

    expect(mockScopedInsert).toHaveBeenCalledWith(
      userRoles,
      expect.objectContaining({
        displayTitle: 'Tenant',
        isUnitOwner: false,
      }),
    );
  });

  it('writes designation null for a resident', async () => {
    setupResidentQueryMocks({ existingUsers: [], existingRoles: [] });

    await createOnboardingResident({
      communityId: COMMUNITY_ID,
      email: 'res@example.com',
      fullName: 'Res User',
      phone: null,
      role: 'resident',
      unitId: 4,
      actorUserId: ACTOR_USER_ID,
      communityType: 'condo_718',
      isUnitOwner: true,
    });

    expect(mockScopedInsert).toHaveBeenCalledWith(
      userRoles,
      expect.objectContaining({
        role: 'resident',
        designation: null,
      }),
    );
  });

  it('resolves displayTitle as "Administrator" for a non-resident role (property_manager)', async () => {
    setupResidentQueryMocks({ existingUsers: [], existingRoles: [] });

    await createOnboardingResident({
      communityId: COMMUNITY_ID,
      email: 'admin@example.com',
      fullName: 'PM Admin',
      phone: null,
      role: 'property_manager',
      unitId: null,
      actorUserId: ACTOR_USER_ID,
      communityType: 'condo_718',
    });

    expect(mockScopedInsert).toHaveBeenCalledWith(
      userRoles,
      expect.objectContaining({
        displayTitle: 'Administrator',
      }),
    );
  });

  it('reuses existing user when email already exists (isNewUser = false)', async () => {
    const existingUser = { id: USER_ID, email: 'existing@example.com', fullName: 'Existing' };

    setupResidentQueryMocks({
      existingUsers: [existingUser],
      existingRoles: [],
    });

    const result = await createOnboardingResident({
      communityId: COMMUNITY_ID,
      email: 'Existing@Example.com',
      fullName: 'Existing',
      phone: null,
      role: 'resident',
      unitId: 3,
      actorUserId: ACTOR_USER_ID,
      communityType: 'condo_718',
      isUnitOwner: true,
    });

    expect(result.isNewUser).toBe(false);
    expect(result.userId).toBe(USER_ID);

    // Should NOT insert into users table (only role + notification prefs + audit)
    // First insert call should be for userRoles, not users
    const firstInsertTable = mockScopedInsert.mock.calls[0]?.[0];
    expect(firstInsertTable).toBe(userRoles);
  });

  it('REFUSES to attach an existing user the actor shares no community with', async () => {
    // Issue #940. The lookup above is not tenant-filtered — `users` has no
    // `community_id` — so this matched a resident of a DIFFERENT association.
    // Binding them here would publish their real name, email and phone through
    // this community's residents list.
    const stranger = { id: USER_ID, email: 'stranger@example.com', fullName: 'Stranger' };
    setupResidentQueryMocks({ existingUsers: [stranger], existingRoles: [] });

    mockFindUserCommunitiesUnscoped.mockImplementation(async (userId: string) =>
      userId === USER_ID ? [membershipRow(999)] : [membershipRow(COMMUNITY_ID)],
    );

    await expect(
      createOnboardingResident({
        communityId: COMMUNITY_ID,
        email: 'Stranger@Example.com',
        fullName: 'Stranger',
        phone: null,
        role: 'resident',
        unitId: 3,
        actorUserId: ACTOR_USER_ID,
        communityType: 'condo_718',
        isUnitOwner: true,
      }),
    ).rejects.toThrow(/cannot already see/i);

    // Nothing was written — no role row, no notification preferences.
    expect(mockScopedInsert).not.toHaveBeenCalled();
  });

  it('attaches an existing user the actor DOES share a community with', async () => {
    // The legitimate case the global lookup exists to serve: one person owning
    // units in two associations, added by a manager who runs both.
    const shared = { id: USER_ID, email: 'owner@example.com', fullName: 'Owner' };
    setupResidentQueryMocks({ existingUsers: [shared], existingRoles: [] });

    mockFindUserCommunitiesUnscoped.mockImplementation(async (userId: string) =>
      userId === USER_ID
        ? [membershipRow(7)]
        : [membershipRow(7), membershipRow(COMMUNITY_ID)],
    );

    const result = await createOnboardingResident({
      communityId: COMMUNITY_ID,
      email: 'Owner@Example.com',
      fullName: 'Owner',
      phone: null,
      role: 'resident',
      unitId: 3,
      actorUserId: ACTOR_USER_ID,
      communityType: 'condo_718',
      isUnitOwner: true,
    });

    expect(result.isNewUser).toBe(false);
    expect(mockScopedInsert).toHaveBeenCalledWith(userRoles, expect.anything());
  });

  it('does not consult the cross-tenant guard for a brand-new email', async () => {
    // A new user belongs to nobody yet, so there is no relationship to check —
    // and paying for two unscoped reads on the common path would be waste.
    setupResidentQueryMocks({ existingUsers: [], existingRoles: [] });

    await createOnboardingResident({
      communityId: COMMUNITY_ID,
      email: 'brand-new@example.com',
      fullName: 'Brand New',
      phone: null,
      role: 'resident',
      unitId: 3,
      actorUserId: ACTOR_USER_ID,
      communityType: 'condo_718',
      isUnitOwner: true,
    });

    expect(mockFindUserCommunitiesUnscoped).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: createOnboardingInvitation
// ---------------------------------------------------------------------------

describe('createOnboardingInvitation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it('creates invitation record, sends email, and returns token', async () => {
    const communityRow = { id: COMMUNITY_ID, name: 'Sunset Condos' };
    const userRow = { id: USER_ID, email: 'invited@example.com', fullName: 'Invited User' };
    const roleRow = { userId: USER_ID, role: 'resident' };

    mockScopedQuery
      .mockResolvedValueOnce([communityRow]) // query(communities)
      .mockResolvedValueOnce([userRow])      // query(users)
      .mockResolvedValueOnce([roleRow]);     // query(userRoles)
    mockScopedInsert.mockResolvedValue([{}]);

    const result = await createOnboardingInvitation({
      communityId: COMMUNITY_ID,
      userId: USER_ID,
      ttlDays: 7,
      actorUserId: ACTOR_USER_ID,
      inviterName: INVITER_NAME,
    });

    // Returns token and expiresAt
    expect(result.token).toMatch(/^[a-f0-9]{64}$/); // two UUIDs concatenated without dashes
    expect(result.expiresAt).toBeInstanceOf(Date);

    // expiresAt should be ~7 days in the future
    const nowMs = Date.now();
    const expiryMs = result.expiresAt.getTime();
    const diffDays = (expiryMs - nowMs) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);

    // Should insert invitation
    expect(mockScopedInsert).toHaveBeenCalledWith(
      expect.anything(), // invitationsTable symbol
      expect.objectContaining({
        userId: USER_ID,
        token: result.token,
        invitedBy: ACTOR_USER_ID,
      }),
    );

    // Should send email
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'invited@example.com',
        subject: expect.stringContaining('Sunset Condos'),
        category: 'transactional',
      }),
    );

    // Should log audit event — keyed on the invitee, NOT on the invitation
    // token. compliance_audit_log is board-readable via /api/v1/audit-trail and
    // append-only, so a token logged here is a permanent, shared credential.
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ACTOR_USER_ID,
        action: 'user_invited',
        resourceType: 'invitation',
        communityId: COMMUNITY_ID,
      }),
    );

    const auditPayload = JSON.stringify(mockLogAuditEvent.mock.calls);
    for (const call of mockLogAuditEvent.mock.calls) {
      expect((call[0] as { resourceId?: string }).resourceId).not.toMatch(/^[0-9a-f]{64}$/);
    }
    expect(auditPayload).not.toMatch(/[0-9a-f]{64}/);
  });

  it('throws NotFoundError when community does not exist', async () => {
    mockScopedQuery.mockResolvedValueOnce([]); // no communities

    await expect(
      createOnboardingInvitation({
        communityId: 999,
        userId: USER_ID,
        actorUserId: ACTOR_USER_ID,
        inviterName: INVITER_NAME,
      }),
    ).rejects.toThrow('Community 999 not found');

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when user does not exist', async () => {
    const communityRow = { id: COMMUNITY_ID, name: 'Test Community' };
    mockScopedQuery
      .mockResolvedValueOnce([communityRow]) // communities found
      .mockResolvedValueOnce([]);            // no users

    await expect(
      createOnboardingInvitation({
        communityId: COMMUNITY_ID,
        userId: 'nonexistent-uuid',
        actorUserId: ACTOR_USER_ID,
        inviterName: INVITER_NAME,
      }),
    ).rejects.toThrow('User nonexistent-uuid not found');

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('defaults role to "resident" when user has no role row', async () => {
    const communityRow = { id: COMMUNITY_ID, name: 'Palm Shores HOA' };
    const userRow = { id: USER_ID, email: 'norole@example.com', fullName: 'No Role' };

    mockScopedQuery
      .mockResolvedValueOnce([communityRow])
      .mockResolvedValueOnce([userRow])
      .mockResolvedValueOnce([]); // no role rows
    mockScopedInsert.mockResolvedValue([{}]);

    await createOnboardingInvitation({
      communityId: COMMUNITY_ID,
      userId: USER_ID,
      actorUserId: ACTOR_USER_ID,
      inviterName: INVITER_NAME,
    });

    // The InvitationEmail createElement call should pass role = 'resident'
    const { createElement } = await import('react');
    const createElementMock = createElement as ReturnType<typeof vi.fn>;
    const inviteCall = createElementMock.mock.calls[0];
    expect(inviteCall?.[1]).toEqual(
      expect.objectContaining({ role: 'resident' }),
    );
  });

  it('exercises addDays indirectly — custom ttlDays shifts expiry accordingly', async () => {
    const communityRow = { id: COMMUNITY_ID, name: 'Test' };
    const userRow = { id: USER_ID, email: 'ttl@example.com', fullName: 'TTL User' };
    const roleRow = { userId: USER_ID, role: 'manager' };

    mockScopedQuery
      .mockResolvedValueOnce([communityRow])
      .mockResolvedValueOnce([userRow])
      .mockResolvedValueOnce([roleRow]);
    mockScopedInsert.mockResolvedValue([{}]);

    const result = await createOnboardingInvitation({
      communityId: COMMUNITY_ID,
      userId: USER_ID,
      ttlDays: 14,
      actorUserId: ACTOR_USER_ID,
      inviterName: INVITER_NAME,
    });

    const diffDays = (result.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(13.9);
    expect(diffDays).toBeLessThan(14.1);
  });
});

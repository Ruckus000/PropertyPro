import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

const { mockScopedQuery, mockScopedInsert, mockLogAuditEvent } = vi.hoisted(() => ({
  mockScopedQuery: vi.fn(),
  mockScopedInsert: vi.fn(),
  mockLogAuditEvent: vi.fn(),
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

vi.mock('@propertypro/shared', () => ({
  getPresetPermissions: vi.fn(() => ({ docs: 'read' })),
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
const ACTOR_USER_ID = 'actor-uuid-000';
const USER_ID = 'user-uuid-123';

function resetMocks() {
  mockScopedQuery.mockReset();
  mockScopedInsert.mockReset();
  mockLogAuditEvent.mockReset().mockResolvedValue(undefined);
  (sendEmail as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(undefined);
  (validateRoleAssignment as ReturnType<typeof vi.fn>).mockReset().mockReturnValue({ valid: true });
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
        role: 'manager',
        unitId: null,
        actorUserId: ACTOR_USER_ID,
        communityType: 'condo_718',
        presetKey: 'cam',
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

  it('resolves displayTitle from PRESET_METADATA for manager with presetKey', async () => {
    setupResidentQueryMocks({ existingUsers: [], existingRoles: [] });

    await createOnboardingResident({
      communityId: COMMUNITY_ID,
      email: 'cam@example.com',
      fullName: 'CAM User',
      phone: null,
      role: 'manager',
      unitId: null,
      actorUserId: ACTOR_USER_ID,
      communityType: 'condo_718',
      presetKey: 'cam',
    });

    expect(mockScopedInsert).toHaveBeenCalledWith(
      userRoles,
      expect.objectContaining({
        displayTitle: 'Community Association Manager',
        presetKey: 'cam',
      }),
    );
  });

  it('resolves displayTitle as "Property Manager Admin" for pm_admin role', async () => {
    setupResidentQueryMocks({ existingUsers: [], existingRoles: [] });

    await createOnboardingResident({
      communityId: COMMUNITY_ID,
      email: 'admin@example.com',
      fullName: 'PM Admin',
      phone: null,
      role: 'pm_admin',
      unitId: null,
      actorUserId: ACTOR_USER_ID,
      communityType: 'condo_718',
    });

    expect(mockScopedInsert).toHaveBeenCalledWith(
      userRoles,
      expect.objectContaining({
        displayTitle: 'Property Manager Admin',
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

    // Should log audit event
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ACTOR_USER_ID,
        action: 'user_invited',
        resourceType: 'invitation',
        communityId: COMMUNITY_ID,
      }),
    );
  });

  it('throws NotFoundError when community does not exist', async () => {
    mockScopedQuery.mockResolvedValueOnce([]); // no communities

    await expect(
      createOnboardingInvitation({
        communityId: 999,
        userId: USER_ID,
        actorUserId: ACTOR_USER_ID,
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
    });

    const diffDays = (result.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(13.9);
    expect(diffDays).toBeLessThan(14.1);
  });
});

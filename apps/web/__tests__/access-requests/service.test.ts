/**
 * Unit tests for access-request-service.
 *
 * Tests cover:
 * - submitAccessRequest: new request, resend for existing pending_verification, reject existing member
 * - verifyOtp: valid OTP transitions to pending, max attempts, expired OTP
 * - approveAccessRequest: creates auth user + users + roles, rejects non-pending, handles auth failure
 * - denyAccessRequest: marks denied, sends notification
 * - listPendingRequests: returns only pending rows
 */
import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  createScopedClientMock,
  sendEmailMock,
  logAuditEventMock,
  createAdminClientMock,
  tables,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  sendEmailMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  tables: {
    accessRequests: Symbol('access_requests'),
    users: Symbol('users'),
    userRoles: Symbol('user_roles'),
    communities: Symbol('communities'),
    notificationPreferences: Symbol('notification_preferences'),
  },
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  accessRequests: tables.accessRequests,
  users: tables.users,
  userRoles: tables.userRoles,
  communities: tables.communities,
  notificationPreferences: tables.notificationPreferences,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({ _type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  isNull: vi.fn((_col: unknown) => ({ _type: 'isNull' })),
  inArray: vi.fn((_col: unknown, _vals: unknown) => ({ _type: 'inArray' })),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(),
}));

vi.mock('@propertypro/email', () => ({
  OtpVerificationEmail: (props: unknown) => ({ type: 'OtpVerificationEmail', props }),
  AccessRequestPendingEmail: (props: unknown) => ({ type: 'AccessRequestPendingEmail', props }),
  AccessRequestApprovedEmail: (props: unknown) => ({ type: 'AccessRequestApprovedEmail', props }),
  AccessRequestDeniedEmail: (props: unknown) => ({ type: 'AccessRequestDeniedEmail', props }),
  sendEmail: sendEmailMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

import {
  submitAccessRequest,
  verifyOtp,
  approveAccessRequest,
  denyAccessRequest,
  listPendingRequests,
} from '../../src/lib/services/access-request-service';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const COMMUNITY_ID = 42;
const COMMUNITY_SLUG = 'sunset-condos';
const TEST_OTP = '123456';
const TEST_OTP_HASH = crypto
  .createHmac('sha256', process.env.OTP_HMAC_SECRET ?? 'dev-secret')
  .update(TEST_OTP)
  .digest('hex');

const communityRows = [{ id: COMMUNITY_ID, name: 'Sunset Condos' }];

// ---------------------------------------------------------------------------
// Mock setup helper
// ---------------------------------------------------------------------------

function setupScopedMock(overrides: {
  accessRequestRows?: Record<string, unknown>[];
  userRows?: Record<string, unknown>[];
  roleRows?: Record<string, unknown>[];
  communityRows?: Record<string, unknown>[];
} = {}) {
  const queryMock = vi.fn(async (table: unknown) => {
    if (table === tables.accessRequests) return overrides.accessRequestRows ?? [];
    if (table === tables.users) return overrides.userRows ?? [];
    if (table === tables.userRoles) return overrides.roleRows ?? [];
    if (table === tables.communities) return overrides.communityRows ?? communityRows;
    if (table === tables.notificationPreferences) return [];
    return [];
  });

  const insertMock = vi.fn(async (_table: unknown, data: unknown) => {
    const row = data as Record<string, unknown>;
    return [{ id: 99, ...row }];
  });

  const updateMock = vi.fn(async () => [{}]);

  const scoped = {
    query: queryMock,
    insert: insertMock,
    update: updateMock,
  };

  createScopedClientMock.mockReturnValue(scoped);
  return scoped;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('access-request-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMock.mockResolvedValue({ id: 'msg-1' });
    logAuditEventMock.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // submitAccessRequest
  // -------------------------------------------------------------------------

  describe('submitAccessRequest', () => {
    it('creates a new access request with OTP and sends verification email', async () => {
      const scoped = setupScopedMock();

      const result = await submitAccessRequest({
        communityId: COMMUNITY_ID,
        communitySlug: COMMUNITY_SLUG,
        email: 'new@example.com',
        fullName: 'New Resident',
        isUnitOwner: true,
        claimedUnitNumber: '101',
      });

      expect(result.resent).toBe(false);
      expect(result.requestId).toBe(99);
      expect(scoped.insert).toHaveBeenCalledTimes(1);
      expect(sendEmailMock).toHaveBeenCalledTimes(1);

      // Verify insert was called with correct data
      const insertCall = scoped.insert.mock.calls[0]!;
      expect(insertCall[0]).toBe(tables.accessRequests);
      const insertData = insertCall[1] as Record<string, unknown>;
      expect(insertData['email']).toBe('new@example.com');
      expect(insertData['fullName']).toBe('New Resident');
      expect(insertData['isUnitOwner']).toBe(true);
      expect(insertData['status']).toBe('pending_verification');
      expect(insertData['otpHash']).toBeTruthy();
      expect(insertData['otpExpiresAt']).toBeInstanceOf(Date);
    });

    it('resends OTP for existing pending_verification request', async () => {
      const scoped = setupScopedMock({
        accessRequestRows: [
          {
            id: 10,
            email: 'existing@example.com',
            fullName: 'Existing User',
            status: 'pending_verification',
            otpHash: 'old-hash',
            otpExpiresAt: new Date(Date.now() - 60000).toISOString(),
            otpAttempts: 3,
          },
        ],
      });

      const result = await submitAccessRequest({
        communityId: COMMUNITY_ID,
        communitySlug: COMMUNITY_SLUG,
        email: 'existing@example.com',
        fullName: 'Existing User',
        isUnitOwner: false,
      });

      expect(result.resent).toBe(true);
      expect(result.requestId).toBe(10);
      expect(scoped.update).toHaveBeenCalledTimes(1);
      expect(scoped.insert).not.toHaveBeenCalled();
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
    });

    it('rejects if email already belongs to a community member', async () => {
      setupScopedMock({
        userRows: [
          { id: 'user-1', email: 'member@example.com', fullName: 'Member', deletedAt: null },
        ],
        roleRows: [
          { userId: 'user-1', role: 'resident', isUnitOwner: true },
        ],
      });

      await expect(
        submitAccessRequest({
          communityId: COMMUNITY_ID,
          communitySlug: COMMUNITY_SLUG,
          email: 'member@example.com',
          fullName: 'Member',
          isUnitOwner: false,
        }),
      ).rejects.toThrow('already associated with a member');
    });
  });

  // -------------------------------------------------------------------------
  // verifyOtp
  // -------------------------------------------------------------------------

  describe('verifyOtp', () => {
    it('transitions to pending status on valid OTP', async () => {
      const scoped = setupScopedMock({
        accessRequestRows: [
          {
            id: 10,
            email: 'user@example.com',
            fullName: 'Test User',
            status: 'pending_verification',
            otpHash: TEST_OTP_HASH,
            otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            otpAttempts: 0,
            claimedUnitNumber: '101',
          },
        ],
        roleRows: [
          { userId: 'admin-1', role: 'pm_admin', presetKey: null },
        ],
        userRows: [
          { id: 'admin-1', email: 'admin@example.com', fullName: 'Admin User' },
        ],
      });

      const result = await verifyOtp({
        requestId: 10,
        otp: TEST_OTP,
        communityId: COMMUNITY_ID,
      });

      expect(result.verified).toBe(true);

      // Should have updated status to 'pending' and set emailVerifiedAt
      const updateCall = scoped.update.mock.calls[0]!;
      const updateData = updateCall[1] as Record<string, unknown>;
      expect(updateData['status']).toBe('pending');
      expect(updateData['emailVerifiedAt']).toBeInstanceOf(Date);

      // Should have sent admin notification
      expect(sendEmailMock).toHaveBeenCalled();
    });

    it('rejects after 5 failed attempts', async () => {
      setupScopedMock({
        accessRequestRows: [
          {
            id: 10,
            email: 'user@example.com',
            fullName: 'Test User',
            status: 'pending_verification',
            otpHash: TEST_OTP_HASH,
            otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            otpAttempts: 5,
          },
        ],
      });

      await expect(
        verifyOtp({ requestId: 10, otp: TEST_OTP, communityId: COMMUNITY_ID }),
      ).rejects.toThrow('Maximum verification attempts exceeded');
    });

    it('rejects expired OTP', async () => {
      setupScopedMock({
        accessRequestRows: [
          {
            id: 10,
            email: 'user@example.com',
            fullName: 'Test User',
            status: 'pending_verification',
            otpHash: TEST_OTP_HASH,
            otpExpiresAt: new Date(Date.now() - 60000).toISOString(),
            otpAttempts: 0,
          },
        ],
      });

      await expect(
        verifyOtp({ requestId: 10, otp: TEST_OTP, communityId: COMMUNITY_ID }),
      ).rejects.toThrow('expired');
    });

    it('increments attempts on invalid OTP', async () => {
      const scoped = setupScopedMock({
        accessRequestRows: [
          {
            id: 10,
            email: 'user@example.com',
            fullName: 'Test User',
            status: 'pending_verification',
            otpHash: TEST_OTP_HASH,
            otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            otpAttempts: 2,
          },
        ],
      });

      await expect(
        verifyOtp({ requestId: 10, otp: '999999', communityId: COMMUNITY_ID }),
      ).rejects.toThrow('Invalid verification code');

      // Verify attempts were incremented
      const updateCall = scoped.update.mock.calls[0]!;
      const updateData = updateCall[1] as Record<string, unknown>;
      expect(updateData['otpAttempts']).toBe(3);
    });

    it('throws NotFoundError for missing request', async () => {
      setupScopedMock();

      await expect(
        verifyOtp({ requestId: 999, otp: TEST_OTP, communityId: COMMUNITY_ID }),
      ).rejects.toThrow('not found');
    });
  });

  // -------------------------------------------------------------------------
  // approveAccessRequest
  // -------------------------------------------------------------------------

  describe('approveAccessRequest', () => {
    const mockAuthResponse = {
      data: { user: { id: 'new-user-uuid' } },
      error: null,
    };

    it('creates auth user, users row, role, and sends welcome email', async () => {
      const scoped = setupScopedMock({
        accessRequestRows: [
          {
            id: 10,
            email: 'resident@example.com',
            fullName: 'New Resident',
            phone: '555-0100',
            status: 'pending',
            isUnitOwner: true,
          },
        ],
      });

      createAdminClientMock.mockReturnValue({
        auth: { admin: { createUser: vi.fn().mockResolvedValue(mockAuthResponse) } },
      });

      const result = await approveAccessRequest({
        requestId: 10,
        communityId: COMMUNITY_ID,
        reviewerId: 'reviewer-uuid',
        unitId: 5,
      });

      expect(result.userId).toBe('new-user-uuid');

      // Should have inserted: users, userRoles, notificationPreferences
      expect(scoped.insert).toHaveBeenCalledTimes(3);

      // Users insert
      const usersInsert = scoped.insert.mock.calls[0]!;
      expect(usersInsert[0]).toBe(tables.users);
      expect((usersInsert[1] as Record<string, unknown>)['id']).toBe('new-user-uuid');

      // UserRoles insert
      const rolesInsert = scoped.insert.mock.calls[1]!;
      expect(rolesInsert[0]).toBe(tables.userRoles);
      expect((rolesInsert[1] as Record<string, unknown>)['role']).toBe('resident');
      expect((rolesInsert[1] as Record<string, unknown>)['isUnitOwner']).toBe(true);

      // Notification preferences insert
      const prefsInsert = scoped.insert.mock.calls[2]!;
      expect(prefsInsert[0]).toBe(tables.notificationPreferences);

      // Status updated to approved
      expect(scoped.update).toHaveBeenCalledTimes(1);
      const updateData = scoped.update.mock.calls[0]![1] as Record<string, unknown>;
      expect(updateData['status']).toBe('approved');

      // Welcome email sent
      expect(sendEmailMock).toHaveBeenCalledTimes(1);

      // Audit event logged
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'access_request.approved',
          communityId: COMMUNITY_ID,
          userId: 'reviewer-uuid',
        }),
      );
    });

    it('rejects non-pending request', async () => {
      setupScopedMock({
        accessRequestRows: [
          {
            id: 10,
            email: 'resident@example.com',
            fullName: 'New Resident',
            status: 'pending_verification',
            isUnitOwner: false,
          },
        ],
      });

      await expect(
        approveAccessRequest({
          requestId: 10,
          communityId: COMMUNITY_ID,
          reviewerId: 'reviewer-uuid',
        }),
      ).rejects.toThrow('Only pending requests can be approved');
    });

    it('does not update request status if auth creation fails', async () => {
      const scoped = setupScopedMock({
        accessRequestRows: [
          {
            id: 10,
            email: 'resident@example.com',
            fullName: 'New Resident',
            phone: null,
            status: 'pending',
            isUnitOwner: false,
          },
        ],
      });

      createAdminClientMock.mockReturnValue({
        auth: {
          admin: {
            createUser: vi.fn().mockResolvedValue({
              data: { user: null },
              error: { message: 'Email already in use' },
            }),
          },
        },
      });

      await expect(
        approveAccessRequest({
          requestId: 10,
          communityId: COMMUNITY_ID,
          reviewerId: 'reviewer-uuid',
        }),
      ).rejects.toThrow('Failed to create auth user');

      // Status should NOT have been updated
      expect(scoped.update).not.toHaveBeenCalled();
      // No users/roles should have been inserted
      expect(scoped.insert).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // denyAccessRequest
  // -------------------------------------------------------------------------

  describe('denyAccessRequest', () => {
    it('marks request as denied and sends notification', async () => {
      const scoped = setupScopedMock({
        accessRequestRows: [
          {
            id: 10,
            email: 'resident@example.com',
            fullName: 'Denied User',
            status: 'pending',
          },
        ],
      });

      await denyAccessRequest({
        requestId: 10,
        communityId: COMMUNITY_ID,
        reviewerId: 'reviewer-uuid',
        reason: 'Could not verify ownership',
      });

      // Status updated to denied
      const updateData = scoped.update.mock.calls[0]![1] as Record<string, unknown>;
      expect(updateData['status']).toBe('denied');
      expect(updateData['denialReason']).toBe('Could not verify ownership');

      // Denial email sent
      expect(sendEmailMock).toHaveBeenCalledTimes(1);

      // Audit event logged
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'access_request.denied',
          communityId: COMMUNITY_ID,
        }),
      );
    });

    it('rejects if request is not pending', async () => {
      setupScopedMock({
        accessRequestRows: [
          {
            id: 10,
            email: 'resident@example.com',
            fullName: 'User',
            status: 'approved',
          },
        ],
      });

      await expect(
        denyAccessRequest({
          requestId: 10,
          communityId: COMMUNITY_ID,
          reviewerId: 'reviewer-uuid',
        }),
      ).rejects.toThrow('Only pending requests can be denied');
    });
  });

  // -------------------------------------------------------------------------
  // listPendingRequests
  // -------------------------------------------------------------------------

  describe('listPendingRequests', () => {
    it('returns only pending requests', async () => {
      setupScopedMock({
        accessRequestRows: [
          { id: 1, status: 'pending', email: 'a@example.com' },
          { id: 2, status: 'approved', email: 'b@example.com' },
          { id: 3, status: 'pending', email: 'c@example.com' },
          { id: 4, status: 'denied', email: 'd@example.com' },
          { id: 5, status: 'pending_verification', email: 'e@example.com' },
        ],
      });

      const result = await listPendingRequests(COMMUNITY_ID);

      expect(result).toHaveLength(2);
      expect(result.map((r) => r['id'])).toEqual([1, 3]);
    });

    it('returns empty array when no pending requests', async () => {
      setupScopedMock();

      const result = await listPendingRequests(COMMUNITY_ID);
      expect(result).toEqual([]);
    });
  });
});

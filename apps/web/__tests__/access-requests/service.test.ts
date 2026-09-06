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
    // Real per-column identities, not a bare Symbol: the approval path does
    // `eq(users.email, ...)`, and on a Symbol that argument is `undefined`,
    // which makes any predicate assertion pass for ANY column.
    users: { __table: 'users', id: Symbol('users.id'), email: Symbol('users.email') },
    userRoles: Symbol('user_roles'),
    communities: Symbol('communities'),
    notificationPreferences: Symbol('notification_preferences'),
    units: Symbol('units'),
    documents: Symbol('documents'),
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
  units: tables.units,
  documents: tables.documents,
}));

vi.mock('@propertypro/db/filters', () => ({
  // Preserves column + value. A bare `{ _type: 'eq' }` would make every
  // predicate assertion vacuous: approval adopts an existing `users` row found
  // by this filter, so a regression that dropped the email condition — or
  // matched the wrong column — would adopt an ARBITRARY user and bind an auth
  // account to their identity, with the whole suite still green.
  eq: vi.fn((col: unknown, val: unknown) => ({ _type: 'eq', col, val })),
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
// No `?? 'dev-secret'` fallback: the service now throws without the env var, so
// mirroring a fallback here would silently diverge from production behaviour.
// setup.common.ts guarantees the value is set.
const TEST_OTP_HASH = crypto
  .createHmac('sha256', process.env.OTP_HMAC_SECRET as string)
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

  const updateMock = vi.fn(
    async (_table: unknown, _data: unknown, _additionalWhere?: unknown) => [{}],
  );

  // Cross-tenant FK guard resolves a referenced unitId through queryById.
  // Default to "found in this community"; a test can override to null to
  // exercise the rejection path.
  const queryByIdMock = vi.fn(async (_table: unknown, id: number) => ({ id }));

  // Approval looks up an existing `users` row by email before creating the auth
  // account, so it can adopt that row's id (issue #944). Default to "no existing
  // row" — the ordinary new-resident case; tests override it to model someone
  // pre-provisioned by another community.
  const selectFromMock = vi.fn(
    async (
      _table: unknown,
      _columns: unknown,
      _additionalWhere?: unknown,
    ): Promise<Record<string, unknown>[]> => [],
  );

  const scoped = {
    query: queryMock,
    insert: insertMock,
    update: updateMock,
    queryById: queryByIdMock,
    selectFrom: selectFromMock,
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
          { userId: 'admin-1', role: 'property_manager', designation: null },
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

    describe('admin notification recipients', () => {
      const pendingRequestRow = {
        id: 10,
        email: 'user@example.com',
        fullName: 'Test User',
        status: 'pending_verification',
        otpHash: TEST_OTP_HASH,
        otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        otpAttempts: 0,
        claimedUnitNumber: '101',
      };

      async function notifiedEmails(
        roleRows: Record<string, unknown>[],
        userRows: Record<string, unknown>[],
      ): Promise<string[]> {
        setupScopedMock({
          accessRequestRows: [pendingRequestRow],
          roleRows,
          userRows,
        });

        await verifyOtp({ requestId: 10, otp: TEST_OTP, communityId: COMMUNITY_ID });

        return sendEmailMock.mock.calls
          .map((call) => call[0] as { to: string; subject: string })
          .filter((args) => args.subject.startsWith('New resident access request'))
          .map((args) => args.to);
      }

      it('notifies all PM-scope role holders', async () => {
        const emails = await notifiedEmails(
          [
            { userId: 'admin-1', role: 'property_manager', designation: null },
            { userId: 'admin-2', role: 'root_manager', designation: null },
          ],
          [
            { id: 'admin-1', email: 'pm@example.com', fullName: 'PM' },
            { id: 'admin-2', email: 'root@example.com', fullName: 'Root' },
          ],
        );

        expect(emails).toEqual([
          'pm@example.com',
          'root@example.com',
        ]);
      });

      it('notifies a resident-role row designated board_president', async () => {
        const emails = await notifiedEmails(
          [
            {
              userId: 'pres-1',
              role: 'resident',
              designation: 'board_president',
            },
          ],
          [{ id: 'pres-1', email: 'president@example.com', fullName: 'President' }],
        );

        expect(emails).toEqual(['president@example.com']);
      });

      it('does NOT notify a board_member designation on a non-PM-scope role', async () => {
        const emails = await notifiedEmails(
          [
            {
              userId: 'member-1',
              role: 'resident',
              designation: 'board_member',
            },
          ],
          [{ id: 'member-1', email: 'member@example.com', fullName: 'Board Member' }],
        );

        expect(emails).toEqual([]);
      });
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

    // -----------------------------------------------------------------------
    // Issue #944 — identity binding and rollback
    // -----------------------------------------------------------------------

    it('ADOPTS an existing users row id instead of minting a new one', async () => {
      // The pre-provisioned case: this person already has a `users` row created
      // by another community. `users` is not tenant-scoped, so the lookup finds
      // it. Letting Supabase mint a fresh id here would (a) break
      // public.users.id === auth.users.id and (b) make the users INSERT fail on
      // the UNIQUE email — after the auth account already exists.
      const scoped = setupScopedMock({
        accessRequestRows: [
          {
            id: 10,
            email: 'preprovisioned@example.com',
            fullName: 'Pre Provisioned',
            phone: null,
            status: 'pending',
            isUnitOwner: false,
          },
        ],
      });
      scoped.selectFrom.mockResolvedValue([{ id: 'existing-user-uuid' }]);

      const createUser = vi
        .fn()
        .mockResolvedValue({ data: { user: { id: 'existing-user-uuid' } }, error: null });
      createAdminClientMock.mockReturnValue({ auth: { admin: { createUser } } });

      const result = await approveAccessRequest({
        requestId: 10,
        communityId: COMMUNITY_ID,
        reviewerId: 'reviewer-uuid',
      });

      expect(result.userId).toBe('existing-user-uuid');
      expect((createUser.mock.calls[0]![0] as Record<string, unknown>)['id']).toBe(
        'existing-user-uuid',
      );

      // The lookup MUST be constrained to this request's email. Without this
      // assertion a regression that dropped the predicate would adopt whichever
      // row came back first — binding an auth account to a stranger's identity.
      expect(scoped.selectFrom).toHaveBeenCalledWith(
        tables.users,
        expect.anything(),
        expect.objectContaining({
          _type: 'eq',
          col: tables.users.email,
          val: 'preprovisioned@example.com',
        }),
      );

      // The existing row is never re-inserted — that would violate the UNIQUE
      // email constraint.
      const insertedTables = scoped.insert.mock.calls.map((call) => call[0]);
      expect(insertedTables).not.toContain(tables.users);
      expect(insertedTables).toContain(tables.userRoles);
    });

    it('does NOT write to the adopted users row — it is shared across communities', async () => {
      // `users` has no `community_id`, so that row belongs to every community
      // this person is in. Writing the request's self-reported fullName/phone
      // there would overwrite another association's data, and would blank out a
      // stored phone whenever this form did not collect one. It would also be
      // unrecoverable: the rollback below restores the auth account, not row
      // contents.
      const scoped = setupScopedMock({
        accessRequestRows: [
          {
            id: 10,
            email: 'preprovisioned@example.com',
            fullName: 'Name From This Request',
            phone: null,
            status: 'pending',
            isUnitOwner: false,
          },
        ],
      });
      scoped.selectFrom.mockResolvedValue([{ id: 'existing-user-uuid' }]);

      createAdminClientMock.mockReturnValue({
        auth: {
          admin: {
            createUser: vi
              .fn()
              .mockResolvedValue({ data: { user: { id: 'existing-user-uuid' } }, error: null }),
          },
        },
      });

      await approveAccessRequest({
        requestId: 10,
        communityId: COMMUNITY_ID,
        reviewerId: 'reviewer-uuid',
      });

      // The only update is the access-request status transition.
      const updatedTables = scoped.update.mock.calls.map((call) => call[0]);
      expect(updatedTables).not.toContain(tables.users);
      expect(updatedTables).toEqual([tables.accessRequests]);
    });

    it('rolls the auth user back when a later insert fails', async () => {
      // Without this the account is already loginable (email_confirm: true) and
      // holds the address, so every retry fails "already registered" — a
      // permanently wedged request plus an orphan account.
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
      scoped.insert.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'));

      const deleteUser = vi.fn().mockResolvedValue({ error: null });
      createAdminClientMock.mockReturnValue({
        auth: {
          admin: {
            createUser: vi
              .fn()
              .mockResolvedValue({ data: { user: { id: 'new-user-uuid' } }, error: null }),
            deleteUser,
          },
        },
      });

      await expect(
        approveAccessRequest({
          requestId: 10,
          communityId: COMMUNITY_ID,
          reviewerId: 'reviewer-uuid',
        }),
      ).rejects.toThrow(/duplicate key/);

      expect(deleteUser).toHaveBeenCalledWith('new-user-uuid');
      // The request stays pending so an admin can retry — and the retry can now
      // succeed, because the orphan is gone.
      expect(scoped.update).not.toHaveBeenCalled();
    });

    it('reports a failed rollback rather than hiding it behind the original error', async () => {
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
      scoped.insert.mockRejectedValueOnce(new Error('db exploded'));

      createAdminClientMock.mockReturnValue({
        auth: {
          admin: {
            createUser: vi
              .fn()
              .mockResolvedValue({ data: { user: { id: 'new-user-uuid' } }, error: null }),
            deleteUser: vi.fn().mockResolvedValue({ error: { message: 'auth unreachable' } }),
          },
        },
      });

      // At this point the account genuinely needs a human, so both facts must
      // reach the operator.
      await expect(
        approveAccessRequest({
          requestId: 10,
          communityId: COMMUNITY_ID,
          reviewerId: 'reviewer-uuid',
        }),
      ).rejects.toThrow(/db exploded.*rollback FAILED: auth unreachable/);
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

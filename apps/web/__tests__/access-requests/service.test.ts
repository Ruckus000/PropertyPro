/**
 * Unit tests for access-request-service.
 *
 * Tests cover:
 * - submitAccessRequest: new request, resend for existing pending_verification, reject existing member
 * - verifyOtp: valid OTP transitions to pending, max attempts, expired OTP
 * - approveAccessRequest: creates auth user + users + roles, rejects non-pending, handles auth failure
 * - denyAccessRequest: marks denied, sends notification
 * - every access_requests read is a targeted SQL lookup, never a full-table
 *   read filtered in JS (roadmap 3.7, PAG-10)
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
    // Per-column identities so the SQL predicates the service builds can be
    // asserted and evaluated (PAG-10: no more full reads + JS `.find`).
    accessRequests: {
      __table: 'access_requests',
      id: Symbol('access_requests.id'),
      email: Symbol('access_requests.email'),
      status: Symbol('access_requests.status'),
    },
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
  asc: vi.fn((col: unknown) => ({ _type: 'asc', col })),
  isNull: vi.fn((_col: unknown) => ({ _type: 'isNull' })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ _type: 'inArray', col, vals })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    _type: 'sql',
    text: strings.join('?'),
    values,
  })),
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
  const accessRequestRows = overrides.accessRequestRows ?? [];

  const queryMock = vi.fn(async (table: unknown) => {
    // PAG-10: a whole-table read of access_requests is exactly the regression
    // these tests exist to catch, so it fails loudly instead of being served.
    if (table === tables.accessRequests) {
      throw new Error('Full-table read of access_requests (PAG-10 regression)');
    }
    // Mirrors the scoped client's read guard: `users` is platform-global, so an
    // unfiltered read of it is refused rather than served.
    if (table === tables.users) throw new Error('Unscoped query on table "users"');
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
  // access_requests lookups by primary key are served from `accessRequestRows`,
  // as the SQL `id = $1` would.
  const queryByIdMock = vi.fn(async (table: unknown, id: number) => {
    if (table === tables.accessRequests) {
      return accessRequestRows.find((row) => row['id'] === id) ?? null;
    }
    return { id };
  });

  // The submit-time pending_verification lookup is
  //   selectFrom(accessRequests, {}, and(sql`lower(email) = x`, eq(status, v)))
  //     .orderBy(asc(id)).limit(n)
  // This evaluates exactly that predicate/order/limit over `accessRequestRows`
  // and records the chain in `accessRequestSelects`, so a test can assert the
  // SQL shape as well as the row it yields.
  const accessRequestSelects: Array<{ where: unknown; orderBy: unknown[]; limit: number | null }> = [];
  function selectAccessRequests(additionalWhere: unknown) {
    const call = { where: additionalWhere, orderBy: [] as unknown[], limit: null as number | null };
    accessRequestSelects.push(call);
    const evaluate = (): Record<string, unknown>[] => {
      const where = additionalWhere as { _type: 'and'; args: unknown[] } | undefined;
      if (where?._type !== 'and') throw new Error('unexpected access_requests predicate');
      let rows = accessRequestRows.filter((row) =>
        where.args.every((clause) => {
          const c = clause as
            | { _type: 'sql'; text: string; values: unknown[] }
            | { _type: 'eq'; col: unknown; val: unknown };
          if (
            c._type === 'sql' &&
            c.text === 'lower(?) = ?' &&
            c.values[0] === tables.accessRequests.email
          ) {
            return String(row['email']).toLowerCase() === c.values[1];
          }
          if (c._type === 'eq' && c.col === tables.accessRequests.status) {
            return row['status'] === c.val;
          }
          throw new Error('unexpected access_requests clause');
        }),
      );
      if (call.orderBy.some((o) => (o as { col?: unknown }).col === tables.accessRequests.id)) {
        rows = [...rows].sort((a, b) => (a['id'] as number) - (b['id'] as number));
      }
      return call.limit === null ? rows : rows.slice(0, call.limit);
    };
    const builder = {
      orderBy: (...cols: unknown[]) => {
        call.orderBy.push(...cols);
        return builder;
      },
      limit: (n: number) => {
        call.limit = n;
        return builder;
      },
      then: <R1, R2 = never>(
        onFulfilled?: (rows: Record<string, unknown>[]) => R1 | PromiseLike<R1>,
        onRejected?: (e: unknown) => R2 | PromiseLike<R2>,
      ) => Promise.resolve().then(evaluate).then(onFulfilled, onRejected),
    };
    return builder;
  }

  // `users` reads go through selectFrom with a WHERE. The two predicates the
  // service builds are applied to `userRows`, so a lookup only sees the rows it
  // actually asked for:
  // - inArray(users.id, ids)           — admin notification recipients
  // - sql`lower(users.email) = lower(x)` — the submit-time member check
  // Anything else (approval's `eq(users.email, ...)`) defaults to "no existing
  // row" — the ordinary new-resident case; tests override it to model someone
  // pre-provisioned by another community (issue #944).
  const selectFromMock = vi.fn(
    (table: unknown, _columns: unknown, additionalWhere?: unknown) =>
      table === tables.accessRequests
        ? selectAccessRequests(additionalWhere)
        : selectUsers(table, additionalWhere),
  );

  const selectUsers = async (
      table: unknown,
      additionalWhere?: unknown,
    ): Promise<Record<string, unknown>[]> => {
      if (table !== tables.users) return [];
      const rows = overrides.userRows ?? [];
      const where = additionalWhere as
        | { _type: 'inArray'; col: unknown; vals: unknown[] }
        | { _type: 'sql'; values: unknown[] }
        | undefined;
      if (where?._type === 'inArray' && where.col === tables.users.id) {
        return rows.filter((row) => where.vals.includes(row['id']));
      }
      if (where?._type === 'sql' && where.values[0] === tables.users.email) {
        const wanted = String(where.values[1]).toLowerCase();
        return rows.filter((row) => String(row['email']).toLowerCase() === wanted);
      }
      return [];
    };

  const scoped = {
    query: queryMock,
    insert: insertMock,
    update: updateMock,
    queryById: queryByIdMock,
    selectFrom: selectFromMock,
    accessRequestSelects,
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

    // --- The attempt cap is a cap (#947) ------------------------------------
    //
    // It used to reset unconditionally on resend, so guess-5 / resend / guess-5
    // was unbounded. It now survives a resend while the current code is live,
    // and resets only once that code has lapsed.




    // Resend RESETS the counter, and a test pins that because the opposite was
    // shipped and reverted: preserving it while the resend also refreshes the
    // expiry let anyone hold any address in a permanent "Too many incorrect
    // codes" state. Brute force is bounded by the Redis-backed auth-tier rate
    // limiter instead. See the note at the update site.
    it('RESETS otpAttempts on resend, so a third party cannot hold the lock open', async () => {
      const scoped = setupScopedMock({
        accessRequestRows: [
          {
            id: 10,
            email: 'existing@example.com',
            fullName: 'Existing User',
            status: 'pending_verification',
            otpHash: 'old-hash',
            // Still LIVE — the case that previously kept the row locked forever.
            otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            otpAttempts: 5,
          },
        ],
      });

      await submitAccessRequest({
        communityId: COMMUNITY_ID,
        communitySlug: COMMUNITY_SLUG,
        email: 'existing@example.com',
        fullName: 'Existing User',
        isUnitOwner: false,
      });

      const updateData = scoped.update.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(updateData['otpAttempts']).toBe(0);
      // A fresh code is issued too, or the reset would be pointless.
      expect(updateData['otpHash']).toEqual(expect.any(String));
      expect(updateData['otpExpiresAt']).toBeInstanceOf(Date);
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

    it('looks the submitted email up case-insensitively, never by reading the users table', async () => {
      const scoped = setupScopedMock({
        userRows: [
          { id: 'someone-else', email: 'other@example.com', fullName: 'Other' },
          { id: 'user-1', email: 'Member@Example.com', fullName: 'Member' },
        ],
        roleRows: [{ userId: 'user-1', role: 'resident', isUnitOwner: true }],
      });

      await expect(
        submitAccessRequest({
          communityId: COMMUNITY_ID,
          communitySlug: COMMUNITY_SLUG,
          email: 'MEMBER@example.com',
          fullName: 'Member',
          isUnitOwner: false,
        }),
      ).rejects.toThrow('already associated with a member');

      expect(scoped.selectFrom).toHaveBeenCalledWith(
        tables.users,
        { id: tables.users.id },
        {
          _type: 'sql',
          text: 'lower(?) = lower(?)',
          values: [tables.users.email, 'member@example.com'],
        },
      );
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

    it('reports the email verification as the record check, and nothing it did not check', async () => {
      setupScopedMock({
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
        roleRows: [{ userId: 'admin-1', role: 'property_manager', designation: null }],
        userRows: [{ id: 'admin-1', email: 'admin@example.com', fullName: 'Admin User' }],
      });

      await verifyOtp({ requestId: 10, otp: TEST_OTP, communityId: COMMUNITY_ID });

      const adminSend = sendEmailMock.mock.calls
        .map((call) => call[0] as { subject: string; category: string; react: { props: Record<string, unknown> } })
        .find((args) => args.subject.startsWith('New resident access request'));
      expect(adminSend).toBeDefined();
      expect(adminSend!.category).toBe('transactional');
      expect(adminSend!.react.props['recordCheck']).toEqual({ label: 'Email verified', tone: 'green' });
      // The "Review request" link names the community, or it opens an error page.
      expect(adminSend!.react.props['dashboardUrl']).toMatch(
        new RegExp(`/dashboard/directory\\?communityId=${COMMUNITY_ID}&tab=requests$`),
      );
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

      it('does NOT notify a resident-role board_president — they cannot open or approve requests', async () => {
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

        expect(emails).toEqual([]);
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

      it('loads only the notified admins, never the whole users table', async () => {
        const scoped = setupScopedMock({
          accessRequestRows: [pendingRequestRow],
          roleRows: [
            { userId: 'admin-1', role: 'property_manager', designation: null },
            { userId: 'resident-1', role: 'resident', designation: null },
            { userId: 'admin-2', role: 'root_manager', designation: null },
          ],
          userRows: [
            { id: 'admin-1', email: 'pm@example.com', fullName: 'PM' },
            { id: 'resident-1', email: 'resident@example.com', fullName: 'Resident' },
            { id: 'admin-2', email: 'root@example.com', fullName: 'Root' },
          ],
        });

        await verifyOtp({ requestId: 10, otp: TEST_OTP, communityId: COMMUNITY_ID });

        const userLookups = scoped.selectFrom.mock.calls.filter(([table]) => table === tables.users);
        expect(userLookups).toEqual([
          [
            tables.users,
            expect.any(Object),
            { _type: 'inArray', col: tables.users.id, vals: ['admin-1', 'admin-2'] },
          ],
        ]);
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
      ).rejects.toThrow('Too many incorrect codes');
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
  // PAG-10 (roadmap 3.7): every access_requests read is targeted SQL
  // -------------------------------------------------------------------------

  describe('access_requests reads are targeted, never full-table', () => {
    const mixedRows = [
      { id: 3, email: 'other@example.com', fullName: 'Other', status: 'pending_verification' },
      { id: 5, email: 'Resend@Example.com', fullName: 'Old Denied', status: 'denied' },
      // Mixed-case stored email: the JS `.find` compared lower(stored) too.
      { id: 7, email: 'Resend@Example.com', fullName: 'Resend Me', status: 'pending_verification' },
    ];

    it('submit: finds the pending_verification row by lower(email) + status, id ASC, LIMIT 1', async () => {
      const scoped = setupScopedMock({ accessRequestRows: mixedRows });

      const result = await submitAccessRequest({
        communityId: COMMUNITY_ID,
        communitySlug: COMMUNITY_SLUG,
        email: 'RESEND@example.com',
        fullName: 'Resend Me',
        isUnitOwner: false,
      });

      // Same row the full read + `.find` returned.
      expect(result).toEqual({ requestId: 7, resent: true });
      expect(scoped.query).not.toHaveBeenCalledWith(tables.accessRequests);
      expect(scoped.accessRequestSelects).toEqual([
        {
          where: {
            _type: 'and',
            args: [
              {
                _type: 'sql',
                text: 'lower(?) = ?',
                values: [tables.accessRequests.email, 'resend@example.com'],
              },
              { _type: 'eq', col: tables.accessRequests.status, val: 'pending_verification' },
            ],
          },
          orderBy: [{ _type: 'asc', col: tables.accessRequests.id }],
          limit: 1,
        },
      ]);
      expect(scoped.update).toHaveBeenCalledWith(
        tables.accessRequests,
        expect.objectContaining({ otpAttempts: 0 }),
        { _type: 'eq', col: tables.accessRequests.id, val: 7 },
      );
    });

    it('submit: with no matching row, inserts a new request', async () => {
      const scoped = setupScopedMock({ accessRequestRows: mixedRows });

      const result = await submitAccessRequest({
        communityId: COMMUNITY_ID,
        communitySlug: COMMUNITY_SLUG,
        email: 'brand-new@example.com',
        fullName: 'New',
        isUnitOwner: false,
      });

      expect(result).toEqual({ requestId: 99, resent: false });
      expect(scoped.accessRequestSelects).toHaveLength(1);
    });

    it('verify / approve / deny: look the request up by primary key only', async () => {
      const rows = [
        { id: 1, email: 'a@example.com', fullName: 'A', status: 'pending' },
        { id: 2, email: 'b@example.com', fullName: 'B', status: 'approved' },
      ];

      let scoped = setupScopedMock({ accessRequestRows: rows });
      await expect(
        verifyOtp({ requestId: 2, otp: TEST_OTP, communityId: COMMUNITY_ID }),
      ).rejects.toThrow('already been verified');
      expect(scoped.queryById).toHaveBeenCalledWith(tables.accessRequests, 2);

      scoped = setupScopedMock({ accessRequestRows: rows });
      await expect(
        approveAccessRequest({ requestId: 2, communityId: COMMUNITY_ID, reviewerId: 'r' }),
      ).rejects.toThrow('Only pending requests can be approved');
      expect(scoped.queryById).toHaveBeenCalledWith(tables.accessRequests, 2);

      scoped = setupScopedMock({ accessRequestRows: rows });
      await denyAccessRequest({ requestId: 1, communityId: COMMUNITY_ID, reviewerId: 'r' });
      expect(scoped.queryById).toHaveBeenCalledWith(tables.accessRequests, 1);
      expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@example.com' }));

      expect(scoped.query).not.toHaveBeenCalledWith(tables.accessRequests);
    });
  });
});

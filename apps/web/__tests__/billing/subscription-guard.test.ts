/**
 * Tests for the subscription guard middleware — P2-34a
 *
 * Function: requireActiveSubscriptionForMutation(communityId: number)
 * File: apps/web/src/lib/middleware/subscription-guard.ts
 *
 * Coverage:
 * - Allowed statuses: active, trialing, past_due, null (new community)
 * - Blocked statuses: canceled, expired
 * - Community not found in DB (rows[0] is undefined → status treated as null → allowed)
 * - AppError shape: statusCode=403, code='SUBSCRIPTION_REQUIRED'
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks before any imports
// ---------------------------------------------------------------------------
const {
  createUnscopedClientMock,
  eqMock,
  communitiesTable,
} = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  eqMock: vi.fn((col: unknown, val: unknown) => ({ _eq: [col, val] })),
  communitiesTable: {
    id: 'communities.id',
    subscriptionStatus: 'communities.subscription_status',
  },
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: eqMock,
}));

vi.mock('@propertypro/db', () => ({
  communities: communitiesTable,
}));

// Import after mocks
import { requireActiveSubscriptionForMutation } from '../../src/lib/middleware/subscription-guard';
import { AppError } from '../../src/lib/api/errors/AppError';

// ---------------------------------------------------------------------------
// Helper: configure the db mock to return a given subscriptionStatus
// ---------------------------------------------------------------------------
function setupDb(subscriptionStatus: string | null | undefined): void {
  const rows =
    subscriptionStatus === undefined
      ? [] // community not found
      : [{ subscriptionStatus }];

  const limitMock = vi.fn().mockResolvedValue(rows);
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  createUnscopedClientMock.mockReturnValue({ select: selectMock });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('requireActiveSubscriptionForMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Allowed statuses — must NOT throw
  // -------------------------------------------------------------------------

  describe('allowed statuses', () => {
    it('resolves without throwing for status "active"', async () => {
      setupDb('active');
      await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
    });

    it('resolves without throwing for status "trialing"', async () => {
      setupDb('trialing');
      await expect(requireActiveSubscriptionForMutation(2)).resolves.toBeUndefined();
    });

    it('resolves without throwing for status "past_due"', async () => {
      setupDb('past_due');
      await expect(requireActiveSubscriptionForMutation(3)).resolves.toBeUndefined();
    });

    it('resolves without throwing when status is null (new/unprovisioned community)', async () => {
      setupDb(null);
      await expect(requireActiveSubscriptionForMutation(4)).resolves.toBeUndefined();
    });

    it('resolves without throwing when community is not found in DB (rows[0] is undefined)', async () => {
      // subscriptionStatus === undefined triggers setupDb to return []
      setupDb(undefined);
      await expect(requireActiveSubscriptionForMutation(999)).resolves.toBeUndefined();
    });

    it('resolves without throwing for status "incomplete" (transient SCA state, not locked)', async () => {
      setupDb('incomplete');
      await expect(requireActiveSubscriptionForMutation(5)).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Blocked statuses — must throw AppError(403, 'SUBSCRIPTION_REQUIRED')
  // -------------------------------------------------------------------------

  describe('blocked statuses', () => {
    it('throws AppError with statusCode 403 for status "canceled"', async () => {
      setupDb('canceled');
      await expect(requireActiveSubscriptionForMutation(10)).rejects.toThrow(AppError);
    });

    it('throws AppError with code SUBSCRIPTION_REQUIRED for status "canceled"', async () => {
      setupDb('canceled');

      let caught: unknown;
      try {
        await requireActiveSubscriptionForMutation(10);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(AppError);
      const appErr = caught as AppError;
      expect(appErr.statusCode).toBe(403);
      expect(appErr.code).toBe('SUBSCRIPTION_REQUIRED');
    });

    it('throws AppError with statusCode 403 for status "expired"', async () => {
      setupDb('expired');
      await expect(requireActiveSubscriptionForMutation(11)).rejects.toThrow(AppError);
    });

    it('throws AppError with statusCode 403 for status "unpaid"', async () => {
      setupDb('unpaid');
      await expect(requireActiveSubscriptionForMutation(12)).rejects.toThrow(AppError);
    });

    it('throws AppError with code SUBSCRIPTION_REQUIRED and correct details for status "unpaid"', async () => {
      setupDb('unpaid');

      let caught: unknown;
      try {
        await requireActiveSubscriptionForMutation(12);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(AppError);
      const appErr = caught as AppError;
      expect(appErr.statusCode).toBe(403);
      expect(appErr.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(appErr.details).toEqual({ subscriptionStatus: 'unpaid' });
    });

    it('throws AppError with code SUBSCRIPTION_REQUIRED for status "expired"', async () => {
      setupDb('expired');

      let caught: unknown;
      try {
        await requireActiveSubscriptionForMutation(11);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(AppError);
      const appErr = caught as AppError;
      expect(appErr.statusCode).toBe(403);
      expect(appErr.code).toBe('SUBSCRIPTION_REQUIRED');
    });

    it('includes the subscriptionStatus in AppError details for "canceled"', async () => {
      setupDb('canceled');

      let caught: unknown;
      try {
        await requireActiveSubscriptionForMutation(20);
      } catch (err) {
        caught = err;
      }

      const appErr = caught as AppError;
      expect(appErr.details).toEqual({ subscriptionStatus: 'canceled' });
    });

    it('includes the subscriptionStatus in AppError details for "expired"', async () => {
      setupDb('expired');

      let caught: unknown;
      try {
        await requireActiveSubscriptionForMutation(21);
      } catch (err) {
        caught = err;
      }

      const appErr = caught as AppError;
      expect(appErr.details).toEqual({ subscriptionStatus: 'expired' });
    });

    it('throws AppError with statusCode 403 for status "incomplete_expired"', async () => {
      setupDb('incomplete_expired');
      await expect(requireActiveSubscriptionForMutation(13)).rejects.toThrow(AppError);
    });

    it('throws AppError with code SUBSCRIPTION_REQUIRED for status "incomplete_expired"', async () => {
      setupDb('incomplete_expired');

      let caught: unknown;
      try {
        await requireActiveSubscriptionForMutation(13);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(AppError);
      const appErr = caught as AppError;
      expect(appErr.statusCode).toBe(403);
      expect(appErr.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(appErr.details).toEqual({ subscriptionStatus: 'incomplete_expired' });
    });
  });

  // -------------------------------------------------------------------------
  // DB query construction
  // -------------------------------------------------------------------------

  describe('DB query', () => {
    it('queries communities table with the correct communityId', async () => {
      const selectMock = vi.fn(() => ({ from: fromMock }));
      const fromMock = vi.fn(() => ({ where: whereMock }));
      const whereMock = vi.fn(() => ({ limit: limitMock }));
      const limitMock = vi.fn().mockResolvedValue([{ subscriptionStatus: 'active' }]);

      createUnscopedClientMock.mockReturnValue({ select: selectMock });

      await requireActiveSubscriptionForMutation(42);

      // select() should be called with at least the subscriptionStatus column
      expect(selectMock).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionStatus: communitiesTable.subscriptionStatus }),
      );

      // from() should be called with the communities table
      expect(fromMock).toHaveBeenCalledWith(communitiesTable);

      // where() should use eq(communities.id, communityId)
      expect(eqMock).toHaveBeenCalledWith(communitiesTable.id, 42);

      // limit(1) should be called
      expect(limitMock).toHaveBeenCalledWith(1);
    });

    it('creates a fresh db client on each call', async () => {
      setupDb('active');
      await requireActiveSubscriptionForMutation(1);
      await requireActiveSubscriptionForMutation(2);
      expect(createUnscopedClientMock).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // AppError serialization
  // -------------------------------------------------------------------------

  describe('AppError toJSON', () => {
    it('serializes correctly for canceled status', async () => {
      setupDb('canceled');

      let caught: unknown;
      try {
        await requireActiveSubscriptionForMutation(30);
      } catch (err) {
        caught = err;
      }

      const appErr = caught as AppError;
      const json = appErr.toJSON();

      expect(json.error.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(json.error.message).toContain('subscription');
      expect(json.error.details).toEqual({ subscriptionStatus: 'canceled' });
    });
  });
});

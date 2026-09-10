/**
 * The add-to-group signup producer — `lib/billing/billing-group-service.ts`.
 *
 * This flow is a parallel implementation of the public signup path, and it had
 * drifted from it in three ways that each broke a different downstream
 * mechanism. These tests pin the three, and they are written against the
 * PRODUCER rather than the sweep on purpose: `expireStalePendingSignups`
 * deliberately refuses NULL-expiry rows (see its docblock and its own test), so
 * the bug was never in the consumer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createUnscopedClientMock,
  eqMock,
  pendingSignupsTable,
} = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  eqMock: vi.fn((col: unknown, val: unknown) => ({ _eq: { col, val } })),
  pendingSignupsTable: {
    id: 'pending_signups.id',
    status: 'pending_signups.status',
    expiresAt: 'pending_signups.expires_at',
    payload: 'pending_signups.payload',
  },
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));
vi.mock('@propertypro/db', () => ({
  pendingSignups: pendingSignupsTable,
  billingGroups: { id: 'billing_groups.id' },
  communities: { id: 'communities.id' },
  userRoles: { id: 'user_roles.id' },
}));
vi.mock('@propertypro/db/filters', () => ({
  eq: eqMock,
  and: vi.fn((...c: unknown[]) => ({ _and: c })),
  isNull: vi.fn((c: unknown) => ({ _isNull: c })),
  lt: vi.fn((c: unknown, v: unknown) => ({ _lt: { c, v } })),
  ne: vi.fn((c: unknown, v: unknown) => ({ _ne: { c, v } })),
  sql: Object.assign(vi.fn(() => ({ _sql: true })), { raw: vi.fn() }),
  inArray: vi.fn((c: unknown, v: unknown) => ({ _inArray: { c, v } })),
}));
vi.mock('../../src/lib/billing/tier-calculator', () => ({
  determineTier: vi.fn(() => 'none'),
}));
vi.mock('../../src/lib/billing/volume-discounts', () => ({
  applyVolumeDiscountToSubscriptions: vi.fn(),
}));
vi.mock('../../src/lib/billing/downgrade-notifications', () => ({
  notifyDowngrade: vi.fn(),
}));

import {
  createPendingAddToGroupSignup,
  recordAddToGroupCheckoutSession,
} from '../../src/lib/billing/billing-group-service';
import { SIGNUP_EXPIRY_MS } from '../../src/lib/auth/signup-expiry';
import { ValidationError } from '@propertypro/shared/http';

const validInput = {
  userId: 'user-123',
  billingGroupId: 42,
  input: {
    name: 'Oceanview Towers',
    communityType: 'condo_718',
    planId: 'essentials',
    addressLine1: '123 Ocean Blvd',
    city: 'Miami',
    state: 'FL',
    zipCode: '33139',
    subdomain: 'oceanview-towers',
    timezone: 'America/New_York',
    unitCount: 48,
  },
};

function buildInsertDb(outcome: { rows?: unknown[]; throws?: unknown }) {
  const returningMock = vi.fn(() =>
    outcome.throws ? Promise.reject(outcome.throws) : Promise.resolve(outcome.rows ?? [{ id: 7n }]),
  );
  const valuesMock = vi.fn((_values: Record<string, unknown>) => ({ returning: returningMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  return { db: { insert: insertMock }, valuesMock };
}

describe('createPendingAddToGroupSignup', () => {
  beforeEach(() => vi.clearAllMocks());

  // The defect this file exists for. `checkout_started` sits INSIDE
  // `pending_signups_candidate_slug_active_unique`, so the row reserves the
  // subdomain immediately; with no `expires_at` nothing could ever release it.
  it('stamps expires_at, so the row is reachable by the expiry sweep', async () => {
    const { db, valuesMock } = buildInsertDb({});
    createUnscopedClientMock.mockReturnValue(db);
    const before = Date.now();

    await createPendingAddToGroupSignup(validInput);

    const values = valuesMock.mock.calls[0]![0] as { expiresAt?: Date; status?: string };
    expect(values.expiresAt).toBeInstanceOf(Date);
    expect(values.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + SIGNUP_EXPIRY_MS);
    // The status is what puts it in the index; assert both together so a future
    // change to either is forced to reconsider the other.
    expect(values.status).toBe('checkout_started');
  });

  it('uses the same window as the public signup path', async () => {
    const { db, valuesMock } = buildInsertDb({});
    createUnscopedClientMock.mockReturnValue(db);

    await createPendingAddToGroupSignup(validInput);

    const values = valuesMock.mock.calls[0]![0] as { expiresAt: Date; termsAcceptedAt: Date };
    expect(values.expiresAt.getTime() - values.termsAcceptedAt.getTime()).toBe(SIGNUP_EXPIRY_MS);
  });

  // TOCTOU between the caller's availability check and this insert. Without the
  // guard the raw PG error escapes withErrorHandler (which only special-cases
  // AppError) and the PM sees "An unexpected error occurred".
  it('turns a slug-index 23505 into a ValidationError, not a raw 500', async () => {
    const pgError = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint: 'pending_signups_candidate_slug_active_unique',
    });
    const { db } = buildInsertDb({ throws: pgError });
    createUnscopedClientMock.mockReturnValue(db);

    await expect(createPendingAddToGroupSignup(validInput)).rejects.toThrow(ValidationError);
  });

  // Control: the guard must be specific to that index, not to 23505 generally,
  // and must not swallow anything else.
  it('rethrows a unique violation on a DIFFERENT constraint unchanged', async () => {
    const pgError = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint: 'pending_signups_email_normalized_unique',
    });
    const { db } = buildInsertDb({ throws: pgError });
    createUnscopedClientMock.mockReturnValue(db);

    await expect(createPendingAddToGroupSignup(validInput)).rejects.toBe(pgError);
  });

  it('rethrows a non-unique-violation error unchanged', async () => {
    const other = Object.assign(new Error('connection terminated'), { code: '08006' });
    const { db } = buildInsertDb({ throws: other });
    createUnscopedClientMock.mockReturnValue(db);

    await expect(createPendingAddToGroupSignup(validInput)).rejects.toBe(other);
  });
});

describe('recordAddToGroupCheckoutSession', () => {
  beforeEach(() => vi.clearAllMocks());

  function buildUpdateDb(existingPayload: unknown) {
    const limitMock = vi.fn().mockResolvedValue([{ payload: existingPayload }]);
    const selectWhereMock = vi.fn(() => ({ limit: limitMock }));
    const fromMock = vi.fn(() => ({ where: selectWhereMock }));
    const selectMock = vi.fn(() => ({ from: fromMock }));
    const updateWhereMock = vi.fn().mockResolvedValue(undefined);
    const setMock = vi.fn((_set: Record<string, unknown>) => ({ where: updateWhereMock }));
    const updateMock = vi.fn(() => ({ set: setMock }));
    return { db: { select: selectMock, update: updateMock }, setMock };
  }

  // Without this the row is invisible to reconcileLostCheckoutSignups, which
  // reads payload.stripeCheckoutSessionId and skips the row when it is absent —
  // so a PM who PAID but lost the webhook could never be recovered.
  it('writes the session id the reconciler looks up', async () => {
    const { db, setMock } = buildUpdateDb({ kind: 'add_to_group', billingGroupId: 42 });
    createUnscopedClientMock.mockReturnValue(db);

    await recordAddToGroupCheckoutSession({ pendingSignupId: 7, sessionId: 'cs_test_abc' });

    const set = setMock.mock.calls[0]![0] as { payload: Record<string, unknown> };
    expect(set.payload.stripeCheckoutSessionId).toBe('cs_test_abc');
  });

  // The provisioning path reads payload.kind and payload.fullInput. Replacing
  // the payload instead of merging would strand the signup at provisioning time.
  it('preserves the existing payload rather than replacing it', async () => {
    const { db, setMock } = buildUpdateDb({
      kind: 'add_to_group',
      billingGroupId: 42,
      fullInput: { name: 'Oceanview Towers' },
    });
    createUnscopedClientMock.mockReturnValue(db);

    await recordAddToGroupCheckoutSession({ pendingSignupId: 7, sessionId: 'cs_test_abc' });

    const set = setMock.mock.calls[0]![0] as { payload: Record<string, unknown> };
    expect(set.payload.kind).toBe('add_to_group');
    expect(set.payload.fullInput).toEqual({ name: 'Oceanview Towers' });
  });

  it('bumps updatedAt, so the row leaves the reconciler queue front', async () => {
    const { db, setMock } = buildUpdateDb({ kind: 'add_to_group' });
    createUnscopedClientMock.mockReturnValue(db);

    await recordAddToGroupCheckoutSession({ pendingSignupId: 7, sessionId: 'cs_test_abc' });

    const set = setMock.mock.calls[0]![0] as { updatedAt: Date };
    expect(set.updatedAt).toBeInstanceOf(Date);
  });
});

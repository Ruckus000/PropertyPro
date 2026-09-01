/**
 * `startConnectOnboarding` when STRIPE_CONNECT_CLIENT_ID is absent.
 *
 * The env var has never been set in production (pre-launch readiness audit,
 * H2/H3). Before this was typed, the missing key surfaced as a bare
 * `new Error(...)`, which `withErrorHandler` renders as a generic 500
 * INTERNAL_ERROR — an admin trying to switch on resident payments got an error
 * page that reads as "the app is broken", not "this environment is missing a
 * key".
 *
 * The Sentry assertion is the half that is easy to lose. `withErrorHandler`
 * returns early for every `AppError`, BEFORE the `captureException` that only
 * runs for unknown errors — so typing the error without capturing at the throw
 * site would have traded the operator signal for the nicer message. Both
 * assertions below have to hold together.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureMessageMock } = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
}));

// finance-service imports the db barrel at module load, which constructs a
// drizzle client and throws on a missing DATABASE_URL — so these mocks are
// required just to import the module under test, not for the assertions.
vi.mock('@propertypro/db', () => ({
  assessmentLineItems: {},
  rentObligations: {},
  rentPayments: {},
  assessments: {},
  createScopedClient: vi.fn(),
  financeStripeWebhookEvents: {},
  getUnitLedgerBalance: vi.fn(),
  listLedgerEntries: vi.fn(),
  logAuditEvent: vi.fn(),
  postLedgerEntry: vi.fn(),
  violationFines: {},
  violations: {},
  stripeConnectedAccounts: {},
  units: {},
  userRoles: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  and: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  inArray: vi.fn(),
  lt: vi.fn(),
  lte: vi.fn(),
  or: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/services/stripe-service', () => ({
  getStripeClient: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: captureMessageMock,
}));

import { AppError } from '@propertypro/shared/http';
import { startConnectOnboarding } from '../../src/lib/services/finance-service';

describe('startConnectOnboarding without STRIPE_CONNECT_CLIENT_ID', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.STRIPE_CONNECT_CLIENT_ID;
  });

  it('throws a typed 503 rather than a bare Error', async () => {
    const err = await startConnectOnboarding(42, 'user-1').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    const appErr = err as AppError;
    // 5xx, not 4xx: the cause is server-side configuration, and a 4xx would
    // read as expected traffic in every dashboard that buckets by status class.
    expect(appErr.statusCode).toBe(503);
    expect(appErr.code).toBe('PAYMENTS_NOT_CONFIGURED');
  });

  it('reports the misconfiguration to Sentry', async () => {
    await startConnectOnboarding(42, 'user-1', 'req-7').catch(() => undefined);

    expect(captureMessageMock).toHaveBeenCalledWith(
      'stripe_connect_client_id_missing',
      expect.objectContaining({
        level: 'error',
        extra: expect.objectContaining({ communityId: 42, requestId: 'req-7' }),
      }),
    );
  });

  it('does not proceed to Stripe once it has failed', async () => {
    // Anti-vacuity: proves the guard returns at the top rather than throwing
    // somewhere downstream for an unrelated reason, which would make the two
    // assertions above accidental.
    const { getStripeClient } = await import('@/lib/services/stripe-service');

    await startConnectOnboarding(42, 'user-1').catch(() => undefined);

    expect(getStripeClient).not.toHaveBeenCalled();
  });
});

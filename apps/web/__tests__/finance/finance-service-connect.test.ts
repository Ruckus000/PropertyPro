/**
 * Stripe Connect onboarding through account links.
 *
 * Stripe no longer offers OAuth to new Connect platforms, so we create the
 * association's account ourselves and send the admin to Stripe's hosted
 * onboarding page. These tests pin the parts that are easy to get wrong:
 * - The account keeps the association's own full Stripe Dashboard.
 * - A saved account is resumed, never replaced.
 * - Two racing clicks end up on one saved account.
 * - Returning from Stripe re-reads the saved account rather than trusting the
 *   redirect.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  captureMessageMock,
  logAuditEventMock,
  selectFromMock,
  insertMock,
  updateMock,
  accountsCreateMock,
  accountsRetrieveMock,
  accountLinksCreateMock,
} = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  selectFromMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  accountsCreateMock: vi.fn(),
  accountsRetrieveMock: vi.fn(),
  accountLinksCreateMock: vi.fn(),
}));

// finance-service imports the db barrel at module load, which constructs a
// drizzle client and throws on a missing DATABASE_URL — so these mocks are
// required just to import the module under test.
vi.mock('@propertypro/db', () => ({
  assessmentLineItems: {},
  rentObligations: {},
  rentPayments: {},
  assessments: {},
  createScopedClient: vi.fn(() => ({
    selectFrom: selectFromMock,
    insert: insertMock,
    update: updateMock,
  })),
  financeStripeWebhookEvents: {},
  getUnitLedgerBalance: vi.fn(),
  listLedgerEntries: vi.fn(),
  logAuditEvent: logAuditEventMock,
  postLedgerEntry: vi.fn(),
  violationFines: {},
  violations: {},
  stripeConnectedAccounts: { id: 'id_col' },
  units: {},
  userRoles: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  and: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  gte: vi.fn(),
  inArray: vi.fn(),
  lt: vi.fn(),
  lte: vi.fn(),
  notInArray: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/services/stripe-service', () => ({
  getStripeClient: vi.fn(() => ({
    accounts: { create: accountsCreateMock, retrieve: accountsRetrieveMock },
    accountLinks: { create: accountLinksCreateMock },
  })),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: captureMessageMock,
}));

import { UnprocessableEntityError } from '@/lib/api/errors';
import {
  completeConnectOnboarding,
  getConnectStatus,
  startConnectOnboarding,
} from '../../src/lib/services/finance-service';

const SAVED = {
  id: 9,
  communityId: 42,
  stripeAccountId: 'acct_saved',
  onboardingComplete: false,
  chargesEnabled: false,
  payoutsEnabled: false,
};

function uniqueViolation(constraint: string) {
  return Object.assign(new Error('wrapped'), {
    cause: { code: '23505', constraint_name: constraint },
  });
}

describe('startConnectOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.example.test';
    accountsCreateMock.mockResolvedValue({ id: 'acct_new' });
    accountLinksCreateMock.mockResolvedValue({ url: 'https://connect.stripe.com/setup/s/abc' });
    insertMock.mockResolvedValue([]);
  });

  it('creates a full-dashboard account, saves it, and returns a hosted onboarding link', async () => {
    selectFromMock.mockResolvedValue([]);

    const result = await startConnectOnboarding(42, 'user-1', 'req-1');

    expect(accountsCreateMock).toHaveBeenCalledWith({
      controller: { stripe_dashboard: { type: 'full' } },
      metadata: { communityId: '42' },
    });
    expect(insertMock).toHaveBeenCalledWith(expect.anything(), {
      stripeAccountId: 'acct_new',
      onboardingComplete: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    });
    expect(accountLinksCreateMock).toHaveBeenCalledWith({
      account: 'acct_new',
      return_url: 'https://www.example.test/settings/payments/connected?communityId=42',
      refresh_url: 'https://www.example.test/settings/payments?communityId=42',
      type: 'account_onboarding',
    });
    expect(result).toEqual({ onboardingUrl: 'https://connect.stripe.com/setup/s/abc' });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'stripe_connected_account', resourceId: 'acct_new' }),
    );
  });

  it('resumes onboarding for a saved account instead of creating another', async () => {
    selectFromMock.mockResolvedValue([SAVED]);

    await startConnectOnboarding(42, 'user-1');

    expect(accountsCreateMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(accountLinksCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'acct_saved' }),
    );
  });

  it('uses the account the other click saved when two clicks race', async () => {
    selectFromMock.mockResolvedValueOnce([]).mockResolvedValueOnce([SAVED]);
    insertMock.mockRejectedValue(uniqueViolation('stripe_connected_accounts_community_unique'));

    await startConnectOnboarding(42, 'user-1');

    expect(accountLinksCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'acct_saved' }),
    );
    expect(captureMessageMock).toHaveBeenCalledWith(
      'stripe_connect_account_race',
      expect.objectContaining({
        extra: expect.objectContaining({ unusedStripeAccountId: 'acct_new' }),
      }),
    );
    // Only the onboarding-link audit row: this request saved no account.
    expect(logAuditEventMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'stripe_connected_account' }),
    );
  });

  it('rethrows any other insert failure', async () => {
    selectFromMock.mockResolvedValue([]);
    insertMock.mockRejectedValue(uniqueViolation('stripe_connected_accounts_stripe_account_unique'));

    await expect(startConnectOnboarding(42, 'user-1')).rejects.toThrow('wrapped');
    expect(accountLinksCreateMock).not.toHaveBeenCalled();
  });
});

describe('completeConnectOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue([]);
  });

  it('re-reads the saved account from Stripe and saves its flags', async () => {
    selectFromMock.mockResolvedValue([SAVED]);
    accountsRetrieveMock.mockResolvedValue({
      details_submitted: true,
      charges_enabled: true,
      payouts_enabled: false,
    });

    const result = await completeConnectOnboarding(42, 'user-1');

    expect(accountsRetrieveMock).toHaveBeenCalledWith('acct_saved');
    expect(updateMock).toHaveBeenCalledWith(
      expect.anything(),
      { onboardingComplete: true, chargesEnabled: true, payoutsEnabled: false },
      expect.anything(),
    );
    expect(result).toEqual({
      stripeAccountId: 'acct_saved',
      onboardingComplete: true,
      chargesEnabled: true,
      payoutsEnabled: false,
    });
  });

  it('reports an unfinished onboarding as unfinished', async () => {
    selectFromMock.mockResolvedValue([SAVED]);
    accountsRetrieveMock.mockResolvedValue({
      details_submitted: false,
      charges_enabled: false,
      payouts_enabled: false,
    });

    const result = await completeConnectOnboarding(42, 'user-1');

    expect(result.onboardingComplete).toBe(false);
  });

  it('refuses a community with no saved account', async () => {
    selectFromMock.mockResolvedValue([]);

    await expect(completeConnectOnboarding(42, 'user-1')).rejects.toBeInstanceOf(
      UnprocessableEntityError,
    );
    expect(accountsRetrieveMock).not.toHaveBeenCalled();
  });
});

describe('getConnectStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue([]);
  });

  it('reports a community with no saved account as not connected, without calling Stripe', async () => {
    selectFromMock.mockResolvedValue([]);

    await expect(getConnectStatus(42)).resolves.toEqual({
      connected: false,
      stripeAccountId: null,
      onboardingComplete: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    });
    expect(accountsRetrieveMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('syncs a saved account from Stripe and returns the fresh flags', async () => {
    selectFromMock.mockResolvedValue([SAVED]);
    accountsRetrieveMock.mockResolvedValue({
      details_submitted: true,
      charges_enabled: false,
      payouts_enabled: false,
    });

    await expect(getConnectStatus(42)).resolves.toEqual({
      connected: true,
      stripeAccountId: 'acct_saved',
      onboardingComplete: true,
      chargesEnabled: false,
      payoutsEnabled: false,
    });
    expect(accountsRetrieveMock).toHaveBeenCalledWith('acct_saved');
    expect(updateMock).toHaveBeenCalledWith(
      expect.anything(),
      { onboardingComplete: true, chargesEnabled: false, payoutsEnabled: false },
      expect.anything(),
    );
  });
});

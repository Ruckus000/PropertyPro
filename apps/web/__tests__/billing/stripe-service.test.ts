/**
 * Tests for the Stripe service — P2-34
 *
 * Source: apps/web/src/lib/services/stripe-service.ts
 *
 * Coverage:
 * - createEmbeddedCheckoutSession — happy path, Stripe API error, null client_secret, missing price env
 * - retrieveCheckoutSession — correct expand options
 * - retrieveSubscription — latest_invoice expanded
 * - retrieveInvoice — retrieves by ID
 * - createBillingPortalSession — positional args (customerId, returnUrl)
 * - getStripeClient — throws when STRIPE_SECRET_KEY not set
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist all mocks so they are available before any imports
// ---------------------------------------------------------------------------
const {
  checkoutSessionsCreateMock,
  checkoutSessionsRetrieveMock,
  subscriptionsRetrieveMock,
  invoicesRetrieveMock,
  billingPortalSessionsCreateMock,
  createUnscopedClientMock,
  eqMock,
  pendingSignupsTable,
  dbUpdateMock,
  dbSetMock,
  dbWhereMock,
  dbSelectMock,
  dbSelectFromMock,
  dbSelectWhereMock,
  dbSelectLimitMock,
} = vi.hoisted(() => {
  const checkoutSessionsCreateMock = vi.fn();
  const checkoutSessionsRetrieveMock = vi.fn();
  const subscriptionsRetrieveMock = vi.fn();
  const invoicesRetrieveMock = vi.fn();
  const billingPortalSessionsCreateMock = vi.fn();

  const dbWhereMock = vi.fn();
  const dbSetMock = vi.fn(() => ({ where: dbWhereMock }));
  const dbUpdateMock = vi.fn(() => ({ set: dbSetMock }));
  // select chain for resolveStripePrice: db.select().from().where().limit()
  const dbSelectLimitMock = vi.fn();
  const dbSelectWhereMock = vi.fn(() => ({ limit: dbSelectLimitMock }));
  const dbSelectFromMock = vi.fn(() => ({ where: dbSelectWhereMock }));
  const dbSelectMock = vi.fn(() => ({ from: dbSelectFromMock }));
  const createUnscopedClientMock = vi.fn(() => ({ update: dbUpdateMock, select: dbSelectMock }));

  const eqMock = vi.fn((...args: unknown[]) => ({ op: 'eq', args }));
  const pendingSignupsTable = { signupRequestId: 'signupRequestId_col' };

  return {
    checkoutSessionsCreateMock,
    checkoutSessionsRetrieveMock,
    subscriptionsRetrieveMock,
    invoicesRetrieveMock,
    billingPortalSessionsCreateMock,
    createUnscopedClientMock,
    eqMock,
    pendingSignupsTable,
    dbUpdateMock,
    dbSetMock,
    dbWhereMock,
    dbSelectMock,
    dbSelectFromMock,
    dbSelectWhereMock,
    dbSelectLimitMock,
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('stripe', () => ({
  default: vi.fn(() => ({
    checkout: {
      sessions: {
        create: checkoutSessionsCreateMock,
        retrieve: checkoutSessionsRetrieveMock,
      },
    },
    subscriptions: { retrieve: subscriptionsRetrieveMock },
    invoices: { retrieve: invoicesRetrieveMock },
    billingPortal: {
      sessions: { create: billingPortalSessionsCreateMock },
    },
  })),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db', () => ({
  pendingSignups: pendingSignupsTable,
  stripePrices: { stripePriceId: 'stripePriceId_col', planId: 'planId_col', communityType: 'communityType_col', billingInterval: 'billingInterval_col' },
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: eqMock,
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function importService() {
  return import('@/lib/services/stripe-service');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('stripe-service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();

    // Restore default mock chains
    dbWhereMock.mockResolvedValue(undefined);
    dbSetMock.mockReturnValue({ where: dbWhereMock });
    dbUpdateMock.mockReturnValue({ set: dbSetMock });
    createUnscopedClientMock.mockReturnValue({ update: dbUpdateMock, select: dbSelectMock });
    dbSelectLimitMock.mockResolvedValue([{ stripePriceId: 'price_test_abc' }]);
    dbSelectWhereMock.mockReturnValue({ limit: dbSelectLimitMock });
    dbSelectFromMock.mockReturnValue({ where: dbSelectWhereMock });
    dbSelectMock.mockReturnValue({ from: dbSelectFromMock });

    // Default env
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  });

  // -----------------------------------------------------------------------
  // createEmbeddedCheckoutSession
  // -----------------------------------------------------------------------
  describe('createEmbeddedCheckoutSession', () => {
    it('creates session, returns clientSecret + sessionId, and updates DB', async () => {
      checkoutSessionsCreateMock.mockResolvedValue({
        id: 'cs_test_123',
        client_secret: 'cs_secret_xyz',
      });

      const { createEmbeddedCheckoutSession } = await importService();

      const result = await createEmbeddedCheckoutSession(
        'req_001',
        'condo_718',
        'essentials',
        'sunset-condos',
        'owner@example.com',
        'https://app.example.com',
      );

      expect(result).toEqual({
        clientSecret: 'cs_secret_xyz',
        sessionId: 'cs_test_123',
      });

      // Verify Stripe session creation args
      expect(checkoutSessionsCreateMock).toHaveBeenCalledWith({
        ui_mode: 'embedded',
        mode: 'subscription',
        line_items: [{ price: 'price_test_abc', quantity: 1 }],
        customer_email: 'owner@example.com',
        return_url:
          'https://app.example.com/signup/checkout/return?session_id={CHECKOUT_SESSION_ID}&signupRequestId=req_001',
        subscription_data: {
          trial_period_days: 14,
        },
        metadata: {
          signupRequestId: 'req_001',
          communityType: 'condo_718',
          selectedPlan: 'essentials',
          candidateSlug: 'sunset-condos',
        },
      });

      // Verify DB update
      expect(createUnscopedClientMock).toHaveBeenCalled();
      expect(dbUpdateMock).toHaveBeenCalledWith(pendingSignupsTable);
      expect(dbSetMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'checkout_started' }),
      );
      expect(eqMock).toHaveBeenCalledWith(
        pendingSignupsTable.signupRequestId,
        'req_001',
      );
    });

    it('throws when Stripe API errors', async () => {
      checkoutSessionsCreateMock.mockRejectedValue(
        new Error('Stripe API down'),
      );

      const { createEmbeddedCheckoutSession } = await importService();

      await expect(
        createEmbeddedCheckoutSession(
          'req_002',
          'condo_718',
          'essentials',
          'sunset-condos',
          'owner@example.com',
          'https://app.example.com',
        ),
      ).rejects.toThrow('Stripe API down');
    });

    it('throws when client_secret is null', async () => {
      checkoutSessionsCreateMock.mockResolvedValue({
        id: 'cs_test_456',
        client_secret: null,
      });

      const { createEmbeddedCheckoutSession } = await importService();

      await expect(
        createEmbeddedCheckoutSession(
          'req_003',
          'condo_718',
          'essentials',
          'sunset-condos',
          'owner@example.com',
          'https://app.example.com',
        ),
      ).rejects.toThrow(
        'Stripe did not return a client_secret for embedded checkout',
      );
    });

    it('throws when stripe_prices row not found in DB', async () => {
      dbSelectLimitMock.mockResolvedValue([]); // No row found

      const { createEmbeddedCheckoutSession } = await importService();

      await expect(
        createEmbeddedCheckoutSession(
          'req_004',
          'condo_718',
          'essentials',
          'sunset-condos',
          'owner@example.com',
          'https://app.example.com',
        ),
      ).rejects.toThrow(
        /no stripe price configured/i,
      );
    });
  });

  // -----------------------------------------------------------------------
  // retrieveCheckoutSession
  // -----------------------------------------------------------------------
  describe('retrieveCheckoutSession', () => {
    it('retrieves with correct expand options', async () => {
      const fakeSession = { id: 'cs_test_789', status: 'complete' };
      checkoutSessionsRetrieveMock.mockResolvedValue(fakeSession);

      const { retrieveCheckoutSession } = await importService();
      const result = await retrieveCheckoutSession('cs_test_789');

      expect(result).toEqual(fakeSession);
      expect(checkoutSessionsRetrieveMock).toHaveBeenCalledWith(
        'cs_test_789',
        { expand: ['line_items', 'subscription'] },
      );
    });
  });

  // -----------------------------------------------------------------------
  // retrieveSubscription
  // -----------------------------------------------------------------------
  describe('retrieveSubscription', () => {
    it('retrieves with latest_invoice expanded', async () => {
      const fakeSub = { id: 'sub_test_001', status: 'active' };
      subscriptionsRetrieveMock.mockResolvedValue(fakeSub);

      const { retrieveSubscription } = await importService();
      const result = await retrieveSubscription('sub_test_001');

      expect(result).toEqual(fakeSub);
      expect(subscriptionsRetrieveMock).toHaveBeenCalledWith('sub_test_001', {
        expand: ['latest_invoice'],
      });
    });
  });

  // -----------------------------------------------------------------------
  // retrieveInvoice
  // -----------------------------------------------------------------------
  describe('retrieveInvoice', () => {
    it('retrieves by ID', async () => {
      const fakeInvoice = { id: 'in_test_001', amount_due: 4999 };
      invoicesRetrieveMock.mockResolvedValue(fakeInvoice);

      const { retrieveInvoice } = await importService();
      const result = await retrieveInvoice('in_test_001');

      expect(result).toEqual(fakeInvoice);
      expect(invoicesRetrieveMock).toHaveBeenCalledWith('in_test_001');
    });
  });

  // -----------------------------------------------------------------------
  // createBillingPortalSession
  // -----------------------------------------------------------------------
  describe('createBillingPortalSession', () => {
    it('creates with positional args (customerId, returnUrl)', async () => {
      const fakePortal = {
        id: 'bps_test_001',
        url: 'https://billing.stripe.com/session/test',
      };
      billingPortalSessionsCreateMock.mockResolvedValue(fakePortal);

      const { createBillingPortalSession } = await importService();
      const result = await createBillingPortalSession(
        'cus_test_abc',
        'https://app.example.com/settings/billing',
      );

      expect(result).toEqual(fakePortal);
      expect(billingPortalSessionsCreateMock).toHaveBeenCalledWith({
        customer: 'cus_test_abc',
        return_url: 'https://app.example.com/settings/billing',
      });
    });
  });

  // -----------------------------------------------------------------------
  // getStripeClient
  // -----------------------------------------------------------------------
  describe('getStripeClient', () => {
    it('throws when STRIPE_SECRET_KEY not set', async () => {
      delete process.env.STRIPE_SECRET_KEY;

      const { getStripeClient } = await importService();

      expect(() => getStripeClient()).toThrow('STRIPE_SECRET_KEY is not set');
    });
  });
});

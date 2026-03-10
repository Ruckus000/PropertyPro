import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  postLedgerEntryMock,
  getStripeClientMock,
  insertMock,
  selectFromMock,
  updateMock,
  assessmentLineItemsTable,
  assessmentsTable,
  financeStripeWebhookEventsTable,
  violationFinesTable,
  violationsTable,
  stripeConnectedAccountsTable,
  unitsTable,
  userRolesTable,
  eqMock,
  andMock,
  ascMock,
  descMock,
  gteMock,
  inArrayMock,
  lteMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  postLedgerEntryMock: vi.fn(),
  getStripeClientMock: vi.fn(),
  insertMock: vi.fn(),
  selectFromMock: vi.fn(),
  updateMock: vi.fn(),
  assessmentLineItemsTable: {
    id: Symbol('assessment_line_items.id'),
    unitId: Symbol('assessment_line_items.unit_id'),
  },
  assessmentsTable: { id: Symbol('assessments.id') },
  financeStripeWebhookEventsTable: {
    stripeEventId: Symbol('finance_stripe_webhook_events.stripe_event_id'),
    eventType: Symbol('finance_stripe_webhook_events.event_type'),
  },
  violationFinesTable: {
    id: Symbol('violation_fines.id'),
    status: Symbol('violation_fines.status'),
    amountCents: Symbol('violation_fines.amount_cents'),
    violationId: Symbol('violation_fines.violation_id'),
    issuedAt: Symbol('violation_fines.issued_at'),
  },
  violationsTable: {
    id: Symbol('violations.id'),
    unitId: Symbol('violations.unit_id'),
  },
  stripeConnectedAccountsTable: { id: Symbol('stripe_connected_accounts.id') },
  unitsTable: { id: Symbol('units.id') },
  userRolesTable: { id: Symbol('user_roles.id') },
  eqMock: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  andMock: vi.fn((...args: unknown[]) => ({ and: args })),
  ascMock: vi.fn((value: unknown) => value),
  descMock: vi.fn((value: unknown) => value),
  gteMock: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  inArrayMock: vi.fn((column: unknown, values: unknown[]) => ({ column, values })),
  lteMock: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}));

vi.mock('@propertypro/db', () => ({
  assessmentLineItems: assessmentLineItemsTable,
  assessments: assessmentsTable,
  createScopedClient: createScopedClientMock,
  financeStripeWebhookEvents: financeStripeWebhookEventsTable,
  getUnitLedgerBalance: vi.fn(),
  listLedgerEntries: vi.fn(),
  logAuditEvent: vi.fn(),
  postLedgerEntry: postLedgerEntryMock,
  violationFines: violationFinesTable,
  violations: violationsTable,
  stripeConnectedAccounts: stripeConnectedAccountsTable,
  units: unitsTable,
  userRoles: userRolesTable,
}));

vi.mock('@propertypro/db/filters', () => ({
  and: andMock,
  asc: ascMock,
  desc: descMock,
  eq: eqMock,
  gte: gteMock,
  inArray: inArrayMock,
  lte: lteMock,
}));

vi.mock('@/lib/services/stripe-service', () => ({
  getStripeClient: getStripeClientMock,
}));

import { processFinanceStripeEvent } from '../../src/lib/services/finance-service';

interface MockScopedClient {
  insert: typeof insertMock;
  selectFrom: typeof selectFromMock;
  update: typeof updateMock;
}

function makeScopedClient(): MockScopedClient {
  return {
    insert: insertMock,
    selectFrom: selectFromMock,
    update: updateMock,
  };
}

function makeEvent(type: string, id: string, payload: Record<string, unknown>): Stripe.Event {
  return {
    id,
    type,
    created: 1,
    object: 'event',
    data: { object: payload as Stripe.Event.Data.Object },
  } as unknown as Stripe.Event;
}

describe('processFinanceStripeEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createScopedClientMock.mockImplementation(() => makeScopedClient());
    insertMock.mockResolvedValue([{ id: 1 }]);
    selectFromMock.mockImplementation((table: unknown) => {
      if (table === assessmentLineItemsTable) {
        return Promise.resolve([
          {
            id: 44,
            assessmentId: 7,
            communityId: 11,
            unitId: 88,
            amountCents: 25000,
            dueDate: '2026-01-15',
            status: 'pending',
            paidAt: null,
            paymentIntentId: null,
            lateFeeCents: 0,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]);
      }
      return Promise.resolve([]);
    });
    updateMock.mockResolvedValue([{ id: 44 }]);
    postLedgerEntryMock.mockResolvedValue({ id: 991 });
  });

  it('posts payment ledger entries and marks line items paid for payment_intent.succeeded', async () => {
    const paymentIntentRetrieve = vi.fn().mockResolvedValue({
      id: 'pi_success_1',
      metadata: {
        communityId: '11',
        lineItemId: '44',
        unitId: '88',
        userId: 'user-11',
      },
      amount_received: 25000,
      amount: 25000,
      latest_charge: 'ch_success_1',
    });
    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_success_1',
      amount: 25000,
      amount_refunded: 0,
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: paymentIntentRetrieve },
      charges: { retrieve: chargesRetrieve },
    });

    await processFinanceStripeEvent(
      makeEvent('payment_intent.succeeded', 'evt_fin_1', { id: 'pi_success_1' }),
    );

    expect(insertMock).toHaveBeenCalledWith(
      financeStripeWebhookEventsTable,
      expect.objectContaining({
        stripeEventId: 'evt_fin_1',
        eventType: 'payment_intent.succeeded',
      }),
    );
    expect(updateMock).toHaveBeenCalledWith(
      assessmentLineItemsTable,
      expect.objectContaining({
        status: 'paid',
        paymentIntentId: 'pi_success_1',
      }),
      expect.anything(),
    );
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entryType: 'payment',
        amountCents: -25000,
        sourceType: 'payment',
        sourceId: 'pi_success_1',
        unitId: 88,
      }),
    );
  });

  it('is idempotent for duplicate Stripe events (unique-constraint insert)', async () => {
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
    insertMock.mockRejectedValueOnce(uniqueViolation);

    const paymentIntentRetrieve = vi.fn().mockResolvedValue({
      id: 'pi_duplicate',
      metadata: {
        communityId: '11',
        lineItemId: '44',
        unitId: '88',
        userId: 'user-11',
      },
      amount_received: 25000,
      amount: 25000,
      latest_charge: 'ch_duplicate',
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: paymentIntentRetrieve },
      charges: { retrieve: vi.fn() },
    });

    await processFinanceStripeEvent(
      makeEvent('payment_intent.succeeded', 'evt_fin_dup', { id: 'pi_duplicate' }),
    );

    expect(selectFromMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(postLedgerEntryMock).not.toHaveBeenCalled();
  });

  it('ignores delayed payment_intent.succeeded events when latest charge is fully refunded', async () => {
    const paymentIntentRetrieve = vi.fn().mockResolvedValue({
      id: 'pi_refunded',
      metadata: {
        communityId: '11',
        lineItemId: '44',
        unitId: '88',
        userId: 'user-11',
      },
      amount_received: 25000,
      amount: 25000,
      latest_charge: 'ch_refunded',
    });
    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_refunded',
      amount: 25000,
      amount_refunded: 25000,
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: paymentIntentRetrieve },
      charges: { retrieve: chargesRetrieve },
    });

    await processFinanceStripeEvent(
      makeEvent('payment_intent.succeeded', 'evt_fin_reorder', { id: 'pi_refunded' }),
    );

    expect(selectFromMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(postLedgerEntryMock).not.toHaveBeenCalled();
  });

  it('processes charge.refunded by restoring line item to pending and posting refund entry', async () => {
    const paymentIntentRetrieve = vi.fn().mockResolvedValue({
      id: 'pi_refund_1',
      metadata: {
        communityId: '11',
        lineItemId: '44',
        unitId: '88',
        userId: 'user-11',
      },
    });
    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_refund_1',
      amount: 25000,
      amount_refunded: 25000,
      payment_intent: 'pi_refund_1',
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: paymentIntentRetrieve },
      charges: { retrieve: chargesRetrieve },
    });

    await processFinanceStripeEvent(
      makeEvent('charge.refunded', 'evt_fin_refund', { id: 'ch_refund_1' }),
    );

    expect(updateMock).toHaveBeenCalledWith(
      assessmentLineItemsTable,
      expect.objectContaining({ status: 'pending', paidAt: null }),
      expect.anything(),
    );
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entryType: 'refund',
        amountCents: 25000,
        sourceType: 'payment',
        sourceId: 'ch_refund_1',
      }),
    );
  });

  it('processes charge.dispute.created by posting a fee ledger entry', async () => {
    const paymentIntentRetrieve = vi.fn().mockResolvedValue({
      id: 'pi_dispute_1',
      metadata: {
        communityId: '11',
        unitId: '88',
        userId: 'user-11',
      },
    });

    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_dispute_1',
      payment_intent: 'pi_dispute_1',
    });

    const disputesRetrieve = vi.fn().mockResolvedValue({
      id: 'dp_1',
      charge: 'ch_dispute_1',
      amount: 1200,
      reason: 'fraudulent',
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: paymentIntentRetrieve },
      charges: { retrieve: chargesRetrieve },
      disputes: { retrieve: disputesRetrieve },
    });

    await processFinanceStripeEvent(
      makeEvent('charge.dispute.created', 'evt_fin_dispute', { id: 'dp_1' }),
    );

    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entryType: 'fee',
        amountCents: 1200,
        sourceType: 'payment',
        sourceId: 'dp_1',
      }),
    );
  });
});

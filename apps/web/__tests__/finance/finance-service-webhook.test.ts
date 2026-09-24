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
  rentObligationsTable,
  rentPaymentsTable,
  assessmentsTable,
  financeStripeWebhookEventsTable,
  violationFinesTable,
  violationsTable,
  stripeConnectedAccountsTable,
  unitsTable,
  userRolesTable,
  usersTable,
  communitiesTable,
  sendEmailMock,
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
  rentObligationsTable: {
    id: Symbol('rent_obligations.id'),
    unitId: Symbol('rent_obligations.unit_id'),
    status: Symbol('rent_obligations.status'),
  },
  rentPaymentsTable: { id: Symbol('rent_payments.id') },
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
  usersTable: { id: Symbol('users.id'), email: Symbol('users.email'), fullName: Symbol('users.full_name') },
  communitiesTable: { name: Symbol('communities.name') },
  sendEmailMock: vi.fn(),
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
  rentObligations: rentObligationsTable,
  rentPayments: rentPaymentsTable,
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
  users: usersTable,
  communities: communitiesTable,
}));

vi.mock('@propertypro/email', () => ({
  AssessmentPaymentReceivedEmail: (props: unknown) => ({ type: 'AssessmentPaymentReceivedEmail', props }),
  sendEmail: sendEmailMock,
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

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

import { describePaymentForReceipt, processFinanceStripeEvent } from '../../src/lib/services/finance-service';

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

function makeEvent(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  // Two `charge.refunded` call sites pass a fourth argument that reads as
  // `previous_attributes`. This helper has never placed it on the event, so
  // those cases exercise the "previous_attributes missing" branch. Declared
  // (and still ignored) so making the file type-check changes no behaviour.
  _previousAttributes?: Record<string, unknown>,
): Stripe.Event {
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

  it('reads the latest charge from the connected account for a Connect payment_intent.succeeded', async () => {
    // Direct charges (F-15) live on the association's connected account, so
    // EVERY re-read the webhook performs must carry `{ stripeAccount }` — a
    // platform-account `charges.retrieve` raises `No such charge`, the handler
    // throws before the line item is marked paid, and Stripe retries forever
    // while the resident's dues never record.
    const paymentIntentRetrieve = vi.fn().mockResolvedValue({
      id: 'pi_connect_1',
      metadata: {
        communityId: '11',
        lineItemId: '44',
        unitId: '88',
        userId: 'user-11',
      },
      amount_received: 25000,
      amount: 25000,
      latest_charge: 'ch_connect_1',
    });
    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_connect_1',
      amount: 25000,
      amount_refunded: 0,
      balance_transaction: { fee: 755 },
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: paymentIntentRetrieve },
      charges: { retrieve: chargesRetrieve },
    });

    const connectEvent = {
      ...makeEvent('payment_intent.succeeded', 'evt_fin_connect_1', { id: 'pi_connect_1' }),
      account: 'acct_123',
    } as unknown as Stripe.Event;

    await processFinanceStripeEvent(connectEvent);

    expect(chargesRetrieve).toHaveBeenCalledWith(
      'ch_connect_1',
      { expand: ['balance_transaction'] },
      { stripeAccount: 'acct_123' },
    );
    // Control: the sibling re-read already carried the account, and must keep
    // doing so. If this assertion reddens too, the whole handler is broken
    // rather than just the charge lookup.
    expect(paymentIntentRetrieve).toHaveBeenCalledWith('pi_connect_1', undefined, {
      stripeAccount: 'acct_123',
    });
    // Control: the payment still records, and the real Stripe fee off the
    // expanded balance_transaction reaches the ledger entry.
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entryType: 'payment',
        amountCents: -25000,
        sourceId: 'pi_connect_1',
        metadata: expect.objectContaining({ stripeFeeActualCents: 755 }),
      }),
    );
  });

  it('supports payable contract metadata for payment_intent.succeeded', async () => {
    const paymentIntentRetrieve = vi.fn().mockResolvedValue({
      id: 'pi_payable_contract_1',
      metadata: {
        communityId: '11',
        payableType: 'assessment_line_item',
        payableId: '44',
        unitId: '88',
        userId: 'user-11',
      },
      amount_received: 25000,
      amount: 25000,
      latest_charge: 'ch_payable_contract_1',
    });
    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_payable_contract_1',
      amount: 25000,
      amount_refunded: 0,
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: paymentIntentRetrieve },
      charges: { retrieve: chargesRetrieve },
    });

    await processFinanceStripeEvent(
      makeEvent('payment_intent.succeeded', 'evt_fin_payable_contract_1', { id: 'pi_payable_contract_1' }),
    );

    expect(updateMock).toHaveBeenCalledWith(
      assessmentLineItemsTable,
      expect.objectContaining({
        status: 'paid',
        paymentIntentId: 'pi_payable_contract_1',
      }),
      expect.anything(),
    );
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({
          payableType: 'assessment_line_item',
          payableId: 44,
          lineItemId: 44,
        }),
      }),
    );
  });

  it('settles rent obligations and records rent payment rows', async () => {
    const paymentIntentRetrieve = vi.fn().mockResolvedValue({
      id: 'pi_rent_success_1',
      metadata: {
        communityId: '11',
        payableType: 'rent_obligation',
        payableId: '501',
        unitId: '88',
        userId: 'user-11',
      },
      amount_received: 160000,
      amount: 160000,
      latest_charge: 'ch_rent_success_1',
    });
    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_rent_success_1',
      amount: 160000,
      amount_refunded: 0,
    });
    selectFromMock.mockImplementationOnce((table: unknown) => {
      if (table === rentObligationsTable) {
        return Promise.resolve([{
          id: 501,
          leaseId: 42,
          communityId: 11,
          unitId: 88,
          dueDate: '2026-01-01',
          amountCents: 160000,
          status: 'pending',
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        }]);
      }
      return Promise.resolve([]);
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: paymentIntentRetrieve },
      charges: { retrieve: chargesRetrieve },
    });

    await processFinanceStripeEvent(
      makeEvent('payment_intent.succeeded', 'evt_fin_rent_1', { id: 'pi_rent_success_1' }),
    );

    expect(updateMock).toHaveBeenCalledWith(
      rentObligationsTable,
      expect.objectContaining({ status: 'paid' }),
      expect.anything(),
    );
    expect(insertMock).toHaveBeenCalledWith(
      rentPaymentsTable,
      expect.objectContaining({
        leaseId: 42,
        obligationId: 501,
        unitId: 88,
        residentId: 'user-11',
        externalReference: 'pi_rent_success_1',
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
      makeEvent('charge.refunded', 'evt_fin_refund', { id: 'ch_refund_1', amount: 25000, amount_refunded: 25000 }),
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
    expect(insertMock).not.toHaveBeenCalledWith(
      rentPaymentsTable,
      expect.anything(),
    );
  });

  it('supports payable contract metadata for charge.refunded', async () => {
    const paymentIntentRetrieve = vi.fn().mockResolvedValue({
      id: 'pi_refund_payable_1',
      metadata: {
        communityId: '11',
        payableType: 'assessment_line_item',
        payableId: '44',
        unitId: '88',
        userId: 'user-11',
      },
    });
    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_refund_payable_1',
      amount: 25000,
      amount_refunded: 25000,
      payment_intent: 'pi_refund_payable_1',
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: paymentIntentRetrieve },
      charges: { retrieve: chargesRetrieve },
    });

    await processFinanceStripeEvent(
      makeEvent('charge.refunded', 'evt_fin_refund_payable', { id: 'ch_refund_payable_1', amount: 25000, amount_refunded: 25000 }, { amount_refunded: 0 }),
    );

    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entryType: 'refund',
        metadata: expect.objectContaining({
          payableType: 'assessment_line_item',
          payableId: 44,
          lineItemId: 44,
        }),
      }),
    );
  });

  it('reverts rent obligation status on full rent refund', async () => {
    const paymentIntentRetrieve = vi.fn().mockResolvedValue({
      id: 'pi_rent_refund_1',
      metadata: {
        communityId: '11',
        payableType: 'rent_obligation',
        payableId: '501',
        unitId: '88',
        userId: 'user-11',
      },
    });
    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_rent_refund_1',
      amount: 160000,
      amount_refunded: 160000,
      payment_intent: 'pi_rent_refund_1',
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: paymentIntentRetrieve },
      charges: { retrieve: chargesRetrieve },
    });
    selectFromMock.mockImplementationOnce((table: unknown) => {
      if (table === rentObligationsTable) {
        return Promise.resolve([{
          id: 501,
          leaseId: 42,
          communityId: 11,
          unitId: 88,
          dueDate: '2026-01-01',
          amountCents: 160000,
          status: 'paid',
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        }]);
      }
      return Promise.resolve([]);
    });

    await processFinanceStripeEvent(
      makeEvent('charge.refunded', 'evt_fin_rent_refund', { id: 'ch_rent_refund_1', amount: 160000, amount_refunded: 160000 }, { amount_refunded: 0 }),
    );

    expect(updateMock).toHaveBeenCalledWith(
      rentObligationsTable,
      expect.objectContaining({ status: 'pending' }),
      expect.anything(),
    );
    expect(insertMock).toHaveBeenCalledWith(
      rentPaymentsTable,
      expect.objectContaining({
        leaseId: 42,
        obligationId: 501,
        unitId: 88,
        residentId: 'user-11',
        amountCents: -160000,
        externalReference: 'ch_rent_refund_1',
        notes: expect.stringContaining('evt_fin_rent_refund'),
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

describe('payment receipt email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createScopedClientMock.mockImplementation(() => makeScopedClient());
    insertMock.mockResolvedValue([{ id: 1 }]);
    updateMock.mockResolvedValue([{ id: 44 }]);
    postLedgerEntryMock.mockResolvedValue({ id: 991 });
    sendEmailMock.mockResolvedValue({ id: 'msg-1' });
    selectFromMock.mockImplementation((table: unknown) => {
      if (table === assessmentLineItemsTable) {
        return Promise.resolve([
          { id: 44, assessmentId: null, communityId: 11, unitId: 88, amountCents: 25000, dueDate: '2026-01-15', status: 'pending', paidAt: null, paymentIntentId: null, lateFeeCents: 0 },
        ]);
      }
      if (table === usersTable) return Promise.resolve([{ email: 'owner@example.com', fullName: 'Marisol Reyes' }]);
      if (table === communitiesTable) return Promise.resolve([{ name: 'Sunset Palms HOA' }]);
      return Promise.resolve([]);
    });
  });

  async function receiptPropsFor(charge: Record<string, unknown>, metadata: Record<string, string> = {}) {
    getStripeClientMock.mockReturnValue({
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'pi_receipt_1',
          metadata: { communityId: '11', lineItemId: '44', unitId: '88', userId: 'user-11', ...metadata },
          amount_received: 25000,
          amount: 25000,
          latest_charge: 'ch_receipt_1',
        }),
      },
      charges: { retrieve: vi.fn().mockResolvedValue({ id: 'ch_receipt_1', amount: 25000, amount_refunded: 0, ...charge }) },
    });

    await processFinanceStripeEvent(makeEvent('payment_intent.succeeded', 'evt_receipt_1', { id: 'pi_receipt_1' }));
    // The confirmation email is fire-and-forget; let it settle.
    await vi.waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(1));

    const call = sendEmailMock.mock.calls[0]![0] as { category: string; react: { props: Record<string, unknown> } };
    return { category: call.category, props: call.react.props };
  }

  it('names the card and Stripe receipt number the owner will see on their statement', async () => {
    const { category, props } = await receiptPropsFor({
      payment_method_details: { type: 'card', card: { brand: 'visa', last4: '4242' } },
      receipt_number: '1234-5678',
    });

    expect(category).toBe('transactional');
    expect(props['paymentMethod']).toBe('Visa ending in 4242');
    expect(props['confirmationNumber']).toBe('1234-5678');
  });

  it('falls back to the bank account and to the PaymentIntent id the ledger records', async () => {
    const { props } = await receiptPropsFor({
      payment_method_details: { type: 'us_bank_account', us_bank_account: { last4: '8871' } },
      receipt_number: null,
    });

    expect(props['paymentMethod']).toBe('Bank account ending in 8871');
    expect(props['confirmationNumber']).toBe('pi_receipt_1');
  });

  it('says only the method type when the charge carries no details', async () => {
    const { props } = await receiptPropsFor({}, { paymentMethod: 'card' });

    expect(props['paymentMethod']).toBe('Card');
  });
});

/**
 * Direct unit coverage for the receipt describer. The webhook tests above
 * exercise it end-to-end for the three common shapes; these pin the branches
 * no live event in the suite reaches, so a change to the fallback ladder
 * cannot pass unnoticed.
 */
describe('describePaymentForReceipt', () => {
  const INTENT_ID = 'pi_direct_1';

  it('labels a bank payment from intent metadata when the charge carries no details', () => {
    expect(describePaymentForReceipt(null, INTENT_ID, 'us_bank_account')).toEqual({
      paymentMethod: 'Bank account',
      confirmationNumber: INTENT_ID,
    });
  });

  it('says "Card" for a brand Stripe has not taught us to spell', () => {
    const details = { payment_method_details: { type: 'card', card: { brand: 'newbrand', last4: '1881' } }, receipt_number: null };
    expect(describePaymentForReceipt(details as never, INTENT_ID, null).paymentMethod).toBe('Card ending in 1881');
  });

  it('states no method at all rather than guessing one', () => {
    expect(describePaymentForReceipt(null, INTENT_ID, null)).toEqual({
      paymentMethod: undefined,
      confirmationNumber: INTENT_ID,
    });
  });

  it('treats a blank receipt number as absent and quotes the PaymentIntent id the ledger records', () => {
    const details = { payment_method_details: null, receipt_number: '   ' };
    expect(describePaymentForReceipt(details as never, INTENT_ID, 'card')).toEqual({
      paymentMethod: 'Card',
      confirmationNumber: INTENT_ID,
    });
  });
});

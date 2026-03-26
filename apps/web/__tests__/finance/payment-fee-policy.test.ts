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
  leasesTable,
  communitiesTable,
  financeStripeWebhookEventsTable,
  stripeConnectedAccountsTable,
  unitsTable,
  userRolesTable,
  eqMock,
  andMock,
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
    status: Symbol('assessment_line_items.status'),
  },
  rentObligationsTable: {
    id: Symbol('rent_obligations.id'),
    unitId: Symbol('rent_obligations.unit_id'),
    status: Symbol('rent_obligations.status'),
    dueDate: Symbol('rent_obligations.due_date'),
    updatedAt: Symbol('rent_obligations.updated_at'),
  },
  rentPaymentsTable: {
    id: Symbol('rent_payments.id'),
  },
  leasesTable: { id: Symbol('leases.id') },
  communitiesTable: { id: Symbol('communities.id') },
  financeStripeWebhookEventsTable: {
    stripeEventId: Symbol('finance_stripe_webhook_events.stripe_event_id'),
    eventType: Symbol('finance_stripe_webhook_events.event_type'),
  },
  stripeConnectedAccountsTable: { id: Symbol('stripe_connected_accounts.id') },
  unitsTable: { id: Symbol('units.id') },
  userRolesTable: { id: Symbol('user_roles.id') },
  eqMock: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  andMock: vi.fn((...args: unknown[]) => ({ and: args })),
}));

vi.mock('@propertypro/db', () => ({
  assessmentLineItems: assessmentLineItemsTable,
  rentObligations: rentObligationsTable,
  rentPayments: rentPaymentsTable,
  leases: leasesTable,
  assessments: { id: Symbol('assessments.id') },
  communities: communitiesTable,
  createScopedClient: createScopedClientMock,
  financeStripeWebhookEvents: financeStripeWebhookEventsTable,
  getUnitLedgerBalance: vi.fn(),
  listLedgerEntries: vi.fn(),
  logAuditEvent: vi.fn(),
  postLedgerEntry: postLedgerEntryMock,
  stripeConnectedAccounts: stripeConnectedAccountsTable,
  units: unitsTable,
  userRoles: userRolesTable,
}));

vi.mock('@propertypro/db/filters', () => ({
  and: andMock,
  asc: vi.fn((v: unknown) => v),
  desc: vi.fn((v: unknown) => v),
  eq: eqMock,
  gte: vi.fn((c: unknown, v: unknown) => ({ c, v })),
  inArray: vi.fn((c: unknown, v: unknown[]) => ({ c, v })),
  lte: vi.fn((c: unknown, v: unknown) => ({ c, v })),
}));

vi.mock('@/lib/services/stripe-service', () => ({
  getStripeClient: getStripeClientMock,
}));

vi.mock('@/lib/services/violations-service', () => ({
  markMatchingViolationFinePaid: vi.fn(),
}));

vi.mock('@/lib/services/calendar-sync-service', () => ({
  signPayload: vi.fn(),
  verifySignature: vi.fn(),
}));

vi.mock('@/lib/finance/common', () => ({
  parseDateOnly: vi.fn((v: string) => v),
}));

vi.mock('@/lib/units/actor-units', () => ({
  listActorUnitIds: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/utils/finance-pdf', () => ({
  generateFinanceStatementPdf: vi.fn(),
}));

vi.mock('@/lib/services/csv-export', () => ({
  generateCSV: vi.fn(),
}));

import {
  getCommunityFeePolicy,
  createPaymentIntentForLineItem,
  updatePaymentIntentFee,
  processFinanceStripeEvent,
} from '../../src/lib/services/finance-service';

interface MockScopedClient {
  insert: typeof insertMock;
  selectFrom: typeof selectFromMock;
  update: typeof updateMock;
}

function makeScopedClient(): MockScopedClient {
  return { insert: insertMock, selectFrom: selectFromMock, update: updateMock };
}

function makeEvent(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  previousAttributes?: Record<string, unknown>,
): Stripe.Event {
  return {
    id,
    type,
    created: 1,
    object: 'event',
    data: {
      object: payload as Stripe.Event.Data.Object,
      ...(previousAttributes ? { previous_attributes: previousAttributes } : {}),
    },
  } as unknown as Stripe.Event;
}

describe('getCommunityFeePolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createScopedClientMock.mockImplementation(() => makeScopedClient());
  });

  it('returns owner_pays when set in community settings', async () => {
    selectFromMock.mockResolvedValue([{ communitySettings: { paymentFeePolicy: 'owner_pays' } }]);
    const policy = await getCommunityFeePolicy(11);
    expect(policy).toBe('owner_pays');
  });

  it('returns association_absorbs when set in community settings', async () => {
    selectFromMock.mockResolvedValue([{ communitySettings: { paymentFeePolicy: 'association_absorbs' } }]);
    const policy = await getCommunityFeePolicy(11);
    expect(policy).toBe('association_absorbs');
  });

  it('defaults to association_absorbs when key is missing', async () => {
    selectFromMock.mockResolvedValue([{ communitySettings: {} }]);
    const policy = await getCommunityFeePolicy(11);
    expect(policy).toBe('association_absorbs');
  });

  it('defaults to association_absorbs when communitySettings is null', async () => {
    selectFromMock.mockResolvedValue([{ communitySettings: null }]);
    const policy = await getCommunityFeePolicy(11);
    expect(policy).toBe('association_absorbs');
  });
});

describe('updatePaymentIntentFee', () => {
  let paymentIntentsRetrieve: ReturnType<typeof vi.fn>;
  let paymentIntentsUpdate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    createScopedClientMock.mockImplementation(() => makeScopedClient());

    paymentIntentsRetrieve = vi.fn();
    paymentIntentsUpdate = vi.fn().mockResolvedValue({ id: 'pi_test' });
    getStripeClientMock.mockReturnValue({
      paymentIntents: {
        retrieve: paymentIntentsRetrieve,
        update: paymentIntentsUpdate,
      },
    });
  });

  it('sets application_fee_amount with convenience fee for owner_pays + card', async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_test',
      status: 'requires_payment_method',
      metadata: {
        communityId: '11',
        baseAmountCents: '50000',
      },
    });
    selectFromMock.mockResolvedValue([{ communitySettings: { paymentFeePolicy: 'owner_pays' } }]);

    const result = await updatePaymentIntentFee(11, 'pi_test', 'card', 'user-1');

    expect(result.convenienceFeeCents).toBe(1525);
    expect(result.totalChargeCents).toBe(50000 + 1525);
    expect(paymentIntentsUpdate).toHaveBeenCalledWith('pi_test', expect.objectContaining({
      amount: 50000 + 1525,
      application_fee_amount: 1525,
    }));
  });

  it('sets application_fee_amount with Stripe fee estimate for association_absorbs', async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_test',
      status: 'requires_payment_method',
      metadata: {
        communityId: '11',
        baseAmountCents: '50000',
      },
    });
    selectFromMock.mockResolvedValue([{ communitySettings: { paymentFeePolicy: 'association_absorbs' } }]);

    const result = await updatePaymentIntentFee(11, 'pi_test', 'card', 'user-1');

    expect(result.convenienceFeeCents).toBe(0);
    expect(result.totalChargeCents).toBe(50000);
    expect(paymentIntentsUpdate).toHaveBeenCalledWith('pi_test', expect.objectContaining({
      amount: 50000,
      application_fee_amount: 1480, // Stripe fee estimate for $500 card
    }));
  });

  it('rejects PI with mismatched communityId', async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_test',
      status: 'requires_payment_method',
      metadata: { communityId: '99', baseAmountCents: '50000' },
    });

    await expect(
      updatePaymentIntentFee(11, 'pi_test', 'card', 'user-1'),
    ).rejects.toThrow('Payment intent does not belong to this community');
  });

  it('rejects already-confirmed PI', async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_test',
      status: 'succeeded',
      metadata: { communityId: '11', baseAmountCents: '50000' },
    });

    await expect(
      updatePaymentIntentFee(11, 'pi_test', 'card', 'user-1'),
    ).rejects.toThrow('Payment intent cannot be updated');
  });
});

describe('processFinanceStripeEvent — convenience fee handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createScopedClientMock.mockImplementation(() => makeScopedClient());
    insertMock.mockResolvedValue([{ id: 1 }]);
    updateMock.mockResolvedValue([{ id: 44 }]);
    postLedgerEntryMock.mockResolvedValue({ id: 991 });
  });

  it('posts fee ledger entry when convenienceFeeCents > 0 in metadata', async () => {
    const paymentIntentRetrieve = vi.fn().mockResolvedValue({
      id: 'pi_fee_1',
      metadata: {
        communityId: '11',
        lineItemId: '44',
        unitId: '88',
        userId: 'user-11',
        convenienceFeeCents: '1525',
        paymentMethod: 'card',
      },
      amount_received: 51525,
      amount: 51525,
      latest_charge: 'ch_fee_1',
    });
    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_fee_1',
      amount: 51525,
      amount_refunded: 0,
      balance_transaction: {
        fee: 1524,
      },
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: paymentIntentRetrieve },
      charges: { retrieve: chargesRetrieve },
    });

    selectFromMock.mockResolvedValue([{
      id: 44,
      assessmentId: 7,
      communityId: 11,
      unitId: 88,
      amountCents: 50000,
      dueDate: '2026-01-15',
      status: 'pending',
      paidAt: null,
      paymentIntentId: null,
      lateFeeCents: 0,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    }]);

    await processFinanceStripeEvent(
      makeEvent('payment_intent.succeeded', 'evt_fee_1', { id: 'pi_fee_1' }),
    );

    // Should post 2 ledger entries: payment + fee
    expect(postLedgerEntryMock).toHaveBeenCalledTimes(2);

    // First call: payment entry
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entryType: 'payment',
        amountCents: -51525,
        metadata: expect.objectContaining({
          stripeFeeActualCents: 1524,
          paymentMethod: 'card',
        }),
      }),
    );

    // Second call: convenience fee entry
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entryType: 'fee',
        amountCents: 1525,
        description: 'Convenience fee for online payment',
        metadata: expect.objectContaining({
          convenienceFeeCents: 1525,
          paymentMethod: 'card',
        }),
      }),
    );
  });

  it('does NOT post fee ledger entry when convenienceFeeCents is 0', async () => {
    const paymentIntentRetrieve = vi.fn().mockResolvedValue({
      id: 'pi_nofee_1',
      metadata: {
        communityId: '11',
        lineItemId: '44',
        unitId: '88',
        userId: 'user-11',
        convenienceFeeCents: '0',
        paymentMethod: 'us_bank_account',
      },
      amount_received: 50000,
      amount: 50000,
      latest_charge: 'ch_nofee_1',
    });
    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_nofee_1',
      amount: 50000,
      amount_refunded: 0,
      balance_transaction: { fee: 400 },
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: paymentIntentRetrieve },
      charges: { retrieve: chargesRetrieve },
    });

    selectFromMock.mockResolvedValue([{
      id: 44, assessmentId: 7, communityId: 11, unitId: 88,
      amountCents: 50000, dueDate: '2026-01-15', status: 'pending',
      paidAt: null, paymentIntentId: null, lateFeeCents: 0,
      createdAt: new Date(), updatedAt: new Date(),
    }]);

    await processFinanceStripeEvent(
      makeEvent('payment_intent.succeeded', 'evt_nofee_1', { id: 'pi_nofee_1' }),
    );

    // Only 1 ledger entry: payment (no fee)
    expect(postLedgerEntryMock).toHaveBeenCalledTimes(1);
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entryType: 'payment' }),
    );
  });

  it('does not include non-refundable language in refund description', async () => {
    const paymentIntentRetrieve = vi.fn().mockResolvedValue({
      id: 'pi_refund_1',
      metadata: {
        communityId: '11',
        lineItemId: '44',
        unitId: '88',
        userId: 'user-11',
        convenienceFeeCents: '1525',
      },
    });
    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_refund_1',
      amount: 51525,
      amount_refunded: 51525,
      payment_intent: {
        id: 'pi_refund_1',
        metadata: {
          communityId: '11',
          lineItemId: '44',
          unitId: '88',
          userId: 'user-11',
          convenienceFeeCents: '1525',
        },
      },
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: paymentIntentRetrieve },
      charges: { retrieve: chargesRetrieve },
    });

    selectFromMock.mockResolvedValue([{
      id: 44, assessmentId: 7, communityId: 11, unitId: 88,
      amountCents: 50000, dueDate: '2026-01-15', status: 'paid',
      paidAt: new Date(), paymentIntentId: 'pi_refund_1', lateFeeCents: 0,
      createdAt: new Date(), updatedAt: new Date(),
    }]);

    await processFinanceStripeEvent(
      makeEvent('charge.refunded', 'evt_refund_1', {
        id: 'ch_refund_1',
        amount: 51525,
        amount_refunded: 51525,
      }, { amount_refunded: 0 }),
    );

    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entryType: 'refund',
        description: expect.not.stringContaining('non-refundable'),
      }),
    );
  });

  it('reverses convenience fee ledger entry on full refund', async () => {
    const paymentIntentRetrieve = vi.fn().mockResolvedValue({
      id: 'pi_refund_2',
      metadata: {
        communityId: '11',
        lineItemId: '44',
        unitId: '88',
        userId: 'user-11',
        convenienceFeeCents: '1525',
      },
    });
    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_refund_2',
      amount: 51525,
      amount_refunded: 51525,
      payment_intent: {
        id: 'pi_refund_2',
        metadata: {
          communityId: '11',
          lineItemId: '44',
          unitId: '88',
          userId: 'user-11',
          convenienceFeeCents: '1525',
        },
      },
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: paymentIntentRetrieve },
      charges: { retrieve: chargesRetrieve },
    });

    selectFromMock.mockResolvedValue([{
      id: 44, assessmentId: 7, communityId: 11, unitId: 88,
      amountCents: 50000, dueDate: '2026-01-15', status: 'paid',
      paidAt: new Date(), paymentIntentId: 'pi_refund_2', lateFeeCents: 0,
      createdAt: new Date(), updatedAt: new Date(),
    }]);

    await processFinanceStripeEvent(
      makeEvent('charge.refunded', 'evt_refund_2', {
        id: 'ch_refund_2',
        amount: 51525,
        amount_refunded: 51525,
      }, { amount_refunded: 0 }),
    );

    // Should post 2 ledger entries: refund + fee reversal adjustment
    expect(postLedgerEntryMock).toHaveBeenCalledTimes(2);

    // First call: refund entry
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entryType: 'refund',
        amountCents: 51525,
      }),
    );

    // Second call: fee reversal adjustment
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entryType: 'adjustment',
        amountCents: -1525,
        description: expect.stringContaining('Convenience fee reversal'),
        metadata: expect.objectContaining({
          reason: 'full_refund_fee_reversal',
          convenienceFeeCents: 1525,
        }),
      }),
    );
  });

  it('does NOT reverse convenience fee on partial refund', async () => {
    const paymentIntentRetrieve = vi.fn().mockResolvedValue({
      id: 'pi_partial_1',
      metadata: {
        communityId: '11',
        lineItemId: '44',
        unitId: '88',
        userId: 'user-11',
        convenienceFeeCents: '1525',
      },
    });
    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_partial_1',
      amount: 51525,
      amount_refunded: 25000, // partial refund
      payment_intent: {
        id: 'pi_partial_1',
        metadata: {
          communityId: '11',
          lineItemId: '44',
          unitId: '88',
          userId: 'user-11',
          convenienceFeeCents: '1525',
        },
      },
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: paymentIntentRetrieve },
      charges: { retrieve: chargesRetrieve },
    });

    selectFromMock.mockResolvedValue([{
      id: 44, assessmentId: 7, communityId: 11, unitId: 88,
      amountCents: 50000, dueDate: '2026-01-15', status: 'paid',
      paidAt: new Date(), paymentIntentId: 'pi_partial_1', lateFeeCents: 0,
      createdAt: new Date(), updatedAt: new Date(),
    }]);

    await processFinanceStripeEvent(
      makeEvent('charge.refunded', 'evt_partial_1', {
        id: 'ch_partial_1',
        amount: 51525,
        amount_refunded: 25000,
      }, { amount_refunded: 0 }),
    );

    // Only 1 ledger entry: refund (no fee reversal for partial)
    expect(postLedgerEntryMock).toHaveBeenCalledTimes(1);
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entryType: 'refund', amountCents: 25000 }),
    );
  });

  it('posts incremental (not cumulative) refund amount on second partial refund', async () => {
    // Scenario: $500 charge ($515.25 with fee), two $250 partial refunds.
    // Second event has cumulative amount_refunded=50000 but previous=25000,
    // so the incremental refund for this event is only $250.
    const piMetadata = {
      communityId: '11',
      lineItemId: '44',
      unitId: '88',
      userId: 'user-11',
      convenienceFeeCents: '1525',
    };
    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_multi_1',
      amount: 51525,
      amount_refunded: 50000,
      payment_intent: { id: 'pi_multi_1', metadata: piMetadata },
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: vi.fn().mockResolvedValue({ id: 'pi_multi_1', metadata: piMetadata }) },
      charges: { retrieve: chargesRetrieve },
    });

    selectFromMock.mockResolvedValue([{
      id: 44, assessmentId: 7, communityId: 11, unitId: 88,
      amountCents: 50000, dueDate: '2026-01-15', status: 'paid',
      paidAt: new Date(), paymentIntentId: 'pi_multi_1', lateFeeCents: 0,
      createdAt: new Date(), updatedAt: new Date(),
    }]);

    // Second partial refund: cumulative 50000, previous was 25000 → incremental 25000
    await processFinanceStripeEvent(
      makeEvent('charge.refunded', 'evt_multi_2', {
        id: 'ch_multi_1',
        amount: 51525,
        amount_refunded: 50000,
      }, { amount_refunded: 25000 }),
    );

    // Refund ledger entry should be the INCREMENTAL amount (25000), not cumulative (50000)
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entryType: 'refund',
        amountCents: 25000,
      }),
    );

    // Not a full refund (50000 < 51525), so no fee reversal
    expect(postLedgerEntryMock).toHaveBeenCalledTimes(1);
  });

  it('reverses fee when sequential partials reach full refund', async () => {
    // Two $257.63 partial refunds on $515.25 charge → full refund on second event
    const piMetadata = {
      communityId: '11',
      lineItemId: '44',
      unitId: '88',
      userId: 'user-11',
      convenienceFeeCents: '1525',
    };
    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_seq_1',
      amount: 51525,
      amount_refunded: 51525,
      payment_intent: { id: 'pi_seq_1', metadata: piMetadata },
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: vi.fn().mockResolvedValue({ id: 'pi_seq_1', metadata: piMetadata }) },
      charges: { retrieve: chargesRetrieve },
    });

    selectFromMock.mockResolvedValue([{
      id: 44, assessmentId: 7, communityId: 11, unitId: 88,
      amountCents: 50000, dueDate: '2026-01-15', status: 'paid',
      paidAt: new Date(), paymentIntentId: 'pi_seq_1', lateFeeCents: 0,
      createdAt: new Date(), updatedAt: new Date(),
    }]);

    // Second partial that completes the full refund:
    // cumulative 51525 (full), previous was 25763 → incremental 25762
    await processFinanceStripeEvent(
      makeEvent('charge.refunded', 'evt_seq_2', {
        id: 'ch_seq_1',
        amount: 51525,
        amount_refunded: 51525,
      }, { amount_refunded: 25763 }),
    );

    // Should post 2 entries: incremental refund + fee reversal
    expect(postLedgerEntryMock).toHaveBeenCalledTimes(2);

    // Refund entry uses incremental amount (51525 - 25763 = 25762)
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entryType: 'refund',
        amountCents: 25762,
      }),
    );

    // Fee reversal triggers because event snapshot shows full refund
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entryType: 'adjustment',
        amountCents: -1525,
        metadata: expect.objectContaining({ reason: 'full_refund_fee_reversal' }),
      }),
    );
  });

  it('skips ledger entries when incremental refund computes to zero', async () => {
    // Defensive: if previous_attributes.amount_refunded equals charge.amount_refunded,
    // the incremental is 0. Should skip without posting any ledger entries or
    // modifying line item status.
    const piMetadata = {
      communityId: '11',
      lineItemId: '44',
      unitId: '88',
      userId: 'user-11',
      convenienceFeeCents: '1525',
    };
    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_zero_1',
      amount: 51525,
      amount_refunded: 25000,
      payment_intent: { id: 'pi_zero_1', metadata: piMetadata },
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { retrieve: vi.fn().mockResolvedValue({ id: 'pi_zero_1', metadata: piMetadata }) },
      charges: { retrieve: chargesRetrieve },
    });

    selectFromMock.mockResolvedValue([{
      id: 44, assessmentId: 7, communityId: 11, unitId: 88,
      amountCents: 50000, dueDate: '2026-01-15', status: 'paid',
      paidAt: new Date(), paymentIntentId: 'pi_zero_1', lateFeeCents: 0,
      createdAt: new Date(), updatedAt: new Date(),
    }]);

    // Event where previous_attributes equals current → incremental = 0
    await processFinanceStripeEvent(
      makeEvent('charge.refunded', 'evt_zero_1', {
        id: 'ch_zero_1',
        amount: 51525,
        amount_refunded: 25000,
      }, { amount_refunded: 25000 }),
    );

    // No ledger entries posted
    expect(postLedgerEntryMock).not.toHaveBeenCalled();
    // Line item status NOT modified (guard fires before status update)
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('createPaymentIntentForLineItem metadata contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createScopedClientMock.mockImplementation(() => makeScopedClient());
    selectFromMock.mockImplementation((table: unknown) => {
      if (table === assessmentLineItemsTable) {
        return Promise.resolve([{
          id: 44,
          assessmentId: 7,
          communityId: 11,
          unitId: 88,
          amountCents: 50000,
          dueDate: '2026-01-15',
          status: 'pending',
          paidAt: null,
          paymentIntentId: null,
          lateFeeCents: 1250,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        }]);
      }
      if (table === stripeConnectedAccountsTable) {
        return Promise.resolve([{
          id: 1,
          communityId: 11,
          stripeAccountId: 'acct_123',
          onboardingComplete: true,
          chargesEnabled: true,
          payoutsEnabled: true,
        }]);
      }
      if (table === communitiesTable) {
        return Promise.resolve([{ communitySettings: { paymentFeePolicy: 'owner_pays' } }]);
      }
      return Promise.resolve([]);
    });
    updateMock.mockResolvedValue([{ id: 44 }]);
  });

  it('sends neutral payable metadata and keeps legacy lineItemId', async () => {
    const paymentIntentsCreate = vi.fn().mockResolvedValue({
      id: 'pi_payable_1',
      client_secret: 'cs_test_1',
      currency: 'usd',
    });

    getStripeClientMock.mockReturnValue({
      paymentIntents: { create: paymentIntentsCreate },
    });

    await createPaymentIntentForLineItem(11, {
      lineItemId: 44,
      actorUserId: 'user-11',
    });

    expect(paymentIntentsCreate).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        payableType: 'assessment_line_item',
        payableId: '44',
        payableSourceType: 'assessment',
        payableSourceId: '44',
        lineItemId: '44',
      }),
    }));
  });

  it('creates rent payable intents with rent metadata contract', async () => {
    selectFromMock.mockImplementation((table: unknown) => {
      if (table === rentObligationsTable) {
        return Promise.resolve([{
          id: 77,
          leaseId: 5,
          communityId: 11,
          unitId: 88,
          dueDate: '2026-01-01',
          amountCents: 160000,
          status: 'pending',
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        }]);
      }
      if (table === stripeConnectedAccountsTable) {
        return Promise.resolve([{
          id: 1,
          communityId: 11,
          stripeAccountId: 'acct_123',
          onboardingComplete: true,
          chargesEnabled: true,
          payoutsEnabled: true,
        }]);
      }
      if (table === communitiesTable) {
        return Promise.resolve([{ communitySettings: { paymentFeePolicy: 'owner_pays' } }]);
      }
      return Promise.resolve([]);
    });

    const paymentIntentsCreate = vi.fn().mockResolvedValue({
      id: 'pi_rent_1',
      client_secret: 'cs_rent_1',
      currency: 'usd',
    });
    getStripeClientMock.mockReturnValue({
      paymentIntents: { create: paymentIntentsCreate },
    });

    await createPaymentIntentForLineItem(11, {
      payableType: 'rent_obligation',
      payableId: 77,
      lineItemId: 77,
      actorUserId: 'user-11',
    });

    expect(paymentIntentsCreate).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        payableType: 'rent_obligation',
        payableId: '77',
        payableSourceType: 'rent',
        payableSourceId: '77',
      }),
    }));
    expect(updateMock).not.toHaveBeenCalledWith(
      assessmentLineItemsTable,
      expect.anything(),
      expect.anything(),
    );
  });
});

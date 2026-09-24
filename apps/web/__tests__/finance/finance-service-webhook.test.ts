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
  stripeConnectedAccountsTable: {
    id: Symbol('stripe_connected_accounts.id'),
    stripeAccountId: Symbol('stripe_connected_accounts.stripe_account_id'),
  },
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

/** Community 11's connected account — the account its events must be signed for. */
const COMMUNITY_ACCOUNT = 'acct_community_11';

function makeEvent(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  // Two `charge.refunded` call sites pass a fourth argument that reads as
  // `previous_attributes`. This helper has never placed it on the event, so
  // those cases exercise the "previous_attributes missing" branch. Declared
  // (and still ignored) so making the file type-check changes no behaviour.
  _previousAttributes?: Record<string, unknown>,
  // The connected account the Connect event came from. `null` omits it, as a
  // platform-account event would.
  account: string | null = COMMUNITY_ACCOUNT,
): Stripe.Event {
  return {
    id,
    type,
    created: 1,
    object: 'event',
    ...(account === null ? {} : { account }),
    data: { object: payload as Stripe.Event.Data.Object },
  } as unknown as Stripe.Event;
}

const LINE_ITEM_ROW = {
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
};

const CONNECTED_ACCOUNT_ROW = {
  id: 1,
  communityId: 11,
  stripeAccountId: COMMUNITY_ACCOUNT,
  onboardingComplete: true,
  chargesEnabled: true,
  payoutsEnabled: true,
};

/** Default table reads; per-test overrides fall back to this. */
function defaultSelect(table: unknown): Promise<unknown[]> {
  if (table === assessmentLineItemsTable) return Promise.resolve([LINE_ITEM_ROW]);
  if (table === stripeConnectedAccountsTable) return Promise.resolve([CONNECTED_ACCOUNT_ROW]);
  return Promise.resolve([]);
}

function errorLogsWithCode(spy: { mock: { calls: unknown[][] } }, errorCode: string) {
  return spy.mock.calls.filter(
    (call) => (call[1] as { errorCode?: string } | undefined)?.errorCode === errorCode,
  );
}

describe('processFinanceStripeEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createScopedClientMock.mockImplementation(() => makeScopedClient());
    insertMock.mockResolvedValue([{ id: 1 }]);
    selectFromMock.mockImplementation(defaultSelect);
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

    // Direct charges: the latest charge lives on the connected account too.
    expect(chargesRetrieve).toHaveBeenCalledWith(
      'ch_success_1',
      expect.anything(),
      { stripeAccount: COMMUNITY_ACCOUNT },
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
    selectFromMock.mockImplementation((table: unknown) => {
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
      return defaultSelect(table);
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

    expect(selectFromMock).not.toHaveBeenCalledWith(assessmentLineItemsTable, expect.anything(), expect.anything());
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

    expect(selectFromMock).not.toHaveBeenCalledWith(assessmentLineItemsTable, expect.anything(), expect.anything());
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
    selectFromMock.mockImplementation((table: unknown) => {
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
      return defaultSelect(table);
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

  describe('connected-account binding', () => {
    function stripeFor(metadata: Record<string, string>, amountReceived = 25000) {
      const paymentIntentRetrieve = vi.fn().mockResolvedValue({
        id: 'pi_bind_1',
        metadata,
        amount_received: amountReceived,
        amount: amountReceived,
        latest_charge: 'ch_bind_1',
      });
      const chargesRetrieve = vi.fn().mockResolvedValue({
        id: 'ch_bind_1',
        amount: 25000,
        amount_refunded: 25000,
        payment_intent: 'pi_bind_1',
      });
      const disputesRetrieve = vi.fn().mockResolvedValue({
        id: 'dp_bind_1',
        charge: 'ch_bind_1',
        amount: 1200,
        reason: 'fraudulent',
      });
      getStripeClientMock.mockReturnValue({
        paymentIntents: { retrieve: paymentIntentRetrieve },
        charges: { retrieve: chargesRetrieve },
        disputes: { retrieve: disputesRetrieve },
      });
    }

    const victimMetadata = {
      communityId: '11',
      payableType: 'assessment_line_item',
      payableId: '44',
      unitId: '88',
      userId: 'user-11',
    };

    function expectNoWrites() {
      expect(insertMock).not.toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
      expect(postLedgerEntryMock).not.toHaveBeenCalled();
    }

    it.each([
      ['payment_intent.succeeded', { id: 'pi_bind_1' }],
      ['charge.refunded', { id: 'ch_bind_1', amount: 25000, amount_refunded: 25000 }],
      ['charge.dispute.created', { id: 'dp_bind_1' }],
    ])('skips %s signed for a different connected account', async (type, payload) => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      stripeFor(victimMetadata);

      await expect(
        processFinanceStripeEvent(makeEvent(type, `evt_attack_${type}`, payload, undefined, 'acct_attacker')),
      ).resolves.toBeUndefined();

      expectNoWrites();
      const logs = errorLogsWithCode(errorSpy, 'FINANCE_WEBHOOK_CONNECTED_ACCOUNT_MISMATCH');
      expect(logs).toHaveLength(1);
      expect(logs[0]![1]).toEqual(
        expect.objectContaining({
          reason: 'connected_account_mismatch',
          outcome: 'skipped',
          communityId: 11,
          payloadSnippet: expect.objectContaining({ eventAccount: 'acct_attacker' }),
        }),
      );
      errorSpy.mockRestore();
    });

    it('skips an event with no event.account (finance charges are always direct)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      stripeFor(victimMetadata);

      await processFinanceStripeEvent(
        makeEvent('payment_intent.succeeded', 'evt_platform', { id: 'pi_bind_1' }, undefined, null),
      );

      expectNoWrites();
      const logs = errorLogsWithCode(errorSpy, 'FINANCE_WEBHOOK_CONNECTED_ACCOUNT_MISMATCH');
      expect(logs).toHaveLength(1);
      expect(logs[0]![1]).toEqual(expect.objectContaining({ reason: 'missing_event_account' }));
      errorSpy.mockRestore();
    });

    it('skips when the named community has no connected account', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      selectFromMock.mockImplementation((table: unknown) =>
        table === stripeConnectedAccountsTable ? Promise.resolve([]) : defaultSelect(table),
      );
      stripeFor(victimMetadata);

      await processFinanceStripeEvent(
        makeEvent('payment_intent.succeeded', 'evt_no_acct', { id: 'pi_bind_1' }),
      );

      expectNoWrites();
      const logs = errorLogsWithCode(errorSpy, 'FINANCE_WEBHOOK_CONNECTED_ACCOUNT_MISMATCH');
      expect(logs).toHaveLength(1);
      expect(logs[0]![1]).toEqual(
        expect.objectContaining({ reason: 'community_has_no_connected_account' }),
      );
      errorSpy.mockRestore();
    });

    it('processes an event signed for the community\'s own connected account', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      stripeFor(victimMetadata);
      getStripeClientMock.mockReturnValue({
        paymentIntents: {
          retrieve: vi.fn().mockResolvedValue({
            id: 'pi_bind_1',
            metadata: victimMetadata,
            amount_received: 25000,
            amount: 25000,
            latest_charge: 'ch_bind_1',
          }),
        },
        charges: {
          retrieve: vi.fn().mockResolvedValue({ id: 'ch_bind_1', amount: 25000, amount_refunded: 0 }),
        },
      });

      await processFinanceStripeEvent(
        makeEvent('payment_intent.succeeded', 'evt_own', { id: 'pi_bind_1' }),
      );

      expect(updateMock).toHaveBeenCalledWith(
        assessmentLineItemsTable,
        expect.objectContaining({ status: 'paid' }),
        expect.anything(),
      );
      expect(errorLogsWithCode(errorSpy, 'FINANCE_WEBHOOK_CONNECTED_ACCOUNT_MISMATCH')).toHaveLength(0);
      errorSpy.mockRestore();
    });
  });

  describe('underpayment', () => {
    function stripeWithReceived(amountReceived: number, extraMetadata: Record<string, string> = {}) {
      getStripeClientMock.mockReturnValue({
        paymentIntents: {
          retrieve: vi.fn().mockResolvedValue({
            id: 'pi_under_1',
            metadata: {
              communityId: '11',
              payableType: 'assessment_line_item',
              payableId: '44',
              unitId: '88',
              userId: 'user-11',
              ...extraMetadata,
            },
            amount_received: amountReceived,
            amount: amountReceived,
            latest_charge: 'ch_under_1',
          }),
        },
        charges: {
          retrieve: vi.fn().mockResolvedValue({ id: 'ch_under_1', amount: amountReceived, amount_refunded: 0 }),
        },
      });
    }

    function expectNotMarkedPaid() {
      expect(updateMock).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'paid' }),
        expect.anything(),
      );
    }

    it('does not mark a $4,000 line item paid on a $1 payment, but still records the $1', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      selectFromMock.mockImplementation((table: unknown) =>
        table === assessmentLineItemsTable
          ? Promise.resolve([{ ...LINE_ITEM_ROW, amountCents: 400000 }])
          : defaultSelect(table),
      );
      stripeWithReceived(100);

      await processFinanceStripeEvent(
        makeEvent('payment_intent.succeeded', 'evt_under_1', { id: 'pi_under_1' }),
      );

      expectNotMarkedPaid();
      expect(postLedgerEntryMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ entryType: 'payment', amountCents: -100 }),
      );
      const logs = errorLogsWithCode(warnSpy, 'FINANCE_WEBHOOK_UNDERPAYMENT');
      expect(logs).toHaveLength(1);
      expect(logs[0]![1]).toEqual(
        expect.objectContaining({
          payloadSnippet: expect.objectContaining({ amountReceivedCents: 100, outstandingCents: 400000 }),
        }),
      );
      warnSpy.mockRestore();
    });

    it('counts an applied late fee as outstanding', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      selectFromMock.mockImplementation((table: unknown) =>
        table === assessmentLineItemsTable
          ? Promise.resolve([{ ...LINE_ITEM_ROW, lateFeeCents: 2500 }])
          : defaultSelect(table),
      );
      stripeWithReceived(25000);

      await processFinanceStripeEvent(
        makeEvent('payment_intent.succeeded', 'evt_under_late', { id: 'pi_under_1' }),
      );

      expectNotMarkedPaid();
      expect(errorLogsWithCode(warnSpy, 'FINANCE_WEBHOOK_UNDERPAYMENT')).toHaveLength(1);
      warnSpy.mockRestore();
    });

    it('does not count a convenience fee toward the payable', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // 25000 received, 900 of it a fee: 24100 toward a 25000 item.
      stripeWithReceived(25000, { convenienceFeeCents: '900' });

      await processFinanceStripeEvent(
        makeEvent('payment_intent.succeeded', 'evt_under_fee', { id: 'pi_under_1' }),
      );

      expectNotMarkedPaid();
      expect(errorLogsWithCode(warnSpy, 'FINANCE_WEBHOOK_UNDERPAYMENT')).toHaveLength(1);
      warnSpy.mockRestore();
    });
  });
});

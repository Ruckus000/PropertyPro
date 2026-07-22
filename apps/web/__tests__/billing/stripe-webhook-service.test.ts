import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createUnscopedClientMock,
  eqMock,
  andMock,
  isNullMock,
  sqlMock,
  accessPlansTable,
  communitiesTable,
  pendingSignupsTable,
  provisioningJobsTable,
  stripePricesTable,
  stripeWebhookEventsTable,
} = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  eqMock: vi.fn((col: unknown, value: unknown) => ({ op: 'eq', col, value })),
  andMock: vi.fn((...clauses: unknown[]) => ({ op: 'and', clauses })),
  isNullMock: vi.fn((col: unknown) => ({ op: 'isNull', col })),
  sqlMock: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: [...strings],
    values,
  })),
  accessPlansTable: {
    id: 'access_plans.id',
    convertedAt: 'access_plans.converted_at',
    revokedAt: 'access_plans.revoked_at',
  },
  communitiesTable: {
    id: 'communities.id',
    name: 'communities.name',
    communityType: 'communities.community_type',
    stripeCustomerId: 'communities.stripe_customer_id',
    stripeSubscriptionId: 'communities.stripe_subscription_id',
    subscriptionStatus: 'communities.subscription_status',
    subscriptionPlan: 'communities.subscription_plan',
    subscriptionCanceledAt: 'communities.subscription_canceled_at',
    paymentFailedAt: 'communities.payment_failed_at',
    nextReminderAt: 'communities.next_reminder_at',
    updatedAt: 'communities.updated_at',
  },
  pendingSignupsTable: {
    signupRequestId: 'pending_signups.signup_request_id',
    status: 'pending_signups.status',
    payload: 'pending_signups.payload',
    updatedAt: 'pending_signups.updated_at',
  },
  provisioningJobsTable: {
    id: 'provisioning_jobs.id',
    signupRequestId: 'provisioning_jobs.signup_request_id',
    stripeEventId: 'provisioning_jobs.stripe_event_id',
    status: 'provisioning_jobs.status',
  },
  stripePricesTable: {
    stripePriceId: 'stripe_prices.stripe_price_id',
    unitAmountCents: 'stripe_prices.unit_amount_cents',
    updatedAt: 'stripe_prices.updated_at',
  },
  stripeWebhookEventsTable: {
    eventId: 'stripe_webhook_events.event_id',
    processedAt: 'stripe_webhook_events.processed_at',
  },
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: eqMock,
  and: andMock,
  isNull: isNullMock,
  sql: sqlMock,
}));

vi.mock('@propertypro/db', () => ({
  accessPlans: accessPlansTable,
  communities: communitiesTable,
  pendingSignups: pendingSignupsTable,
  provisioningJobs: provisioningJobsTable,
  stripePrices: stripePricesTable,
  stripeWebhookEvents: stripeWebhookEventsTable,
}));

import {
  cancelCommunitySubscriptionByIdIfFirst,
  cancelCommunitySubscriptionByStripeSubscriptionIfFirst,
  getProvisioningJobIdBySignupRequestId,
  getStripeWebhookAttempt,
  insertProvisioningJobFence,
  markCommunityPaymentFailed,
  markPendingSignupPaymentCompleted,
  persistSelfServeCommunityStripeIds,
  updateCommunitySubscriptionFromStripe,
  type StripeWebhookCommunity,
} from '../../src/lib/services/stripe-webhook-service';

type MockDb = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function setupDb(options: {
  selectRows?: unknown[];
  updateRows?: unknown[];
} = {}): MockDb & {
  limitMock: ReturnType<typeof vi.fn>;
  valuesMock: ReturnType<typeof vi.fn>;
  setMock: ReturnType<typeof vi.fn>;
  whereMock: ReturnType<typeof vi.fn>;
  returningMock: ReturnType<typeof vi.fn>;
  onConflictDoNothingMock: ReturnType<typeof vi.fn>;
} {
  const { selectRows = [], updateRows = [] } = options;
  const limitMock = vi.fn().mockResolvedValue(selectRows);
  const selectWhereMock = vi.fn(() => ({ limit: limitMock }));
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));
  const selectMock = vi.fn(() => ({ from: selectFromMock }));

  const onConflictDoNothingMock = vi.fn().mockResolvedValue(undefined);
  const valuesMock = vi.fn(() => ({ onConflictDoNothing: onConflictDoNothingMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));

  const returningMock = vi.fn().mockResolvedValue(updateRows);
  const whereMock = vi.fn(() => {
    const thenable = Promise.resolve(updateRows) as Promise<unknown[]> & {
      returning: typeof returningMock;
    };
    thenable.returning = returningMock;
    return thenable;
  });
  const setMock = vi.fn(() => ({ where: whereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));

  const db = {
    select: selectMock,
    insert: insertMock,
    update: updateMock,
  };
  createUnscopedClientMock.mockReturnValue(db);

  return {
    ...db,
    limitMock,
    valuesMock,
    setMock,
    whereMock,
    returningMock,
    onConflictDoNothingMock,
  };
}

describe('stripe-webhook-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a webhook attempt when the event fence exists', async () => {
    const processedAt = new Date('2026-05-13T12:00:00.000Z');
    const db = setupDb({
      selectRows: [{ eventId: 'evt_123', processedAt }],
    });

    await expect(getStripeWebhookAttempt('evt_123')).resolves.toEqual({
      eventId: 'evt_123',
      processedAt,
    });

    expect(createUnscopedClientMock).toHaveBeenCalledTimes(1);
    expect(db.select).toHaveBeenCalledWith({
      eventId: stripeWebhookEventsTable.eventId,
      processedAt: stripeWebhookEventsTable.processedAt,
    });
    expect(eqMock).toHaveBeenCalledWith(stripeWebhookEventsTable.eventId, 'evt_123');
    expect(db.limitMock).toHaveBeenCalledWith(1);
  });

  it('returns null when no provisioning job exists for a signup request', async () => {
    const db = setupDb({ selectRows: [] });

    await expect(getProvisioningJobIdBySignupRequestId('signup_missing')).resolves.toBeNull();

    expect(db.select).toHaveBeenCalledWith({ id: provisioningJobsTable.id });
    expect(eqMock).toHaveBeenCalledWith(
      provisioningJobsTable.signupRequestId,
      'signup_missing',
    );
    expect(db.limitMock).toHaveBeenCalledWith(1);
  });

  it('inserts the provisioning job fence with initiated status and conflict protection', async () => {
    const db = setupDb();

    await insertProvisioningJobFence({
      signupRequestId: 'signup_123',
      stripeEventId: 'evt_checkout',
    });

    expect(db.insert).toHaveBeenCalledWith(provisioningJobsTable);
    expect(db.valuesMock).toHaveBeenCalledWith({
      signupRequestId: 'signup_123',
      stripeEventId: 'evt_checkout',
      status: 'initiated',
    });
    expect(db.onConflictDoNothingMock).toHaveBeenCalled();
  });

  it('persists only non-null Stripe IDs for self-serve communities', async () => {
    const db = setupDb();

    await persistSelfServeCommunityStripeIds({
      communityId: 42,
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: null,
    });

    expect(db.update).toHaveBeenCalledWith(communitiesTable);
    expect(db.setMock).toHaveBeenCalledWith({
      updatedAt: expect.any(Date),
      stripeCustomerId: 'cus_123',
    });
    expect(eqMock).toHaveBeenCalledWith(communitiesTable.id, 42);
  });

  it('marks pending signup payment completed and merges Stripe IDs into payload JSON', async () => {
    const db = setupDb();

    await markPendingSignupPaymentCompleted({
      signupRequestId: 'signup_abc',
      stripeCustomerId: 'cus_abc',
      stripeSubscriptionId: 'sub_abc',
    });

    expect(db.update).toHaveBeenCalledWith(pendingSignupsTable);
    expect(db.setMock).toHaveBeenCalledWith({
      status: 'payment_completed',
      payload: {
        op: 'sql',
        strings: ['coalesce(', ", '{}'::jsonb) || ", '::jsonb'],
        values: [
          pendingSignupsTable.payload,
          JSON.stringify({
            stripeCustomerId: 'cus_abc',
            stripeSubscriptionId: 'sub_abc',
            subscriptionStatus: null,
            subscriptionCurrentPeriodEndAt: null,
          }),
        ],
      },
      updatedAt: expect.any(Date),
    });
    expect(eqMock).toHaveBeenCalledWith(
      pendingSignupsTable.signupRequestId,
      'signup_abc',
    );
  });

  it('merges trial status + period end into the payload when provided (A2)', async () => {
    const db = setupDb();
    const periodEnd = new Date('2026-08-12T00:00:00.000Z');

    await markPendingSignupPaymentCompleted({
      signupRequestId: 'signup_trial',
      stripeCustomerId: 'cus_t',
      stripeSubscriptionId: 'sub_t',
      subscriptionStatus: 'trialing',
      subscriptionCurrentPeriodEndAt: periodEnd,
    });

    expect(db.setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          values: [
            pendingSignupsTable.payload,
            JSON.stringify({
              stripeCustomerId: 'cus_t',
              stripeSubscriptionId: 'sub_t',
              subscriptionStatus: 'trialing',
              subscriptionCurrentPeriodEndAt: periodEnd.toISOString(),
            }),
          ],
        }),
      }),
    );
  });

  it('returns true only when the community cancellation guard updates a row', async () => {
    const canceledAt = new Date('2026-05-13T13:00:00.000Z');
    const nextReminderAt = new Date('2026-06-05T13:00:00.000Z');
    const db = setupDb({ updateRows: [{ id: 42 }] });

    await expect(
      cancelCommunitySubscriptionByIdIfFirst({
        communityId: 42,
        canceledAt,
        nextReminderAt,
      }),
    ).resolves.toBe(true);

    expect(db.update).toHaveBeenCalledWith(communitiesTable);
    expect(db.setMock).toHaveBeenCalledWith({
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: canceledAt,
      subscriptionPlan: null,
      nextReminderAt,
      updatedAt: canceledAt,
    });
    expect(andMock).toHaveBeenCalledWith(
      { op: 'eq', col: communitiesTable.id, value: 42 },
      { op: 'isNull', col: communitiesTable.subscriptionCanceledAt },
    );
    expect(db.returningMock).toHaveBeenCalledWith({ id: communitiesTable.id });
  });

  it('returns the canceled community from subscription-id cancellation guard', async () => {
    const canceledAt = new Date('2026-05-13T14:00:00.000Z');
    const nextReminderAt = new Date('2026-06-05T14:00:00.000Z');
    const row = {
      id: 77,
      name: 'Palm Shores',
      communityType: 'hoa_720',
    };
    const db = setupDb({ updateRows: [row] });

    await expect(
      cancelCommunitySubscriptionByStripeSubscriptionIfFirst({
        stripeSubscriptionId: 'sub_cancel',
        canceledAt,
        nextReminderAt,
      }),
    ).resolves.toEqual(row);

    expect(eqMock).toHaveBeenCalledWith(
      communitiesTable.stripeSubscriptionId,
      'sub_cancel',
    );
    expect(db.returningMock).toHaveBeenCalledWith({
      id: communitiesTable.id,
      name: communitiesTable.name,
      communityType: communitiesTable.communityType,
    });
  });

  it('preserves existing payment-failure timestamps before scheduling defaults', async () => {
    const existingPaymentFailedAt = new Date('2026-05-10T09:00:00.000Z');
    const existingNextReminderAt = new Date('2026-05-15T09:00:00.000Z');
    const attemptedPaymentFailedAt = new Date('2026-05-13T09:00:00.000Z');
    const attemptedNextReminderAt = new Date('2026-05-16T09:00:00.000Z');
    const db = setupDb();

    const community: StripeWebhookCommunity = {
      id: 42,
      name: 'Sunset Condos',
      communityType: 'condo_718',
      paymentFailedAt: existingPaymentFailedAt,
      nextReminderAt: existingNextReminderAt,
    };

    await markCommunityPaymentFailed({
      community,
      paymentFailedAt: attemptedPaymentFailedAt,
      nextReminderAt: attemptedNextReminderAt,
    });

    expect(db.update).toHaveBeenCalledWith(communitiesTable);
    expect(db.setMock).toHaveBeenCalledWith({
      subscriptionStatus: 'past_due',
      paymentFailedAt: existingPaymentFailedAt,
      nextReminderAt: existingNextReminderAt,
      updatedAt: attemptedPaymentFailedAt,
    });
    expect(eqMock).toHaveBeenCalledWith(communitiesTable.id, 42);
  });

  describe('updateCommunitySubscriptionFromStripe', () => {
    it('clears paymentFailedAt when the subscription recovers to active', async () => {
      const db = setupDb();

      await updateCommunitySubscriptionFromStripe({
        communityId: 7,
        subscriptionStatus: 'active',
        subscriptionPlan: 'essentials',
      });

      expect(db.update).toHaveBeenCalledWith(communitiesTable);
      expect(db.setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionStatus: 'active',
          subscriptionPlan: 'essentials',
          paymentFailedAt: null,
        }),
      );
      expect(eqMock).toHaveBeenCalledWith(communitiesTable.id, 7);
    });

    it('preserves paymentFailedAt when the subscription escalates to unpaid', async () => {
      // unpaid/incomplete_expired are worse-than-past_due states, not recovery —
      // the payment-failure marker (and its reminder ladder + UI) must survive.
      const db = setupDb();

      await updateCommunitySubscriptionFromStripe({
        communityId: 7,
        subscriptionStatus: 'unpaid',
        subscriptionPlan: 'essentials',
      });

      const payload = db.setMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect('paymentFailedAt' in payload).toBe(false);
    });

    it('sets paymentFailedAt when a past_due update carries one', async () => {
      const db = setupDb();
      const failedAt = new Date('2026-07-01T00:00:00.000Z');

      await updateCommunitySubscriptionFromStripe({
        communityId: 7,
        subscriptionStatus: 'past_due',
        subscriptionPlan: 'essentials',
        paymentFailedAt: failedAt,
      });

      expect(db.setMock).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionStatus: 'past_due', paymentFailedAt: failedAt }),
      );
    });

    it('preserves an existing paymentFailedAt on a past_due update with no timestamp', async () => {
      const db = setupDb();

      await updateCommunitySubscriptionFromStripe({
        communityId: 7,
        subscriptionStatus: 'past_due',
        subscriptionPlan: 'essentials',
      });

      const payload = db.setMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect('paymentFailedAt' in payload).toBe(false);
    });
  });
});

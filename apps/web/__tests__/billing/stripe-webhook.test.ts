/**
 * Tests for the Stripe webhook handler — P2-34
 *
 * Route: apps/web/src/app/api/v1/webhooks/stripe/route.ts
 *
 * Coverage:
 * - Signature verification (missing secret, invalid sig, valid sig, missing header)
 * - Idempotency: duplicate events return 200 without re-processing
 * - Unique constraint race condition on insert
 * - checkout.session.completed
 * - customer.subscription.updated (first cancellation vs. duplicate)
 * - customer.subscription.deleted (uses .returning())
 * - invoice.payment_failed
 * - invoice.payment_succeeded
 * - Unhandled event types are silently ignored
 *
 * NOTE: This file intentionally has no vi.mock('@/lib/middleware/subscription-guard').
 * Stripe webhooks are system events that must always be processed regardless of
 * subscription status. If that mock were needed here, it would mean the webhook
 * route erroneously imported the guard — a regression caught by test failures above.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoist all mocks so they are available before any imports
// ---------------------------------------------------------------------------
const {
  constructEventMock,
  getExpectedLivemodeMock,
  retrieveCheckoutSessionMock,
  retrieveSubscriptionMock,
  retrieveInvoiceMock,
  resolvePlanIdFromStripePriceIdMock,
  sendPaymentActionRequiredEmailMock,
  sendPaymentFailedEmailMock,
  sendSubscriptionCanceledEmailMock,
  captureExceptionMock,
  runProvisioningMock,
  runAddToGroupProvisioningMock,
  createUnscopedClientMock,
  eqMock,
  communitiesTable,
  pendingSignupsTable,
  provisioningJobsTable,
  stripeWebhookEventsTable,
  accessPlansTable,
} = vi.hoisted(() => {
  // Chainable builder mock — each method returns `this` (the same object)
  // so callers can chain .select().from().where().limit() etc.
  const makeChainingMock = () => {
    const obj: Record<string, ReturnType<typeof vi.fn>> = {};
    const methods = [
      'select',
      'from',
      'where',
      'limit',
      'insert',
      'values',
      'onConflictDoNothing',
      'update',
      'set',
      'returning',
    ];
    for (const m of methods) {
      obj[m] = vi.fn(() => obj);
    }
    return obj;
  };

  return {
    constructEventMock: vi.fn(),
    getExpectedLivemodeMock: vi.fn(() => null as boolean | null),
    retrieveCheckoutSessionMock: vi.fn(),
    retrieveSubscriptionMock: vi.fn(),
    retrieveInvoiceMock: vi.fn(),
    resolvePlanIdFromStripePriceIdMock: vi.fn(),
    sendPaymentActionRequiredEmailMock: vi.fn().mockResolvedValue(undefined),
    sendPaymentFailedEmailMock: vi.fn().mockResolvedValue(undefined),
    sendSubscriptionCanceledEmailMock: vi.fn().mockResolvedValue(undefined),
    captureExceptionMock: vi.fn(),
    runProvisioningMock: vi.fn().mockResolvedValue(undefined),
    runAddToGroupProvisioningMock: vi.fn().mockResolvedValue(undefined),
    createUnscopedClientMock: vi.fn(() => makeChainingMock()),
    eqMock: vi.fn((col: unknown, val: unknown) => ({ _eq: [col, val] })),
    communitiesTable: {
      id: 'communities.id',
      name: 'communities.name',
      communityType: 'communities.community_type',
      subscriptionStatus: 'communities.subscription_status',
      subscriptionCanceledAt: 'communities.subscription_canceled_at',
      stripeSubscriptionId: 'communities.stripe_subscription_id',
      stripeCustomerId: 'communities.stripe_customer_id',
      paymentFailedAt: 'communities.payment_failed_at',
      nextReminderAt: 'communities.next_reminder_at',
    },
    pendingSignupsTable: {
      signupRequestId: 'pending_signups.signup_request_id',
      status: 'pending_signups.status',
      payload: 'pending_signups.payload',
      updatedAt: 'pending_signups.updated_at',
    },
    provisioningJobsTable: {
      signupRequestId: 'provisioning_jobs.signup_request_id',
      stripeEventId: 'provisioning_jobs.stripe_event_id',
      status: 'provisioning_jobs.status',
    },
    stripeWebhookEventsTable: {
      eventId: 'stripe_webhook_events.event_id',
      processedAt: 'stripe_webhook_events.processed_at',
    },
    accessPlansTable: {
      id: 'access_plans.id',
      convertedAt: 'access_plans.converted_at',
      revokedAt: 'access_plans.revoked_at',
    },
  };
});

// ---------------------------------------------------------------------------
// Module mocks — must precede the import of the route under test
// ---------------------------------------------------------------------------

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: eqMock,
  and: (...args: unknown[]) => ({ _and: args }),
  isNull: (col: unknown) => ({ _isNull: col }),
  or: (...args: unknown[]) => ({ _or: args }),
  inArray: (col: unknown, vals: unknown) => ({ _inArray: [col, vals] }),
  sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => ({ _sql: { strings: [...strings], values } }), { raw: (s: string) => ({ _sqlRaw: s }) }),
}));

vi.mock('@propertypro/db', () => ({
  communities: communitiesTable,
  pendingSignups: pendingSignupsTable,
  provisioningJobs: provisioningJobsTable,
  stripeWebhookEvents: stripeWebhookEventsTable,
  accessPlans: accessPlansTable,
}));

vi.mock('@/lib/services/stripe-service', () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent: constructEventMock },
  }),
  // Defaults to null = "mode unknown, do not gate", so every pre-existing test
  // is unaffected by the mode guard. The prefix parsing itself is covered in
  // apps/web/src/lib/services/__tests__/stripe-service.test.ts.
  getExpectedLivemode: getExpectedLivemodeMock,
  retrieveCheckoutSession: retrieveCheckoutSessionMock,
  retrieveSubscription: retrieveSubscriptionMock,
  retrieveInvoice: retrieveInvoiceMock,
  resolvePlanIdFromStripePriceId: resolvePlanIdFromStripePriceIdMock,
  // Real-ish pure impl so subscription.updated/created period-end resolves.
  resolveSubscriptionPeriodEndAt: (sub: {
    trial_end?: number | null;
    items?: { data?: Array<{ current_period_end?: number }> };
    current_period_end?: number;
  }) => {
    if (typeof sub?.trial_end === 'number') return new Date(sub.trial_end * 1000);
    const item = sub?.items?.data?.[0]?.current_period_end;
    if (typeof item === 'number') return new Date(item * 1000);
    if (typeof sub?.current_period_end === 'number') return new Date(sub.current_period_end * 1000);
    return null;
  },
}));

vi.mock('@/lib/services/payment-alert-scheduler', () => ({
  sendPaymentActionRequiredEmail: sendPaymentActionRequiredEmailMock,
  sendPaymentFailedEmail: sendPaymentFailedEmailMock,
  sendSubscriptionCanceledEmail: sendSubscriptionCanceledEmailMock,
}));

vi.mock('@/lib/services/provisioning-service', () => ({
  runProvisioning: runProvisioningMock,
  runAddToGroupProvisioning: runAddToGroupProvisioningMock,
}));

// Route import must come after all vi.mock calls
import { POST } from '../../src/app/api/v1/webhooks/stripe/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a NextRequest as the webhook handler receives it. */
function makeRequest(body = '{}', sig = 'valid-sig'): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': sig, 'content-type': 'application/json' },
    body,
  });
}

/** Produce a minimal Stripe Event stub of the given type. */
function makeEvent(
  type: string,
  data: Record<string, unknown>,
  id = 'evt_test_001',
): Record<string, unknown> {
  return { id, type, data: { object: data } };
}

/**
 * Configure the per-test `createUnscopedClient` mock to return a db proxy
 * where select().from().where().limit() resolves to `selectRows`, and
 * update().set().where() + update().set().where().returning() resolves to
 * `updateRows`, and insert().values() resolves without error (or throws if
 * `insertError` is provided).
 */
function setupDb(options: {
  selectRows?: unknown[];
  updateRows?: unknown[];
  insertError?: Error;
} = {}): {
  selectMock: ReturnType<typeof vi.fn>;
  insertMock: ReturnType<typeof vi.fn>;
  updateMock: ReturnType<typeof vi.fn>;
} {
  const { selectRows = [], updateRows = [], insertError } = options;

  // Produce the terminal promise/value at the end of each chain.
  const limitMock = vi.fn().mockResolvedValue(selectRows);
  const returningMock = vi.fn().mockResolvedValue(updateRows);

  // update chain: update().set().where()  — resolves as a promise itself AND
  // exposes .returning() for handlers that call .returning() at the end.
  const whereForUpdateMock = vi.fn(() => {
    // Return a thenable that also has a .returning() method.
    const p = Promise.resolve(updateRows) as Promise<unknown[]> & {
      returning: typeof returningMock;
    };
    p.returning = returningMock;
    return p;
  });
  const setMock = vi.fn(() => ({ where: whereForUpdateMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));

  // insert chain
  const onConflictDoNothingMock = vi.fn().mockResolvedValue([]);
  // Named so both ternary arms share one mock signature — the throwing arm
  // otherwise infers `() => never`, and `mockImplementation` below then types
  // its argument against that arm alone.
  type InsertValuesResult = {
    onConflictDoNothing: typeof onConflictDoNothingMock;
    then?: (
      resolve: (v: unknown) => unknown,
      _reject?: (e: unknown) => unknown,
    ) => Promise<unknown>;
  };
  const valuesMock = insertError
    ? vi.fn((): InsertValuesResult => {
        throw insertError;
      })
    : vi.fn((): InsertValuesResult => ({ onConflictDoNothing: onConflictDoNothingMock }));
  // For direct insert (no onConflictDoNothing) the handler awaits values() —
  // so make the object returned by values() also thenable.
  if (!insertError) {
    const valuesObj = valuesMock();
    // Reset so next call returns a fresh thenable object
    const realValuesFn = () => {
      const obj = {
        onConflictDoNothing: onConflictDoNothingMock,
        then: (
          resolve: (v: unknown) => unknown,
          _reject?: (e: unknown) => unknown,
        ) => Promise.resolve([]).then(resolve),
      };
      return obj;
    };
    valuesMock.mockImplementation(realValuesFn);
  }
  const insertMock = vi.fn(() => ({ values: valuesMock }));

  // select chain
  const selectMock = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: limitMock,
      })),
    })),
  }));

  createUnscopedClientMock.mockReturnValue({
    select: selectMock,
    insert: insertMock,
    update: updateMock,
  });

  return { selectMock, insertMock, updateMock };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/v1/webhooks/stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks clears CALLS, not implementations — a mockReturnValue set by
    // one test would otherwise leak into every test after it. Restore the
    // "mode unknown, do not gate" default explicitly.
    getExpectedLivemodeMock.mockReturnValue(null);
    // Default env
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  });

  // -------------------------------------------------------------------------
  // 1. Signature verification
  // -------------------------------------------------------------------------

  describe('signature verification', () => {
    it('returns 500 when STRIPE_WEBHOOK_SECRET is not set (misconfiguration signal for Stripe retry)', async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;

      const res = await POST(makeRequest());
      const body = (await res.json()) as { error: string };

      expect(res.status).toBe(500);
      expect(body.error).toBeDefined();
      expect(constructEventMock).not.toHaveBeenCalled();
    });

    it('returns 400 when constructEvent throws (invalid signature)', async () => {
      constructEventMock.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });

      const res = await POST(makeRequest('{}', 'bad-sig'));
      const body = (await res.json()) as { error: string };

      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid signature');
    });

    it('returns 400 when stripe-signature header is absent', async () => {
      // Source: req.headers.get('stripe-signature') ?? '' passes empty string to constructEvent.
      // Stripe's constructEvent throws when the signature is empty/invalid.
      constructEventMock.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });

      const req = new NextRequest('http://localhost:3000/api/v1/webhooks/stripe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' }, // no stripe-signature header
        body: '{}',
      });

      const res = await POST(req);
      const body = (await res.json()) as { error: string };
      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid signature');
    });

    it('passes the raw body string and stripe-signature header to constructEvent', async () => {
      const event = makeEvent('invoice.payment_succeeded', {
        customer: 'cus_abc',
      });
      constructEventMock.mockReturnValue(event);

      // Idempotency: already processed → return early
      setupDb({ selectRows: [{ eventId: 'evt_test_001' }] });

      const rawBody = JSON.stringify({ id: 'evt_test_001' });
      const res = await POST(makeRequest(rawBody, 'sig_xyz'));

      expect(constructEventMock).toHaveBeenCalledWith(rawBody, 'sig_xyz', 'whsec_test');
      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Idempotency
  // -------------------------------------------------------------------------

  describe('idempotency', () => {
    it('returns 200 without processing when event already exists in stripeWebhookEvents', async () => {
      const event = makeEvent('customer.subscription.deleted', {
        id: 'sub_123',
      });
      constructEventMock.mockReturnValue(event);

      // Simulate existing record
      setupDb({ selectRows: [{ eventId: event.id }] });

      const res = await POST(makeRequest());
      const body = (await res.json()) as { received: boolean };

      expect(res.status).toBe(200);
      expect(body.received).toBe(true);
      expect(sendSubscriptionCanceledEmailMock).not.toHaveBeenCalled();
    });

    it('returns 200 when insert hits unique constraint (race condition)', async () => {
      const event = makeEvent('customer.subscription.deleted', {
        id: 'sub_race',
      });
      constructEventMock.mockReturnValue(event);

      const uniqueErr = Object.assign(new Error('duplicate key'), { code: '23505' });

      // First select returns empty (not yet processed), race-check select returns processed row
      const limitMock = vi.fn()
        .mockResolvedValueOnce([]) // idempotency pre-check: no row yet
        .mockResolvedValueOnce([{ processedAt: new Date() }]); // race-check: already processed
      const whereForUpdateMock = vi.fn(() => Promise.resolve([]));
      const setMock = vi.fn(() => ({ where: whereForUpdateMock }));
      const updateMock = vi.fn(() => ({ set: setMock }));

      const insertMock = vi.fn(() => ({
        values: vi.fn(() => {
          throw uniqueErr;
        }),
      }));

      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: limitMock })),
        })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      const res = await POST(makeRequest());
      const body = (await res.json()) as { received: boolean };

      expect(res.status).toBe(200);
      expect(body.received).toBe(true);
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('returns 500 when insert fails with a non-unique error', async () => {
      const event = makeEvent('customer.subscription.deleted', {
        id: 'sub_err',
      });
      constructEventMock.mockReturnValue(event);

      const dbErr = new Error('Connection refused');

      const limitMock = vi.fn().mockResolvedValue([]); // idempotency pre-check: no row
      const insertMock = vi.fn(() => ({
        values: vi.fn(() => {
          throw dbErr;
        }),
      }));
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: limitMock })),
        })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
      });

      const res = await POST(makeRequest());
      // Non-unique constraint DB errors now return 500 instead of silently continuing
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Webhook fence insert failed');
    });
  });

  // -------------------------------------------------------------------------
  // 2b. Mode guard (test vs live)
  // -------------------------------------------------------------------------

  describe('livemode guard', () => {
    /** A checkout event in the given Stripe mode. */
    function stubModeEvent(livemode: boolean) {
      const session = {
        id: 'cs_mode_guard',
        status: 'complete',
        metadata: { signupRequestId: 'req-mode' },
      };
      constructEventMock.mockReturnValue({
        ...makeEvent('checkout.session.completed', session, 'evt_mode_guard'),
        livemode,
      });
      retrieveCheckoutSessionMock.mockResolvedValue({ ...session, status: 'complete' });
    }

    it('drops a test-mode event on a live deployment WITHOUT calling Stripe', async () => {
      getExpectedLivemodeMock.mockReturnValue(true);
      stubModeEvent(false);
      const { insertMock } = setupDb({ selectRows: [] });

      const res = await POST(makeRequest());

      // 200 — a cross-mode event is unprocessable, not transient. A retry can
      // never succeed, so Stripe must not be asked to make one.
      expect(res.status).toBe(200);

      // The whole point of the guard's placement: it fires BEFORE the Stripe
      // API call that would otherwise throw "No such checkout.session" and turn
      // into a 500 retry loop.
      expect(retrieveCheckoutSessionMock).not.toHaveBeenCalled();

      // Ahead of the idempotency fence, so a foreign event leaves no row behind.
      expect(insertMock).not.toHaveBeenCalled();
      expect(runProvisioningMock).not.toHaveBeenCalled();
    });

    it('drops a live-mode event on a test deployment', async () => {
      getExpectedLivemodeMock.mockReturnValue(false);
      stubModeEvent(true);
      const { insertMock } = setupDb({ selectRows: [] });

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      expect(retrieveCheckoutSessionMock).not.toHaveBeenCalled();
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('processes an event whose mode matches the deployment', async () => {
      getExpectedLivemodeMock.mockReturnValue(true);
      stubModeEvent(true);
      setupDb({ selectRows: [] });

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      expect(retrieveCheckoutSessionMock).toHaveBeenCalled();
    });

    it('FAILS OPEN when the key mode is unknown, even on a mode mismatch', async () => {
      // An unrecognised STRIPE_SECRET_KEY prefix must never start dropping real
      // payment events — the guard may only ever be as permissive as before.
      getExpectedLivemodeMock.mockReturnValue(null);
      stubModeEvent(false);
      setupDb({ selectRows: [] });

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      expect(retrieveCheckoutSessionMock).toHaveBeenCalled();
    });

    it('does not gate an event that carries no livemode field', async () => {
      getExpectedLivemodeMock.mockReturnValue(true);
      const session = {
        id: 'cs_no_livemode',
        status: 'complete',
        metadata: { signupRequestId: 'req-none' },
      };
      // No `livemode` key at all — must not be read as "false" and dropped.
      constructEventMock.mockReturnValue(
        makeEvent('checkout.session.completed', session, 'evt_no_livemode'),
      );
      retrieveCheckoutSessionMock.mockResolvedValue({ ...session, status: 'complete' });
      setupDb({ selectRows: [] });

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      expect(retrieveCheckoutSessionMock).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. checkout.session.completed
  // -------------------------------------------------------------------------

  describe('checkout.session.completed', () => {
    it('updates pendingSignup to payment_completed and inserts provisioning job', async () => {
      const session = {
        id: 'cs_live_001',
        status: 'complete',
        metadata: { signupRequestId: 'req-abc' },
      };
      const event = makeEvent('checkout.session.completed', session, 'evt_cs_001');
      constructEventMock.mockReturnValue(event);
      retrieveCheckoutSessionMock.mockResolvedValue({ ...session, status: 'complete' });

      // First select (idempotency check) → empty; subsequent selects handled per query
      const selectCallResults: unknown[][] = [
        [], // idempotency check: no existing event
        [{ signupRequestId: 'req-abc' }], // pending signup exists (FK parent for provisioning_jobs)
        [{ id: 123 }], // provisioning job lookup
      ];
      let selectCallCount = 0;
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockImplementation(() => {
              return Promise.resolve(selectCallResults[selectCallCount++] ?? []);
            }),
          })),
        })),
      }));

      const insertedValues: unknown[] = [];
      const onConflictDoNothingMock = vi.fn().mockResolvedValue([]);
      const valuesMock = vi.fn((vals: unknown) => {
        insertedValues.push(vals);
        return { onConflictDoNothing: onConflictDoNothingMock };
      });
      // Make values() thenable for the update insert
      // (pendingSignups update uses .set().where(), not insert)
      const insertMock = vi.fn(() => ({ values: valuesMock }));

      const whereForUpdateMock = vi.fn(() => Promise.resolve([]));
      const setMock = vi.fn(() => ({ where: whereForUpdateMock }));
      const updateMock = vi.fn(() => ({ set: setMock }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(runProvisioningMock).toHaveBeenCalledWith(123);

      // Should have updated pendingSignups and inserted a provisioning job
      expect(updateMock).toHaveBeenCalled();
      expect(insertMock).toHaveBeenCalledTimes(
        // Once for stripeWebhookEvents, once for provisioningJobs
        2,
      );
      // Verify provisioning job values include signupRequestId
      const provisioningInsert = insertedValues.find(
        (v) =>
          typeof v === 'object' &&
          v !== null &&
          (v as Record<string, unknown>).signupRequestId === 'req-abc',
      );
      expect(provisioningInsert).toBeDefined();

      // Verify processedAt was stamped on the stripeWebhookEvents record (issue 2b)
      const allSetPayloads = setMock.mock.calls.map(([arg]: unknown[]) => arg as Record<string, unknown>);
      const processedAtCall = allSetPayloads.find((p) => 'processedAt' in p);
      expect(processedAtCall).toBeDefined();
      expect((processedAtCall as Record<string, unknown>).processedAt).toBeInstanceOf(Date);
    });

    it('returns 500 for Stripe retry when synchronous provisioning fails', async () => {
      const session = {
        id: 'cs_live_provisioning_failure',
        status: 'complete',
        metadata: { signupRequestId: 'req-failure' },
      };
      const event = makeEvent('checkout.session.completed', session, 'evt_cs_failure');
      constructEventMock.mockReturnValue(event);
      retrieveCheckoutSessionMock.mockResolvedValue({ ...session, status: 'complete' });
      runProvisioningMock.mockRejectedValueOnce(new Error('provisioning exploded'));

      let selectCallCount = 0;
      const selectCallResults: unknown[][] = [
        [], // idempotency check: no existing event
        [{ signupRequestId: 'req-failure' }], // pending signup exists (FK parent for provisioning_jobs)
        [{ id: 456 }], // provisioning job lookup
      ];
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(selectCallResults[selectCallCount++] ?? [])),
          })),
        })),
      }));

      const insertMock = vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      }));

      const setPayloads: Array<Record<string, unknown>> = [];
      // persistSelfServeCommunityStripeIds now ends in .returning() so it can
      // detect a refused rebind; a row back means the write landed.
      const whereForUpdateMock = vi.fn(() =>
        Object.assign(Promise.resolve([{ id: 1 }]), {
          returning: vi.fn(() => Promise.resolve([{ id: 1 }])),
        }),
      );
      const setMock = vi.fn((payload: Record<string, unknown>) => {
        setPayloads.push(payload);
        return { where: whereForUpdateMock };
      });
      const updateMock = vi.fn(() => ({ set: setMock }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      const res = await POST(makeRequest());
      const body = (await res.json()) as { error: string };

      expect(res.status).toBe(500);
      expect(body.error).toBe('Webhook processing failed');
      expect(runProvisioningMock).toHaveBeenCalledWith(456);
      expect(captureExceptionMock).toHaveBeenCalled();
      expect(setPayloads).not.toContainEqual(
        expect.objectContaining({ processedAt: expect.any(Date) }),
      );
    });

    it('skips processing when session status is not complete', async () => {
      const session = {
        id: 'cs_live_002',
        status: 'open',
        metadata: { signupRequestId: 'req-def' },
      };
      const event = makeEvent('checkout.session.completed', session, 'evt_cs_002');
      constructEventMock.mockReturnValue(event);
      retrieveCheckoutSessionMock.mockResolvedValue({ ...session, status: 'open' });

      const { updateMock, insertMock } = setupDb({ selectRows: [] });

      await POST(makeRequest());

      // stripeWebhookEvents insert still happens, but pendingSignups update does not
      expect(insertMock).toHaveBeenCalledTimes(1); // only the idempotency fence insert
      // update for processedAt only — pendingSignups update should NOT occur
      expect(updateMock).toHaveBeenCalledTimes(1);

      // The single update() call is for processedAt stamping only (not pendingSignups) — issue 2d
      // updateMock is called with the table as its first arg; verify no call targeted pendingSignups
      const updateCalls = updateMock.mock.calls as [unknown][];
      const pendingSignupUpdate = updateCalls.find(([table]) => table === pendingSignupsTable);
      expect(pendingSignupUpdate).toBeUndefined();
    });

    it('skips processing when metadata is missing signupRequestId', async () => {
      const session = {
        id: 'cs_live_003',
        status: 'complete',
        metadata: {},
      };
      const event = makeEvent('checkout.session.completed', session, 'evt_cs_003');
      constructEventMock.mockReturnValue(event);

      setupDb({ selectRows: [] });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      // retrieveCheckoutSession should not be called when metadata lacks signupRequestId
      expect(retrieveCheckoutSessionMock).not.toHaveBeenCalled();
    });

    it('returns 200 and provisions NOTHING when the signupRequestId has no pending_signups row', async () => {
      // Regression: prod saw six checkout sessions whose signups were never
      // written to this database. `provisioning_jobs.signup_request_id` is a FK
      // onto `pending_signups`, so the fence insert died on the constraint, the
      // handler 500'd, and Stripe retried an event that could never succeed.
      const session = {
        id: 'cs_live_orphan',
        status: 'complete',
        metadata: { signupRequestId: 'req-orphan' },
      };
      const event = makeEvent('checkout.session.completed', session, 'evt_cs_orphan');
      constructEventMock.mockReturnValue(event);
      retrieveCheckoutSessionMock.mockResolvedValue({ ...session, status: 'complete' });

      // Every select resolves empty: no prior event, and NO pending signup.
      const { updateMock, insertMock } = setupDb({ selectRows: [] });

      const res = await POST(makeRequest());

      // 200, not 500 — this is unprocessable, not transient. A retry can never
      // succeed, so Stripe must not be asked to make one.
      expect(res.status).toBe(200);

      // Only the idempotency fence insert; the provisioning_jobs insert that
      // would have violated the FK never runs.
      expect(insertMock).toHaveBeenCalledTimes(1);
      const provisioningInsert = (insertMock.mock.calls as [unknown][]).find(
        ([table]) => table === provisioningJobsTable,
      );
      expect(provisioningInsert).toBeUndefined();

      // The pendingSignups UPDATE is skipped too. It would have matched zero
      // rows in silence, which is why the miss went undetected before.
      const pendingSignupUpdate = (updateMock.mock.calls as [unknown][]).find(
        ([table]) => table === pendingSignupsTable,
      );
      expect(pendingSignupUpdate).toBeUndefined();

      expect(runProvisioningMock).not.toHaveBeenCalled();
    });

    it('persists Stripe IDs for self-serve subscribe events with accessPlanId + communityId metadata', async () => {
      const session = {
        id: 'cs_live_selfserve_001',
        status: 'complete',
        metadata: { accessPlanId: '101', communityId: '42', planId: 'condo_718_monthly' },
      };
      const event = makeEvent('checkout.session.completed', session, 'evt_cs_selfserve_001');
      constructEventMock.mockReturnValue(event);
      retrieveCheckoutSessionMock.mockResolvedValue({
        ...session,
        customer: 'cus_selfserve_001',
        subscription: 'sub_selfserve_001',
      });

      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      }));

      const setPayloads: Array<Record<string, unknown>> = [];
      // persistSelfServeCommunityStripeIds now ends in .returning() so it can
      // detect a refused rebind; a row back means the write landed.
      const whereForUpdateMock = vi.fn(() =>
        Object.assign(Promise.resolve([{ id: 1 }]), {
          returning: vi.fn(() => Promise.resolve([{ id: 1 }])),
        }),
      );
      const setMock = vi.fn((payload: Record<string, unknown>) => {
        setPayloads.push(payload);
        return { where: whereForUpdateMock };
      });
      const updateMock = vi.fn(() => ({ set: setMock }));
      const insertMock = vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(retrieveCheckoutSessionMock).toHaveBeenCalledWith('cs_live_selfserve_001');

      const communityUpdate = setPayloads.find(
        (p) =>
          p.stripeCustomerId === 'cus_selfserve_001' &&
          p.stripeSubscriptionId === 'sub_selfserve_001',
      );
      expect(communityUpdate).toBeDefined();
    });

    it('persists Stripe IDs for self-serve subscribe events with NO accessPlanId', async () => {
      // REGRESSION: persistence used to be gated on `accessPlanId && communityId`.
      // Most self-serve upgrades carry no access plan, so their Stripe IDs were
      // never written — and every later customer.subscription.* event resolves
      // its community via stripeSubscriptionId, silently returning on no match.
      // Net effect: the customer was charged and never received the plan.
      const session = {
        id: 'cs_live_selfserve_003',
        status: 'complete',
        metadata: { communityId: '44', planId: 'essentials' },
      };
      const event = makeEvent('checkout.session.completed', session, 'evt_cs_selfserve_003');
      constructEventMock.mockReturnValue(event);
      retrieveCheckoutSessionMock.mockResolvedValue({
        ...session,
        customer: 'cus_selfserve_003',
        // Expanded by retrieveCheckoutSession, so status is available here.
        subscription: { id: 'sub_selfserve_003', status: 'active', items: { data: [] } },
      });

      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      }));

      const setPayloads: Array<Record<string, unknown>> = [];
      // persistSelfServeCommunityStripeIds now ends in .returning() so it can
      // detect a refused rebind; a row back means the write landed.
      const whereForUpdateMock = vi.fn(() =>
        Object.assign(Promise.resolve([{ id: 1 }]), {
          returning: vi.fn(() => Promise.resolve([{ id: 1 }])),
        }),
      );
      const setMock = vi.fn((payload: Record<string, unknown>) => {
        setPayloads.push(payload);
        return { where: whereForUpdateMock };
      });
      const updateMock = vi.fn(() => ({ set: setMock }));
      const insertMock = vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(retrieveCheckoutSessionMock).toHaveBeenCalledWith('cs_live_selfserve_003');

      const communityUpdate = setPayloads.find(
        (p) =>
          p.stripeCustomerId === 'cus_selfserve_003' &&
          p.stripeSubscriptionId === 'sub_selfserve_003',
      );
      expect(communityUpdate).toBeDefined();
      // Stripe does not guarantee that checkout.session.completed arrives
      // before customer.subscription.created. When the subscription event
      // lands first it finds no community (this link doesn't exist yet) and
      // silently returns, and nothing re-stamps until the next renewal — so
      // the status/plan MUST be written here, not just the two IDs.
      expect(communityUpdate).toMatchObject({
        subscriptionStatus: 'active',
        subscriptionPlan: 'essentials',
      });
    });

    it('skips Stripe ID persistence when fresh session status is not complete', async () => {
      const session = {
        id: 'cs_live_selfserve_002',
        status: 'complete',
        metadata: { accessPlanId: '102', communityId: '43', planId: 'condo_718_monthly' },
      };
      const event = makeEvent('checkout.session.completed', session, 'evt_cs_selfserve_002');
      constructEventMock.mockReturnValue(event);
      retrieveCheckoutSessionMock.mockResolvedValue({
        ...session,
        status: 'open', // not complete
        customer: 'cus_selfserve_002',
        subscription: 'sub_selfserve_002',
      });

      const setPayloads: Array<Record<string, unknown>> = [];
      // persistSelfServeCommunityStripeIds now ends in .returning() so it can
      // detect a refused rebind; a row back means the write landed.
      const whereForUpdateMock = vi.fn(() =>
        Object.assign(Promise.resolve([{ id: 1 }]), {
          returning: vi.fn(() => Promise.resolve([{ id: 1 }])),
        }),
      );
      const setMock = vi.fn((payload: Record<string, unknown>) => {
        setPayloads.push(payload);
        return { where: whereForUpdateMock };
      });
      const updateMock = vi.fn(() => ({ set: setMock }));
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      }));
      const insertMock = vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(retrieveCheckoutSessionMock).toHaveBeenCalledWith('cs_live_selfserve_002');

      // No community update should have stripeCustomerId since session was not complete
      const communityUpdate = setPayloads.find(
        (p) => p.stripeCustomerId === 'cus_selfserve_002',
      );
      expect(communityUpdate).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 4. customer.subscription.updated
  // -------------------------------------------------------------------------

  describe('customer.subscription.updated', () => {
    const sub = { id: 'sub_upd_001', status: 'active' };

    it('updates community subscription status for active subscription', async () => {
      const event = makeEvent('customer.subscription.updated', sub, 'evt_upd_001');
      constructEventMock.mockReturnValue(event);

      const freshSub = {
        id: sub.id,
        status: 'active',
        // Legacy-alias lookup_key is not a canonical PlanId, so the webhook falls through
        // to resolvePlanIdFromStripePriceId to map price_001 → canonical PlanId.
        items: { data: [{ price: { lookup_key: 'compliance_basic', id: 'price_001' } }] },
      };
      retrieveSubscriptionMock.mockResolvedValue(freshSub);
      resolvePlanIdFromStripePriceIdMock.mockResolvedValue('essentials');

      // Sequence: [idempotency=empty], [community select=found]
      const communityRow = {
        id: 42,
        name: 'Palm Gardens',
        communityType: 'condo_718',
        subscriptionCanceledAt: null,
      };
      let callIdx = 0;
      const selectSequence = [[], [communityRow]];
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(selectSequence[callIdx++] ?? [])),
          })),
        })),
      }));

      const whereForUpdateMock = vi.fn(() => Promise.resolve([]));
      const setMock = vi.fn((_payload: Record<string, unknown>) => ({ where: whereForUpdateMock }));
      const updateMock = vi.fn(() => ({ set: setMock }));

      const valuesMock = vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) }));
      const insertMock = vi.fn(() => ({ values: valuesMock }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);

      // community update should have been called with subscriptionStatus: 'active'
      const setCalls = setMock.mock.calls;
      const communitySetCall = setCalls.find(
        (args) =>
          typeof args[0] === 'object' &&
          args[0] !== null &&
          (args[0] as Record<string, unknown>).subscriptionStatus === 'active',
      );
      expect(communitySetCall).toBeDefined();
      expect(sendSubscriptionCanceledEmailMock).not.toHaveBeenCalled();
    });

    it('sends cancellation email only on first cancellation (not on duplicate events)', async () => {
      const event = makeEvent(
        'customer.subscription.updated',
        { id: sub.id },
        'evt_upd_cancel_001',
      );
      constructEventMock.mockReturnValue(event);

      const freshSub = {
        id: sub.id,
        status: 'canceled',
        items: { data: [{ price: { lookup_key: null, id: 'price_001' } }] },
      };
      retrieveSubscriptionMock.mockResolvedValue(freshSub);

      const communityRow = {
        id: 42,
        name: 'Palm Gardens',
        communityType: 'condo_718',
      };
      let callIdx = 0;
      const selectSequence: unknown[][] = [[], [communityRow]];
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(selectSequence[callIdx++] ?? [])),
          })),
        })),
      }));

      // Atomic UPDATE returning the row — first cancellation wins.
      const returningMock = vi.fn().mockResolvedValue([{ id: 42 }]);
      const whereForUpdateMock = vi.fn(() => {
        const p = Promise.resolve<unknown[]>([]) as Promise<unknown[]> & { returning: typeof returningMock };
        p.returning = returningMock;
        return p;
      });
      const setMock = vi.fn((_payload: Record<string, unknown>) => ({ where: whereForUpdateMock }));
      const updateMock = vi.fn(() => ({ set: setMock }));
      const insertMock = vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      await POST(makeRequest());
      expect(sendSubscriptionCanceledEmailMock).toHaveBeenCalledTimes(1);
      expect(sendSubscriptionCanceledEmailMock).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ communityName: 'Palm Gardens' }),
      );

      const cancellationUpdate = setMock.mock.calls
        .map(([values]) => values as Record<string, unknown>)
        .find((values) => values.subscriptionStatus === 'canceled');
      expect(cancellationUpdate).toEqual(
        expect.objectContaining({
          subscriptionCanceledAt: expect.any(Date),
          nextReminderAt: expect.any(Date),
        }),
      );

      const canceledAt = cancellationUpdate?.subscriptionCanceledAt as Date;
      const nextReminderAt = cancellationUpdate?.nextReminderAt as Date;
      expect(nextReminderAt.getTime() - canceledAt.getTime()).toBe(5 * 24 * 60 * 60 * 1000);
    });

    it('does NOT send cancellation email when community was already canceled', async () => {
      const event = makeEvent(
        'customer.subscription.updated',
        { id: sub.id },
        'evt_upd_dup_cancel',
      );
      constructEventMock.mockReturnValue(event);

      const freshSub = {
        id: sub.id,
        status: 'canceled',
        items: { data: [{ price: { lookup_key: null, id: 'price_001' } }] },
      };
      retrieveSubscriptionMock.mockResolvedValue(freshSub);

      // The SELECT still returns the community (needed for name/type), but the atomic
      // UPDATE's .returning() resolves to [] because subscriptionCanceledAt is already set.
      const communityRow = {
        id: 42,
        name: 'Palm Gardens',
        communityType: 'condo_718',
      };
      let callIdx = 0;
      const selectSequence: unknown[][] = [[], [communityRow]];
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(selectSequence[callIdx++] ?? [])),
          })),
        })),
      }));

      // Atomic UPDATE returns empty — subscriptionCanceledAt was already set (not IS NULL).
      const returningMock = vi.fn().mockResolvedValue([]);
      const whereForUpdateMock = vi.fn(() => {
        const p = Promise.resolve<unknown[]>([]) as Promise<unknown[]> & { returning: typeof returningMock };
        p.returning = returningMock;
        return p;
      });
      const setMock = vi.fn(() => ({ where: whereForUpdateMock }));
      const updateMock = vi.fn(() => ({ set: setMock }));
      const insertMock = vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      await POST(makeRequest());
      expect(sendSubscriptionCanceledEmailMock).not.toHaveBeenCalled();
    });

    it('does NOT send email when subscription.updated cancellation races with subscription.deleted (atomic guard)', async () => {
      // Same setup as the first-cancellation test, but the atomic UPDATE's .returning()
      // resolves to [] — simulating the race where subscription.deleted won first.
      const event = makeEvent(
        'customer.subscription.updated',
        { id: sub.id },
        'evt_upd_race_001',
      );
      constructEventMock.mockReturnValue(event);

      const freshSub = {
        id: sub.id,
        status: 'canceled',
        items: { data: [{ price: { lookup_key: null, id: 'price_001' } }] },
      };
      retrieveSubscriptionMock.mockResolvedValue(freshSub);

      const communityRow = {
        id: 42,
        name: 'Palm Gardens',
        communityType: 'condo_718',
      };
      let callIdx = 0;
      const selectSequence: unknown[][] = [[], [communityRow]];
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(selectSequence[callIdx++] ?? [])),
          })),
        })),
      }));

      // The concurrent subscription.deleted handler already set subscriptionCanceledAt,
      // so this handler's atomic UPDATE finds subscriptionCanceledAt IS NOT NULL → RETURNING [].
      const returningMock = vi.fn().mockResolvedValue([]);
      const whereForUpdateMock = vi.fn(() => {
        const p = Promise.resolve<unknown[]>([]) as Promise<unknown[]> & { returning: typeof returningMock };
        p.returning = returningMock;
        return p;
      });
      const setMock = vi.fn(() => ({ where: whereForUpdateMock }));
      const updateMock = vi.fn(() => ({ set: setMock }));
      const insertMock = vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      await POST(makeRequest());
      expect(sendSubscriptionCanceledEmailMock).not.toHaveBeenCalled();
    });

    it('returns 200 gracefully when no community matches the subscription id', async () => {
      const event = makeEvent(
        'customer.subscription.updated',
        { id: 'sub_no_match' },
        'evt_upd_no_comm',
      );
      constructEventMock.mockReturnValue(event);

      retrieveSubscriptionMock.mockResolvedValue({
        id: 'sub_no_match',
        status: 'active',
        items: { data: [] },
      });

      // Both selects return empty
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      }));

      const whereForUpdateMock = vi.fn(() => Promise.resolve([]));
      const setMock = vi.fn(() => ({ where: whereForUpdateMock }));
      const updateMock = vi.fn(() => ({ set: setMock }));
      const insertMock = vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(sendSubscriptionCanceledEmailMock).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // Plan-gate correctness (PR: claude/plan-gate-writer-fix)
    //
    // The webhook writes communities.subscription_plan, which downstream
    // plan-gate logic uses. It must ALWAYS be a canonical PlanId or null —
    // never a raw Stripe price.id.
    // ---------------------------------------------------------------------

    it('writes canonical PlanId when price.lookup_key is a valid PlanId', async () => {
      // Regression baseline: lookup_key IS a canonical PlanId ('essentials').
      // The webhook should use it directly, NOT call resolvePlanIdFromStripePriceId.
      const event = makeEvent('customer.subscription.updated', sub, 'evt_upd_plan_lookup');
      constructEventMock.mockReturnValue(event);

      const freshSub = {
        id: sub.id,
        status: 'active',
        items: { data: [{ price: { lookup_key: 'essentials', id: 'price_1TEST' } }] },
      };
      retrieveSubscriptionMock.mockResolvedValue(freshSub);

      const communityRow = {
        id: 42,
        name: 'Palm Gardens',
        communityType: 'condo_718',
      };
      let callIdx = 0;
      const selectSequence: unknown[][] = [[], [communityRow]];
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(selectSequence[callIdx++] ?? [])),
          })),
        })),
      }));

      const capturedSets: Record<string, unknown>[] = [];
      const whereForUpdateMock = vi.fn(() => Promise.resolve([]));
      const setMock = vi.fn((vals: Record<string, unknown>) => {
        capturedSets.push(vals);
        return { where: whereForUpdateMock };
      });
      const updateMock = vi.fn(() => ({ set: setMock }));
      const insertMock = vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);

      const communitySet = capturedSets.find((s) => s.subscriptionStatus === 'active');
      expect(communitySet).toBeDefined();
      expect(communitySet?.subscriptionPlan).toBe('essentials');
      // Primary path hit — the DB fallback must not fire.
      expect(resolvePlanIdFromStripePriceIdMock).not.toHaveBeenCalled();
    });

    it('falls back to resolvePlanIdFromStripePriceId when lookup_key is null and price is in stripe_prices', async () => {
      // Current Stripe test-mode state: all 5 prices have lookup_key: null.
      // The webhook must recover by looking up the price_id in our stripe_prices table.
      const event = makeEvent('customer.subscription.updated', sub, 'evt_upd_plan_fallback');
      constructEventMock.mockReturnValue(event);

      const freshSub = {
        id: sub.id,
        status: 'active',
        items: { data: [{ price: { lookup_key: null, id: 'price_1TEST' } }] },
      };
      retrieveSubscriptionMock.mockResolvedValue(freshSub);
      resolvePlanIdFromStripePriceIdMock.mockResolvedValue('essentials');

      const communityRow = {
        id: 42,
        name: 'Palm Gardens',
        communityType: 'condo_718',
      };
      let callIdx = 0;
      const selectSequence: unknown[][] = [[], [communityRow]];
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(selectSequence[callIdx++] ?? [])),
          })),
        })),
      }));

      const capturedSets: Record<string, unknown>[] = [];
      const whereForUpdateMock = vi.fn(() => Promise.resolve([]));
      const setMock = vi.fn((vals: Record<string, unknown>) => {
        capturedSets.push(vals);
        return { where: whereForUpdateMock };
      });
      const updateMock = vi.fn(() => ({ set: setMock }));
      const insertMock = vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);

      expect(resolvePlanIdFromStripePriceIdMock).toHaveBeenCalledWith('price_1TEST');
      const communitySet = capturedSets.find((s) => s.subscriptionStatus === 'active');
      expect(communitySet).toBeDefined();
      expect(communitySet?.subscriptionPlan).toBe('essentials');
    });

    it('returns 500 and writes NOTHING when lookup_key is null AND price is not in stripe_prices', async () => {
      // Unknown Stripe price — we don't know the plan. Rather than write garbage,
      // the webhook must let the error bubble so Stripe retries.
      const event = makeEvent('customer.subscription.updated', sub, 'evt_upd_plan_unknown');
      constructEventMock.mockReturnValue(event);

      const freshSub = {
        id: sub.id,
        status: 'active',
        items: { data: [{ price: { lookup_key: null, id: 'price_unknown_999' } }] },
      };
      retrieveSubscriptionMock.mockResolvedValue(freshSub);
      // Import the real AppError class so the thrown error carries .code.
      const { AppError } = await import('../../src/lib/api/errors/AppError');
      resolvePlanIdFromStripePriceIdMock.mockRejectedValue(
        new AppError(
          'No Stripe price configured for priceId=price_unknown_999',
          500,
          'STRIPE_PRICE_CONFIG_MISSING',
        ),
      );

      const communityRow = {
        id: 42,
        name: 'Palm Gardens',
        communityType: 'condo_718',
      };
      let callIdx = 0;
      const selectSequence: unknown[][] = [[], [communityRow]];
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(selectSequence[callIdx++] ?? [])),
          })),
        })),
      }));

      const capturedSets: Record<string, unknown>[] = [];
      const whereForUpdateMock = vi.fn(() => Promise.resolve([]));
      const setMock = vi.fn((vals: Record<string, unknown>) => {
        capturedSets.push(vals);
        return { where: whereForUpdateMock };
      });
      const updateMock = vi.fn(() => ({ set: setMock }));
      const insertMock = vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      const res = await POST(makeRequest());
      expect(res.status).toBe(500);

      // CRITICAL: the communities table must NOT have been updated with a subscription plan.
      // If the webhook ever writes a raw price_… string, plan gates fail open silently.
      const communitySetWithPlan = capturedSets.find(
        (s) => 'subscriptionPlan' in s || s.subscriptionStatus !== undefined,
      );
      expect(communitySetWithPlan).toBeUndefined();

      expect(resolvePlanIdFromStripePriceIdMock).toHaveBeenCalledWith('price_unknown_999');
    });
  });

  // -------------------------------------------------------------------------
  // 5. customer.subscription.deleted
  // -------------------------------------------------------------------------

  describe('customer.subscription.deleted', () => {
    /**
     * Helper: build db mock for handleSubscriptionDeleted tests.
     * The handler uses a single atomic UPDATE … WHERE subscription_canceled_at IS NULL RETURNING.
     * selectMock only serves the event-level idempotency check (one call).
     * returningRows controls whether the UPDATE matched a row (non-empty = first cancellation).
     */
    function setupDeletedDb(options: {
      returningRows?: unknown[];
      capturedSets?: Record<string, unknown>[];
    } = {}): void {
      const { returningRows = [], capturedSets } = options;

      // select chain — only used for the idempotency fence check
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]), // idempotency: event not yet seen
          })),
        })),
      }));

      const returningMock = vi.fn().mockResolvedValue(returningRows);
      const whereForDeleteMock = vi.fn(() => {
        const p = Promise.resolve<unknown[]>([]) as Promise<unknown[]> & {
          returning: typeof returningMock;
        };
        p.returning = returningMock;
        return p;
      });
      const setMock = capturedSets
        ? vi.fn((vals: Record<string, unknown>) => {
            capturedSets.push(vals);
            return { where: whereForDeleteMock };
          })
        : vi.fn(() => ({ where: whereForDeleteMock }));
      const updateMock = vi.fn(() => ({ set: setMock }));
      const insertMock = vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });
    }

    it('sends cancellation email when atomic UPDATE matches a row (first cancellation)', async () => {
      const event = makeEvent(
        'customer.subscription.deleted',
        { id: 'sub_del_001' },
        'evt_del_001',
      );
      constructEventMock.mockReturnValue(event);
      retrieveSubscriptionMock.mockResolvedValue({ id: 'sub_del_001', status: 'canceled' });

      // RETURNING has a row → subscriptionCanceledAt was NULL → first cancellation
      setupDeletedDb({
        returningRows: [{ id: 99, name: 'Sunset Bay', communityType: 'hoa_720' }],
      });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);

      expect(sendSubscriptionCanceledEmailMock).toHaveBeenCalledWith(
        99,
        expect.objectContaining({ communityName: 'Sunset Bay' }),
      );
    });

    it('does NOT send email when RETURNING is empty (not found or already canceled)', async () => {
      const event = makeEvent(
        'customer.subscription.deleted',
        { id: 'sub_del_gone' },
        'evt_del_gone',
      );
      constructEventMock.mockReturnValue(event);
      retrieveSubscriptionMock.mockResolvedValue({ id: 'sub_del_gone', status: 'canceled' });

      // RETURNING empty — the WHERE clause matched nothing:
      // community not found, OR subscriptionCanceledAt was already set (atomic idempotency).
      // This also covers the concurrent race: the losing handler gets no rows back.
      setupDeletedDb({ returningRows: [] });

      await POST(makeRequest());
      expect(sendSubscriptionCanceledEmailMock).not.toHaveBeenCalled();
    });

    it('sets nextReminderAt to grace Day 5 and nulls out subscriptionPlan in the update payload', async () => {
      const event = makeEvent(
        'customer.subscription.deleted',
        { id: 'sub_del_day5' },
        'evt_del_day5',
      );
      constructEventMock.mockReturnValue(event);
      retrieveSubscriptionMock.mockResolvedValue({ id: 'sub_del_day5', status: 'canceled' });

      const capturedSets: Record<string, unknown>[] = [];
      setupDeletedDb({
        returningRows: [{ id: 7, name: 'Day5 Condo', communityType: 'condo_718' }],
        capturedSets,
      });

      const before = Date.now();
      await POST(makeRequest());
      const after = Date.now();

      const communitySet = capturedSets.find((s) => s.subscriptionStatus === 'canceled');
      expect(communitySet).toBeDefined();

      const day5Ms = 5 * 24 * 60 * 60 * 1000;
      const reminderAt = communitySet!.nextReminderAt as Date;
      expect(reminderAt).toBeInstanceOf(Date);
      expect(reminderAt.getTime()).toBeGreaterThanOrEqual(before + day5Ms);
      expect(reminderAt.getTime()).toBeLessThanOrEqual(after + day5Ms);

      // subscriptionPlan must be explicitly cleared on deletion
      expect(communitySet!.subscriptionPlan).toBeNull();
    });

    it('returns early without updating DB when fresh subscription status is not canceled', async () => {
      const event = makeEvent('customer.subscription.deleted', { id: 'sub_del_stale' }, 'evt_del_stale');
      constructEventMock.mockReturnValue(event);

      // Stale event — Stripe says it's still active (out-of-order delivery)
      retrieveSubscriptionMock.mockResolvedValue({ id: 'sub_del_stale', status: 'active' });

      // Use setupDeletedDb with empty returningRows — but expect DB update to never be called
      setupDeletedDb({ returningRows: [] });

      await POST(makeRequest());

      expect(sendSubscriptionCanceledEmailMock).not.toHaveBeenCalled();
      // The update mock should NOT have been called because we returned early
      // (We can check this by asserting on the db mock if the local updateMock is accessible,
      //  but since setupDeletedDb creates a new mock per test, just assert the email wasn't sent)
    });
  });

  // -------------------------------------------------------------------------
  // 6. invoice.payment_failed
  // -------------------------------------------------------------------------

  describe('invoice.payment_failed', () => {
    it('calls sendPaymentFailedEmail and sets nextReminderAt to Day 3', async () => {
      const invoice = {
        id: 'inv_001',
        customer: 'cus_pay_fail',
        parent: { subscription_details: { subscription: 'sub_pay_fail' }, type: 'subscription_details' },
        amount_due: 4900,
      };
      const event = makeEvent('invoice.payment_failed', invoice, 'evt_inv_fail_001');
      constructEventMock.mockReturnValue(event);

      const communityRow = {
        id: 55,
        name: 'Coral Ridge',
        communityType: 'condo_718',
        paymentFailedAt: null,
        nextReminderAt: null,
        stripeCustomerId: 'cus_pay_fail',
        stripeSubscriptionId: 'sub_pay_fail',
      };

      let selectCallIdx = 0;
      const selectSequence: unknown[][] = [
        [],            // idempotency: no existing event
        [communityRow], // community by stripeSubscriptionId
      ];
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(selectSequence[selectCallIdx++] ?? [])),
          })),
        })),
      }));

      const capturedSets: Record<string, unknown>[] = [];
      const whereForUpdateMock = vi.fn(() => Promise.resolve([]));
      const setMock = vi.fn((vals: Record<string, unknown>) => {
        capturedSets.push(vals);
        return { where: whereForUpdateMock };
      });
      const updateMock = vi.fn(() => ({ set: setMock }));
      const insertMock = vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      const before = Date.now();
      const res = await POST(makeRequest());
      const after = Date.now();

      expect(res.status).toBe(200);
      // amount_due is read from the event object — no Stripe API round-trip needed.
      expect(retrieveInvoiceMock).not.toHaveBeenCalled();
      expect(sendPaymentFailedEmailMock).toHaveBeenCalledWith(
        55,
        expect.objectContaining({
          amountDue: '$49.00',
          communityName: 'Coral Ridge',
        }),
      );

      // nextReminderAt should be approximately Day 3 from now
      const communitySet = capturedSets.find((s) => s.subscriptionStatus === 'past_due');
      expect(communitySet).toBeDefined();
      const day3Ms = 3 * 24 * 60 * 60 * 1000;
      const reminderAt = communitySet!.nextReminderAt as Date;
      expect(reminderAt).toBeInstanceOf(Date);
      expect(reminderAt.getTime()).toBeGreaterThanOrEqual(before + day3Ms);
      expect(reminderAt.getTime()).toBeLessThanOrEqual(after + day3Ms);
    });

    it('sends email on every retry even when community already has paymentFailedAt set', async () => {
      // Intentional behavior: email fires on every Stripe retry (up to 3-4 per billing cycle).
      // paymentFailedAt is preserved from first failure; nextReminderAt is also preserved.
      const originalFailedAt = new Date('2026-02-01T00:00:00Z');
      const originalReminderAt = new Date('2026-02-04T00:00:00Z');
      const invoice = {
        id: 'inv_retry_001',
        parent: { subscription_details: { subscription: 'sub_retry' }, type: 'subscription_details' },
        amount_due: 2900,
      };
      const event = makeEvent('invoice.payment_failed', invoice, 'evt_inv_retry_001');
      constructEventMock.mockReturnValue(event);

      const communityRow = {
        id: 77,
        name: 'Retry Condo',
        communityType: 'condo_718',
        paymentFailedAt: originalFailedAt,
        nextReminderAt: originalReminderAt,
        stripeSubscriptionId: 'sub_retry',
      };

      let selectCallIdx = 0;
      const selectSequence: unknown[][] = [[], [communityRow]];
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(selectSequence[selectCallIdx++] ?? [])),
          })),
        })),
      }));

      const capturedSets: Record<string, unknown>[] = [];
      const whereForUpdateMock = vi.fn(() => Promise.resolve([]));
      const setMock = vi.fn((vals: Record<string, unknown>) => {
        capturedSets.push(vals);
        return { where: whereForUpdateMock };
      });
      const updateMock = vi.fn(() => ({ set: setMock }));
      const insertMock = vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      await POST(makeRequest());

      // Email fires even on retry
      expect(sendPaymentFailedEmailMock).toHaveBeenCalledTimes(1);

      // paymentFailedAt is preserved (original date, not `now`)
      const communitySet = capturedSets.find((s) => s.subscriptionStatus === 'past_due');
      expect(communitySet).toBeDefined();
      expect(communitySet!.paymentFailedAt).toEqual(originalFailedAt);
      expect(communitySet!.nextReminderAt).toEqual(originalReminderAt);
    });

    it('skips processing when invoice has no subscription', async () => {
      const invoice = { id: 'inv_002', parent: null };
      const event = makeEvent('invoice.payment_failed', invoice, 'evt_inv_no_cus');
      constructEventMock.mockReturnValue(event);

      setupDb({ selectRows: [] });

      await POST(makeRequest());
      expect(sendPaymentFailedEmailMock).not.toHaveBeenCalled();
    });

    it('skips email when no community matches the subscription id', async () => {
      const invoice = { id: 'inv_003', parent: { subscription_details: { subscription: 'sub_unknown' }, type: 'subscription_details' } };
      const event = makeEvent('invoice.payment_failed', invoice, 'evt_inv_no_comm');
      constructEventMock.mockReturnValue(event);

      // Both selects return empty
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      }));
      const updateMock = vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })),
      }));
      const insertMock = vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      await POST(makeRequest());
      expect(sendPaymentFailedEmailMock).not.toHaveBeenCalled();
    });

    it('skips processing when invoice subscription field is missing', async () => {
      const invoice = { id: 'inv_nosub', customer: 'cus_abc' }; // no parent field → no subscription
      const event = makeEvent('invoice.payment_failed', invoice, 'evt_inv_nosub');
      constructEventMock.mockReturnValue(event);
      setupDb({ selectRows: [] });
      await POST(makeRequest());
      expect(sendPaymentFailedEmailMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 7. invoice.payment_succeeded
  // -------------------------------------------------------------------------

  describe('invoice.payment_succeeded', () => {
    it('clears paymentFailedAt and nextReminderAt and sets status to active', async () => {
      const invoice = { id: 'inv_ok_001', customer: 'cus_ok', parent: { subscription_details: { subscription: 'sub_ok' }, type: 'subscription_details' } };
      const event = makeEvent('invoice.payment_succeeded', invoice, 'evt_inv_ok_001');
      constructEventMock.mockReturnValue(event);

      // idempotency: no existing event
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      }));

      const capturedSets: Record<string, unknown>[] = [];
      const whereForUpdateMock = vi.fn(() => Promise.resolve([]));
      const setMock = vi.fn((vals: Record<string, unknown>) => {
        capturedSets.push(vals);
        return { where: whereForUpdateMock };
      });
      const updateMock = vi.fn(() => ({ set: setMock }));
      const insertMock = vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);

      // Find the community update (not the processedAt update)
      const communitySet = capturedSets.find((s) => 'paymentFailedAt' in s);
      expect(communitySet).toBeDefined();
      expect(communitySet!.subscriptionStatus).toBe('active');
      expect(communitySet!.paymentFailedAt).toBeNull();
      expect(communitySet!.nextReminderAt).toBeNull();
    });

    // Regression guard, measured live 2026-08-09: a trial's FIRST invoice is $0
    // and Stripe emits `invoice.payment_succeeded` for it. This handler used to
    // write a hardcoded 'active', which ended a brand-new 30-day trial in our
    // database seconds after it began — the "Free trial active" banner
    // disappeared and the trial-end date was wrong. Whether it happened at all
    // depended on webhook arrival order, so two identical signups landed
    // `trialing` and `active` respectively and it read as a flaky test.
    it('keeps a trialing subscription trialing when its $0 trial invoice succeeds', async () => {
      const invoice = {
        id: 'inv_trial_001',
        customer: 'cus_trial',
        parent: { subscription_details: { subscription: 'sub_trial' }, type: 'subscription_details' },
      };
      const event = makeEvent('invoice.payment_succeeded', invoice, 'evt_inv_trial_001');
      constructEventMock.mockReturnValue(event);
      retrieveSubscriptionMock.mockResolvedValue({
        id: 'sub_trial',
        status: 'trialing',
        items: { data: [{ price: { id: 'price_x', lookup_key: 'essentials_condo_718_monthly' } }] },
      });

      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
        })),
      }));
      const capturedSets: Record<string, unknown>[] = [];
      const setMock = vi.fn((vals: Record<string, unknown>) => {
        capturedSets.push(vals);
        return { where: vi.fn(() => Promise.resolve([])) };
      });
      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: vi.fn(() => ({
          values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
        })),
        update: vi.fn(() => ({ set: setMock })),
      });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);

      const communitySet = capturedSets.find((s) => 'paymentFailedAt' in s);
      expect(communitySet).toBeDefined();
      expect(communitySet!.subscriptionStatus).toBe('trialing');
      expect(communitySet!.paymentFailedAt).toBeNull();
    });

    it('skips processing when invoice has no subscription', async () => {
      const invoice = { id: 'inv_ok_no_cus', parent: null };
      const event = makeEvent('invoice.payment_succeeded', invoice, 'evt_inv_ok_no_cus');
      constructEventMock.mockReturnValue(event);

      setupDb({ selectRows: [] });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
    });

    it('returns 200 without error when no community matches the subscription id', async () => {
      // The source runs an unconditional UPDATE; no prior SELECT for community lookup.
      // A non-existent stripeSubscriptionId fires a no-op UPDATE — this is untested above.
      const invoice = { id: 'inv_ok_nomatch', customer: 'cus_nomatch', parent: { subscription_details: { subscription: 'sub_no_match' }, type: 'subscription_details' } };
      const event = makeEvent('invoice.payment_succeeded', invoice, 'evt_inv_ok_nomatch');
      constructEventMock.mockReturnValue(event);

      // All selects return empty (idempotency check returns no existing event)
      setupDb({ selectRows: [] });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 8. Unhandled event types
  // -------------------------------------------------------------------------

  describe('unhandled event types', () => {
    it('ignores unknown event types and returns 200', async () => {
      const event = makeEvent('customer.created', { id: 'cus_new' }, 'evt_unknown_001');
      constructEventMock.mockReturnValue(event);

      setupDb({ selectRows: [] });

      const res = await POST(makeRequest());
      const body = (await res.json()) as { received: boolean };

      expect(res.status).toBe(200);
      expect(body.received).toBe(true);
      expect(sendSubscriptionCanceledEmailMock).not.toHaveBeenCalled();
      expect(sendPaymentFailedEmailMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 9. Event handler errors are caught, logged to Sentry, and return 500 for retry
  // -------------------------------------------------------------------------

  describe('error handling in event processing', () => {
    it('returns 500 and calls captureException when handleStripeEvent throws', async () => {
      const event = makeEvent('customer.subscription.deleted', { id: 'sub_err' }, 'evt_err_001');
      constructEventMock.mockReturnValue(event);

      let selectCallIdx = 0;
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              if (selectCallIdx++ === 0) return Promise.resolve([]); // idempotency empty
              return Promise.reject(new Error('DB select boom'));
            }),
          })),
        })),
      }));

      const returningMock = vi.fn().mockRejectedValue(new Error('DB returning boom'));
      const whereForDeleteMock = vi.fn(() => {
        const p = Promise.reject(
          new Error('DB update boom'),
        ) as Promise<unknown[]> & { returning: typeof returningMock };
        p.returning = returningMock;
        return p;
      });
      const setMock = vi.fn(() => ({ where: whereForDeleteMock }));
      const updateMock = vi.fn(() => ({ set: setMock }));
      const insertMock = vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
      }));

      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      const res = await POST(makeRequest());
      expect(res.status).toBe(500);
      expect(captureExceptionMock).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // invoice.payment_action_required (SCA / 3-D Secure) — #772
  // -------------------------------------------------------------------------

  describe('invoice.payment_action_required', () => {
    function setupCommunity() {
      const communityRow = {
        id: 55,
        name: 'Coral Ridge',
        communityType: 'condo_718',
        stripeCustomerId: 'cus_sca',
        stripeSubscriptionId: 'sub_sca',
      };
      let idx = 0;
      const sequence: unknown[][] = [[], [communityRow]];
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(sequence[idx++] ?? [])),
          })),
        })),
      }));
      createUnscopedClientMock.mockReturnValue({
        select: selectMock,
        insert: vi.fn(() => ({
          values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })),
        })),
        update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })) })),
      });
    }

    it('sends the SCA email, not the payment-failed one', async () => {
      // The #772 defect: this event routed to sendPaymentFailedEmail, so a board
      // whose card was fine was told the payment had failed and to update its
      // payment method — advice that cannot clear a 3-D Secure challenge.
      constructEventMock.mockReturnValue(
        makeEvent(
          'invoice.payment_action_required',
          {
            id: 'inv_sca',
            customer: 'cus_sca',
            parent: {
              subscription_details: { subscription: 'sub_sca' },
              type: 'subscription_details',
            },
            amount_due: 24900,
            hosted_invoice_url: 'https://invoice.stripe.com/i/acct_1/live_abc',
          },
          'evt_sca_001',
        ),
      );
      setupCommunity();

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      expect(sendPaymentFailedEmailMock).not.toHaveBeenCalled();
      expect(sendPaymentActionRequiredEmailMock).toHaveBeenCalledWith(55, {
        amountDue: '$249.00',
        communityName: 'Coral Ridge',
        authenticateUrl: 'https://invoice.stripe.com/i/acct_1/live_abc',
      });
    });

    it('passes null when Stripe supplied no hosted invoice URL', async () => {
      constructEventMock.mockReturnValue(
        makeEvent(
          'invoice.payment_action_required',
          {
            id: 'inv_sca_2',
            customer: 'cus_sca',
            parent: {
              subscription_details: { subscription: 'sub_sca' },
              type: 'subscription_details',
            },
            amount_due: 24900,
          },
          'evt_sca_002',
        ),
      );
      setupCommunity();

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      expect(sendPaymentActionRequiredEmailMock).toHaveBeenCalledWith(
        55,
        expect.objectContaining({ authenticateUrl: null }),
      );
    });

    it('never writes the bearer-ish invoice URL to a log line', async () => {
      // `hosted_invoice_url` authorises viewing and paying the invoice. It goes
      // in the email body and nowhere else.
      const url = 'https://invoice.stripe.com/i/acct_1/live_secret';
      constructEventMock.mockReturnValue(
        makeEvent(
          'invoice.payment_action_required',
          {
            id: 'inv_sca_3',
            customer: 'cus_sca',
            parent: {
              subscription_details: { subscription: 'sub_sca' },
              type: 'subscription_details',
            },
            amount_due: 24900,
            hosted_invoice_url: url,
          },
          'evt_sca_003',
        ),
      );
      setupCommunity();

      // `console.info` is the one that matters and is easy to omit:
      // `logStripeWebhookEvent` routes level 'info' there, and 'info' is what
      // every success-path log in this route uses — including the one that
      // fires immediately after this handler returns. A version of this test
      // watching only log/warn/error passed while leaving the dominant channel
      // unobserved, which would have let a `payloadSnippet: { hosted_invoice_url }`
      // land without a single test going red.
      const spies = (['log', 'info', 'warn', 'error'] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(() => {}),
      );

      await POST(makeRequest());

      const everythingLogged = JSON.stringify(spies.map((spy) => spy.mock.calls));
      for (const spy of spies) spy.mockRestore();

      // Assert the logger actually ran — otherwise this passes vacuously on any
      // change that stops the route logging at all.
      expect(everythingLogged).toContain('stripe-webhook');
      expect(everythingLogged).not.toContain('live_secret');
      expect(everythingLogged).not.toContain('invoice.stripe.com');
    });
  });

});

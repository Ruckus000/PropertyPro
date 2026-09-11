/**
 * The five action routes and the two read routes.
 *
 * The single most important assertion in this file is that a request WITHOUT
 * `confirm: true` never reaches the action. It is asserted for all five, and in
 * each case "the action was not called" is checked BEFORE the status code — a 400
 * that had already changed a live subscription is a far worse failure than a
 * wrong status, and an assertion order that reported the status first would name
 * the lesser harm when it broke.
 *
 * `confirm` is a LITERAL `true`, not a truthy check: `1`, `'true'` and `'yes'` are
 * each what an accidental or machine-generated request looks like, and each is
 * rejected here.
 *
 * The action functions are mocked, so nothing in this file constructs a Stripe
 * client or asserts the mode — that is `billing-actions.test.ts`. What is asserted
 * here is the envelope: which audit action, which community id, and that
 * `oldValues`/`newValues` carry the action's own before/after rather than a
 * request echo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(async () => ({
    id: 'u',
    email: 'admin@propertypro.test',
    role: 'super_admin' as const,
  })),
  // Parameter typed rather than inferred: `mock.calls[n][0]` on a zero-argument
  // `vi.fn` is index 0 of an empty tuple, which is a type error — and casting
  // past it would also hide a call that genuinely passed nothing.
  logAdminAction: vi.fn(async (_params: Record<string, unknown>) => {}),
  changePlan: vi.fn(async () => ({
    subscriptionId: 'sub_1',
    before: { plan: 'essentials', priceId: 'price_ess_m' },
    after: { plan: 'professional', priceId: 'price_pro_m', interval: 'month' },
  })),
  extendTrial: vi.fn(async () => ({
    subscriptionId: 'sub_1',
    before: { trialEndsAt: null },
    after: { trialEndsAt: '2026-09-22T00:00:00.000Z', daysAdded: 14 },
  })),
  applyCoupon: vi.fn(async () => ({
    subscriptionId: 'sub_1',
    before: { coupon: null },
    after: { coupon: 'SUMMER' },
  })),
  pauseSubscription: vi.fn(async () => ({
    subscriptionId: 'sub_1',
    before: { paused: false },
    after: { paused: true },
  })),
  cancelSubscription: vi.fn(async () => ({
    subscriptionId: 'sub_1',
    before: { cancelAtPeriodEnd: false, canceled: false },
    after: { cancelAtPeriodEnd: true, canceled: false },
  })),
  getBillingOverview: vi.fn(async () => ({
    rows: [
      { status: 'active', communityId: 1, stripeSubscriptionId: 'sub_1' },
      { status: 'past_due', communityId: 2, stripeSubscriptionId: 'sub_2' },
    ],
    kpis: { mrrCents: 24_000, mrrDeltaPct: null, pastDueCents: 9_900, trialsEnding14d: 0, couponsActive: 0 },
    series: [],
    syncedAt: '2026-09-11T00:00:00.000Z',
    truncated: false,
  })),
  getCommunityBilling: vi.fn(async () => ({
    row: null,
    invoices: [],
    timeline: [],
    stripeDashboardUrl: 'https://dashboard.stripe.com/test/subscriptions',
    livemode: false,
  })),
}));

vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: h.requirePlatformAdmin }));
vi.mock('@/lib/audit/log-admin-action', () => ({ logAdminAction: h.logAdminAction }));
vi.mock('@/lib/server/billing-actions', () => ({
  changePlan: h.changePlan,
  extendTrial: h.extendTrial,
  applyCoupon: h.applyCoupon,
  pauseSubscription: h.pauseSubscription,
  cancelSubscription: h.cancelSubscription,
}));
vi.mock('@/lib/server/billing', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/server/billing')>('@/lib/server/billing');
  return {
    ...actual,
    getBillingOverview: h.getBillingOverview,
    getCommunityBilling: h.getCommunityBilling,
  };
});

import { POST as applyCouponRoute } from '@/app/api/admin/communities/[id]/billing/apply-coupon/route';
import { POST as cancelRoute } from '@/app/api/admin/communities/[id]/billing/cancel/route';
import { POST as changePlanRoute } from '@/app/api/admin/communities/[id]/billing/change-plan/route';
import { POST as extendTrialRoute } from '@/app/api/admin/communities/[id]/billing/extend-trial/route';
import { POST as pauseRoute } from '@/app/api/admin/communities/[id]/billing/pause/route';
import { GET as communityBillingRoute } from '@/app/api/admin/communities/[id]/billing/route';
import { GET as subscriptionsRoute } from '@/app/api/admin/billing/subscriptions/route';

const req = (body: unknown) =>
  new NextRequest('http://admin.test/x', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

const params = (id = '1') => ({ params: Promise.resolve({ id }) });

/** The five, each with a payload that is valid APART from the confirmation. */
const ACTIONS = [
  ['change-plan', changePlanRoute, { planId: 'professional' }, () => h.changePlan] as const,
  ['extend-trial', extendTrialRoute, { days: 14 }, () => h.extendTrial] as const,
  ['apply-coupon', applyCouponRoute, { coupon: 'SUMMER' }, () => h.applyCoupon] as const,
  ['pause', pauseRoute, { resume: false }, () => h.pauseSubscription] as const,
  ['cancel', cancelRoute, { atPeriodEnd: true }, () => h.cancelSubscription] as const,
];

beforeEach(() => {
  h.requirePlatformAdmin.mockResolvedValue({
    id: 'u',
    email: 'admin@propertypro.test',
    role: 'super_admin' as const,
  });
});

describe('the confirm gate', () => {
  it.each(ACTIONS)('%s rejects a MISSING confirm before calling Stripe', async (_n, route, body, action) => {
    const response = await route(req(body), params());

    // Harm first: a refusal that already ran the action is not a refusal.
    expect(action()).not.toHaveBeenCalled();
    expect(h.logAdminAction).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });

  it.each(ACTIONS)('%s rejects a TRUTHY confirm — it is a literal, not a truthiness test', async (_n, route, body, action) => {
    for (const confirm of [1, 'true', 'yes', {}, [true]]) {
      const response = await route(req({ ...body, confirm }), params());
      expect(action()).not.toHaveBeenCalled();
      expect(response.status).toBe(400);
    }
  });

  it.each(ACTIONS)('%s rejects an explicit confirm: false', async (_n, route, body, action) => {
    const response = await route(req({ ...body, confirm: false }), params());
    expect(action()).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });

  it('names the confirmation in the 400 body, so a caller can fix it', async () => {
    const response = await cancelRoute(req({ atPeriodEnd: true }), params());
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toMatch(/confirm: true/);
  });
});

describe('input validation', () => {
  it('rejects an unknown field rather than ignoring it', async () => {
    // `at_period_end` instead of `atPeriodEnd` would otherwise leave the real
    // field undefined — and the two outcomes are "at the end of the period" and
    // "right now".
    const response = await cancelRoute(req({ confirm: true, at_period_end: true }), params());
    expect(h.cancelSubscription).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });

  it('rejects a trial extension that is not 7, 14 or 30 days', async () => {
    for (const days of [1, 90, 365, '14']) {
      const response = await extendTrialRoute(req({ confirm: true, days }), params());
      expect(h.extendTrial).not.toHaveBeenCalled();
      expect(response.status).toBe(400);
    }
  });

  it('rejects a coupon id with characters that do not belong in an idempotency key', async () => {
    for (const coupon of ['SUM MER', 'SUMMER\n', 'a'.repeat(101), '']) {
      const response = await applyCouponRoute(req({ confirm: true, coupon }), params());
      expect(h.applyCoupon).not.toHaveBeenCalled();
      expect(response.status).toBe(400);
    }
  });

  it('requires an explicit direction on pause and cancel — no default', async () => {
    expect((await pauseRoute(req({ confirm: true }), params())).status).toBe(400);
    expect((await cancelRoute(req({ confirm: true }), params())).status).toBe(400);
    expect(h.pauseSubscription).not.toHaveBeenCalled();
    expect(h.cancelSubscription).not.toHaveBeenCalled();
  });

  it.each(ACTIONS)('%s rejects a non-numeric community id', async (_n, route, body, action) => {
    const response = await route(req({ ...body, confirm: true }), params('../../etc'));
    expect(action()).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });

  it('rejects malformed JSON as a 400, not a 500', async () => {
    const bad = new NextRequest('http://admin.test/x', {
      method: 'POST',
      body: '{ not json',
      headers: { 'content-type': 'application/json' },
    });
    expect((await cancelRoute(bad, params())).status).toBe(400);
    expect(h.cancelSubscription).not.toHaveBeenCalled();
  });
});

describe('the happy path and its audit row', () => {
  it('cancels and audits with community_id', async () => {
    const res = await cancelRoute(req({ confirm: true, atPeriodEnd: true }), params());

    expect(res.status).toBe(200);
    expect(h.cancelSubscription).toHaveBeenCalledWith(1, { atPeriodEnd: true });
    expect(h.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription_canceled',
        communityId: 1,
        resourceType: 'subscription',
        resourceId: 'sub_1',
        newValues: expect.objectContaining({ cancelAtPeriodEnd: true }),
      }),
    );
    expect(await res.json()).toEqual({
      data: { after: { cancelAtPeriodEnd: true, canceled: false } },
    });
  });

  it.each([
    ['change-plan', changePlanRoute, { planId: 'professional' }, 'subscription_plan_changed'],
    ['extend-trial', extendTrialRoute, { days: 14 }, 'subscription_trial_extended'],
    ['apply-coupon', applyCouponRoute, { coupon: 'SUMMER' }, 'subscription_coupon_applied'],
    ['pause', pauseRoute, { resume: false }, 'subscription_paused'],
    // A RESUME is not a pause. One route, one Stripe field, two audit actions —
    // `platform_admin_audit_log` is append-only, so a row filed under the wrong
    // name is permanent, and `where action = 'subscription_paused'` returning
    // resumes is a query nobody can fix afterwards.
    ['pause (resume)', pauseRoute, { resume: true }, 'subscription_resumed'],
    ['cancel', cancelRoute, { atPeriodEnd: true }, 'subscription_canceled'],
  ])('%s records its own audit action', async (_n, route, body, auditAction) => {
    const res = await route(req({ ...body, confirm: true }), params('42'));

    expect(res.status).toBe(200);
    expect(h.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: auditAction, communityId: 42 }),
    );
  });

  it('audits the ACTION’s before/after, not the request body', async () => {
    await changePlanRoute(req({ confirm: true, planId: 'professional' }), params());

    const payload = h.logAdminAction.mock.calls.at(-1)![0];
    // `before.plan` is `essentials` — a value that appears nowhere in the request.
    // Echoing the request would record the intent rather than the change.
    expect(payload.oldValues).toEqual({ plan: 'essentials', priceId: 'price_ess_m' });
    expect(payload.newValues).toEqual({
      plan: 'professional',
      priceId: 'price_pro_m',
      interval: 'month',
    });
  });

  it('writes NO audit row when the action throws, and surfaces the specific code', async () => {
    const { AppError } = await import('@propertypro/shared/http');
    h.cancelSubscription.mockRejectedValueOnce(
      new AppError(
        'Stripe key mode does not match STRIPE_EXPECTED_LIVEMODE',
        500,
        'STRIPE_MODE_MISMATCH',
      ),
    );

    const res = await cancelRoute(req({ confirm: true, atPeriodEnd: true }), params());

    // An audit row records a CHANGE. A refused action changed nothing.
    expect(h.logAdminAction).not.toHaveBeenCalled();
    expect(res.status).toBe(500);
    // The mode refusal must be LEGIBLE — the specific code and sentence, not the
    // generic "An unexpected error occurred" that an unknown throw would produce.
    // This is the path a reviewer of this branch actually exercises, because the
    // repo's Stripe is in test mode and the default expects live.
    expect(await res.json()).toEqual({
      error: {
        code: 'STRIPE_MODE_MISMATCH',
        message: 'Stripe key mode does not match STRIPE_EXPECTED_LIVEMODE',
      },
    });
  });
});

describe('the platform-admin gate', () => {
  it.each(ACTIONS)('%s refuses an unauthenticated caller before reading the body', async (_n, route, body, action) => {
    const { UnauthorizedError } = await import('@propertypro/shared/http');
    h.requirePlatformAdmin.mockRejectedValueOnce(new UnauthorizedError('Not signed in'));

    const response = await route(req({ ...body, confirm: true }), params());

    expect(action()).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
  });

  it('gates both read routes too', async () => {
    const { ForbiddenError } = await import('@propertypro/shared/http');

    h.requirePlatformAdmin.mockRejectedValueOnce(new ForbiddenError('Not an admin'));
    expect(
      (await subscriptionsRoute(new NextRequest('http://admin.test/api/admin/billing/subscriptions')))
        .status,
    ).toBe(403);
    expect(h.getBillingOverview).not.toHaveBeenCalled();

    h.requirePlatformAdmin.mockRejectedValueOnce(new ForbiddenError('Not an admin'));
    expect(
      (await communityBillingRoute(new NextRequest('http://admin.test/x'), params())).status,
    ).toBe(403);
    expect(h.getCommunityBilling).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/billing/subscriptions', () => {
  it('returns the whole portfolio with no filter', async () => {
    const res = await subscriptionsRoute(
      new NextRequest('http://admin.test/api/admin/billing/subscriptions'),
    );
    const body = (await res.json()) as { data: { rows: unknown[] } };
    expect(res.status).toBe(200);
    expect(body.data.rows).toHaveLength(2);
  });

  it('filters rows server-side but leaves the KPIs computed over everything', async () => {
    const res = await subscriptionsRoute(
      new NextRequest('http://admin.test/api/admin/billing/subscriptions?status=past_due'),
    );
    const body = (await res.json()) as {
      data: { rows: { status: string }[]; kpis: { mrrCents: number } };
    };
    expect(body.data.rows.map((r) => r.status)).toEqual(['past_due']);
    // An MRR headline that changed when you clicked a filter tab would be a
    // different number presented as the same one.
    expect(body.data.kpis.mrrCents).toBe(24_000);
  });

  it('400s on a status value that is not a subscription status', async () => {
    const res = await subscriptionsRoute(
      new NextRequest('http://admin.test/api/admin/billing/subscriptions?status=overdue'),
    );
    // Not a silent empty table: "no past-due subscriptions" is the one answer on
    // this screen that must never be wrong by accident.
    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/communities/[id]/billing', () => {
  it('returns the detail envelope', async () => {
    const res = await communityBillingRoute(new NextRequest('http://admin.test/x'), params('7'));
    expect(res.status).toBe(200);
    expect(h.getCommunityBilling).toHaveBeenCalledWith(7);
    expect(await res.json()).toEqual({
      data: {
        row: null,
        invoices: [],
        timeline: [],
        stripeDashboardUrl: 'https://dashboard.stripe.com/test/subscriptions',
        livemode: false,
      },
    });
  });

  it('400s on a non-numeric id without reading anything', async () => {
    const res = await communityBillingRoute(new NextRequest('http://admin.test/x'), params('abc'));
    expect(h.getCommunityBilling).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });
});

import { type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * revenue-snapshot's UNCAUGHT failures, tested against the REAL Sentry SDK.
 *
 * This route opted out of `withErrorHandler` ("we want explicit control over
 * responses here"), which was correct until #1047 wrapped it in `withCronJob`.
 * After that, the opt-out had a cost nothing measured: five of its calls can
 * throw, and an uncaught throw escapes `Sentry.withIsolationScope` before
 * anything captures it. Next.js then reports it through `captureRequestError`,
 * by which point the async context carrying the `job` tag is gone — so the one
 * job of seventeen whose failures the runbook's Rule 1 could not match was this
 * one.
 *
 * Mocking @sentry/nextjs would assert only that we called what we wrote. The
 * thing under test is Sentry's own scope propagation, so the real SDK runs with
 * a `beforeSend` that captures the assembled event and returns null.
 */
const captured: Sentry.ErrorEvent[] = [];

Sentry.init({
  dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
  enabled: true,
  beforeSend(event) {
    captured.push(event);
    return null;
  },
});

const {
  loadInputsMock,
  priorMrrMock,
  insertSnapshotMock,
  getStripeClientMock,
  recordCronRunMock,
  registerCronJobsMock,
} = vi.hoisted(() => ({
  loadInputsMock: vi.fn(),
  priorMrrMock: vi.fn(),
  insertSnapshotMock: vi.fn(),
  getStripeClientMock: vi.fn(),
  recordCronRunMock: vi.fn(),
  registerCronJobsMock: vi.fn(),
}));

vi.mock('@/lib/services/revenue-snapshot-data-service', () => ({
  loadRevenueSnapshotInputs: loadInputsMock,
  getPriorSnapshotMrr: priorMrrMock,
  insertRevenueSnapshot: insertSnapshotMock,
}));
vi.mock('@/lib/services/stripe-service', () => ({ getStripeClient: getStripeClientMock }));
vi.mock('@/lib/services/cron-run-service', () => ({
  recordCronRun: recordCronRunMock,
  registerCronJobs: registerCronJobsMock,
}));
vi.mock('@/lib/api/cron-auth', () => ({ requireCronSecret: vi.fn() }));

import { GET } from '@/app/api/v1/internal/revenue-snapshot/route';

const req = () =>
  new Request('http://localhost/api/v1/internal/revenue-snapshot') as unknown as NextRequest;

const settle = () => Sentry.flush(2000);

beforeEach(() => {
  captured.length = 0;
  loadInputsMock.mockReset();
  priorMrrMock.mockReset();
  insertSnapshotMock.mockReset().mockResolvedValue(undefined);
  getStripeClientMock.mockReset();
  recordCronRunMock.mockReset().mockResolvedValue(undefined);
  registerCronJobsMock.mockReset().mockResolvedValue(undefined);
});

afterAll(async () => {
  await Sentry.close(2000);
});

describe('revenue-snapshot — an uncaught failure keeps its identity', () => {
  it('captures a throw from loadRevenueSnapshotInputs WITH the job tag', async () => {
    // The revert-check target: unwrap `withErrorHandler` in route.ts and this
    // reddens, because the throw then leaves the isolation scope uncaptured.
    loadInputsMock.mockRejectedValue(new Error('Failed query: select * from communities'));

    const res = await GET(req());
    await settle();

    expect(res.status).toBe(500);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.tags).toMatchObject({ job: 'revenue-snapshot' });
  });

  it('groups that failure under its own fingerprint, not the shared one', async () => {
    // Drizzle reports every failure as `Failed query: <SQL>`, so without a
    // per-job fingerprint this event would share an issue with any other cron
    // failing the same way.
    loadInputsMock.mockRejectedValue(new Error('Failed query: select * from communities'));

    await GET(req());
    await settle();

    expect(captured[0]?.fingerprint).toEqual(['{{ default }}', 'revenue-snapshot']);
  });

  it('records the run as failed, so the health probe can see it', async () => {
    loadInputsMock.mockRejectedValue(new Error('boom'));

    await GET(req());

    expect(recordCronRunMock).toHaveBeenCalledWith(
      'revenue-snapshot',
      expect.objectContaining({ status: 'error' }),
    );
  });

  it('returns the standard envelope and leaks no internals', async () => {
    // The one deliberate behaviour change: an uncaught throw used to reach
    // Next.js's own error response. It is now the canonical envelope — and the
    // SQL in the message must not appear in it.
    loadInputsMock.mockRejectedValue(new Error('Failed query: select * from communities'));

    const res = await GET(req());
    const body = await res.json();

    expect(body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
    expect(JSON.stringify(body)).not.toContain('select * from communities');
  });
});

describe('revenue-snapshot — a healthy run is not a Sentry issue', () => {
  const emptyInputs = { communities: [], prices: [], billingGroups: [], accessPlans: [] };
  const noSubscriptions = {
    subscriptions: { list: () => (async function* () {})() },
  };

  beforeEach(async () => {
    // Earlier tests above do not all flush, so their events can land during
    // THIS test's flush. Drain them first, or `captured` carries a stranger's.
    await settle();
    captured.length = 0;
    loadInputsMock.mockResolvedValue(emptyInputs);
    getStripeClientMock.mockReturnValue(noSubscriptions);
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  // In afterEach, not after the assertions: a failing expect would skip it and
  // leave console.info swallowed for the rest of the file.
  afterEach(() => {
    vi.mocked(console.info).mockRestore();
  });

  it('sends NOTHING to Sentry when the snapshot succeeds', async () => {
    // PROPERTY-PRO-1H / 1M: an info-level `captureMessage('revenue_snapshot')`
    // on every run opened a Sentry issue daily, and the admin console reads
    // unresolved issues with no level filter — so a healthy cron rendered as a
    // "production error" in Health, the tray and the error-spike count.
    priorMrrMock.mockResolvedValue(null);

    const res = await GET(req());
    await settle();

    expect(res.status).toBe(200);
    expect(captured).toEqual([]);
    // The figures still reach the runtime log.
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('"event":"revenue_snapshot"'),
    );
  });

  it('still reports a real anomaly — the delta warning is untouched', async () => {
    // Control: proves the test above is not green merely because nothing can
    // reach `captured`. 0 MRR against a prior of 1000 is a -100% delta.
    priorMrrMock.mockResolvedValue(1000);

    const res = await GET(req());
    await settle();

    expect(res.status).toBe(200);
    expect(captured.map((e) => e.message)).toEqual(['revenue_snapshot_delta_high']);
  });
});

describe('revenue-snapshot — Stripe ahead of the database (a late webhook)', () => {
  /*
   * Reconciliation compares COUNTS at snapshot time; it never looks at when a
   * webhook was sent. A webhook that is hours late shows up here as exactly one
   * thing: Stripe already lists a subscription as active while our row still
   * says otherwise. So the scenario is two active communities in the database
   * and three active subscriptions in Stripe.
   */
  const activeCommunity = (id: number) => ({
    id,
    subscriptionStatus: 'active',
    subscriptionPlan: 'plan_1',
    communityType: 'condo_718',
    billingGroupId: null,
    deletedAt: null,
    isDemo: false,
  });
  const twoActiveInDb = {
    communities: [activeCommunity(1), activeCommunity(2)],
    prices: [
      { planId: 'plan_1', communityType: 'condo_718', billingInterval: 'month', unitAmountCents: 10_000 },
    ],
    billingGroups: [],
    accessPlans: [],
  };
  const emptyInputsForDrift = { communities: [], prices: [], billingGroups: [], accessPlans: [] };
  const stripeListing = (count: number) => ({
    subscriptions: {
      list: () =>
        (async function* () {
          for (let i = 0; i < count; i += 1) yield { id: `sub_${i}` };
        })(),
    },
  });

  beforeEach(async () => {
    await settle();
    captured.length = 0;
    loadInputsMock.mockResolvedValue(twoActiveInDb);
    priorMrrMock.mockResolvedValue(null);
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.mocked(console.info).mockRestore();
  });

  it('records the drift on the snapshot and raises the drift warning', async () => {
    getStripeClientMock.mockReturnValue(stripeListing(3));

    const res = await GET(req());
    await settle();
    const body = await res.json();

    // |3 - 2| / 2 = 50%, well past the 5% warning line.
    expect(res.status).toBe(200);
    expect(body.drift_pct).toBe(50);
    // The snapshot is still written — drift is a warning, not a refusal — and
    // the figure is persisted, so the history shows when the gap opened.
    expect(insertSnapshotMock).toHaveBeenCalledTimes(1);
    expect(insertSnapshotMock.mock.calls[0]?.[0]).toMatchObject({ reconciliationDriftPct: 50 });
    expect(captured.map((e) => e.message)).toEqual(['revenue_snapshot_drift_high']);
  });

  it('caps a drift too large for the column instead of losing the snapshot', async () => {
    // |25 - 2| / 2 = 1150%. numeric(5,2) holds at most 999.99, and an uncapped
    // value made the insert throw, failing the whole run.
    getStripeClientMock.mockReturnValue(stripeListing(25));

    const res = await GET(req());
    await settle();

    expect(res.status).toBe(200);
    expect(insertSnapshotMock.mock.calls[0]?.[0]).toMatchObject({ reconciliationDriftPct: 999.99 });
    const warning = captured.find((e) => e.message === 'revenue_snapshot_drift_high');
    expect(warning?.extra).toMatchObject({ stripe_active: 25, db_active: 2 });
  });

  it('warns when Stripe has active subscriptions and the database has none', async () => {
    // Division by zero used to leave drift null, so this, the worst gap, was silent.
    loadInputsMock.mockResolvedValue(emptyInputsForDrift);
    getStripeClientMock.mockReturnValue(stripeListing(3));

    const res = await GET(req());
    await settle();

    expect(res.status).toBe(200);
    expect(insertSnapshotMock.mock.calls[0]?.[0]).toMatchObject({ reconciliationDriftPct: 999.99 });
    expect(captured.map((e) => e.message)).toEqual(['revenue_snapshot_drift_high']);
  });

  it('reports zero drift, and no warning, once the webhook has landed', async () => {
    // Control: the case above must not pass because every run warns.
    getStripeClientMock.mockReturnValue(stripeListing(2));

    const res = await GET(req());
    await settle();
    const body = await res.json();

    expect(body.drift_pct).toBe(0);
    expect(insertSnapshotMock.mock.calls[0]?.[0]).toMatchObject({ reconciliationDriftPct: 0 });
    expect(captured).toEqual([]);
  });
});

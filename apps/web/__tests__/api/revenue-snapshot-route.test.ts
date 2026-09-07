import { type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

const { loadInputsMock, recordCronRunMock, registerCronJobsMock } = vi.hoisted(() => ({
  loadInputsMock: vi.fn(),
  recordCronRunMock: vi.fn(),
  registerCronJobsMock: vi.fn(),
}));

vi.mock('@/lib/services/revenue-snapshot-data-service', () => ({
  loadRevenueSnapshotInputs: loadInputsMock,
  getPriorSnapshotMrr: vi.fn(),
  insertRevenueSnapshot: vi.fn(),
}));
vi.mock('@/lib/services/stripe-service', () => ({ getStripeClient: vi.fn() }));
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

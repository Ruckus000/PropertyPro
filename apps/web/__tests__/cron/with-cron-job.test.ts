import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { withCronJob } from '@/lib/cron/with-cron-job';

/**
 * The `job` tag, tested against the REAL Sentry SDK.
 *
 * WHY NOT MOCK. The thing under test is Sentry's own scope-propagation
 * behaviour — whether a tag set on an isolation scope reaches an event captured
 * inside a nested `withScope` fork (which is how `withErrorHandler` captures)
 * and inside a nested async service call. A mocked `@sentry/nextjs` would
 * assert only that we called the functions we wrote, which is exactly the
 * mistake that let #1042 ship: the unit suite mocked `execute`, so the bound
 * values never reached a driver and a fatal bug read as green.
 *
 * So this initialises the real SDK with a `beforeSend` that captures the
 * assembled event and returns `null` — nothing is transmitted, and the
 * assertion is against the event Sentry actually built.
 *
 * The inverted-nesting case is the anti-vacuity probe for the ordering rule:
 * without it, these tests would pass just as happily against a wrapper that
 * tags nothing anyone can see.
 */
const captured: Sentry.ErrorEvent[] = [];

Sentry.init({
  dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
  enabled: true,
  // Collect and drop: the assertions read the event Sentry assembled, and
  // nothing leaves the process.
  beforeSend(event) {
    captured.push(event);
    return null;
  },
});

const req = () => new Request('http://localhost/api/v1/internal/x') as unknown as NextRequest;
const tagsOf = (i = 0) => captured[i]?.tags ?? {};

/**
 * Sentry assembles an event through an async pipeline, so `beforeSend` has not
 * necessarily run by the time `captureException` returns. Asserting straight
 * after the call reads an empty array and would pass for a wrapper that tags
 * nothing — so every case settles the pipeline first.
 */
const settle = () => Sentry.flush(2000);

beforeEach(() => {
  captured.length = 0;
});

afterAll(async () => {
  await Sentry.flush(500).catch(() => undefined);
});

describe('withCronJob stamps the job tag', () => {
  it('tags an error captured inside a nested withScope — the #1042 shape', async () => {
    // `withErrorHandler` captures inside its own `Sentry.withScope` fork and
    // sets `request_id` there. Both tags must survive onto one event.
    const handler = withCronJob('scheduled-site-publish', async () => {
      Sentry.withScope((scope) => {
        scope.setTag('request_id', 'req-1');
        Sentry.captureException(new Error('Failed query'));
      });
      return NextResponse.json({ data: {} });
    });

    await handler(req());
    await settle();

    expect(captured).toHaveLength(1);
    expect(tagsOf()).toMatchObject({ job: 'scheduled-site-publish', request_id: 'req-1' });
  });

  it('tags a message captured deep in a nested async service', async () => {
    // Services call captureMessage with no scope of their own; the tag has to
    // reach them through the async context, which is what an ISOLATION scope
    // (rather than withScope) buys.
    const handler = withCronJob('community-export-worker', async () => {
      await (async () => {
        await Promise.resolve();
        Sentry.captureMessage('cron_job_reported_failures');
      })();
      return NextResponse.json({ data: {} });
    });

    await handler(req());
    await settle();

    expect(captured).toHaveLength(1);
    expect(tagsOf()).toMatchObject({ job: 'community-export-worker' });
  });

  it('does not leak the tag to work outside the wrapper', async () => {
    // Isolation must be isolation: a later unrelated capture must not inherit
    // the last cron's identity, or every unrelated 500 would match the alert.
    const handler = withCronJob('expire-demos', async () => NextResponse.json({ data: {} }));
    await handler(req());

    Sentry.captureException(new Error('unrelated request'));
    await settle();

    expect(captured).toHaveLength(1);
    expect(tagsOf().job).toBeUndefined();
  });

  it('propagates the handler result unchanged', async () => {
    const handler = withCronJob('snowbird-digest', async () =>
      NextResponse.json({ data: { sent: 3 } }, { status: 200 }),
    );

    const res = await handler(req());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { sent: 3 } });
  });

  it('lets a handler throw rather than swallowing it', async () => {
    // `withErrorHandler` is what turns a throw into a 500; this wrapper must
    // stay transparent, or it would become the thing that hides failures.
    const handler = withCronJob('late-fee-processor', async () => {
      throw new Error('boom');
    });

    await expect(handler(req())).rejects.toThrow('boom');
  });

  /**
   * ANTI-VACUITY PROBE for the ordering rule enforced by
   * `pnpm guard:cron-job-tagging`.
   *
   * Inverted — the capture happening OUTSIDE the isolation scope — the tag is
   * silently absent. No error, no warning, and a route that reads as correctly
   * instrumented. This case is what makes the guard's existence justified
   * rather than decorative, and it is why the wrapper must be outermost.
   */
  it('loses the tag when the capture happens outside the wrapper (why order matters)', async () => {
    const inner = withCronJob('visitor-auto-checkout', async () => NextResponse.json({ data: {} }));

    await inner(req());
    Sentry.captureException(new Error('escaped the isolation scope'));
    await settle();

    expect(captured).toHaveLength(1);
    expect(tagsOf()).not.toHaveProperty('job');
  });
});

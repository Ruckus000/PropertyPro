import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';

const { processDueSitePublishesMock } = vi.hoisted(() => ({
  processDueSitePublishesMock: vi.fn(),
}));

vi.mock('@/lib/services/site-publish-schedule-service', () => ({
  processDueSitePublishes: processDueSitePublishesMock,
}));

import { GET, POST } from '../../src/app/api/v1/internal/scheduled-site-publish/route';

const URL = 'http://localhost:3000/api/v1/internal/scheduled-site-publish';

/*
 * The real SDK, collecting into `sentryEvents` and transmitting nothing.
 *
 * This route is the one that 500'd on all ~96 daily runs for a day (#1042)
 * while Sentry captured every failure and nobody was told — because the event
 * carried no attribute naming the job, so no alert rule could match it. The
 * case at the bottom of this file is that regression, asserted end-to-end
 * through the ACTUAL exported route rather than through the wrapper in
 * isolation: it proves this specific route is wired, not merely that the
 * wrapper works somewhere.
 */
const sentryEvents: Sentry.ErrorEvent[] = [];
Sentry.init({
  dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
  enabled: true,
  beforeSend(event) {
    sentryEvents.push(event);
    return null;
  },
});

describe('scheduled-site-publish cron route', () => {
  const previousRouteSecret = process.env.SCHEDULED_SITE_PUBLISH_CRON_SECRET;
  const previousCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SCHEDULED_SITE_PUBLISH_CRON_SECRET = 'test-secret';
    processDueSitePublishesMock.mockResolvedValue({
      claimed: 2,
      published: 1,
      nothingToPublish: 1,
      failed: 0,
    });
  });

  afterEach(() => {
    // Restored rather than deleted: these are real process-wide env vars, and
    // leaving a test value behind changes how later files' auth behaves.
    if (previousRouteSecret === undefined) delete process.env.SCHEDULED_SITE_PUBLISH_CRON_SECRET;
    else process.env.SCHEDULED_SITE_PUBLISH_CRON_SECRET = previousRouteSecret;
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCronSecret;
  });

  it('401s without a bearer token, and does not run the job', async () => {
    const res = await GET(new NextRequest(URL));

    expect(res.status).toBe(401);
    expect(processDueSitePublishesMock).not.toHaveBeenCalled();
  });

  it('401s on the wrong token', async () => {
    const res = await GET(
      new NextRequest(URL, { headers: { authorization: 'Bearer nope' } }),
    );

    expect(res.status).toBe(401);
    expect(processDueSitePublishesMock).not.toHaveBeenCalled();
  });

  it('runs the job and returns its summary', async () => {
    const res = await GET(
      new NextRequest(URL, { headers: { authorization: 'Bearer test-secret' } }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { claimed: 2, published: 1, nothingToPublish: 1, failed: 0 },
    });
  });

  it('accepts POST as well as GET', async () => {
    /*
     * Vercel Cron issues GET; the GitHub-Actions era of these jobs issued POST.
     * Serving both means the scheduler's verb can never be the thing that
     * silently stops scheduled publishes from firing.
     */
    const res = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
      }),
    );

    expect(res.status).toBe(200);
    expect(processDueSitePublishesMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the platform-wide CRON_SECRET when no per-route secret is set', async () => {
    delete process.env.SCHEDULED_SITE_PUBLISH_CRON_SECRET;
    process.env.CRON_SECRET = 'platform-secret';

    const res = await GET(
      new NextRequest(URL, { headers: { authorization: 'Bearer platform-secret' } }),
    );

    expect(res.status).toBe(200);
  });

  it('tags a failure with its job name, so an alert rule can match it [#1042]', async () => {
    // Before withCronJob, this event carried only `request_id` — a per-request
    // UUID — so there was nothing to write a Sentry alert on. A day of 500s
    // sat in Sentry, correctly captured and entirely unnoticed.
    sentryEvents.length = 0;
    processDueSitePublishesMock.mockRejectedValue(new Error('Failed query'));

    const res = await GET(new NextRequest(URL, { headers: { authorization: 'Bearer test-secret' } }));
    await Sentry.flush(2000);

    expect(res.status).toBe(500);
    expect(sentryEvents).not.toHaveLength(0);
    expect(sentryEvents[0]?.tags).toMatchObject({ job: 'scheduled-site-publish' });
  });
});

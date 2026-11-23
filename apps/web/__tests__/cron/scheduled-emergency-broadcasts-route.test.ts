import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';

const { processDueMock } = vi.hoisted(() => ({
  processDueMock: vi.fn(),
}));

vi.mock('@/lib/services/emergency-broadcast-schedule-service', () => ({
  processDueScheduledBroadcasts: processDueMock,
}));

import { GET, POST } from '../../src/app/api/v1/internal/scheduled-emergency-broadcasts/route';

const URL = 'http://localhost:3000/api/v1/internal/scheduled-emergency-broadcasts';

/*
 * The real SDK, collecting into `sentryEvents` and transmitting nothing, so the
 * last case can assert the `job` tag end-to-end through the ACTUAL exported
 * route (the #1042 regression: an untagged cron 500 matches no alert rule).
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

describe('scheduled-emergency-broadcasts cron route', () => {
  const previousRouteSecret = process.env.SCHEDULED_EMERGENCY_BROADCASTS_CRON_SECRET;
  const previousCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SCHEDULED_EMERGENCY_BROADCASTS_CRON_SECRET = 'test-secret';
    processDueMock.mockResolvedValue({
      due: 3,
      sent: 2,
      missed: 1,
      failed: 0,
      claimedElsewhere: 0,
      interrupted: 0,
      deferred: 0,
    });
  });

  afterEach(() => {
    // Restored rather than deleted: these are real process-wide env vars, and
    // leaving a test value behind changes how later files' auth behaves.
    if (previousRouteSecret === undefined) delete process.env.SCHEDULED_EMERGENCY_BROADCASTS_CRON_SECRET;
    else process.env.SCHEDULED_EMERGENCY_BROADCASTS_CRON_SECRET = previousRouteSecret;
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCronSecret;
  });

  it('401s without a bearer token, and does not run the job', async () => {
    const res = await GET(new NextRequest(URL));

    expect(res.status).toBe(401);
    expect(processDueMock).not.toHaveBeenCalled();
  });

  it('401s on the wrong token', async () => {
    const res = await GET(
      new NextRequest(URL, { headers: { authorization: 'Bearer nope' } }),
    );

    expect(res.status).toBe(401);
    expect(processDueMock).not.toHaveBeenCalled();
  });

  it('runs the job and returns its summary', async () => {
    const res = await GET(
      new NextRequest(URL, { headers: { authorization: 'Bearer test-secret' } }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { due: 3, sent: 2, missed: 1, failed: 0, claimedElsewhere: 0, interrupted: 0, deferred: 0 },
    });
  });

  it('accepts POST as well as GET', async () => {
    // Vercel Cron issues GET; manual runs and the admin Health board's Retry POST.
    const res = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
      }),
    );

    expect(res.status).toBe(200);
    expect(processDueMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the platform-wide CRON_SECRET when no per-route secret is set', async () => {
    delete process.env.SCHEDULED_EMERGENCY_BROADCASTS_CRON_SECRET;
    process.env.CRON_SECRET = 'platform-secret';

    const res = await GET(
      new NextRequest(URL, { headers: { authorization: 'Bearer platform-secret' } }),
    );

    expect(res.status).toBe(200);
  });

  it('tags a failure with its job name, so an alert rule can match it [#1042]', async () => {
    sentryEvents.length = 0;
    processDueMock.mockRejectedValue(new Error('Failed query'));

    const res = await GET(new NextRequest(URL, { headers: { authorization: 'Bearer test-secret' } }));
    await Sentry.flush(2000);

    expect(res.status).toBe(500);
    expect(sentryEvents).not.toHaveLength(0);
    expect(sentryEvents[0]?.tags).toMatchObject({ job: 'scheduled-emergency-broadcasts' });
  });
});

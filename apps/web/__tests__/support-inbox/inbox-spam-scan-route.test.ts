import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runInboxSpamScan } = vi.hoisted(() => ({ runInboxSpamScan: vi.fn() }));

vi.mock('@/lib/services/support-inbox/spam-classifier-service', () => ({ runInboxSpamScan }));
vi.mock('@/lib/cron/with-cron-job', () => ({
  // The real wrapper records a run row and opens a Sentry isolation scope.
  // Neither is under test here; `guard:cron-job-tagging` already proves the
  // wrapper is applied and outermost.
  withCronJob: (_slug: string, handler: unknown) => handler,
}));

const { GET, POST } = await import('@/app/api/v1/internal/inbox-spam-scan/route');

const SECRET = 'cron-secret-value';

const SUMMARY = {
  spamCount: 6,
  hamCount: 0,
  scored: 6,
  shelved: 0,
  advisoryOnly: true,
};

function request(method: 'GET' | 'POST', secret: string | null = SECRET): NextRequest {
  const headers = new Headers();
  if (secret !== null) headers.set('authorization', `Bearer ${secret}`);
  return new NextRequest('https://www.getpropertypro.com/api/v1/internal/inbox-spam-scan', {
    method,
    headers,
  });
}

describe('/api/v1/internal/inbox-spam-scan', () => {
  const original = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    delete process.env.INBOX_SPAM_SCAN_CRON_SECRET;
    runInboxSpamScan.mockResolvedValue(SUMMARY);
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it('runs on GET — the method Vercel cron actually issues', async () => {
    // The contract declares `method: 'GET'` so the runner does not try to parse
    // a body off the scheduled request, which carries none. If this regresses
    // the job fails on every tick while a manual POST still looks healthy.
    const response = await GET(request('GET'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: SUMMARY });
    expect(runInboxSpamScan).toHaveBeenCalledTimes(1);
  });

  it('also runs on POST, for a manual re-run from the Health board', async () => {
    const response = await POST(request('POST'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: SUMMARY });
  });

  it('refuses without the cron secret, and does not touch the inbox', async () => {
    const response = await GET(request('GET', null));

    expect(response.status).toBe(401);
    expect(runInboxSpamScan).not.toHaveBeenCalled();
  });

  it('refuses a wrong secret', async () => {
    const response = await GET(request('GET', 'not-the-secret'));

    expect(response.status).toBe(401);
    expect(runInboxSpamScan).not.toHaveBeenCalled();
  });

  it('surfaces a failure as a 500 rather than a cheerful zero-count 200', async () => {
    // The defect this guards against is the one `visitor-auto-checkout`
    // documents: a swallowed error returns `{ scored: 0 }` with HTTP 200, so
    // the job reads as healthy on every dashboard while doing nothing.
    runInboxSpamScan.mockRejectedValue(new Error('database is gone'));

    const response = await GET(request('GET'));

    expect(response.status).toBe(500);
  });
});

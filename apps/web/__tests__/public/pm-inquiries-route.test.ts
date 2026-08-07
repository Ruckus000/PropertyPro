import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const captureMarketingLeadMock = vi.fn();
const rateLimiterCheckMock = vi.fn();

vi.mock('@/lib/services/marketing-leads-service', () => ({
  captureMarketingLead: (...args: unknown[]) => captureMarketingLeadMock(...args),
}));

vi.mock('@/lib/middleware/rate-limiter', () => ({
  getRateLimiter: () => ({
    check: (...args: unknown[]) => rateLimiterCheckMock(...args),
  }),
}));

import { POST } from '@/app/api/v1/public/pm-inquiries/route';

function postRequest(body: unknown, ip = '203.0.113.9'): NextRequest {
  return new NextRequest('https://app.test/api/v1/public/pm-inquiries', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/v1/public/pm-inquiries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimiterCheckMock.mockReturnValue({ allowed: true, retryAfter: 0 });
    captureMarketingLeadMock.mockResolvedValue(undefined);
  });

  it('captures an inquiry tagged as a portfolio lead', async () => {
    const res = await POST(
      postRequest({
        email: 'ops@managementco.com',
        contactName: 'A Person',
        companyName: 'Management Co',
        communityCount: 12,
        unitCount: 1400,
        message: 'Six of ours are behind.',
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ data: { ok: true } });
    expect(captureMarketingLeadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ops@managementco.com',
        // The server sets the source. A client-supplied discriminator would let
        // anyone stuff the table with rows labelled as portfolio inquiries.
        source: 'pm_inquiry',
        associationName: 'Management Co',
        communityCount: 12,
        message: 'Six of ours are behind.',
      }),
    );
  });

  it('uses its own rate-limit budget, not the compliance checker’s', async () => {
    // Sharing a key would mean a visitor who played with the checker hits a
    // silent 429 on the highest-value form on the site.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await POST(postRequest({ email: 'ops@managementco.com' }), {} as any);

    expect(rateLimiterCheckMock).toHaveBeenCalledWith(
      'pm-inquiry:203.0.113.9',
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('throttles before validating, so a malformed body cannot bypass it', async () => {
    rateLimiterCheckMock.mockReturnValue({ allowed: false, retryAfter: 42 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(postRequest('not json at all'), {} as any);

    expect(res.status).toBe(429);
    expect(captureMarketingLeadMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed email', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(postRequest({ email: 'nope' }), {} as any);

    expect(res.status).toBe(400);
    expect(captureMarketingLeadMock).not.toHaveBeenCalled();
  });
});

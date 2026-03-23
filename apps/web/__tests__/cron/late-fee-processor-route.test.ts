import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { processLateFeesMock } = vi.hoisted(() => ({
  processLateFeesMock: vi.fn(),
}));

vi.mock('@/lib/services/assessment-automation-service', () => ({
  processLateFees: processLateFeesMock,
}));

import { POST } from '../../src/app/api/v1/internal/late-fee-processor/route';

const URL = 'http://localhost:3000/api/v1/internal/late-fee-processor';

describe('late-fee-processor cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASSESSMENT_CRON_SECRET = 'test-secret';
    processLateFeesMock.mockResolvedValue({
      processed: 5,
      feesApplied: 3,
      skipped: 2,
    });
  });

  it('returns 401 for missing bearer token', async () => {
    const req = new NextRequest(URL, { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong bearer token', async () => {
    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when env var is undefined', async () => {
    delete process.env.ASSESSMENT_CRON_SECRET;
    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('calls processLateFees and returns summary for valid token', async () => {
    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual({
      processed: 5,
      feesApplied: 3,
      skipped: 2,
    });
    expect(processLateFeesMock).toHaveBeenCalledOnce();
  });

  it('propagates service errors through withErrorHandler', async () => {
    processLateFeesMock.mockRejectedValue(new Error('DB connection failed'));
    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it('idempotency: calling twice invokes service twice', async () => {
    const makeReq = () =>
      new NextRequest(URL, {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
      });
    const res1 = await POST(makeReq());
    const res2 = await POST(makeReq());
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(processLateFeesMock).toHaveBeenCalledTimes(2);
  });
});

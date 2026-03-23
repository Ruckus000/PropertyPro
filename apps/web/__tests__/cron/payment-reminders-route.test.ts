import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { processPaymentRemindersMock } = vi.hoisted(() => ({
  processPaymentRemindersMock: vi.fn(),
}));

vi.mock('@/lib/services/payment-alert-scheduler', () => ({
  processPaymentReminders: processPaymentRemindersMock,
}));

import { POST } from '../../src/app/api/v1/internal/payment-reminders/route';

const URL = 'http://localhost:3000/api/v1/internal/payment-reminders';

describe('payment-reminders cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAYMENT_REMINDERS_CRON_SECRET = 'test-secret';
    processPaymentRemindersMock.mockResolvedValue({
      communitiesScanned: 3,
      emailsSent: 2,
      errors: 0,
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

  it('returns 401 when ASSESSMENT_CRON_SECRET is set but PAYMENT_REMINDERS_CRON_SECRET is not', async () => {
    delete process.env.PAYMENT_REMINDERS_CRON_SECRET;
    process.env.ASSESSMENT_CRON_SECRET = 'some-other-secret';
    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { authorization: 'Bearer some-other-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('calls processPaymentReminders and returns summary for valid token', async () => {
    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual({
      communitiesScanned: 3,
      emailsSent: 2,
      errors: 0,
    });
    expect(processPaymentRemindersMock).toHaveBeenCalledOnce();
  });

  it('propagates service errors through withErrorHandler', async () => {
    processPaymentRemindersMock.mockRejectedValue(new Error('DB connection failed'));
    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});

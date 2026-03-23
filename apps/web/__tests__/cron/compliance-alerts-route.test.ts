import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { processComplianceAlertsMock } = vi.hoisted(() => ({
  processComplianceAlertsMock: vi.fn(),
}));

vi.mock('@/lib/services/compliance-alert-service', () => ({
  processComplianceAlerts: processComplianceAlertsMock,
}));

import { POST } from '../../src/app/api/v1/internal/compliance-alerts/route';

describe('compliance-alerts cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMPLIANCE_CRON_SECRET = 'test-secret';
    processComplianceAlertsMock.mockResolvedValue({
      communitiesProcessed: 3,
      totalOverdue: 5,
      totalNotified: 9,
      errors: 0,
    });
  });

  it('returns 401 for missing bearer token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/compliance-alerts', {
      method: 'POST',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong bearer token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/compliance-alerts', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('runs processor and returns structured summary for valid token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/compliance-alerts', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual(
      expect.objectContaining({
        communitiesProcessed: 3,
        totalOverdue: 5,
        totalNotified: 9,
        errors: 0,
      }),
    );
  });

  it('returns 500 when service throws', async () => {
    processComplianceAlertsMock.mockRejectedValue(new Error('DB connection failed'));
    const req = new NextRequest('http://localhost:3000/api/v1/internal/compliance-alerts', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});

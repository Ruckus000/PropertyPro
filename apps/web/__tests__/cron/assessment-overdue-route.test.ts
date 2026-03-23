import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { processOverdueTransitionsMock } = vi.hoisted(() => ({
  processOverdueTransitionsMock: vi.fn(),
}));

vi.mock('@/lib/services/assessment-automation-service', () => ({
  processOverdueTransitions: processOverdueTransitionsMock,
}));

import { POST } from '../../src/app/api/v1/internal/assessment-overdue/route';

describe('assessment-overdue cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASSESSMENT_CRON_SECRET = 'test-secret';
    processOverdueTransitionsMock.mockResolvedValue({
      communitiesScanned: 3,
      itemsTransitioned: 5,
      errors: 0,
    });
  });

  it('returns 401 for missing bearer token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/assessment-overdue', {
      method: 'POST',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong bearer token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/assessment-overdue', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('runs processor and returns structured summary for valid token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/assessment-overdue', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual(
      expect.objectContaining({
        communitiesScanned: 3,
        itemsTransitioned: 5,
        errors: 0,
      }),
    );
  });

  it('handles zero overdue items gracefully', async () => {
    processOverdueTransitionsMock.mockResolvedValue({
      communitiesScanned: 2,
      itemsTransitioned: 0,
      errors: 0,
    });
    const req = new NextRequest('http://localhost:3000/api/v1/internal/assessment-overdue', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual(
      expect.objectContaining({
        communitiesScanned: 2,
        itemsTransitioned: 0,
        errors: 0,
      }),
    );
  });

  it('returns 500 when service throws', async () => {
    processOverdueTransitionsMock.mockRejectedValue(new Error('DB connection failed'));
    const req = new NextRequest('http://localhost:3000/api/v1/internal/assessment-overdue', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});

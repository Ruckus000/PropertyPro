import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { processRecurringAssessmentsMock } = vi.hoisted(() => ({
  processRecurringAssessmentsMock: vi.fn(),
}));

vi.mock('@/lib/services/assessment-automation-service', () => ({
  processRecurringAssessments: processRecurringAssessmentsMock,
}));

import { POST } from '../../src/app/api/v1/internal/generate-assessments/route';

describe('generate-assessments cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASSESSMENT_CRON_SECRET = 'test-secret';
    processRecurringAssessmentsMock.mockResolvedValue({
      communitiesScanned: 3,
      assessmentsProcessed: 5,
      totalInserted: 12,
      totalSkipped: 2,
      errors: 0,
    });
  });

  it('returns 401 for missing bearer token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/generate-assessments', {
      method: 'POST',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong bearer token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/generate-assessments', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 with summary for valid token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/generate-assessments', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual(
      expect.objectContaining({
        communitiesScanned: 3,
        assessmentsProcessed: 5,
        totalInserted: 12,
        totalSkipped: 2,
        errors: 0,
      }),
    );
  });

  it('returns 500 when service throws', async () => {
    processRecurringAssessmentsMock.mockRejectedValue(new Error('DB connection failed'));
    const req = new NextRequest('http://localhost:3000/api/v1/internal/generate-assessments', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});

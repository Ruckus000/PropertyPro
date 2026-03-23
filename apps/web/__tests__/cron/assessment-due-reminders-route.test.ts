import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { processAssessmentDueRemindersMock } = vi.hoisted(() => ({
  processAssessmentDueRemindersMock: vi.fn(),
}));

vi.mock('@/lib/services/assessment-automation-service', () => ({
  processAssessmentDueReminders: processAssessmentDueRemindersMock,
}));

import { POST } from '../../src/app/api/v1/internal/assessment-due-reminders/route';

describe('assessment-due-reminders cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASSESSMENT_CRON_SECRET = 'test-secret';
    processAssessmentDueRemindersMock.mockResolvedValue({
      communitiesScanned: 3,
      emailsSent: 4,
      errors: 0,
    });
  });

  it('returns 401 for missing bearer token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/assessment-due-reminders', {
      method: 'POST',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong bearer token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/assessment-due-reminders', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('runs processor and returns structured summary for valid token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/assessment-due-reminders', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual(
      expect.objectContaining({
        communitiesScanned: 3,
        emailsSent: 4,
        errors: 0,
      }),
    );
  });

  it('returns 200 when no reminders are needed', async () => {
    processAssessmentDueRemindersMock.mockResolvedValue({
      communitiesScanned: 2,
      emailsSent: 0,
      errors: 0,
    });
    const req = new NextRequest('http://localhost:3000/api/v1/internal/assessment-due-reminders', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual(
      expect.objectContaining({
        communitiesScanned: 2,
        emailsSent: 0,
        errors: 0,
      }),
    );
  });

  it('returns 500 when service throws', async () => {
    processAssessmentDueRemindersMock.mockRejectedValue(new Error('DB connection failed'));
    const req = new NextRequest('http://localhost:3000/api/v1/internal/assessment-due-reminders', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});

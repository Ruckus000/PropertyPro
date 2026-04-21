import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { processCalendarEventRemindersMock } = vi.hoisted(() => ({
  processCalendarEventRemindersMock: vi.fn(),
}));

vi.mock('@/lib/services/calendar-event-reminder-service', () => ({
  processCalendarEventReminders: processCalendarEventRemindersMock,
}));

import { POST } from '../../src/app/api/v1/internal/calendar-event-reminders/route';

describe('calendar-event-reminders cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CALENDAR_EVENT_REMINDERS_CRON_SECRET = 'test-secret';
    processCalendarEventRemindersMock.mockResolvedValue({
      communitiesScanned: 3,
      rowsEnqueued: 6,
      rowsClaimed: 4,
      rowsSent: 3,
      rowsDiscarded: 1,
      rowsRetried: 0,
      rowsFailed: 0,
      emailsSent: 3,
      errors: 0,
      hasMore: false,
    });
  });

  it('returns 401 for missing bearer token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/calendar-event-reminders', {
      method: 'POST',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong bearer token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/calendar-event-reminders', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('runs processor and returns structured summary for valid token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/calendar-event-reminders', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual(
      expect.objectContaining({
        communitiesScanned: 3,
        rowsEnqueued: 6,
        rowsClaimed: 4,
      }),
    );
  });
});

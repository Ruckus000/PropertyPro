import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { processNotificationDigestsMock } = vi.hoisted(() => ({
  processNotificationDigestsMock: vi.fn(),
}));

vi.mock('@/lib/services/notification-digest-processor', () => ({
  processNotificationDigests: processNotificationDigestsMock,
}));

import { POST } from '../../src/app/api/v1/internal/notification-digests/process/route';

describe('notification digest cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NOTIFICATION_DIGEST_CRON_SECRET = 'test-secret';
    processNotificationDigestsMock.mockResolvedValue({
      communitiesScanned: 2,
      communitiesProcessed: 1,
      rowsClaimed: 4,
      rowsSent: 3,
      rowsFailed: 0,
      rowsDiscarded: 1,
      rowsRetried: 0,
      emailsSent: 1,
      hasMore: false,
    });
  });

  it('returns 401 for missing bearer token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/notification-digests/process', {
      method: 'POST',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong bearer token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/notification-digests/process', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('runs processor and returns structured summary for valid token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/notification-digests/process', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual(
      expect.objectContaining({
        communitiesScanned: 2,
        communitiesProcessed: 1,
        rowsClaimed: 4,
      }),
    );
  });
});

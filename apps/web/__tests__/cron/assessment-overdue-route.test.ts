/**
 * Route unit tests — `POST /api/v1/internal/assessment-overdue`.
 *
 * Plan A1 auto-drain. Covers the contracted runRoute envelope for this
 * cron-authenticated endpoint: happy path (structured summary, exact
 * `{ data }` wire shape), zero-items happy path, 401 for missing/wrong bearer
 * token, 401 when the cron secret env is unset, and 500 when the service
 * throws.
 *
 * This route is cron-authed (Bearer token via `requireCronSecret`), NOT a
 * community-membership route — there are no params/query/body and no RBAC
 * gate, so there is no `params.id` 400 case to assert.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { processOverdueTransitionsMock } = vi.hoisted(() => ({
  processOverdueTransitionsMock: vi.fn(),
}));

vi.mock('@/lib/services/assessment-automation-service', () => ({
  processOverdueTransitions: processOverdueTransitionsMock,
}));

import { POST } from '../../src/app/api/v1/internal/assessment-overdue/route';

function cronPost(headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/internal/assessment-overdue', {
    method: 'POST',
    headers: headers ?? {},
  });
}

describe('POST /api/v1/internal/assessment-overdue', () => {
  const originalSecret = process.env.ASSESSMENT_CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASSESSMENT_CRON_SECRET = 'test-secret';
    processOverdueTransitionsMock.mockResolvedValue({
      communitiesScanned: 3,
      itemsTransitioned: 5,
      errors: 0,
    });
  });

  afterEach(() => {
    process.env.ASSESSMENT_CRON_SECRET = originalSecret;
  });

  it('runs processor and returns structured summary for a valid token (happy path)', async () => {
    const res = await POST(cronPost({ authorization: 'Bearer test-secret' }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { communitiesScanned: number; itemsTransitioned: number; errors: number };
    };
    expect(json.data).toEqual({
      communitiesScanned: 3,
      itemsTransitioned: 5,
      errors: 0,
    });
    expect(processOverdueTransitionsMock).toHaveBeenCalledTimes(1);
  });

  it('handles zero overdue items gracefully', async () => {
    processOverdueTransitionsMock.mockResolvedValue({
      communitiesScanned: 2,
      itemsTransitioned: 0,
      errors: 0,
    });

    const res = await POST(cronPost({ authorization: 'Bearer test-secret' }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { itemsTransitioned: number } };
    expect(json.data).toEqual({
      communitiesScanned: 2,
      itemsTransitioned: 0,
      errors: 0,
    });
  });

  it('returns 401 when the bearer token is missing', async () => {
    const res = await POST(cronPost());

    expect(res.status).toBe(401);
    expect(processOverdueTransitionsMock).not.toHaveBeenCalled();
  });

  it('returns 401 when the bearer token is wrong', async () => {
    const res = await POST(cronPost({ authorization: 'Bearer wrong-secret' }));

    expect(res.status).toBe(401);
    expect(processOverdueTransitionsMock).not.toHaveBeenCalled();
  });

  it('returns 401 when the cron secret env is unset', async () => {
    delete process.env.ASSESSMENT_CRON_SECRET;

    const res = await POST(cronPost({ authorization: 'Bearer test-secret' }));

    expect(res.status).toBe(401);
    expect(processOverdueTransitionsMock).not.toHaveBeenCalled();
  });

  it('returns 500 when the service throws', async () => {
    processOverdueTransitionsMock.mockRejectedValue(new Error('DB connection failed'));

    const res = await POST(cronPost({ authorization: 'Bearer test-secret' }));

    expect(res.status).toBe(500);
  });
});

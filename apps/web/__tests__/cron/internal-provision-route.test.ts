/**
 * POST /api/v1/internal/provision — the manual provisioning retry.
 *
 * Pins that a retry which did nothing (another run holds the job's claim)
 * is reported as such, not as a successful retry.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  findProvisioningJobBySignupRequestIdMock,
  getProvisioningJobSummaryByIdMock,
  runProvisioningMock,
} = vi.hoisted(() => ({
  findProvisioningJobBySignupRequestIdMock: vi.fn(),
  getProvisioningJobSummaryByIdMock: vi.fn(),
  runProvisioningMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/services/provisioning-service', () => ({
  findProvisioningJobBySignupRequestId: findProvisioningJobBySignupRequestIdMock,
  getProvisioningJobSummaryById: getProvisioningJobSummaryByIdMock,
  runProvisioning: runProvisioningMock,
}));

import { POST } from '../../src/app/api/v1/internal/provision/route';

function request(): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/internal/provision', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret', 'content-type': 'application/json' },
    body: JSON.stringify({ signupRequestId: 'req_1' }),
  });
}

describe('POST /api/v1/internal/provision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PROVISIONING_RETRY_SECRET = 'test-secret';
    delete process.env.CRON_SECRET;
    findProvisioningJobBySignupRequestIdMock.mockResolvedValue({ id: 7 });
    getProvisioningJobSummaryByIdMock.mockResolvedValue({ id: 7, status: 'user_linked' });
  });

  it('returns 409 with the current job summary when another run holds the claim', async () => {
    runProvisioningMock.mockResolvedValue('in_flight');

    const res = await POST(request());
    const body = (await res.json()) as { error?: string; data?: unknown };

    expect(runProvisioningMock).toHaveBeenCalledWith(7);
    expect(res.status).toBe(409);
    expect(body.error).toMatch(/already running/);
    expect(body.data).toEqual({ id: 7, status: 'user_linked' });
  });

  it.each(['completed', 'already_completed'] as const)(
    'returns 200 with the job summary when the run outcome is %s',
    async (outcome) => {
      runProvisioningMock.mockResolvedValue(outcome);
      getProvisioningJobSummaryByIdMock.mockResolvedValue({ id: 7, status: 'completed' });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { id: 7, status: 'completed' } });
    },
  );
});

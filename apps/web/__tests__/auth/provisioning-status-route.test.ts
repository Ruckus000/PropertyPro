/**
 * Route unit tests — `GET /api/v1/auth/provisioning-status`.
 *
 * The poll answers only the signed-in founder's own signup, and mints no login
 * token: the founder already holds the root manager's session (email-first
 * signs them in before they pay; provisioning links that same account). It
 * used to hand the first poller a single-use magic-link token, so holding the
 * signupRequestId (it is in the Stripe return URL) was a race for a
 * root-manager login. These tests mock the provisioning-service layer.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getProvisioningJobBySignupRequestId = vi.fn();
const getPendingSignupBySignupRequestId = vi.fn();
const getUserMock = vi.fn();

vi.mock('@/lib/services/provisioning-service', () => ({
  getProvisioningJobBySignupRequestId: (...args: unknown[]) =>
    getProvisioningJobBySignupRequestId(...args),
  getPendingSignupBySignupRequestId: (...args: unknown[]) =>
    getPendingSignupBySignupRequestId(...args),
}));

vi.mock('@propertypro/db/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: getUserMock } }),
}));

import { GET } from '../../src/app/api/v1/auth/provisioning-status/route';

const FOUNDER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'founder@example.com',
  email_confirmed_at: '2026-10-09T12:00:00Z',
};

const BASE_JOB = {
  id: 1,
  signupRequestId: 'req-uuid-abc123',
  communityId: 42,
  status: 'completed',
  lastSuccessfulStatus: 'completed',
};

const OWN_SIGNUP = { signupRequestId: 'req-uuid-abc123', authUserId: FOUNDER.id };

function makeRequest(signupRequestId?: string): NextRequest {
  const url = signupRequestId
    ? `https://getpropertypro.com/api/v1/auth/provisioning-status?signupRequestId=${signupRequestId}`
    : `https://getpropertypro.com/api/v1/auth/provisioning-status`;
  return new NextRequest(url, { method: 'GET' });
}

async function dataOf(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json()) as { data?: Record<string, unknown> };
  return (body.data ?? {}) as Record<string, unknown>;
}

describe('provisioning-status route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: FOUNDER }, error: null });
    getPendingSignupBySignupRequestId.mockResolvedValue({ ...OWN_SIGNUP });
    getProvisioningJobBySignupRequestId.mockResolvedValue({ ...BASE_JOB });
  });

  it('returns 400 when signupRequestId is missing', async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  describe('binding to the signed-in founder', () => {
    it('refuses a caller with no session, before reading anything', async () => {
      getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
      const response = await GET(makeRequest('req-uuid-abc123'));
      expect(response.status).toBe(401);
      expect(getPendingSignupBySignupRequestId).not.toHaveBeenCalled();
      expect(getProvisioningJobBySignupRequestId).not.toHaveBeenCalled();
    });

    it('refuses a session whose email is not confirmed', async () => {
      getUserMock.mockResolvedValueOnce({
        data: { user: { ...FOUNDER, email_confirmed_at: null } },
        error: null,
      });
      const response = await GET(makeRequest('req-uuid-abc123'));
      expect(response.status).toBe(401);
    });

    // Holding another founder's id (it is in their Stripe return URL) must
    // reveal nothing: not the job, not the community, and above all no login.
    it("answers another founder's completed signup exactly like an unknown id", async () => {
      getPendingSignupBySignupRequestId.mockResolvedValueOnce({
        ...OWN_SIGNUP,
        authUserId: '00000000-0000-4000-8000-000000000002',
      });
      const response = await GET(makeRequest('req-uuid-abc123'));
      expect(response.status).toBe(200);
      expect(await dataOf(response)).toEqual({ status: 'pending', step: 'waiting' });
      expect(getProvisioningJobBySignupRequestId).not.toHaveBeenCalled();
    });

    it('answers an unknown id as pending', async () => {
      getPendingSignupBySignupRequestId.mockResolvedValueOnce(null);
      const response = await GET(makeRequest('req-unknown'));
      expect(await dataOf(response)).toEqual({ status: 'pending', step: 'waiting' });
      expect(getProvisioningJobBySignupRequestId).not.toHaveBeenCalled();
    });
  });

  describe("the founder's own signup", () => {
    it('is pending until the webhook creates a job', async () => {
      getProvisioningJobBySignupRequestId.mockResolvedValueOnce(null);
      const response = await GET(makeRequest('req-uuid-abc123'));
      expect(await dataOf(response)).toEqual({ status: 'pending', step: 'waiting' });
    });

    it('reports the provisioning step', async () => {
      getProvisioningJobBySignupRequestId.mockResolvedValueOnce({
        ...BASE_JOB,
        status: 'user_linked',
        lastSuccessfulStatus: 'community_created',
      });
      const response = await GET(makeRequest('req-uuid-abc123'));
      expect(await dataOf(response)).toEqual({ status: 'provisioning', step: 'community_created' });
    });

    it('reports a failure with the last good step', async () => {
      getProvisioningJobBySignupRequestId.mockResolvedValueOnce({
        ...BASE_JOB,
        status: 'failed',
        lastSuccessfulStatus: 'categories_created',
      });
      const response = await GET(makeRequest('req-uuid-abc123'));
      expect(await dataOf(response)).toEqual({ status: 'failed', step: 'categories_created' });
    });

    it('reports completion with the community, and no login token', async () => {
      const response = await GET(makeRequest('req-uuid-abc123'));
      expect(response.status).toBe(200);
      const data = await dataOf(response);
      expect(data).toEqual({ status: 'completed', step: 'completed', communityId: 42 });
      expect(data).not.toHaveProperty('loginToken');
    });
  });
});

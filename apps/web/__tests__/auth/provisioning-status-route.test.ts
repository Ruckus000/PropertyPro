/**
 * Route unit tests — `GET /api/v1/auth/provisioning-status`.
 *
 * The magic-link token is single-use: the first poll after completion issues a
 * token and atomically stamps login_token_consumed_at; later polls (and any
 * leaked-signupRequestId replay) see the consumed marker and get no token.
 * These tests mock the provisioning-service layer the route delegates to.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getProvisioningJobBySignupRequestId = vi.fn();
const getPendingSignupBySignupRequestId = vi.fn();
const issueSingleUseLoginToken = vi.fn();

vi.mock('@/lib/services/provisioning-service', () => ({
  getProvisioningJobBySignupRequestId: (...args: unknown[]) =>
    getProvisioningJobBySignupRequestId(...args),
  getPendingSignupBySignupRequestId: (...args: unknown[]) =>
    getPendingSignupBySignupRequestId(...args),
  issueSingleUseLoginToken: (...args: unknown[]) => issueSingleUseLoginToken(...args),
}));

import { GET } from '../../src/app/api/v1/auth/provisioning-status/route';

const BASE_JOB = {
  id: 1,
  signupRequestId: 'req-uuid-abc123',
  communityId: 42,
  status: 'completed',
  lastSuccessfulStatus: 'completed',
};

const BASE_SIGNUP = {
  email: 'newuser@example.com',
  payload: null,
  signupRequestId: 'req-uuid-abc123',
  loginTokenConsumedAt: null,
};

const HASHED_TOKEN = 'hashed-token-xyz789';

function makeRequest(signupRequestId?: string): Request {
  const url = signupRequestId
    ? `https://getpropertypro.com/api/v1/auth/provisioning-status?signupRequestId=${signupRequestId}`
    : `https://getpropertypro.com/api/v1/auth/provisioning-status`;
  return new Request(url, { method: 'GET' });
}

async function dataOf(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json()) as { data?: Record<string, unknown> };
  return (body.data ?? {}) as Record<string, unknown>;
}

describe('provisioning-status route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    issueSingleUseLoginToken.mockResolvedValue({ status: 'issued', token: HASHED_TOKEN });
    getPendingSignupBySignupRequestId.mockResolvedValue({ ...BASE_SIGNUP });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 400 when signupRequestId is missing', async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('returns pending when no provisioning job exists yet', async () => {
    getProvisioningJobBySignupRequestId.mockResolvedValue(null);

    const response = await GET(makeRequest('req-uuid-abc123'));
    expect(response.status).toBe(200);
    expect(await dataOf(response)).toEqual({ status: 'pending', step: 'waiting' });
    expect(issueSingleUseLoginToken).not.toHaveBeenCalled();
  });

  it('returns provisioning with current step when job is in progress', async () => {
    getProvisioningJobBySignupRequestId.mockResolvedValue({
      ...BASE_JOB,
      status: 'in_progress',
      lastSuccessfulStatus: 'community_created',
    });

    const response = await GET(makeRequest('req-uuid-abc123'));
    expect(response.status).toBe(200);
    expect(await dataOf(response)).toEqual({ status: 'provisioning', step: 'community_created' });
    expect(issueSingleUseLoginToken).not.toHaveBeenCalled();
  });

  it('returns failed with last successful step on failure', async () => {
    getProvisioningJobBySignupRequestId.mockResolvedValue({
      ...BASE_JOB,
      status: 'failed',
      lastSuccessfulStatus: 'community_created',
    });

    const response = await GET(makeRequest('req-uuid-abc123'));
    expect(response.status).toBe(200);
    expect(await dataOf(response)).toEqual({ status: 'failed', step: 'community_created' });
    expect(issueSingleUseLoginToken).not.toHaveBeenCalled();
  });

  it('issues and returns loginToken + communityId on the first completed poll', async () => {
    getProvisioningJobBySignupRequestId.mockResolvedValue({ ...BASE_JOB });

    const response = await GET(makeRequest('req-uuid-abc123'));
    expect(response.status).toBe(200);
    expect(await dataOf(response)).toEqual({
      status: 'completed',
      step: 'completed',
      loginToken: HASHED_TOKEN,
      communityId: 42,
    });
    expect(issueSingleUseLoginToken).toHaveBeenCalledWith('req-uuid-abc123', BASE_SIGNUP.email);
  });

  it('returns consumed (no token) when the token was already consumed (leaked-id replay)', async () => {
    getProvisioningJobBySignupRequestId.mockResolvedValue({ ...BASE_JOB });
    getPendingSignupBySignupRequestId.mockResolvedValue({
      ...BASE_SIGNUP,
      loginTokenConsumedAt: new Date('2026-05-04T00:00:00Z'),
    });

    const response = await GET(makeRequest('req-uuid-abc123'));
    expect(response.status).toBe(200);
    const data = await dataOf(response);
    expect(data).toEqual({ status: 'consumed', step: 'completed', communityId: 42 });
    expect(data).not.toHaveProperty('loginToken');
    // Must not even attempt to issue a new token.
    expect(issueSingleUseLoginToken).not.toHaveBeenCalled();
  });

  it('returns consumed (no token) when a concurrent poll wins the atomic claim', async () => {
    getProvisioningJobBySignupRequestId.mockResolvedValue({ ...BASE_JOB });
    issueSingleUseLoginToken.mockResolvedValue({ status: 'consumed' });

    const response = await GET(makeRequest('req-uuid-abc123'));
    expect(response.status).toBe(200);
    const data = await dataOf(response);
    expect(data).toEqual({ status: 'consumed', step: 'completed', communityId: 42 });
    expect(data).not.toHaveProperty('loginToken');
  });

  it('returns 500 when token issuance fails', async () => {
    getProvisioningJobBySignupRequestId.mockResolvedValue({ ...BASE_JOB });
    issueSingleUseLoginToken.mockResolvedValue({ status: 'error' });

    const response = await GET(makeRequest('req-uuid-abc123'));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error?.message).toMatch(/login token/i);
  });
});

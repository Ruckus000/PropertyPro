import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  state,
  provisioningJobsTable,
  pendingSignupsTable,
  eqMock,
  queryCounter,
  createUnscopedClientMock,
  createAdminClientMock,
  generateLinkMock,
  updateMock,
  setMock,
  whereMockUpdate,
} = vi.hoisted(() => {
  interface JobRow {
    id: number;
    signupRequestId: string;
    communityId: number;
    status: string;
    lastSuccessfulStatus: string | null;
  }

  interface SignupRow {
    email: string;
    payload: Record<string, unknown> | null;
    signupRequestId: string;
  }

  const state = {
    jobRows: [] as JobRow[],
    signupRows: [] as SignupRow[],
  };

  const queryCounter = { count: 0 };
  const eqMock = vi.fn(() => Symbol('eq_predicate'));

  // Update chain mocks
  const whereMockUpdate = vi.fn().mockResolvedValue(undefined);
  const setMock = vi.fn(() => ({ where: whereMockUpdate }));
  const updateMock = vi.fn(() => ({ set: setMock }));

  // Select chain — returns different data per call index
  const limitMock = vi.fn(async () => {
    const callIndex = queryCounter.count++;
    return callIndex === 0 ? state.jobRows : state.signupRows;
  });
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  const createUnscopedClientMock = vi.fn(() => ({
    select: selectMock,
    update: updateMock,
  }));

  const generateLinkMock = vi.fn();
  const createAdminClientMock = vi.fn(() => ({
    auth: {
      admin: {
        generateLink: generateLinkMock,
      },
    },
  }));

  return {
    state,
    provisioningJobsTable: Symbol('provisioning_jobs'),
    pendingSignupsTable: Symbol('pending_signups'),
    eqMock,
    queryCounter,
    createUnscopedClientMock,
    createAdminClientMock,
    generateLinkMock,
    updateMock,
    setMock,
    whereMockUpdate,
  };
});

vi.mock('@propertypro/db', () => ({
  provisioningJobs: provisioningJobsTable,
  pendingSignups: pendingSignupsTable,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: eqMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
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
};

const HASHED_TOKEN = 'hashed-token-xyz789';

function makeRequest(signupRequestId?: string): Request {
  const url = signupRequestId
    ? `https://getpropertypro.com/api/v1/auth/provisioning-status?signupRequestId=${signupRequestId}`
    : `https://getpropertypro.com/api/v1/auth/provisioning-status`;
  return new Request(url, { method: 'GET' });
}

describe('provisioning-status route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.jobRows = [];
    state.signupRows = [];
    queryCounter.count = 0;

    generateLinkMock.mockResolvedValue({
      data: {
        properties: {
          hashed_token: HASHED_TOKEN,
        },
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 400 when signupRequestId is missing', async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/signupRequestId/i);
  });

  it('returns pending when no provisioning job exists yet', async () => {
    state.jobRows = [];

    const response = await GET(makeRequest('req-uuid-abc123'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: 'pending', step: 'waiting' });
    // Should not try to look up signup or generate a link
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it('returns provisioning with current step when job is in progress', async () => {
    state.jobRows = [
      {
        ...BASE_JOB,
        status: 'in_progress',
        lastSuccessfulStatus: 'community_created',
      },
    ];

    const response = await GET(makeRequest('req-uuid-abc123'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: 'provisioning', step: 'community_created' });
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it('returns failed with last successful step on failure', async () => {
    state.jobRows = [
      {
        ...BASE_JOB,
        status: 'failed',
        lastSuccessfulStatus: 'community_created',
      },
    ];

    const response = await GET(makeRequest('req-uuid-abc123'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: 'failed', step: 'community_created' });
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it('generates and returns loginToken + communityId on completed', async () => {
    state.jobRows = [{ ...BASE_JOB, status: 'completed' }];
    state.signupRows = [{ ...BASE_SIGNUP, payload: null }];

    const response = await GET(makeRequest('req-uuid-abc123'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: 'completed',
      step: 'completed',
      loginToken: HASHED_TOKEN,
      communityId: 42,
    });
    expect(generateLinkMock).toHaveBeenCalledWith({
      type: 'magiclink',
      email: BASE_SIGNUP.email,
    });
    // Should cache the token
    expect(updateMock).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ loginToken: HASHED_TOKEN }) }),
    );
  });

  it('returns cached loginToken on repeated polls without calling generateLink', async () => {
    state.jobRows = [{ ...BASE_JOB, status: 'completed' }];
    state.signupRows = [
      {
        ...BASE_SIGNUP,
        payload: { loginToken: 'cached-token-from-db', someOtherField: true },
      },
    ];

    const response = await GET(makeRequest('req-uuid-abc123'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: 'completed',
      step: 'completed',
      loginToken: 'cached-token-from-db',
      communityId: 42,
    });
    // Must NOT call generateLink when cached token exists
    expect(generateLinkMock).not.toHaveBeenCalled();
    // Must NOT update the DB again
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns 500 when generateLink fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.jobRows = [{ ...BASE_JOB, status: 'completed' }];
    state.signupRows = [{ ...BASE_SIGNUP, payload: null }];

    generateLinkMock.mockResolvedValue({
      data: null,
      error: { message: 'Auth service unavailable' },
    });

    const response = await GET(makeRequest('req-uuid-abc123'));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/login token/i);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[provisioning-status]'),
      expect.any(String),
    );
  });
});

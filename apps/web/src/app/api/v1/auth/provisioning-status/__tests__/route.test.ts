import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jobSelectResult = vi.fn();
const signupSelectResult = vi.fn();
const updateResult = vi.fn();
const generateLink = vi.fn();

function buildSelectChain(rowsFactory: () => unknown) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => rowsFactory(),
  };
  return chain;
}

const dbMock = {
  select: vi.fn().mockImplementation((columns: Record<string, unknown>) => {
    const keys = Object.keys(columns ?? {});
    // Crude but effective discriminator: provisioningJobs select asks for `id, signupRequestId, communityId, status, lastSuccessfulStatus`.
    if (keys.includes('communityId') && keys.includes('lastSuccessfulStatus')) {
      return buildSelectChain(() => jobSelectResult());
    }
    return buildSelectChain(() => signupSelectResult());
  }),
  update: vi.fn().mockImplementation(() => ({
    set: () => ({
      where: () => ({
        returning: async () => updateResult(),
      }),
    }),
  })),
};

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => dbMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { generateLink: (...args: unknown[]) => generateLink(...args) } },
  }),
}));

vi.mock('@propertypro/db', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    provisioningJobs: { signupRequestId: 'col' } as never,
    pendingSignups: {
      signupRequestId: 'col',
      email: 'col',
      loginTokenConsumedAt: 'col',
      loginTokenIssuedAt: 'col',
      id: 'col',
    } as never,
  };
});

async function callPoll(signupRequestId = 'sru-1234') {
  const mod = await import('../route');
  return mod.GET(
    new Request(
      `http://localhost/api/v1/auth/provisioning-status?signupRequestId=${signupRequestId}`,
    ),
  );
}

describe('GET /api/v1/auth/provisioning-status — single-use token claim', () => {
  beforeEach(() => {
    jobSelectResult.mockReset();
    signupSelectResult.mockReset();
    updateResult.mockReset();
    generateLink.mockReset();
    dbMock.select.mockClear();
    dbMock.update.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when signupRequestId is missing', async () => {
    const mod = await import('../route');
    const response = await mod.GET(
      new Request('http://localhost/api/v1/auth/provisioning-status'),
    );
    expect(response.status).toBe(400);
  });

  it('returns pending/waiting before the provisioning job exists', async () => {
    jobSelectResult.mockResolvedValue([]);
    const response = await callPoll();
    const body = await response.json();
    expect(body).toMatchObject({ status: 'pending', step: 'waiting' });
  });

  it('returns the magic-link token on the first poll after completion (and marks consumed)', async () => {
    jobSelectResult.mockResolvedValue([
      { id: 1, signupRequestId: 'sru-1', communityId: 99, status: 'completed', lastSuccessfulStatus: 'completed' },
    ]);
    signupSelectResult.mockResolvedValue([
      { email: 'first@example.com', signupRequestId: 'sru-1', loginTokenConsumedAt: null },
    ]);
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'token-xyz' } },
      error: null,
    });
    updateResult.mockResolvedValue([{ id: 7n }]);

    const response = await callPoll();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'completed',
      loginToken: 'token-xyz',
      communityId: 99,
    });
    expect(updateResult).toHaveBeenCalledTimes(1);
  });

  it('returns consumed (no token) when the row already has loginTokenConsumedAt', async () => {
    jobSelectResult.mockResolvedValue([
      { id: 1, signupRequestId: 'sru-1', communityId: 99, status: 'completed', lastSuccessfulStatus: 'completed' },
    ]);
    signupSelectResult.mockResolvedValue([
      {
        email: 'leaked@example.com',
        signupRequestId: 'sru-1',
        loginTokenConsumedAt: new Date('2026-05-04T00:00:00Z'),
      },
    ]);

    const response = await callPoll();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: 'consumed', step: 'completed', communityId: 99 });
    expect(body).not.toHaveProperty('loginToken');
    expect(generateLink).not.toHaveBeenCalled();
    expect(updateResult).not.toHaveBeenCalled();
  });

  it('returns consumed (no token) when a concurrent poller wins the atomic claim race', async () => {
    jobSelectResult.mockResolvedValue([
      { id: 1, signupRequestId: 'sru-1', communityId: 99, status: 'completed', lastSuccessfulStatus: 'completed' },
    ]);
    signupSelectResult.mockResolvedValue([
      { email: 'first@example.com', signupRequestId: 'sru-1', loginTokenConsumedAt: null },
    ]);
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'token-xyz' } },
      error: null,
    });
    // Concurrent poller already claimed; conditional UPDATE returns 0 rows.
    updateResult.mockResolvedValue([]);

    const response = await callPoll();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: 'consumed' });
    expect(body).not.toHaveProperty('loginToken');
  });

  it('surfaces 500 when generateLink fails', async () => {
    jobSelectResult.mockResolvedValue([
      { id: 1, signupRequestId: 'sru-1', communityId: 99, status: 'completed', lastSuccessfulStatus: 'completed' },
    ]);
    signupSelectResult.mockResolvedValue([
      { email: 'first@example.com', signupRequestId: 'sru-1', loginTokenConsumedAt: null },
    ]);
    generateLink.mockResolvedValue({ data: null, error: { message: 'rate limited' } });

    const response = await callPoll();
    expect(response.status).toBe(500);
    expect(updateResult).not.toHaveBeenCalled();
  });
});

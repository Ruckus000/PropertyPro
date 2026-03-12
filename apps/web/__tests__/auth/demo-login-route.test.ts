import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  state,
  demoInstancesTable,
  eqMock,
  createUnscopedClientMock,
  createAdminClientMock,
  generateLinkMock,
  extractDemoIdFromTokenMock,
  validateDemoTokenMock,
  decryptDemoTokenSecretMock,
} = vi.hoisted(() => {
  interface DemoInstanceRow {
    id: number;
    authTokenSecret: string;
    demoResidentEmail: string;
    demoBoardEmail: string;
    seededCommunityId: number | null;
  }

  const state = {
    rows: [] as DemoInstanceRow[],
  };

  const eqMock = vi.fn(() => Symbol('eq_predicate'));
  const limitMock = vi.fn(async () => state.rows);
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const createUnscopedClientMock = vi.fn(() => ({
    select: selectMock,
  }));

  const generateLinkMock = vi.fn();
  const createAdminClientMock = vi.fn(() => ({
    auth: {
      admin: {
        generateLink: generateLinkMock,
      },
    },
  }));

  const extractDemoIdFromTokenMock = vi.fn();
  const validateDemoTokenMock = vi.fn();
  const decryptDemoTokenSecretMock = vi.fn();

  return {
    state,
    demoInstancesTable: Symbol('demo_instances'),
    eqMock,
    createUnscopedClientMock,
    createAdminClientMock,
    generateLinkMock,
    extractDemoIdFromTokenMock,
    validateDemoTokenMock,
    decryptDemoTokenSecretMock,
  };
});

vi.mock('@propertypro/db', () => ({
  demoInstances: demoInstancesTable,
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

vi.mock('@propertypro/shared/server', () => ({
  extractDemoIdFromToken: extractDemoIdFromTokenMock,
  validateDemoToken: validateDemoTokenMock,
  decryptDemoTokenSecret: decryptDemoTokenSecretMock,
}));

import { GET } from '../../src/app/api/v1/auth/demo-login/route';

const ACTION_LINK = 'https://supabase.example/auth/v1/verify?token=magic';
const BASE_INSTANCE = {
  id: 101,
  demoResidentEmail: 'demo-resident@test.propertyprofl.com',
  demoBoardEmail: 'demo-board@test.propertyprofl.com',
  seededCommunityId: 42,
};

function makeRequest(url: string): Request {
  return new Request(url, { method: 'GET' });
}

describe('demo-login route hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DEMO_TOKEN_ENCRYPTION_KEY_HEX', '');
    vi.stubEnv('DEMO_TOKEN_ENCRYPTION_KEY', '');
    state.rows = [];

    extractDemoIdFromTokenMock.mockReturnValue(101);
    decryptDemoTokenSecretMock.mockReturnValue('decrypted-secret');
    validateDemoTokenMock.mockReturnValue({
      demoId: 101,
      userId: 'user-1',
      role: 'resident',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    generateLinkMock.mockResolvedValue({
      data: {
        properties: {
          action_link: ACTION_LINK,
        },
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns session_error and logs when encrypted secret exists but DEMO_TOKEN_ENCRYPTION_KEY_HEX is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://propertyprofl.com');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    state.rows = [
      {
        ...BASE_INSTANCE,
        authTokenSecret: 'enc:v1:iv:cipher:tag',
      },
    ];

    const response = await GET(makeRequest('https://propertyprofl.com/api/v1/auth/demo-login?token=test'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://propertyprofl.com/auth/login?error=session_error');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('DEMO_TOKEN_ENCRYPTION_KEY_HEX is required'),
    );
    expect(decryptDemoTokenSecretMock).not.toHaveBeenCalled();
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it('uses trusted base URL for redirectTo even when request host is malicious', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://propertyprofl.com');
    vi.stubEnv('DEMO_TOKEN_ENCRYPTION_KEY_HEX', 'a'.repeat(64));

    state.rows = [
      {
        ...BASE_INSTANCE,
        authTokenSecret: 'enc:v1:iv:cipher:tag',
      },
    ];

    const response = await GET(makeRequest('https://evil.example/api/v1/auth/demo-login?token=test'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(ACTION_LINK);
    expect(generateLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'magiclink',
        email: BASE_INSTANCE.demoResidentEmail,
        options: {
          redirectTo: 'https://propertyprofl.com/mobile?communityId=42',
        },
      }),
    );
  });

  it('keeps legacy plaintext-secret flow working without encryption key', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://propertyprofl.com');
    decryptDemoTokenSecretMock.mockReturnValue('legacy-plaintext-secret');

    state.rows = [
      {
        ...BASE_INSTANCE,
        authTokenSecret: 'legacy-plaintext-secret',
      },
    ];

    const response = await GET(makeRequest('https://propertyprofl.com/api/v1/auth/demo-login?token=test'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(ACTION_LINK);
    expect(decryptDemoTokenSecretMock).toHaveBeenCalledWith('legacy-plaintext-secret', '');
    expect(generateLinkMock).toHaveBeenCalledTimes(1);
  });

  it('returns invalid_token when decryption fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://propertyprofl.com');
    vi.stubEnv('DEMO_TOKEN_ENCRYPTION_KEY_HEX', 'a'.repeat(64));
    decryptDemoTokenSecretMock.mockReturnValue(null);
    validateDemoTokenMock.mockReturnValue(null);

    state.rows = [
      {
        ...BASE_INSTANCE,
        authTokenSecret: 'enc:v1:iv:cipher:tag',
      },
    ];

    const response = await GET(makeRequest('https://propertyprofl.com/api/v1/auth/demo-login?token=test'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://propertyprofl.com/auth/login?error=invalid_token');
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it('uses trusted base for login errors and sets hardened redirect headers', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://propertyprofl.com');

    const response = await GET(makeRequest('https://evil.example/api/v1/auth/demo-login'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://propertyprofl.com/auth/login');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Pragma')).toBe('no-cache');
  });
});

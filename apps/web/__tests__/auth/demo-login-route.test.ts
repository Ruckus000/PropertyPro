import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  state,
  demoInstancesTable,
  communitiesTable,
  eqMock,
  queryCounter,
  createUnscopedClientMock,
  createAdminClientMock,
  generateLinkMock,
  extractDemoIdFromTokenMock,
  validateDemoTokenMock,
  decryptDemoTokenSecretMock,
  verifyOtpMock,
  createServerClientMock,
  cookiesMock,
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
    communityRows: [{ demoExpiresAt: null }] as Array<{ demoExpiresAt: Date | string | null }>,
  };

  const queryCounter = { count: 0 };
  const eqMock = vi.fn(() => Symbol('eq_predicate'));
  const limitMock = vi.fn(async () => {
    // First select() call returns demo instance rows, second returns community rows
    const callIndex = queryCounter.count++;
    return callIndex === 0 ? state.rows : state.communityRows;
  });
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

  const verifyOtpMock = vi.fn();
  const createServerClientMock = vi.fn(() => ({
    auth: {
      verifyOtp: verifyOtpMock,
    },
  }));

  const cookiesMock = vi.fn(() => ({
    getAll: vi.fn(() => []),
    set: vi.fn(),
  }));

  return {
    state,
    demoInstancesTable: Symbol('demo_instances'),
    communitiesTable: { demoExpiresAt: Symbol('demoExpiresAt'), id: Symbol('communities_id') },
    queryCounter,
    eqMock,
    createUnscopedClientMock,
    createAdminClientMock,
    generateLinkMock,
    extractDemoIdFromTokenMock,
    validateDemoTokenMock,
    decryptDemoTokenSecretMock,
    verifyOtpMock,
    createServerClientMock,
    cookiesMock,
  };
});

vi.mock('@propertypro/db', () => ({
  demoInstances: demoInstancesTable,
  communities: communitiesTable,
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

vi.mock('@propertypro/db/supabase/cookie-config', () => ({
  getCookieOptions: vi.fn(() => ({})),
}));

vi.mock('@propertypro/shared/server', () => ({
  extractDemoIdFromToken: extractDemoIdFromTokenMock,
  validateDemoToken: validateDemoTokenMock,
  decryptDemoTokenSecret: decryptDemoTokenSecretMock,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: createServerClientMock,
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

import { GET } from '../../src/app/api/v1/auth/demo-login/route';

const HASHED_TOKEN = 'hashed-token-abc123';
const BASE_INSTANCE = {
  id: 101,
  demoResidentEmail: 'demo-resident@test.getpropertypro.com',
  demoBoardEmail: 'demo-board@test.getpropertypro.com',
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
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
    state.rows = [];
    state.communityRows = [{ demoExpiresAt: null }];
    queryCounter.count = 0;

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
          hashed_token: HASHED_TOKEN,
        },
      },
      error: null,
    });

    verifyOtpMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns session_error and logs when encrypted secret exists but DEMO_TOKEN_ENCRYPTION_KEY_HEX is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://getpropertypro.com');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    state.rows = [
      {
        ...BASE_INSTANCE,
        authTokenSecret: 'enc:v1:iv:cipher:tag',
      },
    ];

    const response = await GET(makeRequest('https://getpropertypro.com/api/v1/auth/demo-login?token=test'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://getpropertypro.com/auth/login?error=session_error');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('DEMO_TOKEN_ENCRYPTION_KEY_HEX is required'),
    );
    expect(decryptDemoTokenSecretMock).not.toHaveBeenCalled();
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it('redirects to computed URL after server-side OTP verification', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://getpropertypro.com');
    vi.stubEnv('DEMO_TOKEN_ENCRYPTION_KEY_HEX', 'a'.repeat(64));

    state.rows = [
      {
        ...BASE_INSTANCE,
        authTokenSecret: 'enc:v1:iv:cipher:tag',
      },
    ];

    const response = await GET(makeRequest('https://evil.example/api/v1/auth/demo-login?token=test'));

    expect(response.status).toBe(307);
    // Should redirect to the computed redirect URL, not to a Supabase action link
    expect(response.headers.get('location')).toBe('https://getpropertypro.com/mobile?communityId=42');
    expect(generateLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'magiclink',
        email: BASE_INSTANCE.demoResidentEmail,
      }),
    );
    expect(verifyOtpMock).toHaveBeenCalledWith({
      token_hash: HASHED_TOKEN,
      type: 'magiclink',
    });
  });

  it('keeps legacy plaintext-secret flow working without encryption key', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://getpropertypro.com');
    decryptDemoTokenSecretMock.mockReturnValue('legacy-plaintext-secret');

    state.rows = [
      {
        ...BASE_INSTANCE,
        authTokenSecret: 'legacy-plaintext-secret',
      },
    ];

    const response = await GET(makeRequest('https://getpropertypro.com/api/v1/auth/demo-login?token=test'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://getpropertypro.com/mobile?communityId=42');
    expect(decryptDemoTokenSecretMock).toHaveBeenCalledWith('legacy-plaintext-secret', '');
    expect(generateLinkMock).toHaveBeenCalledTimes(1);
    expect(verifyOtpMock).toHaveBeenCalledTimes(1);
  });

  it('returns invalid_token when decryption fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://getpropertypro.com');
    vi.stubEnv('DEMO_TOKEN_ENCRYPTION_KEY_HEX', 'a'.repeat(64));
    decryptDemoTokenSecretMock.mockReturnValue(null);
    validateDemoTokenMock.mockReturnValue(null);

    state.rows = [
      {
        ...BASE_INSTANCE,
        authTokenSecret: 'enc:v1:iv:cipher:tag',
      },
    ];

    const response = await GET(makeRequest('https://getpropertypro.com/api/v1/auth/demo-login?token=test'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://getpropertypro.com/auth/login?error=invalid_token');
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it('uses trusted base for login errors and sets hardened redirect headers', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://getpropertypro.com');

    const response = await GET(makeRequest('https://evil.example/api/v1/auth/demo-login'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://getpropertypro.com/auth/login');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Pragma')).toBe('no-cache');
  });

  it('returns session_error when OTP verification fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://getpropertypro.com');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    state.rows = [
      {
        ...BASE_INSTANCE,
        authTokenSecret: 'plaintext-secret',
      },
    ];

    verifyOtpMock.mockResolvedValue({ data: null, error: { message: 'Invalid OTP' } });

    const response = await GET(makeRequest('https://getpropertypro.com/api/v1/auth/demo-login?token=test'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://getpropertypro.com/auth/login?error=session_error');
    expect(errorSpy).toHaveBeenCalledWith(
      '[demo-session] OTP verification failed:',
      'Invalid OTP',
    );
  });

  it('returns session_error when hashed_token is missing from generateLink response', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://getpropertypro.com');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    state.rows = [
      {
        ...BASE_INSTANCE,
        authTokenSecret: 'plaintext-secret',
      },
    ];

    generateLinkMock.mockResolvedValue({
      data: { properties: {} },
      error: null,
    });

    const response = await GET(makeRequest('https://getpropertypro.com/api/v1/auth/demo-login?token=test'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://getpropertypro.com/auth/login?error=session_error');
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it('propagates preview=true to redirect URL via HTML redirect (200)', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://getpropertypro.com');

    state.rows = [
      {
        ...BASE_INSTANCE,
        authTokenSecret: 'plaintext-secret',
      },
    ];

    const response = await GET(
      makeRequest('https://getpropertypro.com/api/v1/auth/demo-login?token=test&preview=true'),
    );

    // Preview mode uses a 200 HTML response with client-side redirect
    // because browsers block Set-Cookie on 307 in cross-origin iframes
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('https://getpropertypro.com/mobile?communityId=42&amp;preview=true');
  });
});

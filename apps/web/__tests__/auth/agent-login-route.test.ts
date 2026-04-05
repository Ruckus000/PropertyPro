import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAdminClientMock,
  generateLinkMock,
  createServerClientMock,
  verifyOtpMock,
  cookiesMock,
  findUserCommunitiesUnscopedMock,
} = vi.hoisted(() => {
  const generateLinkMock = vi.fn();
  const createAdminClientMock = vi.fn(() => ({
    auth: {
      admin: {
        generateLink: generateLinkMock,
      },
    },
  }));

  const verifyOtpMock = vi.fn();
  const createServerClientMock = vi.fn(() => ({
    auth: {
      verifyOtp: verifyOtpMock,
    },
  }));

  const cookiesMock = vi.fn(async () => ({
    getAll: vi.fn(() => []),
    set: vi.fn(),
  }));

  const findUserCommunitiesUnscopedMock = vi.fn();

  return {
    createAdminClientMock,
    generateLinkMock,
    createServerClientMock,
    verifyOtpMock,
    cookiesMock,
    findUserCommunitiesUnscopedMock,
  };
});

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@propertypro/db/supabase/cookie-config', () => ({
  getCookieOptions: vi.fn(() => ({})),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  findUserCommunitiesUnscoped: findUserCommunitiesUnscopedMock,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: createServerClientMock,
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

import { GET } from '@/app/dev/agent-login/route';

function makeRequest(url: string, accept = 'application/json'): Request {
  return new Request(url, {
    method: 'GET',
    headers: { accept },
  });
}

describe('dev agent-login route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://getpropertypro.com');

    generateLinkMock.mockResolvedValue({
      data: {
        properties: {
          hashed_token: 'hashed-token',
        },
      },
      error: null,
    });

    verifyOtpMock.mockResolvedValue({
      data: {
        user: {
          id: 'pm-user-1',
          email: 'pm.admin@sunset.local',
        },
      },
      error: null,
    });

    findUserCommunitiesUnscopedMock.mockResolvedValue([
      {
        communityId: 42,
        communityName: 'Sunset Condos',
        slug: 'sunset-condos',
        communityType: 'condo_718',
        role: 'pm_admin',
      },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the PM dashboard communities portal in JSON mode', async () => {
    const response = await GET(
      makeRequest('http://localhost:3000/dev/agent-login?as=pm_admin', 'application/json'),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.portal).toBe('/pm/dashboard/communities');
    expect(body.hint).toContain('/pm/dashboard/communities');
  });

  it('uses the request origin for HTML redirects in development', async () => {
    const response = await GET(
      makeRequest('http://localhost:3000/dev/agent-login?as=pm_admin', 'text/html'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/pm/dashboard/communities');
  });
});

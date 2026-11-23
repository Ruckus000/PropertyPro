import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { headersMock, cookiesMock, getClaimsMock, createServerClientMock, redirectMock } = vi.hoisted(() => {
  const getClaimsMock = vi.fn();
  return {
  headersMock: vi.fn(),
  cookiesMock: vi.fn(async () => ({ getAll: () => [] })),
  getClaimsMock,
  createServerClientMock: vi.fn(() => ({ auth: { getClaims: getClaimsMock } })),
  // Mirrors next/navigation: redirect() never returns, it throws NEXT_REDIRECT.
  redirectMock: vi.fn((url: string) => {
    const err = new Error('NEXT_REDIRECT') as Error & { digest?: string };
    err.digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  }),
  };
});

vi.mock('next/headers', () => ({
  headers: headersMock,
  cookies: cookiesMock,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: createServerClientMock,
}));

function claims(value: { sub: string; aal?: string } | null) {
  getClaimsMock.mockResolvedValue({ data: value ? { claims: value } : null, error: null });
}

const ADMIN_HEADERS = {
  'x-user-id': 'admin-1',
  'x-user-email': 'admin@getpropertypro.com',
  'x-platform-admin-role': 'super_admin',
};

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('admin page context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the forwarded admin session when an aal2 session matches it', async () => {
    headersMock.mockResolvedValue(new Headers(ADMIN_HEADERS));
    claims({ sub: 'admin-1', aal: 'aal2' });

    const { requireAdminPageSession } = await import(
      '@/lib/request/admin-page-context'
    );

    await expect(requireAdminPageSession()).resolves.toEqual({
      id: 'admin-1',
      email: 'admin@getpropertypro.com',
      role: 'super_admin',
    });
  });

  // A Server Component cannot set an HTTP status, so these redirect instead of
  // throwing. Previously they did `throw new Response(...)`, a Remix idiom the
  // App Router never unwraps — it surfaced as an unstyled 500, not a 401/403.
  it('redirects to login when the forwarded admin context is missing', async () => {
    headersMock.mockResolvedValue(new Headers());

    const { requireAdminPageSession } = await import(
      '@/lib/request/admin-page-context'
    );

    await expect(requireAdminPageSession()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/auth/login');
  });

  it('redirects with access_denied when the role is not super_admin', async () => {
    headersMock.mockResolvedValue(
      new Headers({
        'x-user-id': 'admin-1',
        'x-platform-admin-role': 'not_an_admin',
      }),
    );

    const { requireAdminPageSession } = await import(
      '@/lib/request/admin-page-context'
    );

    await expect(requireAdminPageSession()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/auth/login?error=access_denied');
  });

  // Pages verify the session themselves, in addition to middleware.
  describe('session check', () => {
    async function expectLoginRedirect() {
      const { requireAdminPageSession } = await import(
        '@/lib/request/admin-page-context'
      );
      await expect(requireAdminPageSession()).rejects.toThrow('NEXT_REDIRECT');
      expect(redirectMock).toHaveBeenCalledWith('/auth/login');
    }

    it('admin headers with no session redirect to login', async () => {
      headersMock.mockResolvedValue(new Headers(ADMIN_HEADERS));
      claims(null);
      await expectLoginRedirect();
    });

    it('admin headers with only an aal1 session redirect to login', async () => {
      headersMock.mockResolvedValue(new Headers(ADMIN_HEADERS));
      claims({ sub: 'admin-1', aal: 'aal1' });
      await expectLoginRedirect();
    });

    it('an admin header id that disagrees with the session subject redirects to login', async () => {
      headersMock.mockResolvedValue(new Headers(ADMIN_HEADERS));
      claims({ sub: 'admin-2', aal: 'aal2' });
      await expectLoginRedirect();
    });

    it('reads the admin session cookie, not the web one', async () => {
      headersMock.mockResolvedValue(new Headers(ADMIN_HEADERS));
      claims({ sub: 'admin-1', aal: 'aal2' });

      const { requireAdminPageSession } = await import(
        '@/lib/request/admin-page-context'
      );
      await requireAdminPageSession();

      expect(createServerClientMock).toHaveBeenCalledWith(
        'http://127.0.0.1:54321',
        'anon-key',
        expect.objectContaining({
          cookieOptions: expect.objectContaining({ name: 'sb-admin-auth-token' }),
        }),
      );
      expect(getClaimsMock).toHaveBeenCalledWith();
    });
  });
});

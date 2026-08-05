import { beforeEach, describe, expect, it, vi } from 'vitest';

const { headersMock, redirectMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  // Mirrors next/navigation: redirect() never returns, it throws NEXT_REDIRECT.
  redirectMock: vi.fn((url: string) => {
    const err = new Error('NEXT_REDIRECT') as Error & { digest?: string };
    err.digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  }),
}));

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('admin page context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns the forwarded admin session', async () => {
    headersMock.mockResolvedValue(
      new Headers({
        'x-user-id': 'admin-1',
        'x-user-email': 'admin@getpropertypro.com',
        'x-platform-admin-role': 'super_admin',
      }),
    );

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
});

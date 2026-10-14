/**
 * requirePlatformAdmin — the gate every admin API route calls.
 *
 * 32 test files mock this function away, so nothing tested the real one. It
 * now also refuses a password-only (aal1) session (ponytail audit #14): the
 * middleware is not the only gate a route handler should trust.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, getClaimsMock, singleMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  getClaimsMock: vi.fn(),
  singleMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [] }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: getUserMock, getClaims: getClaimsMock } }),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: singleMock }) }) }),
  }),
}));

import { requirePlatformAdmin } from '@/lib/auth/platform-admin';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  getUserMock.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'ops@example.com' } }, error: null });
  getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'admin-1', aal: 'aal2' } }, error: null });
  singleMock.mockResolvedValue({ data: { role: 'super_admin' } });
});

describe('requirePlatformAdmin', () => {
  it('admits a platform admin whose session passed the second factor', async () => {
    await expect(requirePlatformAdmin()).resolves.toEqual({
      id: 'admin-1',
      email: 'ops@example.com',
      role: 'super_admin',
    });
  });

  it('refuses a password-only (aal1) session with 401 MFA_REQUIRED', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'admin-1', aal: 'aal1' } }, error: null });
    await expect(requirePlatformAdmin()).rejects.toMatchObject({
      statusCode: 401,
      code: 'MFA_REQUIRED',
    });
    // Refused before the service-role lookup.
    expect(singleMock).not.toHaveBeenCalled();
  });

  it('refuses when the claims cannot be verified', async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: new Error('invalid JWT') });
    await expect(requirePlatformAdmin()).rejects.toMatchObject({ code: 'MFA_REQUIRED' });
  });

  it('refuses with no session at all', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requirePlatformAdmin()).rejects.toMatchObject({ statusCode: 401 });
    expect(getClaimsMock).not.toHaveBeenCalled();
  });

  it('refuses an aal2 session that has no platform_admin_users row', async () => {
    singleMock.mockResolvedValue({ data: null });
    await expect(requirePlatformAdmin()).rejects.toMatchObject({ statusCode: 403 });
  });
});

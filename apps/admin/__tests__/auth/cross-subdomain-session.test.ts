/**
 * P1-7: Cross-subdomain session tests.
 *
 * Verifies that a session from .getpropertypro.com is accepted by admin
 * middleware, and that non-admin accounts are rejected even with valid sessions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetUser = vi.fn();
const mockSingle = vi.fn();
const mockAdminDb = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: mockSingle,
      })),
    })),
  })),
};

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: vi.fn(async () => ({
    supabase: { auth: { getUser: mockGetUser } },
    response: { headers: new Headers(), status: 200 },
  })),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockAdminDb),
}));

describe('cross-subdomain session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts session from a platform_admin_users member', async () => {
    const adminUserId = 'platform-admin-uuid';
    mockGetUser.mockResolvedValue({
      data: { user: { id: adminUserId, email: 'admin@getpropertypro.com' } },
    });
    mockSingle.mockResolvedValue({ data: { user_id: adminUserId } });

    const { middleware } = await import('@/middleware');
    const req = new NextRequest('http://admin.getpropertypro.com/clients');
    const res = await middleware(req);

    // Should not redirect to login
    expect(res.status).not.toBe(307);
    expect(mockSingle).toHaveBeenCalledOnce();
  });

  it('rejects session for user not in platform_admin_users', async () => {
    const nonAdminId = 'regular-user-uuid';
    mockGetUser.mockResolvedValue({
      data: { user: { id: nonAdminId, email: 'user@sunset-condos.getpropertypro.com' } },
    });
    mockSingle.mockResolvedValue({ data: null }); // No platform_admin_users row

    const { middleware } = await import('@/middleware');
    const req = new NextRequest('http://admin.getpropertypro.com/clients');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('access_denied');
  });

  it('rejects request with no session at all', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { middleware } = await import('@/middleware');
    const req = new NextRequest('http://admin.getpropertypro.com/clients');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/auth/login');
    // Should not have checked platform_admin_users since there's no session
    expect(mockSingle).not.toHaveBeenCalled();
  });
});

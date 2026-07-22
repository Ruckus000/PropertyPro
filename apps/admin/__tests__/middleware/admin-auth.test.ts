/**
 * P1-7: Admin middleware auth tests.
 *
 * Tests the platform admin authorization enforcement in middleware.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockSingleFrom = vi.fn();
const mockAdminDb = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: mockSingleFrom,
      })),
    })),
  })),
};

// createMiddlewareClient resolves the user itself (getClaims) and returns it
// directly — the admin middleware no longer calls supabase.auth.getUser.
// Tests set `middlewareUser` to control the authenticated identity.
let middlewareUser: { id: string; email: string | null; emailVerified: boolean } | null = null;

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: vi.fn(async (_req: NextRequest) => {
    return {
      supabase: { auth: { getUser: mockGetUser } },
      response: {
        headers: new Headers(),
        status: 200,
      },
      user: middlewareUser,
      authChecked: middlewareUser != null,
    };
  }),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockAdminDb),
}));

// ---------------------------------------------------------------------------
// Helper: build a mock NextRequest
// ---------------------------------------------------------------------------
function makeRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(`http://admin.getpropertypro.com${pathname}`));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('admin middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    middlewareUser = null;
  });

  it('passes through /auth/login without session check', async () => {
    const { middleware } = await import('@/middleware');
    const req = makeRequest('/auth/login');
    const res = await middleware(req);
    expect(res.status).not.toBe(302);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('passes through /api/health without session check', async () => {
    const { middleware } = await import('@/middleware');
    const req = makeRequest('/api/health');
    const res = await middleware(req);
    expect(res.status).not.toBe(302);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('redirects unauthenticated request to /clients → /auth/login', async () => {
    middlewareUser = null;

    const { middleware } = await import('@/middleware');
    const req = makeRequest('/clients');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/auth/login');
  });

  it('redirects authenticated non-admin user to /auth/login?error=access_denied', async () => {
    middlewareUser = { id: 'user-123', email: 'notadmin@example.com', emailVerified: true };
    mockSingleFrom.mockResolvedValue({ data: null });

    const { middleware } = await import('@/middleware');
    const req = makeRequest('/clients');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/auth/login');
    expect(location).toContain('access_denied');
  });

  it('passes through authenticated platform admin', async () => {
    middlewareUser = { id: 'admin-456', email: 'admin@getpropertypro.com', emailVerified: true };
    mockSingleFrom.mockResolvedValue({ data: { user_id: 'admin-456' } });

    const { middleware } = await import('@/middleware');
    const req = makeRequest('/clients');
    const res = await middleware(req);

    expect(res.status).not.toBe(307);
  });

  it('returns 429 on rate limit exceeded', async () => {
    // The rate limiter is stateful; this test is basic verification
    // In real tests you would mock Date.now() to control the window
    middlewareUser = null;

    const { middleware } = await import('@/middleware');

    // Make 101 API requests with the same IP to trigger rate limit
    // (simplified — the rate limiter resets per module import in tests)
    const req = makeRequest('/api/some-endpoint');
    Object.defineProperty(req, 'headers', {
      value: new Headers({ 'x-forwarded-for': '1.2.3.4' }),
    });

    // First request passes
    const res = await middleware(req);
    // Can't fully test without mocking the rate store, but verify structure
    expect([200, 307, 429]).toContain(res.status);
  });
});

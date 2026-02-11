import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { getUserMock, createMiddlewareClientMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  createMiddlewareClientMock: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: createMiddlewareClientMock,
}));

import { middleware } from '../../src/middleware';

function request(url: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, {
    headers,
  });
}

describe('p1-22 session middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createMiddlewareClientMock.mockResolvedValue({
      supabase: {
        auth: {
          getUser: getUserMock,
        },
      },
      response: NextResponse.next(),
    });

    getUserMock.mockResolvedValue({
      data: {
        user: null,
      },
    });
  });

  it('preserves incoming x-request-id header', async () => {
    const response = await middleware(
      request('http://localhost:3000/', { 'x-request-id': 'req-123' }),
    );

    expect(response.headers.get('X-Request-ID')).toBe('req-123');
  });

  it('redirects unauthenticated protected requests to login with returnTo', async () => {
    const response = await middleware(
      request('http://localhost:3000/dashboard?tab=overview'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/auth/login');
    expect(response.headers.get('location')).toContain('returnTo=%2Fdashboard%3Ftab%3Doverview');
  });

  it('redirects authenticated but unverified users to /auth/verify-email', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email_confirmed_at: null,
        },
      },
    });

    const response = await middleware(request('http://localhost:3000/dashboard'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/auth/verify-email');
    expect(response.headers.get('location')).toContain('returnTo=%2Fdashboard');
  });

  it('allows authenticated + verified users to access protected routes', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email_confirmed_at: '2026-02-11T21:00:00.000Z',
        },
      },
    });

    const response = await middleware(request('http://localhost:3000/dashboard'));

    expect(response.status).toBe(200);
  });

  it('redirects authenticated users away from auth pages to dashboard by default', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email_confirmed_at: '2026-02-11T21:00:00.000Z',
        },
      },
    });

    const response = await middleware(request('http://localhost:3000/auth/login'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/dashboard');
  });

  it('redirects authenticated users to returnTo when present on auth pages', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email_confirmed_at: '2026-02-11T21:00:00.000Z',
        },
      },
    });

    const response = await middleware(
      request('http://localhost:3000/auth/login?returnTo=%2Fdocuments'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/documents');
  });

  it('keeps unverified users on verify-email route (no redirect loop)', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email_confirmed_at: null,
        },
      },
    });

    const response = await middleware(request('http://localhost:3000/auth/verify-email'));

    expect(response.status).toBe(200);
  });
});

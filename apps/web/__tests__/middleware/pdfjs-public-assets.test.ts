import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { createMiddlewareClientMock, getUserMock } = vi.hoisted(() => ({
  createMiddlewareClientMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: createMiddlewareClientMock,
}));

import { config, middleware } from '../../src/middleware';

function request(pathname: string): NextRequest {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    headers: {
      host: 'localhost:3000',
      'x-real-ip': '203.0.113.10',
    },
  });
}

describe('PDF.js public asset contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({
      data: {
        user: null,
      },
    });
    createMiddlewareClientMock.mockResolvedValue({
      supabase: {
        auth: {
          getUser: getUserMock,
        },
      },
      response: NextResponse.next(),
    });
  });

  it('keeps PDF.js assets outside the middleware matcher', () => {
    expect(config.matcher).toEqual(
      expect.arrayContaining([
        expect.stringContaining('pdfjs/'),
      ]),
    );
    expect(config.matcher).toEqual(
      expect.arrayContaining([
        expect.stringContaining('mjs'),
      ]),
    );
  });

  it('does not redirect or require auth when a PDF.js asset request reaches middleware', async () => {
    const response = await middleware(request('/pdfjs/pdf.mjs'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(await response.text()).toBe('');
  });
});

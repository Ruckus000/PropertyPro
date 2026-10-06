/**
 * POST /api/v1/auth/signup/details — the route's own job is to resolve the REAL
 * session user and refuse without one. Everything else is the service's
 * (`email-first-service.test.ts`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  submitSignupDetailsMock: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: h.getUserMock } }),
}));
vi.mock('../../src/lib/auth/signup-email-first', () => ({
  submitSignupDetails: h.submitSignupDetailsMock,
}));

import { POST } from '../../src/app/api/v1/auth/signup/details/route';

function post(body: unknown): NextRequest {
  return new NextRequest('https://www.getpropertypro.com/api/v1/auth/signup/details', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/v1/auth/signup/details', () => {
  it('401s without a session and never reaches the service', async () => {
    h.getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(post({}), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    expect(h.submitSignupDetailsMock).not.toHaveBeenCalled();
  });

  it('passes the session user and body to the service and wraps the result', async () => {
    const user = { id: 'u1', email: 'a@example.com', email_confirmed_at: '2026-10-06T00:00:00Z' };
    h.getUserMock.mockResolvedValue({ data: { user }, error: null });
    h.submitSignupDetailsMock.mockResolvedValue({ signupRequestId: 'req-1', subdomain: 'bayview' });

    const res = await POST(post({ communityName: 'Bayview' }), { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    expect(h.submitSignupDetailsMock).toHaveBeenCalledWith(user, { communityName: 'Bayview' });
    expect(await res.json()).toEqual({ data: { signupRequestId: 'req-1', subdomain: 'bayview' } });
  });
});

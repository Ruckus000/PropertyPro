/**
 * Admin middleware rate limiting.
 *
 * The limiter used to run AFTER the public-path short-circuit and only for
 * `/api/*`, so the only throttled surface was `/api/admin/*` — endpoints that
 * already require a `platform_admin_users` row. Everything an unauthenticated
 * client can actually reach (`/auth/login`, `/dev/agent-login`) was exempt
 * twice over: it returned before the check, and it would have failed the
 * `isApiRoute` test anyway.
 *
 * Note what this cannot cover: the credential POST itself goes browser →
 * Supabase GoTrue and never touches middleware. See the header comment in
 * `src/middleware.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockSingle = vi.fn();

let middlewareUser: { id: string; email: string | null; emailVerified: boolean } | null = null;

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: vi.fn(async () => ({
    supabase: { auth: { getUser: vi.fn() } },
    response: { headers: new Headers(), status: 200 },
    user: middlewareUser,
    authChecked: middlewareUser != null,
  })),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockSingle })) })),
    })),
  })),
}));

import { middleware } from '@/middleware';

/** Each test uses a unique IP so the module-level bucket store stays isolated. */
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

function request(pathname: string, ip: string): NextRequest {
  return new NextRequest(`http://localhost:3001${pathname}`, {
    headers: { host: 'localhost:3001', 'x-forwarded-for': ip },
  });
}

async function hammer(pathname: string, ip: string, times: number): Promise<Response[]> {
  const responses: Response[] = [];
  for (let i = 0; i < times; i += 1) {
    responses.push(await middleware(request(pathname, ip)));
  }
  return responses;
}

beforeEach(() => {
  vi.clearAllMocks();
  middlewareUser = null;
  mockSingle.mockResolvedValue({ data: null });
});

describe('admin middleware rate limiting', () => {
  it('throttles the login page, which is a public path', async () => {
    const ip = nextIp();
    const responses = await hammer('/auth/login', ip, 25);

    // AUTH_RATE_LIMIT is 20.
    expect(responses.slice(0, 20).every((r) => r.status !== 429)).toBe(true);
    expect(responses[20]!.status).toBe(429);
  });

  it('throttles /dev/agent-login', async () => {
    const ip = nextIp();
    const responses = await hammer('/dev/agent-login', ip, 25);

    expect(responses[24]!.status).toBe(429);
  });

  it('returns Retry-After and X-RateLimit-Reset on a 429', async () => {
    const ip = nextIp();
    const responses = await hammer('/auth/login', ip, 25);
    const throttled = responses.find((r) => r.status === 429)!;

    expect(throttled.headers.get('Retry-After')).toBeTruthy();
    expect(Number(throttled.headers.get('X-RateLimit-Reset'))).toBeGreaterThan(0);
    expect(throttled.headers.get('X-RateLimit-Limit')).toBe('20');
  });

  // Separate keyspaces, asserted in the direction that can actually bite: API
  // traffic must not consume the (much smaller) LOGIN allowance, or a burst of
  // 20 API calls would lock a real operator out of signing in.
  //
  // The reverse direction — login traffic consuming the API allowance — cannot
  // distinguish a shared bucket from separate ones, because the auth bucket
  // caps at 20 and the API limit is 100. A test written that way passes against
  // a single shared key and proves nothing; a revert-check caught exactly that.
  it('does not let API traffic consume the login allowance', async () => {
    const ip = nextIp();
    await hammer('/api/admin/stats', ip, 25);

    const loginResponse = await middleware(request('/auth/login', ip));
    expect(loginResponse.status).not.toBe(429);
  });

  it('gives the general API surface the larger allowance', async () => {
    const ip = nextIp();
    const responses = await hammer('/api/admin/stats', ip, 25);

    // 25 < RATE_LIMIT (100) — the tighter auth bucket must not apply here.
    expect(responses.every((r) => r.status !== 429)).toBe(true);
  });

  // A shared 'unknown' key put every unattributable client in ONE bucket, so a
  // single stream could exhaust the allowance for all of them.
  it('does not put un-keyable clients into a single shared bucket', async () => {
    const noIp = () =>
      middleware(
        new NextRequest('http://localhost:3001/auth/login', {
          headers: { host: 'localhost:3001' },
        }),
      );

    const responses: Response[] = [];
    for (let i = 0; i < 30; i += 1) responses.push(await noIp());

    expect(responses.every((r) => r.status !== 429)).toBe(true);
  });

  // /api/health must stay reachable for the deploy smoke test and any uptime
  // monitor. It is an EXACT public path — as a prefix it would have made a
  // future /api/healthz unauthenticated on the service-role console.
  it('leaves /api/health public and does not open /api/healthz', async () => {
    const health = await middleware(request('/api/health', nextIp()));
    expect(health.status).not.toBe(307);

    // No platform_admin_users row is mocked, so a non-public path redirects.
    const lookalike = await middleware(request('/api/healthz', nextIp()));
    expect(lookalike.status).toBe(307);
  });

  // The favicon must not sit behind the auth wall: the login page is the one
  // screen guaranteed to be unauthenticated, so a redirected /icon.svg means
  // it has no tab icon at all.
  it('serves /icon.svg without an admin session', async () => {
    const res = await middleware(request('/icon.svg', nextIp()));
    expect(res.status).not.toBe(307);
  });

  it('still throttles independently per IP', async () => {
    const busy = nextIp();
    await hammer('/auth/login', busy, 25);

    const quiet = nextIp();
    const response = await middleware(request('/auth/login', quiet));
    expect(response.status).not.toBe(429);
  });
});

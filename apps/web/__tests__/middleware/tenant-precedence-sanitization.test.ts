/**
 * Middleware tenant precedence + inbound header sanitization.
 *
 * Moved here from `integration/multi-tenant-isolation.integration.test.ts`:
 * these two cases never touched the database. They drive `middleware()` with a
 * stubbed Supabase middleware client (fake slugs → ids, a fake session user),
 * so they are unit tests of the middleware's precedence and header handling,
 * and the stub is what made the integration file need a mock allowlist entry.
 * The route-handler isolation tests stayed in the integration file.
 */
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createMiddlewareClientMock,
  getUserMock,
  fromMock,
  selectMock,
  eqMock,
  isMock,
  limitMock,
  rpcMock,
} = vi.hoisted(() => ({
  createMiddlewareClientMock: vi.fn(),
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  isMock: vi.fn(),
  limitMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: createMiddlewareClientMock,
}));

import { middleware } from '../../src/middleware';

interface MiddlewareUser {
  id: string;
  emailVerified: boolean;
}

interface MiddlewareConfig {
  slugToCommunityId: Record<string, number | null>;
  user: MiddlewareUser | null;
}

function apiUrl(pathname: string): string {
  return `http://localhost:3000${pathname}`;
}

function configureMiddlewareClient(config: MiddlewareConfig): { getRequestedSlug: () => string | null } {
  let requestedSlug: string | null = null;

  // Tenant resolution goes through the pp_public_community_id_by_slug RPC
  // (migration 0045), not a direct read of `communities`. The anon-keyed
  // client cannot see that table — `pp_communities_select` requires
  // membership, which an anonymous visitor does not have — so a direct read
  // returned zero rows and broke every public site. The mock mirrors the RPC's
  // contract: a scalar id, or null.
  rpcMock.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'pp_public_community_id_by_slug') {
      requestedSlug = String(args['p_slug']);
      return { data: config.slugToCommunityId[requestedSlug] ?? null, error: null };
    }
    if (fn === 'pp_public_community_id_by_domain') {
      return { data: null, error: null };
    }
    throw new Error(`unexpected rpc: ${fn}`);
  });

  // Retained so a regression to the direct-table read fails loudly here rather
  // than silently resolving null the way it did in production.
  limitMock.mockImplementation(async () => {
    throw new Error(
      'middleware read `communities` directly; tenant resolution must use the public RPC (see migration 0045)',
    );
  });
  isMock.mockImplementation(() => ({ limit: limitMock }));
  eqMock.mockImplementation(() => ({ is: isMock }));
  selectMock.mockImplementation(() => ({ eq: eqMock }));
  fromMock.mockImplementation(() => ({ select: selectMock }));

  getUserMock.mockResolvedValue({
    data: { user: config.user },
  });

  // createMiddlewareClient resolves the user itself (getClaims) and returns
  // it directly — middleware no longer calls supabase.auth.getUser.
  createMiddlewareClientMock.mockResolvedValue({
    supabase: {
      auth: { getUser: getUserMock },
      from: fromMock,
      rpc: rpcMock,
    },
    response: NextResponse.next(),
    user: config.user,
    authChecked: config.user != null,
  });

  return {
    getRequestedSlug: () => requestedSlug,
  };
}

// Direct route-handler tests above bypass middleware by design.
// These middleware tests cover tenant precedence + header sanitization behavior.
describe('p2-43 middleware tenant precedence and header sanitization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers non-reserved host subdomain over conflicting tenant query', async () => {
    const tracker = configureMiddlewareClient({
      slugToCommunityId: {
        'tenant-query-wins': 501,
        'tenant-host-conflict': 999,
      },
      user: {
        id: 'middleware-user-a',
        emailVerified: true,
      },
    });

    const response = await middleware(
      new NextRequest(apiUrl('/api/v1/documents?tenant=tenant-query-wins'), {
        headers: {
          host: 'tenant-host-conflict.getpropertypro.com',
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(tracker.getRequestedSlug()).toBe('tenant-host-conflict');
    expect(response.headers.get('x-middleware-request-x-community-id')).toBe('999');
    expect(response.headers.get('x-middleware-request-x-tenant-slug')).toBe('tenant-host-conflict');
    expect(response.headers.get('x-middleware-request-x-tenant-source')).toBe('host_subdomain');
  });

  it('sanitizes spoofed inbound tenant headers and forwards server-owned values', async () => {
    configureMiddlewareClient({
      slugToCommunityId: {
        'tenant-sanitized': 777,
      },
      user: {
        id: 'middleware-user-b',
        emailVerified: true,
      },
    });

    const response = await middleware(
      new NextRequest(apiUrl('/api/v1/documents'), {
        headers: {
          host: 'tenant-sanitized.getpropertypro.com',
          'x-community-id': '999',
          'x-tenant-slug': 'spoofed-slug',
          'x-tenant-source': 'spoofed-source',
          'x-user-id': 'spoofed-user',
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-request-x-community-id')).toBe('777');
    expect(response.headers.get('x-middleware-request-x-tenant-slug')).toBe('tenant-sanitized');
    expect(response.headers.get('x-middleware-request-x-tenant-source')).toBe('host_subdomain');
    expect(response.headers.get('x-middleware-request-x-user-id')).toBe('middleware-user-b');

    const overrideHeaders = response.headers.get('x-middleware-override-headers') ?? '';
    expect(overrideHeaders).toContain('x-community-id');
    expect(overrideHeaders).toContain('x-tenant-slug');
    expect(overrideHeaders).toContain('x-tenant-source');
    expect(overrideHeaders).toContain('x-user-id');
  });
});

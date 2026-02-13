import { describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';

describe('p2-43 multi-tenant isolation (integration slice)', () => {
  it('returns 404 for tenant-header/query mismatch on document search', async () => {
    vi.resetModules();

    const searchDocumentsMock = vi.fn();
    const requireAuthenticatedUserIdMock = vi.fn().mockResolvedValue('user-community-a');
    const requireCommunityMembershipMock = vi.fn();

    vi.doMock('@propertypro/db', () => ({
      searchDocuments: searchDocumentsMock,
    }));
    vi.doMock('@/lib/api/auth', () => ({
      requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
    }));
    vi.doMock('@/lib/api/community-membership', () => ({
      requireCommunityMembership: requireCommunityMembershipMock,
    }));

    const { GET } = await import('../../src/app/api/v1/documents/search/route');

    const req = new NextRequest(
      `http://localhost:3000/api/v1/documents/search?communityId=${MULTI_TENANT_COMMUNITIES[1]!.id}&q=budget`,
      {
        headers: {
          'x-community-id': String(MULTI_TENANT_COMMUNITIES[0]!.id),
        },
      },
    );

    const res = await GET(req);
    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(searchDocumentsMock).not.toHaveBeenCalled();
  });

  it('returns 404 for tenant-header/body mismatch on invitation acceptance without session auth', async () => {
    vi.resetModules();

    const createScopedClientMock = vi.fn();
    const requireAuthenticatedUserIdMock = vi.fn();

    vi.doMock('@propertypro/db', () => ({
      communities: Symbol('communities'),
      invitations: Symbol('invitations'),
      userRoles: Symbol('user_roles'),
      users: Symbol('users'),
      createScopedClient: createScopedClientMock,
      logAuditEvent: vi.fn(),
    }));
    vi.doMock('@/lib/api/auth', () => ({
      requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
    }));
    vi.doMock('@/lib/api/community-membership', () => ({
      requireCommunityMembership: vi.fn(),
    }));
    vi.doMock('@propertypro/email', () => ({
      sendEmail: vi.fn(),
      InvitationEmail: () => null,
    }));

    const { PATCH } = await import('../../src/app/api/v1/invitations/route');

    const req = new NextRequest('http://localhost:3000/api/v1/invitations', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-community-id': String(MULTI_TENANT_COMMUNITIES[0]!.id),
      },
      body: JSON.stringify({
        communityId: MULTI_TENANT_COMMUNITIES[1]!.id,
        token: 'token-123',
        password: 'StrongPass123!',
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(404);
    expect(createScopedClientMock).not.toHaveBeenCalled();
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  it('middleware allows unauthenticated invitation PATCH but blocks other unauthenticated API requests', async () => {
    vi.resetModules();

    const getUserMock = vi.fn().mockResolvedValue({
      data: { user: null },
    });

    vi.doMock('@propertypro/db/supabase/middleware', () => ({
      createMiddlewareClient: vi.fn().mockResolvedValue({
        supabase: {
          auth: { getUser: getUserMock },
          from: vi.fn(),
        },
        response: NextResponse.next(),
      }),
    }));

    const { middleware } = await import('../../src/middleware');

    const tokenRouteResponse = await middleware(
      new NextRequest('http://localhost:3000/api/v1/invitations', { method: 'PATCH' }),
    );
    expect(tokenRouteResponse.status).toBe(200);

    const protectedRouteResponse = await middleware(
      new NextRequest('http://localhost:3000/api/v1/invitations', { method: 'POST' }),
    );
    expect(protectedRouteResponse.status).toBe(401);
  });

  it('middleware returns 404 for reserved tenant subdomain before auth checks', async () => {
    vi.resetModules();

    const getUserMock = vi.fn().mockResolvedValue({
      data: { user: null },
    });

    vi.doMock('@propertypro/db/supabase/middleware', () => ({
      createMiddlewareClient: vi.fn().mockResolvedValue({
        supabase: {
          auth: { getUser: getUserMock },
          from: vi.fn(),
        },
        response: NextResponse.next(),
      }),
    }));

    const { middleware } = await import('../../src/middleware');

    const response = await middleware(
      new NextRequest('http://localhost:3000/api/v1/documents', {
        headers: {
          host: 'admin.propertyprofl.com',
        },
      }),
    );
    expect(response.status).toBe(404);
    expect(getUserMock).not.toHaveBeenCalled();
  });
});

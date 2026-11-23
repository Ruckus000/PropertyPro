import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  headersMock,
  cookiesMock,
  getClaimsMock,
  createServerClientMock,
  parseImpersonationCookieMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => {
  const getClaimsMock = vi.fn();
  return {
    headersMock: vi.fn(),
    cookiesMock: vi.fn(),
    getClaimsMock,
    createServerClientMock: vi.fn(async () => ({ auth: { getClaims: getClaimsMock } })),
    parseImpersonationCookieMock: vi.fn(),
    requireCommunityMembershipMock: vi.fn(),
  };
});

vi.mock('next/headers', () => ({
  headers: headersMock,
  cookies: cookiesMock,
}));

vi.mock('@propertypro/db/supabase/server', () => ({
  createServerClient: createServerClientMock,
}));

vi.mock('@/lib/support/impersonation', () => ({
  parseImpersonationCookie: parseImpersonationCookieMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

function sessionFor(sub: string) {
  getClaimsMock.mockResolvedValue({ data: { claims: { sub } }, error: null });
}

function noSession() {
  getClaimsMock.mockResolvedValue({ data: null, error: null });
}

function supportCookie(value: string | undefined) {
  cookiesMock.mockResolvedValue({
    get: (name: string) =>
      name === 'pp-support-session' && value !== undefined ? { name, value } : undefined,
  });
}

async function loadOptionalUser() {
  const { getOptionalPageAuthenticatedUser } = await import(
    '../../src/lib/request/page-auth-context'
  );
  return getOptionalPageAuthenticatedUser();
}

describe('page auth and community context helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    supportCookie(undefined);
  });

  it('reads forwarded user headers once the session subject matches', async () => {
    headersMock.mockResolvedValue(
      new Headers({
        'x-user-id': 'user-123',
        'x-user-email': 'jane@example.com',
        'x-user-full-name': 'Jane Doe',
        'x-user-phone': '+13055550123',
      }),
    );
    sessionFor('user-123');

    const { requirePageAuthenticatedUser } = await import(
      '../../src/lib/request/page-auth-context'
    );

    await expect(requirePageAuthenticatedUser()).resolves.toEqual({
      id: 'user-123',
      email: 'jane@example.com',
      fullName: 'Jane Doe',
      phone: '+13055550123',
      user_metadata: {
        full_name: 'Jane Doe',
      },
    });
  });

  it('resolves community membership from forwarded headers', async () => {
    headersMock.mockResolvedValue(
      new Headers({
        'x-user-id': 'user-123',
        'x-community-id': '42',
      }),
    );
    sessionFor('user-123');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-123',
      communityId: 42,
      communityName: 'Sunset Condos',
      role: 'manager',
      communityType: 'condo_718',
      timezone: 'America/New_York',
      isUnitOwner: false,
      isAdmin: true,
      displayTitle: 'Manager',
      city: 'Miami',
      state: 'FL',
      isDemo: false,
    });

    const { requirePageCommunityMembership } = await import(
      '../../src/lib/request/page-community-context'
    );

    await requirePageCommunityMembership();

    expect(requireCommunityMembershipMock).toHaveBeenCalledTimes(1);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-123');
  });

  // Pages verify the session themselves, in addition to middleware.
  describe('session check', () => {
    it('a user-id header with no session resolves to no user', async () => {
      headersMock.mockResolvedValue(new Headers({ 'x-user-id': 'victim' }));
      noSession();

      await expect(loadOptionalUser()).resolves.toBeNull();
    });

    it('a user-id header that disagrees with the session subject resolves to no user', async () => {
      headersMock.mockResolvedValue(new Headers({ 'x-user-id': 'user-b' }));
      sessionFor('user-a');

      await expect(loadOptionalUser()).resolves.toBeNull();
    });

    it('a session whose subject matches the header resolves the user', async () => {
      headersMock.mockResolvedValue(new Headers({ 'x-user-id': 'user-a' }));
      sessionFor('user-a');

      await expect(loadOptionalUser()).resolves.toMatchObject({ id: 'user-a' });
    });

    it('a claims error resolves to no user', async () => {
      headersMock.mockResolvedValue(new Headers({ 'x-user-id': 'user-a' }));
      getClaimsMock.mockResolvedValue({
        data: { claims: { sub: 'user-a' } },
        error: new Error('invalid JWT'),
      });

      await expect(loadOptionalUser()).resolves.toBeNull();
    });

    // Middleware may have just refreshed the access token. It writes the new
    // cookie onto the forwarded request, so the page must read the request
    // cookies (no explicit JWT argument) to see the refreshed token.
    it('reads claims from the request cookies, not an explicit token', async () => {
      headersMock.mockResolvedValue(new Headers({ 'x-user-id': 'user-a' }));
      sessionFor('user-a');

      await loadOptionalUser();

      expect(createServerClientMock).toHaveBeenCalledTimes(1);
      expect(getClaimsMock).toHaveBeenCalledTimes(1);
      expect(getClaimsMock).toHaveBeenCalledWith();
    });

    it('a support session resolves the impersonated user when its cookie verifies', async () => {
      headersMock.mockResolvedValue(
        new Headers({ 'x-user-id': 'victim', 'x-support-session': '1' }),
      );
      supportCookie('signed-support-token');
      parseImpersonationCookieMock.mockResolvedValue({ sub: 'victim' });
      // The operator's own web session, if any, is a different user.
      sessionFor('operator');

      await expect(loadOptionalUser()).resolves.toMatchObject({ id: 'victim' });
      expect(parseImpersonationCookieMock).toHaveBeenCalledWith('signed-support-token');
      expect(getClaimsMock).not.toHaveBeenCalled();
    });

    it('a support-session header without a valid support cookie resolves to no user', async () => {
      headersMock.mockResolvedValue(
        new Headers({ 'x-user-id': 'victim', 'x-support-session': '1' }),
      );
      supportCookie(undefined);
      parseImpersonationCookieMock.mockResolvedValue(null);
      sessionFor('victim');

      await expect(loadOptionalUser()).resolves.toBeNull();
    });

    it('a support cookie for a different user resolves to no user', async () => {
      headersMock.mockResolvedValue(
        new Headers({ 'x-user-id': 'victim', 'x-support-session': '1' }),
      );
      supportCookie('signed-support-token');
      parseImpersonationCookieMock.mockResolvedValue({ sub: 'someone-else' });

      await expect(loadOptionalUser()).resolves.toBeNull();
    });

    it('no user-id header resolves to no user without touching auth', async () => {
      headersMock.mockResolvedValue(new Headers());

      await expect(loadOptionalUser()).resolves.toBeNull();
      expect(createServerClientMock).not.toHaveBeenCalled();
    });
  });
});

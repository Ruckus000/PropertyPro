/**
 * Regression guard: the zero-community empty state must offer a way OUT.
 *
 * Background: a user whose every membership points at a soft-deleted community
 * resolves to zero communities (`findUserCommunitiesUnscoped` filters
 * `isNull(communities.deletedAt)`) and lands here. This page used to render a
 * terminal message — "You are not a member of any community yet. Contact your
 * community manager or board." — with nothing to click. Post-login routing
 * sends a no-tenant-context session straight here, so from the user's seat that
 * dead end is indistinguishable from "login is broken". It was reported as
 * exactly that.
 *
 * The join path is the one self-service route out, so the empty state has to
 * carry it as an action. Its middleware half — keeping /account/join-community
 * out of the missing-tenant bounce, so the button cannot land back on this very
 * page — is guarded in __tests__/auth/middleware-no-tenant-redirect.test.ts.
 * Both halves are required; either alone leaves the user stranded.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const { requireAuthenticatedUserIdMock, listCommunitiesForUserMock, redirectMock } = vi.hoisted(
  () => ({
    requireAuthenticatedUserIdMock: vi.fn(),
    listCommunitiesForUserMock: vi.fn(),
    redirectMock: vi.fn(() => {
      throw new Error('NEXT_REDIRECT');
    }),
  }),
);

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));

vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/user-communities', () => ({
  listCommunitiesForUser: listCommunitiesForUserMock,
}));

// Request headers as middleware forwards them. Empty = an ordinary request;
// the support-session block below fills in the x-support-* stamps.
const { requestHeaders } = vi.hoisted(() => ({ requestHeaders: { current: new Headers() } }));
vi.mock('next/headers', () => ({ headers: async () => requestHeaders.current }));

import SelectCommunityPage from '../../../src/app/(authenticated)/select-community/page';

async function renderPage(): Promise<string> {
  const element = await SelectCommunityPage({ searchParams: Promise.resolve({}) });
  return renderToStaticMarkup(element);
}

describe('select-community page — zero-community empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-with-no-live-communities');
  });

  it('offers a join-community action when the user belongs to no live community', async () => {
    listCommunitiesForUserMock.mockResolvedValue([]);

    const html = await renderPage();

    // The escape hatch itself. Asserting the href — not just the label — is the
    // point: a button that renders but links nowhere is the same dead end.
    expect(html).toContain('href="/account/join-community"');
    expect(html).toContain('Join a community');
  });

  it('still explains the board/manager fallback, for a resident who cannot self-serve', async () => {
    listCommunitiesForUserMock.mockResolvedValue([]);

    const html = await renderPage();

    expect(html).toContain('You are not a member of any community yet.');
    expect(html).toMatch(/community manager or board/);
  });

  it('does not redirect a zero-community user anywhere (the empty state is the destination)', async () => {
    listCommunitiesForUserMock.mockResolvedValue([]);

    await renderPage();

    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('control: a user WITH communities gets the picker, not the empty state', async () => {
    // Two communities, so the single-community auto-redirect at the top of the
    // page does not fire. Guards against the empty state leaking into the
    // normal path — a green "join" assertion above would otherwise be
    // compatible with the CTA rendering for everyone.
    listCommunitiesForUserMock.mockResolvedValue([
      {
        communityId: 133,
        communityName: 'Breakaway Apartments',
        slug: 'breakaway',
        communityType: 'apartment',
        city: 'Tampa',
        state: 'FL',
        logoPath: null,
        role: 'root_manager',
        isUnitOwner: false,
        displayTitle: 'Root Manager',
        subscriptionStatus: 'active',
        subscriptionPlan: 'professional',
        freeAccessExpiresAt: null,
        isDemo: false,
        trialEndsAt: null,
        demoExpiresAt: null,
      },
      {
        communityId: 134,
        communityName: 'Sunset Towers',
        slug: 'sunset-towers',
        communityType: 'condo_718',
        city: 'Miami',
        state: 'FL',
        logoPath: null,
        role: 'root_manager',
        isUnitOwner: false,
        displayTitle: 'Root Manager',
        subscriptionStatus: 'active',
        subscriptionPlan: 'professional',
        freeAccessExpiresAt: null,
        isDemo: false,
        trialEndsAt: null,
        demoExpiresAt: null,
      },
    ]);

    const html = await renderPage();

    expect(html).not.toContain('href="/account/join-community"');
    expect(html).not.toContain('You are not a member of any community yet.');
  });
});

describe('select-community page — support session', () => {
  function membership(communityId: number, communityName: string) {
    return {
      communityId,
      communityName,
      slug: `c-${communityId}`,
      communityType: 'condo_718' as const,
      city: null,
      state: null,
      logoPath: null,
      role: 'resident',
      isUnitOwner: true,
      displayTitle: null,
      subscriptionStatus: 'active',
      subscriptionPlan: 'professional',
      freeAccessExpiresAt: null,
      isDemo: false,
      trialEndsAt: null,
      demoExpiresAt: null,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('impersonated-user');
    listCommunitiesForUserMock.mockResolvedValue([
      membership(11, 'Consented Condos'),
      membership(22, 'Other Towers'),
    ]);
  });

  afterEach(() => {
    requestHeaders.current = new Headers();
  });

  it('offers only the consented community, which auto-redirects', async () => {
    // /select-community is a TENANT_OPTIONAL_PATH: no x-community-id is stamped.
    requestHeaders.current = new Headers({
      'x-support-session-id': '7',
      'x-support-community-id': '22',
    });

    await expect(renderPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/dashboard?communityId=22');
  });

  it('offers nothing when the session community is unreadable (fail closed)', async () => {
    requestHeaders.current = new Headers({ 'x-support-session-id': '7' });

    const html = await renderPage();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(html).not.toContain('Consented Condos');
    expect(html).not.toContain('Other Towers');
  });

  it('control: without a support session both communities are offered', async () => {
    const html = await renderPage();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(html).toContain('Consented Condos');
    expect(html).toContain('Other Towers');
  });
});

/**
 * D10 — the subdomain loop. On a community's own subdomain middleware takes
 * the community from the HOST and ignores `?communityId=`, so a relative
 * `/dashboard?communityId=<other>` reopens the host's community; for a
 * non-member the authenticated layout sends them back here, and the
 * single-community auto-redirect fires again, forever. There every way out of
 * this page must go to the picked community's subdomain. Everywhere else the
 * query param is honoured and links stay relative.
 */
describe('select-community page — tenant host routing', () => {
  function membership(communityId: number, communityName: string, slug: string) {
    return {
      communityId,
      communityName,
      slug,
      communityType: 'condo_718' as const,
      city: null,
      state: null,
      logoPath: null,
      role: 'resident',
      isUnitOwner: true,
      displayTitle: null,
      subscriptionStatus: 'active',
      subscriptionPlan: 'professional',
      freeAccessExpiresAt: null,
      isDemo: false,
      trialEndsAt: null,
      demoExpiresAt: null,
    };
  }

  const TWO = [membership(133, 'Breakaway Condos', 'breakaway'), membership(134, 'Sunset Towers', 'sunset-towers')];

  async function renderWith(host: string, searchParams: Record<string, string> = {}): Promise<string> {
    requestHeaders.current = new Headers({ host });
    const element = await SelectCommunityPage({ searchParams: Promise.resolve(searchParams) });
    return renderToStaticMarkup(element);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'getpropertypro.com');
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    listCommunitiesForUserMock.mockResolvedValue(TWO);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    requestHeaders.current = new Headers();
  });

  it('on a community subdomain, picker cards link to each community’s own subdomain', async () => {
    const html = await renderWith('sunset-towers.getpropertypro.com');

    expect(html).toContain('href="https://breakaway.getpropertypro.com/dashboard?communityId=133"');
    expect(html).toContain('href="https://sunset-towers.getpropertypro.com/dashboard?communityId=134"');
  });

  it('on a community subdomain, the cards keep returnTo (path and query)', async () => {
    const html = await renderWith('sunset-towers.getpropertypro.com', {
      returnTo: '/documents?tab=minutes',
    });

    expect(html).toContain(
      'href="https://breakaway.getpropertypro.com/documents?tab=minutes&amp;communityId=133"',
    );
  });

  it('on a community subdomain, the single-community auto-redirect goes cross-host', async () => {
    listCommunitiesForUserMock.mockResolvedValue([membership(133, 'Breakaway Condos', 'breakaway')]);

    await expect(renderWith('sunset-towers.getpropertypro.com', { returnTo: '/maintenance' })).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(redirectMock).toHaveBeenCalledWith(
      'https://breakaway.getpropertypro.com/maintenance?communityId=133',
    );
  });

  it.each([
    ['the apex', 'getpropertypro.com'],
    ['www', 'www.getpropertypro.com'],
    ['a reserved label (pm)', 'pm.getpropertypro.com'],
    ['a Vercel preview', 'propertypro-git-feature-team.vercel.app'],
    ['localhost', 'localhost:3000'],
  ])('on %s, picker cards stay relative', async (_label, host) => {
    const html = await renderWith(host);

    expect(html).toContain('href="/dashboard?communityId=133"');
    expect(html).toContain('href="/dashboard?communityId=134"');
    expect(html).not.toContain('https://');
  });

  it('on the apex, the single-community auto-redirect stays relative', async () => {
    listCommunitiesForUserMock.mockResolvedValue([membership(133, 'Breakaway Condos', 'breakaway')]);

    await expect(renderWith('www.getpropertypro.com')).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/dashboard?communityId=133');
  });
});

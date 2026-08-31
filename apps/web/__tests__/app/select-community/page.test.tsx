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
import { describe, expect, it, vi, beforeEach } from 'vitest';
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

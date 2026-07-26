/**
 * Website editor v3 route entry — authorization and gating.
 *
 * The v3 editor lives outside the `(authenticated)` route group, so it does not
 * inherit that layout's guarantees. Middleware still protects `/pm`, but
 * middleware only proves a session exists — role, tenancy, plan and
 * subscription state are this page's responsibility. These tests are the proof
 * that flipping the rollout flag cannot widen anyone's access.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    // Mirror next/navigation: redirect() throws to halt rendering.
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
);
const requireAuthMock = vi.hoisted(() => vi.fn());
const requireMembershipMock = vi.hoisted(() => vi.fn());
const featuresMock = vi.hoisted(() => vi.fn());
const shellContextMock = vi.hoisted(() => vi.fn());
const flagMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: requireAuthMock,
}));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: requireMembershipMock,
}));
vi.mock('@/lib/middleware/plan-guard', () => ({
  getEffectiveFeaturesForPage: featuresMock,
}));
vi.mock('@/lib/request/page-shell-context', () => ({
  getPageShellContext: shellContextMock,
}));
vi.mock('@/lib/site-editor/flag', () => ({
  isSiteEditorV3Enabled: flagMock,
  siteEditorV3Path: (id: number) => `/pm/website-editor?communityId=${id}`,
}));
vi.mock('@/components/pm/site-editor-v3/EditorFrame', () => ({
  EditorFrame: () => null,
}));

import WebsiteEditorV3Page from '@/app/(site-editor)/pm/website-editor/page';

const ACTIVE_MEMBERSHIP = {
  userId: 'user-1',
  communityId: 7,
  communityName: 'Sunset Condos',
  role: 'property_manager' as const,
  communityType: 'condo_718' as const,
  subscriptionPlan: 'professional',
  subscriptionStatus: 'active',
  subscriptionCanceledAt: null,
  subscriptionCurrentPeriodEndAt: null,
  freeAccessExpiresAt: null,
  timezone: 'America/New_York',
  isUnitOwner: false,
  isAdmin: true,
  displayTitle: 'Property Manager',
  designation: null,
  city: 'Miami',
  state: 'FL',
};

/** Runs the page and returns the redirect target, or null if it rendered. */
async function runPage(communityId: unknown): Promise<string | null> {
  try {
    await WebsiteEditorV3Page({
      searchParams: Promise.resolve({ communityId } as Record<string, string>),
    });
    return null;
  } catch (err) {
    const digest = (err as Error & { digest?: string }).digest;
    if (digest?.startsWith('NEXT_REDIRECT;')) return digest.slice('NEXT_REDIRECT;'.length);
    throw err;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  flagMock.mockReturnValue(true);
  requireAuthMock.mockResolvedValue('user-1');
  requireMembershipMock.mockResolvedValue({ ...ACTIVE_MEMBERSHIP });
  featuresMock.mockResolvedValue({ hasSiteEditor: true });
  shellContextMock.mockResolvedValue({ user: { id: 'user-1', fullName: 'Jordan Rivera', email: null } });
});

describe('v3 editor page — rollout flag', () => {
  it('redirects away when the flag is off', async () => {
    flagMock.mockReturnValue(false);
    expect(await runPage('7')).toBe('/pm/dashboard/communities?reason=editor-unavailable');
  });

  it('checks the flag before doing any database work', async () => {
    flagMock.mockReturnValue(false);
    await runPage('7');
    expect(requireMembershipMock).not.toHaveBeenCalled();
    expect(featuresMock).not.toHaveBeenCalled();
  });
});

describe('v3 editor page — community scope', () => {
  it.each([
    ['missing', undefined],
    ['non-numeric', 'abc'],
    ['zero', '0'],
    ['negative', '-3'],
    ['fractional', '1.5'],
  ])('redirects on a %s communityId', async (_label, value) => {
    expect(await runPage(value)).toBe('/pm/dashboard/communities?reason=invalid-selection');
  });
});

describe('v3 editor page — authorization', () => {
  it('redirects an unauthenticated caller to login', async () => {
    requireAuthMock.mockRejectedValue(new Error('no session'));
    expect(await runPage('7')).toBe('/auth/login');
  });

  it('redirects a resident — PM manager role is required', async () => {
    requireMembershipMock.mockResolvedValue({
      ...ACTIVE_MEMBERSHIP,
      role: 'resident',
      isAdmin: false,
    });
    expect(await runPage('7')).toBe('/pm/dashboard/communities?reason=invalid-selection');
  });

  it('propagates a cross-tenant membership failure rather than rendering', async () => {
    // requirePageCommunityMembership throws when the user has no role in the
    // target community. The page must not swallow it into a render.
    requireMembershipMock.mockRejectedValue(new Error('not a member'));
    await expect(runPage('7')).rejects.toThrow('not a member');
  });

  it('redirects when the plan does not include the site editor', async () => {
    featuresMock.mockResolvedValue({ hasSiteEditor: false });
    expect(await runPage('7')).toBe('/pm/dashboard/communities?reason=feature-unavailable');
  });
});

describe('v3 editor page — lapsed-community route gate', () => {
  it('redirects a lapsed community instead of rendering the editor', async () => {
    requireMembershipMock.mockResolvedValue({
      ...ACTIVE_MEMBERSHIP,
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: new Date('2020-01-01T00:00:00Z'),
    });
    expect(await runPage('7')).toBe('/pm/dashboard/communities?reason=subscription-lapsed');
  });

  it('gates on the TARGET community, not the shell context', async () => {
    // Regression guard. The PM portal carries no tenant header, so
    // getPageShellContext() resolves a null community with null subscription
    // fields. Gating on that would let every lapsed community through.
    shellContextMock.mockResolvedValue({
      user: { id: 'user-1', fullName: 'Jordan Rivera', email: null },
      community: null,
      subscriptionStatus: null,
      subscriptionCanceledAt: null,
      freeAccessExpiresAt: null,
    });
    requireMembershipMock.mockResolvedValue({
      ...ACTIVE_MEMBERSHIP,
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: new Date('2020-01-01T00:00:00Z'),
    });
    expect(await runPage('7')).toBe('/pm/dashboard/communities?reason=subscription-lapsed');
  });

  it('allows an active community through', async () => {
    expect(await runPage('7')).toBeNull();
  });

  it('allows a trialing community through', async () => {
    requireMembershipMock.mockResolvedValue({
      ...ACTIVE_MEMBERSHIP,
      subscriptionStatus: 'trialing',
    });
    expect(await runPage('7')).toBeNull();
  });
});

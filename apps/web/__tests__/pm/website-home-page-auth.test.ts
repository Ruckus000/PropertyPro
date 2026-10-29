/**
 * The website home's route entry (`/pm/website`) — authorization and what it
 * does before loading.
 *
 * Middleware proves only that a session exists. Role, plan and subscription
 * are this page's to enforce, with the same gates as the website editor, and
 * a refused visit must write nothing: the checklist is initialized only after
 * every gate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const ensureChecklistMock = vi.hoisted(() => vi.fn());
const loadWebsiteHomeMock = vi.hoisted(() => vi.fn());

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
vi.mock('@/lib/services/transparency-service', () => ({
  ensureTransparencyChecklistInitialized: ensureChecklistMock,
}));
vi.mock('@/lib/services/website-home-service', () => ({
  loadWebsiteHome: loadWebsiteHomeMock,
}));
vi.mock('@/components/website-home/website-home', () => ({ WebsiteHome: () => null }));

import WebsiteHomePage from '@/app/(authenticated)/pm/website/page';
import { WebsiteHome } from '@/components/website-home/website-home';

const MANAGER = {
  userId: 'user-1',
  communityId: 7,
  communityName: 'Sunset Condos',
  role: 'property_manager' as const,
  communityType: 'condo_718' as const,
  subscriptionPlan: 'essentials',
  subscriptionStatus: 'active',
  subscriptionCanceledAt: null,
  subscriptionCurrentPeriodEndAt: null,
  freeAccessExpiresAt: null,
  timezone: 'America/New_York',
  isUnitOwner: false,
  isAdmin: true,
  displayTitle: 'Property Manager',
  designation: null,
};

/** Runs the page: the redirect target, or the element tree it rendered. */
async function runPage(query: Record<string, string>): Promise<{ redirect: string | null; tree: unknown }> {
  try {
    const tree = await WebsiteHomePage({ searchParams: Promise.resolve(query) });
    return { redirect: null, tree };
  } catch (err) {
    const digest = (err as Error & { digest?: string }).digest;
    if (digest?.startsWith('NEXT_REDIRECT;')) return { redirect: digest.slice('NEXT_REDIRECT;'.length), tree: null };
    throw err;
  }
}

function findProps(node: unknown, type: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProps(child, type);
      if (found) return found;
    }
    return null;
  }
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  if (element.type === type) return element.props ?? null;
  return findProps(element.props?.['children'], type);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue('user-1');
  requireMembershipMock.mockResolvedValue({ ...MANAGER });
  featuresMock.mockResolvedValue({ hasSiteEditor: true, hasSitePolishBlocks: false });
  ensureChecklistMock.mockResolvedValue([]);
  loadWebsiteHomeMock.mockResolvedValue({ marker: 'home-data' });
});

describe('website home page — access', () => {
  it('a resident is redirected', async () => {
    requireMembershipMock.mockResolvedValue({ ...MANAGER, role: 'resident', isUnitOwner: true, isAdmin: false });

    const { redirect } = await runPage({ communityId: '7' });

    expect(redirect).toBe('/pm/dashboard/communities?reason=invalid-selection');
    // Refused before anything is written or read.
    expect(ensureChecklistMock).not.toHaveBeenCalled();
    expect(loadWebsiteHomeMock).not.toHaveBeenCalled();
  });

  it('redirects without the site feature, or with a lapsed subscription', async () => {
    featuresMock.mockResolvedValueOnce({ hasSiteEditor: false });
    expect((await runPage({ communityId: '7' })).redirect).toBe(
      '/pm/dashboard/communities?reason=feature-unavailable',
    );

    requireMembershipMock.mockResolvedValueOnce({ ...MANAGER, subscriptionStatus: 'canceled', subscriptionCanceledAt: new Date('2025-01-01') });
    expect((await runPage({ communityId: '7' })).redirect).toBe(
      '/pm/dashboard/communities?reason=subscription-lapsed',
    );
    expect(ensureChecklistMock).not.toHaveBeenCalled();
  });

  it('redirects a missing or malformed community id', async () => {
    expect((await runPage({})).redirect).toBe('/pm/dashboard/communities?reason=invalid-selection');
    expect((await runPage({ communityId: 'abc' })).redirect).toBe('/pm/dashboard/communities?reason=invalid-selection');
  });
});

describe('website home page — loading', () => {
  it('initializes the checklist for a condo before loading, then renders the home', async () => {
    const order: string[] = [];
    ensureChecklistMock.mockImplementation(async () => order.push('checklist'));
    loadWebsiteHomeMock.mockImplementation(async () => {
      order.push('load');
      return { marker: 'home-data' };
    });

    const { tree } = await runPage({ communityId: '7', published: '1' });

    expect(ensureChecklistMock).toHaveBeenCalledWith(7, 'condo_718');
    expect(order).toEqual(['checklist', 'load']);
    // Essentials: no version list.
    expect(loadWebsiteHomeMock).toHaveBeenCalledWith(7, 'user-1', { includeHistory: false });
    expect(findProps(tree, WebsiteHome)).toMatchObject({
      communityId: 7,
      data: { marker: 'home-data' },
      published: true,
      timeZone: 'America/New_York',
    });
  });

  it('asks for the version list with hasSitePolishBlocks', async () => {
    featuresMock.mockResolvedValue({ hasSiteEditor: true, hasSitePolishBlocks: true });

    await runPage({ communityId: '7' });

    expect(loadWebsiteHomeMock).toHaveBeenCalledWith(7, 'user-1', { includeHistory: true });
  });

  it('an apartment has no checklist to initialize', async () => {
    requireMembershipMock.mockResolvedValue({ ...MANAGER, communityType: 'apartment' });

    const { tree } = await runPage({ communityId: '7' });

    expect(ensureChecklistMock).not.toHaveBeenCalled();
    expect(findProps(tree, WebsiteHome)).toMatchObject({ published: false });
  });
});

/**
 * Website editor v3 route entry — authorization and gating.
 *
 * The v3 editor lives outside the `(authenticated)` route group, so it does not
 * inherit that layout's guarantees. Middleware still protects `/pm`, but
 * middleware only proves a session exists — role, tenancy, plan and
 * subscription state are this page's responsibility. These tests are the proof
 * that this page enforces all four on its own.
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
const quotaLookupMock = vi.hoisted(() => vi.fn());
const captureMessageMock = vi.hoisted(() => vi.fn());

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
vi.mock('@/components/pm/site-editor-v3/EditorFrame', () => ({
  EditorFrame: () => null,
}));
vi.mock('@/components/pm/site-editor-v3/EditorRoot', () => ({
  EditorRoot: () => null,
}));
// `@/lib/api/branding` constructs a DB client at module scope. Without this
// mock the file fails to LOAD in the DB-less CI unit job while passing locally
// — the exact split-brain failure the test strategy warns about. Repro the CI
// condition with `env -u DATABASE_URL pnpm exec vitest run <file>`.
vi.mock('@/lib/api/branding', () => ({
  getCommunityPublicInfo: vi.fn().mockResolvedValue({ slug: 'sunset-condos', name: 'Sunset Condos' }),
  // Phase 8: the page reads branding to seed the Site panel. Mocked here for
  // the same reason as the rest of this factory — the real module pulls
  // `@propertypro/db/unsafe` → drizzle, which throws at module load without
  // DATABASE_URL, i.e. green locally and red in the DB-less CI unit job.
  getBrandingForCommunity: vi.fn().mockResolvedValue(null),
  // Same reason again: the page reads this to decide whether to show the
  // wizard-entry banner, and the real module hits the DB at module load.
  getSiteOnboardingCompletedAt: vi.fn().mockResolvedValue(new Date()),
}));
vi.mock('@/lib/utils/community-url', () => ({
  buildCommunityUrl: (slug: string, path: string) => `https://${slug}.example.com${path}`,
}));
// Same reason as the branding mock above: the canvas loader reaches
// @propertypro/db for presigned URLs and constructs a client at module scope.
vi.mock('@/lib/site-editor/load-canvas-context', () => ({
  loadCanvasContext: vi.fn().mockResolvedValue(null),
}));
// The storage meter's plan lookup. Mocked PARTIALLY, on purpose: the pure
// usage resolver stays real, and so does the service's degrading wrapper that
// the page reaches the lookup through — the point of the storage tests below
// is that a failure at this seam is survived by the page, which only holds if
// the wrapper between them is the real one.
vi.mock('@/lib/site-assets/quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/site-assets/quota')>()),
  getSiteAssetsQuotaBytes: quotaLookupMock,
}));
vi.mock('@sentry/nextjs', () => ({ captureMessage: captureMessageMock }));

import WebsiteEditorV3Page from '@/app/(site-editor)/pm/website-editor/page';
import { EditorRoot } from '@/components/pm/site-editor-v3/EditorRoot';
import { getBrandingForCommunity } from '@/lib/api/branding';

/**
 * Depth-first search of the element tree the page returns for the EditorRoot
 * element's props. EditorRoot is mocked to render nothing, so its props are
 * only observable on the element itself.
 */
function findEditorRootProps(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findEditorRootProps(child);
      if (found) return found;
    }
    return null;
  }
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  if (element.type === EditorRoot) return element.props ?? null;
  return findEditorRootProps(element.props?.['children']);
}

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
  requireAuthMock.mockResolvedValue('user-1');
  requireMembershipMock.mockResolvedValue({ ...ACTIVE_MEMBERSHIP });
  featuresMock.mockResolvedValue({ hasSiteEditor: true });
  shellContextMock.mockResolvedValue({ user: { id: 'user-1', fullName: 'Jordan Rivera', email: null } });
  quotaLookupMock.mockResolvedValue(null);
});

describe('v3 editor page — storage meter seed', () => {
  const QUOTA_500_MB = 500 * 1024 * 1024;

  function renderPage() {
    return WebsiteEditorV3Page({
      searchParams: Promise.resolve({ communityId: '7' } as Record<string, string>),
    });
  }

  it('seeds the meter from the cached branding read and the plan quota', async () => {
    vi.mocked(getBrandingForCommunity).mockResolvedValueOnce({ assetsBytesUsed: 2048 });
    quotaLookupMock.mockResolvedValueOnce(QUOTA_500_MB);

    const props = findEditorRootProps(await renderPage());

    expect(props?.['initialSiteSettings']).toMatchObject({
      storage: { assetsBytesUsed: 2048, quotaBytes: QUOTA_500_MB },
    });
  });

  // A manager who came to move a block must not meet an error boundary because
  // the plan lookup behind a storage bar hiccuped. There is no route-group
  // error.tsx here — the root one would swallow the whole editor. Same trade
  // `loadInitialPages` makes, and like it, not silent: Sentry gets a warning.
  it('survives a quota lookup failure — the meter degrades, the editor does not', async () => {
    quotaLookupMock.mockRejectedValueOnce(new Error('plan lookup down'));

    const props = findEditorRootProps(await renderPage());

    expect(props?.['initialSiteSettings']).toMatchObject({
      storage: { assetsBytesUsed: 0, quotaBytes: null },
    });
    expect(captureMessageMock).toHaveBeenCalledWith(
      'site_settings_storage_quota_failure',
      expect.objectContaining({ level: 'warning' }),
    );
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

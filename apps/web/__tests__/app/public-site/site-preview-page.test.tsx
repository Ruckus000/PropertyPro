/**
 * The wizard's live-preview route must hand `<Layout>` the same props the real
 * public route does, or the preview shows a site the visitor will not get.
 *
 * There was no test of any kind for this route before this file. Mock shape is
 * lifted from `site-page.test.tsx`, the equivalent test for the real route.
 *
 * Deliberately NOT mocked: `@/lib/site-editor/site-settings` and
 * `@/lib/public-site/preview-overrides`. Both are pure and dependency-free, and
 * the point of the footer case is that the REAL resolver reads the PM's fields
 * out of the branding blob — a mocked resolver would assert nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const {
  getCommunityPublicInfoMock,
  getBrandingForCommunityMock,
  listSiteBlocksMock,
  getHomePageIdMock,
  listNavPagesMock,
  createPresignedDownloadUrlMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  hasRoleMock,
  getLayoutMock,
  capturedProps,
} = vi.hoisted(() => ({
  getCommunityPublicInfoMock: vi.fn(),
  getBrandingForCommunityMock: vi.fn(),
  listSiteBlocksMock: vi.fn().mockResolvedValue([]),
  getHomePageIdMock: vi.fn().mockResolvedValue(1),
  listNavPagesMock: vi.fn(),
  createPresignedDownloadUrlMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn().mockResolvedValue('user-1'),
  requireCommunityMembershipMock: vi.fn().mockResolvedValue({ role: 'property_manager' }),
  hasRoleMock: vi.fn().mockReturnValue(true),
  getLayoutMock: vi.fn(),
  capturedProps: [] as Record<string, unknown>[],
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

vi.mock('@/lib/api/branding', () => ({
  getCommunityPublicInfo: getCommunityPublicInfoMock,
  getBrandingForCommunity: getBrandingForCommunityMock,
}));

vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: () => ({
    listSiteBlocks: listSiteBlocksMock,
    getHomePageId: getHomePageIdMock,
    listNavPages: listNavPagesMock,
  }),
}));

vi.mock('@propertypro/db', () => ({
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
}));

vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/role-guard', () => ({
  hasRole: hasRoleMock,
  PM_MANAGER_ROLES: ['property_manager', 'root_manager'],
}));

vi.mock('@/lib/db/theme-preset-catalog', () => ({
  listThemePresetsForWizard: vi.fn().mockResolvedValue([]),
}));

// `--brand` is returned by BOTH doubles with different values, so the merge
// order is observable: whichever value lands on the wrapper proves which side
// won. Custom overrides must win, exactly as they do on the live site.
vi.mock('@propertypro/theme', () => ({
  resolveTheme: vi.fn(() => ({
    primaryColor: '#0e3338',
    secondaryColor: '#f6f1e6',
    accentColor: '#c66f49',
    fontHeading: 'Fraunces',
    fontBody: 'Manrope',
    logoUrl: 'https://signed/square-avatar.png',
    communityName: 'Sunset Condos',
    communityType: 'condo_718',
  })),
  toCssVars: vi.fn(() => ({ '--brand': 'from-theme', '--only-theme': 'kept' })),
  toFontLinks: vi.fn(() => []),
  customCssOverridesToCssVars: vi.fn(() => ({ '--brand': 'from-override' })),
}));

vi.mock('@/components/public-site/layouts/registry', () => ({
  getLayout: getLayoutMock,
}));

import SitePreviewPage from '@/app/(site-preview)/pm/site-preview/page';

const NAV_PAGES = [
  { id: 1, name: 'Home', slug: '', isHome: true },
  { id: 7, name: 'About Us', slug: 'about', isHome: false },
];

const BRANDING = {
  logoPath: 'communities/1/logo.png',
  siteLogoPath: 'communities/1/wordmark.png',
  siteFooter: {
    associationName: 'Sunset Condominium Association, Inc.',
    note: 'Managed by Acme Property Group',
    showStatutoryLine: true,
  },
  customCssOverrides: { primaryColor: '#123456' },
};

async function renderPreview() {
  const element = await SitePreviewPage({
    searchParams: Promise.resolve({ communityId: '1' }),
  });
  return render(element);
}

describe('SitePreviewPage — the props it hands <Layout>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps.length = 0;

    getCommunityPublicInfoMock.mockResolvedValue({
      id: 1,
      slug: 'sunset-condos',
      name: 'Sunset Condos',
      communityType: 'condo_718',
    });
    getBrandingForCommunityMock.mockResolvedValue(BRANDING);
    listNavPagesMock.mockResolvedValue(NAV_PAGES);
    listSiteBlocksMock.mockResolvedValue([]);
    getHomePageIdMock.mockResolvedValue(1);
    hasRoleMock.mockReturnValue(true);
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({ role: 'property_manager' });

    // Distinct URL per storage path, so the header-logo case can tell the
    // wordmark from the square avatar rather than just "some signed URL".
    createPresignedDownloadUrlMock.mockImplementation(async (_bucket: string, path: string) =>
      path.includes('wordmark') ? 'https://signed/wordmark.png' : 'https://signed/square.png',
    );

    getLayoutMock.mockReturnValue((props: Record<string, unknown>) => {
      capturedProps.push(props);
      return null;
    });
  });

  it('passes the PM-authored footer, including the opt-in statutory line', async () => {
    await renderPreview();

    expect(capturedProps).toHaveLength(1);
    expect(capturedProps[0]!.footer).toEqual({
      associationName: 'Sunset Condominium Association, Inc.',
      note: 'Managed by Acme Property Group',
      showStatutoryLine: true,
    });
  });

  it('passes the page nav with the home slug as the current one', async () => {
    await renderPreview();

    expect(listNavPagesMock).toHaveBeenCalledTimes(1);
    expect(capturedProps[0]!.nav).toEqual({ items: NAV_PAGES, currentSlug: '' });
  });

  it('prefers the wordmark over the square avatar for the header logo', async () => {
    await renderPreview();

    const community = capturedProps[0]!.community as { logoUrl: string };
    expect(community.logoUrl).toBe('https://signed/wordmark.png');
  });

  it('falls back to the square avatar when there is no wordmark', async () => {
    getBrandingForCommunityMock.mockResolvedValue({ ...BRANDING, siteLogoPath: undefined });

    await renderPreview();

    // resolveTheme's logoUrl, i.e. the square avatar the theme resolved.
    const community = capturedProps[0]!.community as { logoUrl: string };
    expect(community.logoUrl).toBe('https://signed/square-avatar.png');
  });

  it('survives a failed wordmark presign rather than 500ing the preview', async () => {
    createPresignedDownloadUrlMock.mockImplementation(async (_b: string, path: string) => {
      if (path.includes('wordmark')) throw new Error('storage down');
      return 'https://signed/square.png';
    });

    await renderPreview();

    const community = capturedProps[0]!.community as { logoUrl: string };
    expect(community.logoUrl).toBe('https://signed/square-avatar.png');
  });

  it('merges Pro+ custom CSS overrides over the resolved theme', async () => {
    const { container } = await renderPreview();

    const root = container.querySelector('[data-testid="site-preview-root"]') as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.style.getPropertyValue('--brand')).toBe('from-override');
    // The override must not clobber untouched theme vars.
    expect(root.style.getPropertyValue('--only-theme')).toBe('kept');
  });

  it('omits `page`, which the layouts read as "this is the home page"', async () => {
    await renderPreview();

    expect(capturedProps[0]!.page).toBeUndefined();
  });
});

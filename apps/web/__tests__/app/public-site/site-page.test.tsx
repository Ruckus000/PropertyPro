import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const {
  getCommunityPublicInfoMock,
  getBrandingForCommunityMock,
  listSiteBlocksMock,
  getHomePageIdMock,
  getPageBySlugMock,
  resolveRedirectMock,
  listNavPagesMock,
  headersGetMock,
} = vi.hoisted(() => ({
  getCommunityPublicInfoMock: vi.fn(),
  getBrandingForCommunityMock: vi.fn(),
  listSiteBlocksMock: vi.fn(),
  // Phase 11b: the renderer scopes its block read to the home page. Every
  // export the page reaches has to be on this double — a missing one is a
  // TypeError at render, and this file fails locally on Missing DATABASE_URL,
  // so CI is where that would surface.
  getHomePageIdMock: vi.fn().mockResolvedValue(1),
  // Phase 11b-2 — slug resolution, retired-slug redirects, nav.
  getPageBySlugMock: vi.fn(),
  resolveRedirectMock: vi.fn(),
  listNavPagesMock: vi.fn(),
  headersGetMock: vi.fn(),
}));

// Mock the headers module (Next 15 dynamic API)
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: headersGetMock })),
}));

// next/navigation's control-flow helpers throw in production; the doubles throw
// identifiable errors so a test can assert 404 vs 308-permanent by which one
// fired. `permanentRedirect` (308) is deliberately distinct from `redirect`
// (307) — D6 requires a permanent redirect for a retired slug.
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  permanentRedirect: (url: string) => {
    throw new Error(`NEXT_PERMANENT_REDIRECT:${url}`);
  },
}));

vi.mock('@/lib/api/branding', () => ({
  getCommunityPublicInfo: getCommunityPublicInfoMock,
  getBrandingForCommunity: getBrandingForCommunityMock,
}));

// Mock the public reader so we don't touch a real DB
vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: () => ({
    listSiteBlocks: listSiteBlocksMock,
    getHomePageId: getHomePageIdMock,
    getPageBySlug: getPageBySlugMock,
    resolveRedirect: resolveRedirectMock,
    listNavPages: listNavPagesMock,
    listAnnouncements: vi.fn().mockResolvedValue([]),
    listDocuments: vi.fn().mockResolvedValue([]),
    listMeetings: vi.fn().mockResolvedValue([]),
    getContactInfo: vi.fn().mockResolvedValue(null),
  }),
}));

// Mock @propertypro/theme so the test doesn't need the full package
vi.mock('@propertypro/theme', () => ({
  resolveTheme: vi.fn(() => ({
    primaryColor: '#0e3338',
    secondaryColor: '#f6f1e6',
    accentColor: '#c66f49',
    fontHeading: 'Fraunces',
    fontBody: 'Manrope',
    logoUrl: null,
    communityName: 'Sunset Condos',
    communityType: 'condo_718',
  })),
  toCssVars: vi.fn(() => ({})),
  toFontLinks: vi.fn(() => []),
  customCssOverridesToCssVars: vi.fn(() => ({})),
}));

// Mock html-sanitizer passthrough
vi.mock('@/lib/utils/html-sanitizer', () => ({
  sanitizeHtml: (html: string) => html,
}));

import PublicSitePage, { generateMetadata } from '@/app/public-site/[[...slug]]/page';

const HOME_PAGE = {
  id: 1,
  name: 'Home',
  slug: '',
  isHome: true,
  isDraft: false,
  inNav: true,
  sortOrder: 0,
  deleteStagedAt: null,
};

const ABOUT_PAGE = {
  id: 7,
  name: 'About Us',
  slug: 'about',
  isHome: false,
  isDraft: false,
  inNav: true,
  sortOrder: 1,
  deleteStagedAt: null,
};

describe('PublicSitePage (layout-registry path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersGetMock.mockImplementation((key: string) =>
      key === 'x-community-id' ? '42' : null,
    );
    getCommunityPublicInfoMock.mockResolvedValue({
      id: 42,
      slug: 'sunset-condos',
      name: 'Sunset Condos',
      communityType: 'condo_718',
      sitePublishedAt: null,
    });
    getBrandingForCommunityMock.mockResolvedValue({});
    listSiteBlocksMock.mockResolvedValue([]);
    getHomePageIdMock.mockResolvedValue(1);
    getPageBySlugMock.mockResolvedValue(null);
    resolveRedirectMock.mockResolvedValue(null);
    listNavPagesMock.mockResolvedValue([]);
  });

  it('renders the Tidewater layout with empty-state hero when no blocks exist', async () => {
    const ui = await PublicSitePage({ params: Promise.resolve({}) });
    const { container } = render(ui as React.ReactElement);
    // Empty-state hero renders the community name as h1
    const h1 = container.querySelector('h1');
    expect(h1?.textContent).toBe('Sunset Condos');
    // CTA present
    expect(container.querySelector('a[href="/auth/login"]')).not.toBeNull();
  });

  it('scopes the block read to the HOME page', async () => {
    // Phase 11b: the pages API ships in 11b-1 but the multi-page renderer is
    // 11b-2, so between those releases a PM can publish a second page. Unfiltered,
    // every one of its sections would render inline here, interleaved by
    // block_order.
    await PublicSitePage({ params: Promise.resolve({}) });
    expect(listSiteBlocksMock).toHaveBeenCalledWith({ includeDrafts: false, pageId: 1 });
  });

  it('falls back to an unfiltered read when the community has no page row', async () => {
    // 0046's backfill skipped communities with no site content; that is the
    // pre-11b behaviour and must not become an empty site.
    getHomePageIdMock.mockResolvedValueOnce(null);
    await PublicSitePage({ params: Promise.resolve({}) });
    expect(listSiteBlocksMock).toHaveBeenCalledWith({ includeDrafts: false });
  });

  it('builds metadata via buildCommunityMetadata using the helper', async () => {
    const meta = await generateMetadata();
    expect(meta.title).toBe('Sunset Condos — Community Portal');
  });

  it('returns minimal metadata when no community is resolved', async () => {
    getCommunityPublicInfoMock.mockResolvedValueOnce(null);
    const meta = await generateMetadata();
    expect(meta.title).toBe('PropertyPro');
  });

  it('renders the Boulevard layout for HOA communities', async () => {
    getCommunityPublicInfoMock.mockResolvedValueOnce({
      id: 99,
      slug: 'palm-shores-hoa',
      name: 'Palm Shores HOA',
      communityType: 'hoa_720',
      sitePublishedAt: null,
    });
    const ui = await PublicSitePage({ params: Promise.resolve({}) });
    const { container } = render(ui as React.ReactElement);
    expect(container.querySelector('h1')?.textContent).toBe('Palm Shores HOA');
    expect(container.innerHTML).not.toContain('Community Resources');
  });
});

describe('PublicSitePage — slug resolution [11b-2]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersGetMock.mockImplementation((key: string) =>
      key === 'x-community-id' ? '42' : null,
    );
    getCommunityPublicInfoMock.mockResolvedValue({
      id: 42,
      slug: 'sunset-condos',
      name: 'Sunset Condos',
      communityType: 'condo_718',
      sitePublishedAt: null,
    });
    getBrandingForCommunityMock.mockResolvedValue({});
    listSiteBlocksMock.mockResolvedValue([]);
    getHomePageIdMock.mockResolvedValue(1);
    getPageBySlugMock.mockResolvedValue(null);
    resolveRedirectMock.mockResolvedValue(null);
    listNavPagesMock.mockResolvedValue([]);
  });

  it('renders a published page addressed by its slug, scoping blocks to it', async () => {
    getPageBySlugMock.mockResolvedValue(ABOUT_PAGE);
    const ui = await PublicSitePage({ params: Promise.resolve({ slug: ['about'] }) });
    render(ui as React.ReactElement);
    expect(getPageBySlugMock).toHaveBeenCalledWith('about', { includeDrafts: false });
    expect(listSiteBlocksMock).toHaveBeenCalledWith({ includeDrafts: false, pageId: 7 });
  });

  it('404s on an unknown slug with no redirect', async () => {
    await expect(
      PublicSitePage({ params: Promise.resolve({ slug: ['nope'] }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('308s a retired slug to the target page current slug', async () => {
    resolveRedirectMock.mockResolvedValue({ pageId: 7, toSlug: 'about' });
    await expect(
      PublicSitePage({ params: Promise.resolve({ slug: ['about-us'] }) }),
    ).rejects.toThrow('NEXT_PERMANENT_REDIRECT:/about');
  });

  it('308s a retired slug whose target is now the home page to /', async () => {
    resolveRedirectMock.mockResolvedValue({ pageId: 1, toSlug: '' });
    await expect(
      PublicSitePage({ params: Promise.resolve({ slug: ['welcome-home'] }) }),
    ).rejects.toThrow('NEXT_PERMANENT_REDIRECT:/');
  });

  it('404s a nested slug without consulting the pages table (D5)', async () => {
    // site_pages_slug_shape_check admits no `/`, so /a/b is not representable
    // as a page — falling back to the first segment would index duplicates.
    await expect(
      PublicSitePage({ params: Promise.resolve({ slug: ['about', 'team'] }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getPageBySlugMock).not.toHaveBeenCalled();
  });

  it('404s a draft page anonymously', async () => {
    // The reader applies is_draft=false without includeDrafts, so a draft page
    // resolves to null — the assertion that matters is the flag we pass it.
    await expect(
      PublicSitePage({ params: Promise.resolve({ slug: ['draft-page'] }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getPageBySlugMock).toHaveBeenCalledWith('draft-page', { includeDrafts: false });
  });

  it('renders a draft page under preview, threading includeDrafts to BOTH reads', async () => {
    headersGetMock.mockImplementation((key: string) => {
      if (key === 'x-community-id') return '42';
      if (key === 'x-preview') return 'true';
      return null;
    });
    getPageBySlugMock.mockResolvedValue({ ...ABOUT_PAGE, isDraft: true });
    const ui = await PublicSitePage({ params: Promise.resolve({ slug: ['about'] }) });
    render(ui as React.ReactElement);
    expect(getPageBySlugMock).toHaveBeenCalledWith('about', { includeDrafts: true });
    expect(listSiteBlocksMock).toHaveBeenCalledWith({ includeDrafts: true, pageId: 7 });
  });

  it('still serves a page staged for deletion (D8)', async () => {
    getPageBySlugMock.mockResolvedValue({
      ...ABOUT_PAGE,
      deleteStagedAt: new Date('2026-07-30T00:00:00Z'),
    });
    const ui = await PublicSitePage({ params: Promise.resolve({ slug: ['about'] }) });
    const { container } = render(ui as React.ReactElement);
    expect(container.querySelector('h1')?.textContent).toBe('About Us');
  });

  it("headlines a non-home page with the page's own name (D18)", async () => {
    getPageBySlugMock.mockResolvedValue(ABOUT_PAGE);
    const ui = await PublicSitePage({ params: Promise.resolve({ slug: ['about'] }) });
    const { container } = render(ui as React.ReactElement);
    const headings = container.querySelectorAll('h1');
    expect(headings.length).toBe(1);
    expect(headings[0]?.textContent).toBe('About Us');
  });
});

describe('PublicSitePage — per-page metadata [11b-2 / D17]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersGetMock.mockImplementation((key: string) =>
      key === 'x-community-id' ? '42' : null,
    );
    getCommunityPublicInfoMock.mockResolvedValue({
      id: 42,
      slug: 'sunset-condos',
      name: 'Sunset Condos',
      communityType: 'condo_718',
      sitePublishedAt: null,
    });
    getBrandingForCommunityMock.mockResolvedValue({});
    getPageBySlugMock.mockResolvedValue(null);
  });

  it('leaves the home page title and canonical untouched', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({}) });
    expect(meta.title).toBe('Sunset Condos — Community Portal');
    // Home has no canonical today; adding one would be SEO churn on every
    // live site for no benefit.
    expect(meta.alternates?.canonical).toBeUndefined();
    expect(getPageBySlugMock).not.toHaveBeenCalled();
  });

  it('emits a per-page title and canonical for a named page', async () => {
    getPageBySlugMock.mockResolvedValue(ABOUT_PAGE);
    const meta = await generateMetadata({ params: Promise.resolve({ slug: ['about'] }) });
    expect(meta.title).toBe('About Us · Sunset Condos');
    expect(String(meta.alternates?.canonical)).toContain('/about');
  });

  it('keeps community-level metadata when the slug resolves to the home page', async () => {
    getPageBySlugMock.mockResolvedValue(HOME_PAGE);
    const meta = await generateMetadata({ params: Promise.resolve({ slug: [''] }) });
    expect(meta.title).toBe('Sunset Condos — Community Portal');
  });

  it('keeps community-level metadata for an unknown slug (the body 404s)', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ slug: ['nope'] }) });
    expect(meta.title).toBe('Sunset Condos — Community Portal');
  });
});

describe('PublicSitePage — nav [11b-2]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersGetMock.mockImplementation((key: string) =>
      key === 'x-community-id' ? '42' : null,
    );
    getCommunityPublicInfoMock.mockResolvedValue({
      id: 42,
      slug: 'sunset-condos',
      name: 'Sunset Condos',
      communityType: 'condo_718',
      sitePublishedAt: null,
    });
    getBrandingForCommunityMock.mockResolvedValue({});
    listSiteBlocksMock.mockResolvedValue([]);
    getHomePageIdMock.mockResolvedValue(1);
    getPageBySlugMock.mockResolvedValue(null);
    resolveRedirectMock.mockResolvedValue(null);
    listNavPagesMock.mockResolvedValue([]);
  });

  it('renders no page nav when the community has a single page (D10)', async () => {
    listNavPagesMock.mockResolvedValue([{ id: 1, name: 'Home', slug: '', isHome: true }]);
    const ui = await PublicSitePage({ params: Promise.resolve({}) });
    const { container } = render(ui as React.ReactElement);
    expect(container.querySelector('nav[aria-label="Site pages"]')).toBeNull();
  });

  it('renders the page nav at two or more pages, marking the active one', async () => {
    listNavPagesMock.mockResolvedValue([
      { id: 1, name: 'Home', slug: '', isHome: true },
      { id: 7, name: 'About Us', slug: 'about', isHome: false },
    ]);
    getPageBySlugMock.mockResolvedValue(ABOUT_PAGE);
    const ui = await PublicSitePage({ params: Promise.resolve({ slug: ['about'] }) });
    const { container } = render(ui as React.ReactElement);
    const navEl = container.querySelector('nav[aria-label="Site pages"]');
    expect(navEl).not.toBeNull();
    const links = Array.from(navEl?.querySelectorAll('a') ?? []);
    expect(links.map((a) => a.textContent)).toEqual(['Home', 'About Us']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/about']);
    const current = links.filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe('About Us');
  });

  it('marks home current on the site root, labelled by its own name', async () => {
    listNavPagesMock.mockResolvedValue([
      { id: 1, name: 'Welcome', slug: '', isHome: true },
      { id: 7, name: 'About Us', slug: 'about', isHome: false },
    ]);
    const ui = await PublicSitePage({ params: Promise.resolve({}) });
    const { container } = render(ui as React.ReactElement);
    const links = Array.from(
      container.querySelectorAll('nav[aria-label="Site pages"] a'),
    );
    const current = links.filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe('Welcome');
  });
});

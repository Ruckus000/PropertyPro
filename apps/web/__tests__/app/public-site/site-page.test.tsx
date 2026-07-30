import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const {
  getCommunityPublicInfoMock,
  getBrandingForCommunityMock,
  listSiteBlocksMock,
  getHomePageIdMock,
} = vi.hoisted(() => ({
  getCommunityPublicInfoMock: vi.fn(),
  getBrandingForCommunityMock: vi.fn(),
  listSiteBlocksMock: vi.fn(),
  // Phase 11b: the renderer scopes its block read to the home page. Every
  // export the page reaches has to be on this double — a missing one is a
  // TypeError at render, and this file fails locally on Missing DATABASE_URL,
  // so CI is where that would surface.
  getHomePageIdMock: vi.fn().mockResolvedValue(1),
}));

// Mock the headers module (Next 15 dynamic API)
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => (key === 'x-community-id' ? '42' : null),
  })),
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

describe('PublicSitePage (layout-registry path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCommunityPublicInfoMock.mockResolvedValue({
      id: 42,
      slug: 'sunset-condos',
      name: 'Sunset Condos',
      communityType: 'condo_718',
      sitePublishedAt: null,
    });
    getBrandingForCommunityMock.mockResolvedValue({});
    listSiteBlocksMock.mockResolvedValue([]);
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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const {
  getCommunityPublicInfoMock,
  getBrandingForCommunityMock,
  getPublishedTemplateMock,
  listSiteBlocksMock,
} = vi.hoisted(() => ({
  getCommunityPublicInfoMock: vi.fn(),
  getBrandingForCommunityMock: vi.fn(),
  getPublishedTemplateMock: vi.fn(),
  listSiteBlocksMock: vi.fn(),
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

vi.mock('@/lib/api/site-template', () => ({
  getPublishedTemplate: getPublishedTemplateMock,
}));

// Mock the public reader so we don't touch a real DB
vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: () => ({
    listSiteBlocks: listSiteBlocksMock,
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
}));

// Mock html-sanitizer passthrough
vi.mock('@/lib/utils/html-sanitizer', () => ({
  sanitizeHtml: (html: string) => html,
}));

import PublicSitePage, { generateMetadata } from '@/app/_site/page';

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
    getPublishedTemplateMock.mockResolvedValue(null);
    listSiteBlocksMock.mockResolvedValue([]);
  });

  it('renders the Tidewater layout with empty-state hero when no blocks exist', async () => {
    const ui = await PublicSitePage();
    const { container } = render(ui as React.ReactElement);
    // Empty-state hero renders the community name as h1
    const h1 = container.querySelector('h1');
    expect(h1?.textContent).toBe('Sunset Condos');
    // CTA present
    expect(container.querySelector('a[href="/auth/login"]')).not.toBeNull();
  });

  it('falls back to the legacy JSX template when compiledHtml is present', async () => {
    getPublishedTemplateMock.mockResolvedValueOnce('<p>legacy template content</p>');
    const ui = await PublicSitePage();
    const { container } = render(ui as React.ReactElement);
    expect(container.innerHTML).toContain('legacy template content');
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

  it('falls back to the legacy hardcoded markup when the resolved layout is not registered', async () => {
    // hoa_720 resolves to 'boulevard', which is NOT registered in PR #1b.
    getCommunityPublicInfoMock.mockResolvedValueOnce({
      id: 99,
      slug: 'palm-shores-hoa',
      name: 'Palm Shores HOA',
      communityType: 'hoa_720',
      sitePublishedAt: null,
    });
    const ui = await PublicSitePage();
    const { container } = render(ui as React.ReactElement);
    // The hardcoded fallback contains "Community Resources" — the layout
    // path does not.
    expect(container.innerHTML).toContain('Community Resources');
  });
});

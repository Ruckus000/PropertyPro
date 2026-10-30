/**
 * The editor canvas has to resolve a linked field ({{city}}, {{units}}) from the
 * same facts the live site does, or the picture of the site and the site
 * disagree. `loadCanvasContext` mirrors the public page's community shape, so it
 * is pinned here the way the page and the preview route are pinned in
 * `__tests__/app/public-site/`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getCommunityPublicInfoMock,
  getBrandingForCommunityMock,
  getContactInfoMock,
  listOwnerRecordGroupsMock,
} = vi.hoisted(() => ({
  getCommunityPublicInfoMock: vi.fn(),
  getBrandingForCommunityMock: vi.fn(),
  getContactInfoMock: vi.fn(),
  listOwnerRecordGroupsMock: vi.fn(),
}));

vi.mock('@/lib/api/branding', () => ({
  getCommunityPublicInfo: getCommunityPublicInfoMock,
  getBrandingForCommunity: getBrandingForCommunityMock,
}));

// Presigning reaches storage; the canvas falls back to no logo on null.
vi.mock('@/lib/branding/branding-image-url', () => ({
  resolveBrandingImageUrl: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: () => ({
    listAnnouncements: vi.fn().mockResolvedValue([]),
    listDocuments: vi.fn().mockResolvedValue([]),
    listMeetings: vi.fn().mockResolvedValue([]),
    getContactInfo: getContactInfoMock,
    listOwnerRecordGroups: listOwnerRecordGroupsMock,
  }),
}));

// isomorphic-dompurify drags jsdom in; announcements are empty here anyway.
vi.mock('@/lib/utils/html-sanitizer', () => ({
  sanitizeHtml: (html: string) => html,
}));

import { loadCanvasContext } from '@/lib/site-editor/load-canvas-context';

const INFO = {
  id: 42,
  slug: 'sunset-condos',
  name: 'Sunset Condominium Association, Inc.',
  shortName: 'Sunset',
  communityType: 'condo_718',
  city: 'Miami',
  state: 'FL',
  unitCount: 120,
  sitePublishedAt: null,
  urgentNoticeText: null,
  urgentNoticeExpiresAt: null,
};

describe('loadCanvasContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCommunityPublicInfoMock.mockResolvedValue(INFO);
    getBrandingForCommunityMock.mockResolvedValue({});
    getContactInfoMock.mockResolvedValue({
      management: null,
      board: [],
      address: '100 Palm Way, Miami, FL 33101',
      officeHours: 'Mon-Fri, 9-5',
    });
    listOwnerRecordGroupsMock.mockResolvedValue([
      { category: 'budget', label: 'Budgets', postedCount: 2 },
    ]);
  });

  it("gives the canvas the community's real city, state, short name and unit count", async () => {
    const context = await loadCanvasContext(42);

    expect(context?.community).toMatchObject({
      id: 42,
      name: 'Sunset Condominium Association, Inc.',
      shortName: 'Sunset',
      city: 'Miami',
      state: 'FL',
      unitCount: 120,
    });
  });

  it('passes nulls through for facts the community has not given', async () => {
    getCommunityPublicInfoMock.mockResolvedValue({
      ...INFO,
      shortName: null,
      city: null,
      state: null,
      unitCount: null,
    });

    const context = await loadCanvasContext(42);

    expect(context?.community).toMatchObject({
      shortName: null,
      city: null,
      state: null,
      unitCount: null,
    });
  });

  it("carries the office address and hours into the canvas's contact data", async () => {
    const context = await loadCanvasContext(42);

    // Both sides are fetched switched on; the canvas masks them per block.
    expect(getContactInfoMock).toHaveBeenCalledWith({ showBoard: true, showManagement: true });
    expect(context?.preview.contact).toMatchObject({
      address: '100 Palm Way, Miami, FL 33101',
      officeHours: 'Mon-Fri, 9-5',
    });
  });

  it("carries the owners' record counts to the Documents panel", async () => {
    const context = await loadCanvasContext(42);

    expect(context?.ownerRecordGroups).toEqual([
      { category: 'budget', label: 'Budgets', postedCount: 2 },
    ]);
  });

  it('returns null for a community that is gone', async () => {
    getCommunityPublicInfoMock.mockResolvedValue(null);

    await expect(loadCanvasContext(42)).resolves.toBeNull();
  });
});

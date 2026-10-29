/**
 * `loadSiteFacts` — the look picker's loader (website builder, Phase 4, D19).
 *
 * Mocked at the module edges: the community and branding reads, the public
 * reader, the checklist loader, the profile service and the scoped client.
 * Kept REAL, because they are what is under test: the look ids
 * (`lookIdForLayout`), the records totals (`recordsPostedTotals`) and the
 * shared `pendingLook` / `isLazyDraftHome` that the draft count is built on.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunityBranding } from '@propertypro/shared';

const {
  getCommunityPublicInfoMock,
  getBrandingMock,
  listMeetingsMock,
  listAnnouncementsMock,
  loadChecklistMock,
  getCommunityProfileMock,
  selectFromMock,
} = vi.hoisted(() => ({
  getCommunityPublicInfoMock: vi.fn(),
  getBrandingMock: vi.fn(),
  listMeetingsMock: vi.fn(),
  listAnnouncementsMock: vi.fn(),
  loadChecklistMock: vi.fn(),
  getCommunityProfileMock: vi.fn(),
  selectFromMock: vi.fn(),
}));

vi.mock('@/lib/api/branding', () => ({
  getCommunityPublicInfo: getCommunityPublicInfoMock,
  getBrandingForCommunity: getBrandingMock,
}));
vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: () => ({
    listMeetings: listMeetingsMock,
    listAnnouncements: listAnnouncementsMock,
  }),
}));
vi.mock('@/lib/compliance/load-checklist-with-status', () => ({
  loadChecklistWithStatus: loadChecklistMock,
}));
vi.mock('@/lib/services/community-profile-service', () => ({
  getCommunityProfile: getCommunityProfileMock,
}));
vi.mock('@/lib/utils/community-url', () => ({
  buildCommunityUrl: (slug: string, path: string) => `https://${slug}.example.com${path}`,
}));
// Tables as plain objects, so a select's column map can be told apart.
vi.mock('@propertypro/db', () => ({
  createScopedClient: () => ({ selectFrom: selectFromMock }),
  siteBlocks: { __table: 'site_blocks', pageId: 'site_blocks.page_id', isDraft: 'site_blocks.is_draft' },
  sitePages: {
    __table: 'site_pages',
    id: 'site_pages.id',
    isHome: 'site_pages.is_home',
    isDraft: 'site_pages.is_draft',
    deleteStagedAt: 'site_pages.delete_staged_at',
  },
}));
vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
}));

import { loadSiteFacts } from '@/lib/services/website-home-service';

const COMMUNITY_ID = 42;

const PROFILE = {
  name: 'Sunset Condos',
  shortName: null,
  addressLine1: '100 Ocean Dr',
  addressLine2: null,
  city: 'Miami',
  state: 'FL',
  zipCode: '33139',
  unitCount: 40,
  officeHours: null,
  contactName: null,
  contactEmail: null,
  contactPhone: null,
};

const HOME = { id: 1, isHome: true, isDraft: false, deleteStagedAt: null };
const ABOUT = { id: 2, isHome: false, isDraft: false, deleteStagedAt: null };

/** Draft section rows and pages the scoped reads return, dispatched on the table. */
function siteRows(draftRows: Array<{ pageId: number | null }>, pages: unknown[]) {
  selectFromMock.mockImplementation(async (table: { __table: string }) =>
    table.__table === 'site_blocks' ? draftRows : pages,
  );
}

function item(templateKey: string, status: 'satisfied' | 'unsatisfied', documentState: 'posted' | null) {
  return {
    id: templateKey.length,
    templateKey,
    title: templateKey,
    category: 'governing_documents',
    isApplicable: true,
    isConditional: false,
    documentState,
    documentId: documentState ? 9 : null,
    documentPostedAt: documentState ? '2026-10-01T00:00:00.000Z' : null,
    rollingWindow: null,
    status,
  };
}

function branding(over: Partial<CommunityBranding> = {}): CommunityBranding {
  return { layoutId: 'bayfront', themePresetSlug: 'bayfront', ...over } as CommunityBranding;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCommunityPublicInfoMock.mockResolvedValue({
    id: COMMUNITY_ID,
    name: 'Sunset Condos',
    slug: 'sunset-condos',
    communityType: 'condo_718',
  });
  getBrandingMock.mockResolvedValue(branding());
  getCommunityProfileMock.mockResolvedValue(PROFILE);
  listMeetingsMock.mockResolvedValue([]);
  listAnnouncementsMock.mockResolvedValue([]);
  loadChecklistMock.mockResolvedValue([]);
  siteRows([], [HOME]);
});

describe('loadSiteFacts', () => {
  it('loadSiteFacts counts what the public site shows', async () => {
    listMeetingsMock.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    // The reader stops at the limit, so a long list comes back as 50 rows.
    listAnnouncementsMock.mockResolvedValue(Array.from({ length: 50 }, (_, i) => ({ id: i })));
    loadChecklistMock.mockResolvedValue([
      item('declaration', 'satisfied', 'posted'),
      item('bylaws', 'unsatisfied', null),
    ]);

    const facts = await loadSiteFacts(COMMUNITY_ID);

    // The public reader: what a visitor's Meetings and News sections read.
    expect(listMeetingsMock).toHaveBeenCalledWith({ limit: 50, timeWindowDays: 365 });
    expect(listAnnouncementsMock).toHaveBeenCalledWith({ limit: 50 });
    expect(loadChecklistMock).toHaveBeenCalledWith(COMMUNITY_ID, 'condo_718');
    expect(facts).toEqual({
      profile: PROFILE,
      communityType: 'condo_718',
      upcomingMeetingCount: 3,
      newsCount: 50,
      recordsPosted: 1,
      recordsTotal: 2,
      liveLookId: 'bayfront',
      draftLookId: null,
      pendingDraftCount: 0,
      siteUrl: 'https://sunset-condos.example.com/',
    });
  });

  it('reads the drafted look over the live one, and null for a legacy layout', async () => {
    getBrandingMock.mockResolvedValue(branding({ layoutId: 'sable', draftLook: { layoutId: 'heritage' } }));

    const facts = await loadSiteFacts(COMMUNITY_ID);

    expect(facts.liveLookId).toBeNull();
    expect(facts.draftLookId).toBe('heritage');
  });

  it('reads no records for an apartment community', async () => {
    getCommunityPublicInfoMock.mockResolvedValue({ id: COMMUNITY_ID, slug: 'ridge', communityType: 'apartment' });

    const facts = await loadSiteFacts(COMMUNITY_ID);

    expect(loadChecklistMock).not.toHaveBeenCalled();
    expect(facts.communityType).toBe('apartment');
    expect([facts.recordsPosted, facts.recordsTotal]).toEqual([0, 0]);
  });

  it('refuses a community that does not exist', async () => {
    getCommunityPublicInfoMock.mockResolvedValue(null);

    await expect(loadSiteFacts(COMMUNITY_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('loadSiteFacts — unpublished edits besides the look', () => {
  it('counts each draft section, each added or removed page, and drafted colours as one', async () => {
    siteRows(
      [{ pageId: 1 }, { pageId: 1 }, { pageId: 2 }, { pageId: null }],
      [
        HOME,
        ABOUT,
        { id: 3, isHome: false, isDraft: true, deleteStagedAt: null }, // added, unpublished
        { id: 4, isHome: false, isDraft: false, deleteStagedAt: new Date() }, // staged removal
      ],
    );
    getBrandingMock.mockResolvedValue(branding({ draftLook: { primaryColor: '#123456' } }));

    const facts = await loadSiteFacts(COMMUNITY_ID);

    expect(facts.pendingDraftCount).toBe(4 + 2 + 1);
    // Only draft rows are read; the scoped client leaves out removed ones.
    expect(selectFromMock).toHaveBeenCalledWith(
      expect.objectContaining({ __table: 'site_blocks' }),
      { pageId: 'site_blocks.page_id' },
      { __eq: { col: 'site_blocks.is_draft', val: true } },
    );
  });

  it("leaves out the drafted look's own home-page sections and design", async () => {
    siteRows([{ pageId: 1 }, { pageId: 1 }, { pageId: null }, { pageId: 2 }], [HOME, ABOUT]);
    getBrandingMock.mockResolvedValue(
      branding({ draftLook: { layoutId: 'heritage', themePresetSlug: 'heritage', primaryColor: '#1D2B4A' } }),
    );

    const facts = await loadSiteFacts(COMMUNITY_ID);

    // The About page's edit is still another edit; the home page is the look's.
    expect(facts.pendingDraftCount).toBe(1);
  });

  it('does not count the lazily created draft home page, or colours equal to the live ones', async () => {
    siteRows([], [{ id: 1, isHome: true, isDraft: true, deleteStagedAt: null }]);
    getBrandingMock.mockResolvedValue(branding({ draftLook: { layoutId: 'bayfront' } }));

    const facts = await loadSiteFacts(COMMUNITY_ID);

    expect(facts.pendingDraftCount).toBe(0);
  });
});

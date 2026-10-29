/**
 * `loadSiteFacts` — the look picker's loader — and `loadWebsiteHome` — the
 * website home's (website builder, Phase 4, D19).
 *
 * Mocked at the module edges: the community and branding reads, the public
 * reader, the checklist loader, the profile service and the scoped client.
 * Kept REAL, because they are what is under test: the look ids
 * (`lookIdForLayout`), the records totals (`recordsPostedTotals`) and the
 * shared `pendingLook` / `isLazyDraftHome` that the draft count is built on,
 * and for the home the records helpers (`missingRecordItems`,
 * `conditionalRecordItems`, `autoLinkedRecordCount`), `requirementLevel` and
 * the snooze reader.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunityBranding } from '@propertypro/shared';

const {
  getCommunityPublicInfoMock,
  getBrandingMock,
  listMeetingsMock,
  listAnnouncementsMock,
  loadChecklistMock,
  getCommunityProfileMock,
  selectFromMock,
  listRecordCandidatesMock,
  historyMock,
  liveNoticeMock,
  listMeetingsForCommunityMock,
  getUserPreferenceMock,
} = vi.hoisted(() => ({
  listRecordCandidatesMock: vi.fn(),
  historyMock: vi.fn(),
  liveNoticeMock: vi.fn(),
  listMeetingsForCommunityMock: vi.fn(),
  getUserPreferenceMock: vi.fn(),
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
vi.mock('@/lib/services/record-auto-link-service', () => ({
  listRecordCandidates: listRecordCandidatesMock,
}));
vi.mock('@/lib/services/site-blocks-service', () => ({
  paginateSitePublishHistory: historyMock,
}));
vi.mock('@/lib/services/site-live-notice-service', () => ({
  getSiteLiveNoticeState: liveNoticeMock,
}));
vi.mock('@/lib/services/meeting-service', () => ({
  listMeetingsForCommunity: listMeetingsForCommunityMock,
}));
vi.mock('@/lib/services/user-preferences-service', () => ({
  getUserPreference: getUserPreferenceMock,
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
  users: { __table: 'users', id: 'users.id', fullName: 'users.full_name' },
}));
vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  inArray: (col: unknown, vals: unknown) => ({ __inArray: { col, vals } }),
}));

import { loadSiteFacts, loadWebsiteHome } from '@/lib/services/website-home-service';

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

/** Publishers' user rows, as the scoped read of `users` returns them. */
let userRows: Array<{ id: string; fullName: string | null }> = [];

/** Draft section rows, pages and users the scoped reads return, dispatched on the table. */
function siteRows(draftRows: Array<{ pageId: number | null }>, pages: unknown[]) {
  selectFromMock.mockImplementation(async (table: { __table: string }) =>
    table.__table === 'site_blocks' ? draftRows : table.__table === 'users' ? userRows : pages,
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

const LIVE_NOTICE = { sentAt: null, dismissedAt: null, ownerCount: 12, offerable: true };

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
  listRecordCandidatesMock.mockResolvedValue({});
  historyMock.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false, pageSize: 10 } });
  liveNoticeMock.mockResolvedValue(LIVE_NOTICE);
  listMeetingsForCommunityMock.mockResolvedValue([]);
  getUserPreferenceMock.mockResolvedValue(null);
  userRows = [];
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

describe('loadWebsiteHome', () => {
  const USER_ID = 'user-1';
  const NOW = new Date('2026-10-29T12:00:00.000Z');

  function checklistRow(over: Record<string, unknown>) {
    return {
      category: 'governing_documents',
      isApplicable: true,
      isConditional: false,
      documentState: null,
      documentId: null,
      documentPostedAt: null,
      rollingWindow: null,
      status: 'unsatisfied',
      ...over,
    };
  }

  function snapshot(id: number, publishedAt: string, actorUserId: string | null, restorable = true) {
    return { id, publishedAt: new Date(publishedAt), actorUserId, changeCount: 1, changeLabels: [], restorable };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the missing records, auto-linked count, candidates and snooze for a covered condo', async () => {
    loadChecklistMock.mockResolvedValue([
      checklistRow({ id: 1, templateKey: '718_bylaws', title: 'Bylaws', status: 'satisfied', documentId: 5, autoLinkedDocumentId: 5, documentState: 'posted' }),
      checklistRow({ id: 2, templateKey: '718_budget', title: 'Annual budget', category: 'financial_records' }),
      checklistRow({ id: 3, templateKey: '718_sirs', title: 'SIRS', category: 'operations', isConditional: true }),
    ]);
    listRecordCandidatesMock.mockResolvedValue({
      2: [{ documentId: 31, title: '2026 Budget' }, { documentId: 30, title: '2025 Budget' }],
      // An item the alert does not list: no Upload to put a match beside.
      99: [{ documentId: 40, title: 'Elsewhere' }],
    });
    getUserPreferenceMock.mockResolvedValue({ snoozedUntil: '2026-11-02T00:00:00.000Z' });

    const home = await loadWebsiteHome(COMMUNITY_ID, USER_ID);

    expect(loadChecklistMock).toHaveBeenCalledTimes(1);
    expect(getUserPreferenceMock).toHaveBeenCalledWith(USER_ID, `site_records_alert:${COMMUNITY_ID}`);
    expect(home.records).toEqual({
      level: 'required',
      missing: [
        { itemId: 2, templateKey: '718_budget', title: 'Annual budget', category: 'financial_records', state: 'nothing_posted' },
      ],
      conditional: [{ itemId: 3, templateKey: '718_sirs', title: 'SIRS', category: 'operations', state: 'nothing_posted' }],
      autoLinked: 1,
      candidates: { 2: [{ documentId: 31, title: '2026 Budget' }, { documentId: 30, title: '2025 Budget' }] },
      snoozedUntil: '2026-11-02T00:00:00.000Z',
    });
    expect(home.facts.recordsPosted).toBe(1);
    expect(home.slug).toBe('sunset-condos');
    expect(home.liveNotice).toEqual(LIVE_NOTICE);
  });

  it('a lapsed snooze reads as none', async () => {
    getUserPreferenceMock.mockResolvedValue({ snoozedUntil: '2026-10-28T00:00:00.000Z' });

    expect((await loadWebsiteHome(COMMUNITY_ID, USER_ID)).records.snoozedUntil).toBeNull();
  });

  it('below the threshold the level is recommended and nothing is missing', async () => {
    getCommunityProfileMock.mockResolvedValue({ ...PROFILE, unitCount: 12 });
    loadChecklistMock.mockResolvedValue([checklistRow({ id: 2, templateKey: '718_budget', title: 'Annual budget' })]);

    const { records } = await loadWebsiteHome(COMMUNITY_ID, USER_ID);

    expect(records.level).toBe('recommended');
    expect(records.missing).toEqual([]);
  });

  it('an apartment reads no records at all', async () => {
    getCommunityPublicInfoMock.mockResolvedValue({ id: COMMUNITY_ID, slug: 'ridge', communityType: 'apartment' });

    const { records } = await loadWebsiteHome(COMMUNITY_ID, USER_ID);

    expect(loadChecklistMock).not.toHaveBeenCalled();
    expect(listRecordCandidatesMock).not.toHaveBeenCalled();
    expect(records.level).toBe('none');
  });

  it('reads meetings in the next 90 days, with whether each notice is marked posted', async () => {
    listMeetingsForCommunityMock.mockResolvedValue([
      { id: 7, title: 'Board meeting', startsAt: new Date('2026-11-05T23:00:00.000Z'), noticePostedAt: null },
      { id: 8, title: 'Annual meeting', startsAt: new Date('2026-12-01T23:00:00.000Z'), noticePostedAt: new Date() },
    ]);

    const home = await loadWebsiteHome(COMMUNITY_ID, USER_ID);

    expect(listMeetingsForCommunityMock).toHaveBeenCalledWith(COMMUNITY_ID, {
      startUtc: NOW,
      endUtcExclusive: new Date('2027-01-27T12:00:00.000Z'),
    });
    expect(home.upcomingMeetings).toEqual([
      { id: 7, title: 'Board meeting', startsAt: '2026-11-05T23:00:00.000Z', noticePosted: false },
      { id: 8, title: 'Annual meeting', startsAt: '2026-12-01T23:00:00.000Z', noticePosted: true },
    ]);
  });

  it('names who published last; the version list only when asked for (hasSitePolishBlocks)', async () => {
    historyMock.mockResolvedValue({
      data: [
        snapshot(30, '2026-10-27T15:00:00.000Z', 'user-a'),
        snapshot(29, '2026-10-20T15:00:00.000Z', 'user-blank'),
        snapshot(28, '2026-09-01T15:00:00.000Z', null, false),
      ],
      pagination: { nextCursor: null, hasMore: false, pageSize: 10 },
    });
    userRows = [
      { id: 'user-a', fullName: 'Maria Lopez' },
      { id: 'user-blank', fullName: '  ' },
    ];

    const essentials = await loadWebsiteHome(COMMUNITY_ID, USER_ID);
    expect(historyMock).toHaveBeenCalledWith({ communityId: COMMUNITY_ID, pageSize: 10 });
    // Only the publishers, by id: never an unfiltered read of a global table.
    expect(selectFromMock).toHaveBeenCalledWith(
      expect.objectContaining({ __table: 'users' }),
      { id: 'users.id', fullName: 'users.full_name' },
      { __inArray: { col: 'users.id', vals: ['user-a', 'user-blank'] } },
    );
    expect(essentials.lastPublish).toEqual({ publishedAt: '2026-10-27T15:00:00.000Z', byName: 'Maria Lopez' });
    expect(essentials.canRestorePrevious).toBe(true);
    expect(essentials.history).toBeNull();

    const professional = await loadWebsiteHome(COMMUNITY_ID, USER_ID, { includeHistory: true });
    expect(professional.history).toEqual([
      { snapshotId: 30, publishedAt: '2026-10-27T15:00:00.000Z', byName: 'Maria Lopez', restorable: true },
      // A blank name is no name, rather than an id.
      { snapshotId: 29, publishedAt: '2026-10-20T15:00:00.000Z', byName: null, restorable: true },
      { snapshotId: 28, publishedAt: '2026-09-01T15:00:00.000Z', byName: null, restorable: false },
    ]);
  });

  it('with one publish there is nothing to restore; with none there is no last publish', async () => {
    historyMock.mockResolvedValueOnce({
      data: [snapshot(30, '2026-10-27T15:00:00.000Z', null)],
      pagination: { nextCursor: null, hasMore: false, pageSize: 10 },
    });
    const once = await loadWebsiteHome(COMMUNITY_ID, USER_ID);
    expect(once.canRestorePrevious).toBe(false);
    expect(once.lastPublish).toEqual({ publishedAt: '2026-10-27T15:00:00.000Z', byName: null });
    // No actor, no read of users.
    expect(selectFromMock).not.toHaveBeenCalledWith(expect.objectContaining({ __table: 'users' }), expect.anything(), expect.anything());

    const never = await loadWebsiteHome(COMMUNITY_ID, USER_ID);
    expect(never.lastPublish).toBeNull();
    expect(never.canRestorePrevious).toBe(false);
  });
});

/**
 * The website pages' loaders (website builder, Phase 4, D19): each manager
 * page reads everything it shows through one function here, and its
 * components render what that returns without querying anything themselves.
 *
 * - `loadSiteFacts`: the look picker (`/pm/website/looks`). What the site
 *   already shows ("Filled in for you"), which look is live and which is
 *   drafted, and how many other unpublished edits a Publish would carry.
 * - `loadWebsiteHome`: the website home (`/pm/website`). The same facts, plus
 *   the last publish and the versions to restore, the "Email owners" offer, the
 *   Florida records still missing (with documents that may be them), and the
 *   meetings coming up.
 *
 * Read only: nothing here writes.
 *
 * AUTHZ: callers authorize. Both pages verify a management role in the
 * community, the `hasSiteEditor` plan feature and an entitled subscription
 * before calling.
 */
import { createScopedClient, siteBlocks, sitePages, users } from '@propertypro/db';
import { eq, inArray } from '@propertypro/db/filters';
import {
  isLazyDraftHome,
  pendingLook,
  requirementLevel,
  type CommunityBranding,
  type CommunityType,
  type RequirementLevel,
} from '@propertypro/shared';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';
import { getBrandingForCommunity, getCommunityPublicInfo } from '@/lib/api/branding';
import { NotFoundError } from '@/lib/api/errors';
import { loadChecklistWithStatus } from '@/lib/compliance/load-checklist-with-status';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { getCommunityProfile, type CommunityProfile } from '@/lib/services/community-profile-service';
import { listMeetingsForCommunity } from '@/lib/services/meeting-service';
import { listRecordCandidates } from '@/lib/services/record-auto-link-service';
import { paginateSitePublishHistory } from '@/lib/services/site-blocks-service';
import { getSiteLiveNoticeState, type SiteLiveNoticeState } from '@/lib/services/site-live-notice-service';
import { getUserPreference } from '@/lib/services/user-preferences-service';
import { readSnoozedUntil, recordsAlertSnoozeKey } from '@/lib/site-editor/records-alert-snooze';
import {
  autoLinkedRecordCount,
  conditionalRecordItems,
  missingRecordItems,
  recordsPostedTotals,
  type MissingRecord,
} from '@/lib/site-editor/records-status';
import { lookIdForLayout, type LookId } from '@/lib/site-looks/looks';
import { buildCommunityUrl } from '@/lib/utils/community-url';

/**
 * How many meetings and news posts are counted. The picker shows the limit as
 * "50+", so a long list costs one bounded read rather than a count of all.
 */
const SITE_FACTS_LIST_LIMIT = 50;
/** Upcoming meetings within a year, the window the public Meetings section's longest setting reads. */
const UPCOMING_MEETINGS_WINDOW_DAYS = 365;

export interface SiteFacts {
  profile: CommunityProfile;
  communityType: CommunityType;
  /** Upcoming meetings the public site can show, up to `SITE_FACTS_LIST_LIMIT`. */
  upcomingMeetingCount: number;
  /** News posts the public site can show, up to `SITE_FACTS_LIST_LIMIT`. */
  newsCount: number;
  /** Records posted and current, over all owed (`recordsPostedTotals`); 0 of 0 for apartments. */
  recordsPosted: number;
  recordsTotal: number;
  /** The live look; null for a site on a legacy layout. */
  liveLookId: LookId | null;
  /** A look drafted over the live one (a picker card chosen, not yet published). */
  draftLookId: LookId | null;
  /** Unpublished edits other than the drafted look's own, which a Publish carries too. */
  pendingDraftCount: number;
  /** The public site's address. */
  siteUrl: string;
}

type CommunityInfo = NonNullable<Awaited<ReturnType<typeof getCommunityPublicInfo>>>;

async function requireCommunityInfo(communityId: number): Promise<CommunityInfo> {
  const info = await getCommunityPublicInfo(communityId);
  if (!info) throw new NotFoundError('Community not found');
  return info;
}

/** The checklist with its derived statuses; empty for apartments, which have no records list (Global Constraints). */
async function loadRecordsChecklist(
  communityId: number,
  communityType: CommunityType,
): Promise<ChecklistItemData[]> {
  if (communityType === 'apartment') return [];
  return (await loadChecklistWithStatus(communityId, communityType)) as unknown as ChecklistItemData[];
}

export async function loadSiteFacts(communityId: number): Promise<SiteFacts> {
  const info = await requireCommunityInfo(communityId);
  const checklist = await loadRecordsChecklist(communityId, info.communityType as CommunityType);
  return buildSiteFacts(communityId, info, checklist);
}

/** The facts, given the community and its checklist (read once by `loadWebsiteHome` for both uses). */
async function buildSiteFacts(
  communityId: number,
  info: CommunityInfo,
  checklist: readonly ChecklistItemData[],
): Promise<SiteFacts> {
  const communityType = info.communityType as CommunityType;
  const reader = getPublicCommunityScopedReader(communityId);

  const [profile, branding, meetings, news] = await Promise.all([
    getCommunityProfile(communityId),
    getBrandingForCommunity(communityId),
    // The public reader, so these are the meetings and posts a visitor sees.
    reader.listMeetings({ limit: SITE_FACTS_LIST_LIMIT, timeWindowDays: UPCOMING_MEETINGS_WINDOW_DAYS }),
    reader.listAnnouncements({ limit: SITE_FACTS_LIST_LIMIT }),
  ]);
  const records = recordsPostedTotals(checklist);
  const pendingDraftCount = await countOtherPendingEdits(communityId, branding);

  return {
    profile,
    communityType,
    upcomingMeetingCount: meetings.length,
    newsCount: news.length,
    recordsPosted: records.posted,
    recordsTotal: records.total,
    liveLookId: lookIdForLayout(branding?.layoutId),
    draftLookId: lookIdForLayout(branding?.draftLook?.layoutId),
    pendingDraftCount,
    siteUrl: buildCommunityUrl(info.slug, '/'),
  };
}

/** The "Coming up" window on the website home. */
const HOME_MEETINGS_WINDOW_DAYS = 90;
/** How many past publishes the version list shows. */
const HISTORY_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Documents that may be a record, newest first, keyed by checklist item id (`listRecordCandidates`). */
type RecordCandidates = Record<number, Array<{ documentId: number; title: string }>>;

export interface WebsiteHomeData {
  facts: SiteFacts;
  /** The newest publish and its actor's name; null before the first publish recorded in the log. */
  lastPublish: { publishedAt: string; byName: string | null } | null;
  /** The latest publishes, newest first; null unless the plan has `hasSitePolishBlocks`. */
  history: Array<{
    snapshotId: number;
    publishedAt: string;
    byName: string | null;
    /** False once retention has cleared the version's content; the entry stays in the log. */
    restorable: boolean;
  }> | null;
  /** Whether the version before the last publish can be restored (one-step Restore, on every plan). */
  canRestorePrevious: boolean;
  liveNotice: SiteLiveNoticeState;
  records: {
    level: RequirementLevel;
    missing: MissingRecord[];
    conditional: MissingRecord[];
    autoLinked: number;
    /** For each missing or conditional item, documents that may be it, newest first; items with none are absent. */
    candidates: RecordCandidates;
    /** This manager's snooze of the alert, while it is in force. */
    snoozedUntil: string | null;
  };
  /** Meetings in the next 90 days, soonest first. */
  upcomingMeetings: Array<{ id: number; title: string; startsAt: string; noticePosted: boolean }>;
  /** The community's subdomain, for the transparency page's address. */
  slug: string;
}

export interface LoadWebsiteHomeOptions {
  /** Include the version list (`hasSitePolishBlocks`). One-step restore needs no plan feature. */
  includeHistory?: boolean;
}

/**
 * Everything the website home shows (D19).
 *
 * The caller has already run `ensureTransparencyChecklistInitialized` for a
 * condo or HOA: a community created by a manager has no checklist rows until
 * then, and would read as missing nothing.
 */
export async function loadWebsiteHome(
  communityId: number,
  userId: string,
  { includeHistory = false }: LoadWebsiteHomeOptions = {},
): Promise<WebsiteHomeData> {
  const info = await requireCommunityInfo(communityId);
  const communityType = info.communityType as CommunityType;
  const hasRecords = communityType !== 'apartment';
  const now = new Date();

  const [checklist, candidatesByItem, historyPage, liveNotice, meetings, storedSnooze] = await Promise.all([
    loadRecordsChecklist(communityId, communityType),
    hasRecords ? listRecordCandidates(communityId) : Promise.resolve<RecordCandidates>({}),
    paginateSitePublishHistory({ communityId, pageSize: HISTORY_LIMIT }),
    getSiteLiveNoticeState(communityId),
    listMeetingsForCommunity(communityId, {
      startUtc: now,
      endUtcExclusive: new Date(now.getTime() + HOME_MEETINGS_WINDOW_DAYS * DAY_MS),
    }),
    getUserPreference(userId, recordsAlertSnoozeKey(communityId)),
  ]);
  const facts = await buildSiteFacts(communityId, info, checklist);

  const entries = historyPage.data;
  const names = await publisherNames(communityId, entries.map((entry) => entry.actorUserId));
  const nameOf = (actorUserId: string | null): string | null =>
    (actorUserId ? names.get(actorUserId) : undefined) ?? null;
  const newest = entries[0];

  const subject = { communityType, unitCount: facts.profile.unitCount };
  const missing = missingRecordItems(checklist, subject);
  const conditional = conditionalRecordItems(checklist, subject);
  // Only the rows the alert shows: an item that is not listed has no Upload to offer a match beside.
  const listed = new Set([...missing, ...conditional].map((item) => item.itemId));
  const candidates = Object.fromEntries(
    Object.entries(candidatesByItem).filter(([itemId]) => listed.has(Number(itemId))),
  );

  return {
    facts,
    lastPublish: newest
      ? { publishedAt: newest.publishedAt.toISOString(), byName: nameOf(newest.actorUserId) }
      : null,
    history: includeHistory
      ? entries.map((entry) => ({
          snapshotId: entry.id,
          publishedAt: entry.publishedAt.toISOString(),
          byName: nameOf(entry.actorUserId),
          restorable: entry.restorable,
        }))
      : null,
    canRestorePrevious: entries[1]?.restorable === true,
    liveNotice,
    records: {
      level: requirementLevel(subject),
      missing,
      conditional,
      autoLinked: autoLinkedRecordCount(checklist),
      candidates,
      snoozedUntil: readSnoozedUntil(storedSnooze, now.getTime()),
    },
    upcomingMeetings: meetings.map((meeting) => ({
      id: meeting.id,
      title: meeting.title,
      startsAt: new Date(meeting.startsAt).toISOString(),
      noticePosted: meeting.noticePostedAt != null,
    })),
    slug: info.slug,
  };
}

/**
 * The names of the people who published, by user id: the actors of this
 * community's own publish log, read by id. A blank name is left out, so the
 * home says "Last published 3 days ago" rather than naming no one.
 */
async function publisherNames(
  communityId: number,
  actorUserIds: ReadonlyArray<string | null>,
): Promise<Map<string, string>> {
  const ids = [...new Set(actorUserIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  if (ids.length === 0) return new Map();
  const rows = await createScopedClient(communityId).selectFrom<{ id: string; fullName: string | null }>(
    users,
    { id: users.id, fullName: users.fullName },
    inArray(users.id, ids),
  );
  return new Map(
    rows.flatMap((row) => {
      const name = row.fullName?.trim();
      return name ? [[row.id, name] as const] : [];
    }),
  );
}

/**
 * The unpublished edits a Publish would carry besides a drafted look, counted
 * the way the publish transaction finds work: each live draft section row
 * (an edit, an addition or a staged removal), each page added or staged for
 * removal (never the lazily created home page), and the drafted colours and
 * fonts as one edit.
 *
 * A drafted look (a different layout in `draftLook`) wrote the home page's
 * sections and the look's design itself, so while one is drafted those are the
 * look, not other edits, and are left out. Otherwise reopening the picker after
 * choosing a card would report the card's own sections as edits.
 */
async function countOtherPendingEdits(
  communityId: number,
  branding: CommunityBranding | null,
): Promise<number> {
  const scoped = createScopedClient(communityId);
  // Soft-deleted rows are excluded by the scoped client.
  const [draftRows, pageRows] = await Promise.all([
    scoped.selectFrom<{ pageId: number | null }>(
      siteBlocks,
      { pageId: siteBlocks.pageId },
      eq(siteBlocks.isDraft, true),
    ),
    scoped.selectFrom<{ id: number; isHome: boolean; isDraft: boolean; deleteStagedAt: Date | null }>(
      sitePages,
      {
        id: sitePages.id,
        isHome: sitePages.isHome,
        isDraft: sitePages.isDraft,
        deleteStagedAt: sitePages.deleteStagedAt,
      },
    ),
  ]);

  const pending = pendingLook(branding);
  const lookDrafted = pending.layoutId !== undefined;
  const homePageId = pageRows.find((page) => page.isHome)?.id ?? null;
  // A row with no page yet belongs to the home page (`ensureHomePage` adopts it).
  const onHome = (pageId: number | null) => pageId === null || pageId === homePageId;

  const sections = draftRows.filter((row) => !(lookDrafted && onHome(row.pageId))).length;
  const pages = pageRows.filter(
    (page) => (page.isDraft && !isLazyDraftHome(page)) || page.deleteStagedAt !== null,
  ).length;
  const design = !lookDrafted && Object.keys(pending).length > 0 ? 1 : 0;
  return sections + pages + design;
}

/**
 * The website overview's loader (website builder, Phase 4, D19): the page
 * reads everything it shows through `loadWebsiteHome`, and its components
 * render what that returns without querying anything themselves.
 *
 * What it reads: the site's facts (the profile, which look is live and which is
 * drafted, how many unpublished edits a Publish would carry, whether anything is
 * waiting, the records posted), the last publish and the versions to restore,
 * the "Email owners" offer, and the Florida records still missing (with
 * documents that may be them).
 *
 * Read only: nothing here writes.
 *
 * AUTHZ: callers authorize. The page verifies a management role in the
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

export interface SiteFacts {
  profile: CommunityProfile;
  communityType: CommunityType;
  /** Records posted and current, over all owed (`recordsPostedTotals`); 0 of 0 for apartments. */
  recordsPosted: number;
  recordsTotal: number;
  /** The live look; null for a site on a legacy layout. */
  liveLookId: LookId | null;
  /** A look drafted over the live one (chosen in the editor, not yet published). */
  draftLookId: LookId | null;
  /** Unpublished edits other than the drafted look's own, which a Publish carries too. */
  pendingDraftCount: number;
  /**
   * Anything is waiting to be published: a drafted layout or any other edit.
   * A yes/no, not a count: the editor's Publish button counts changes its own
   * way (`useSiteDiff`), and a second number here would disagree with it.
   */
  hasUnpublishedChanges: boolean;
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

/** The facts, given the community and its checklist (read once by `loadWebsiteHome` for both uses). */
async function buildSiteFacts(
  communityId: number,
  info: CommunityInfo,
  checklist: readonly ChecklistItemData[],
): Promise<SiteFacts> {
  const communityType = info.communityType as CommunityType;

  const [profile, branding] = await Promise.all([
    getCommunityProfile(communityId),
    getBrandingForCommunity(communityId),
  ]);
  const records = recordsPostedTotals(checklist);
  const pendingDraftCount = await countOtherPendingEdits(communityId, branding);

  return {
    profile,
    communityType,
    recordsPosted: records.posted,
    recordsTotal: records.total,
    liveLookId: lookIdForLayout(branding?.layoutId),
    draftLookId: lookIdForLayout(branding?.draftLook?.layoutId),
    pendingDraftCount,
    // A drafted layout counts on its own: `pendingDraftCount` leaves its edits out.
    hasUnpublishedChanges: pendingDraftCount > 0 || pendingLook(branding).layoutId !== undefined,
    siteUrl: buildCommunityUrl(info.slug, '/'),
  };
}

/** How many past publishes the version list shows. */
const HISTORY_LIMIT = 10;

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
  /**
   * The version before the last publish (the second-newest snapshot), when it
   * can still be restored: one-step Restore, on every plan. Read at page load,
   * so Restore puts back the version the person saw named, never a newer one.
   */
  previousSnapshotId: number | null;
  /**
   * The site's publish token at page load: max `published_at` over its
   * published sections, the value the publish route checks. Restore refuses
   * when the live site has moved on since (a colleague published).
   */
  publishToken: string | null;
  /** The site is public (`site_published_at` set), as every site is from creation. */
  sitePublished: boolean;
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

  const reader = getPublicCommunityScopedReader(communityId);
  const [checklist, candidatesByItem, historyPage, liveNotice, storedSnooze, publishToken] = await Promise.all([
    loadRecordsChecklist(communityId, communityType),
    hasRecords ? listRecordCandidates(communityId) : Promise.resolve<RecordCandidates>({}),
    paginateSitePublishHistory({ communityId, pageSize: HISTORY_LIMIT }),
    getSiteLiveNoticeState(communityId),
    getUserPreference(userId, recordsAlertSnoozeKey(communityId)),
    reader.getLatestPublishedAt(),
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
    previousSnapshotId: entries[1]?.restorable === true ? entries[1].id : null,
    publishToken: publishToken ? publishToken.toISOString() : null,
    sitePublished: info.sitePublishedAt != null,
    liveNotice,
    records: {
      level: requirementLevel(subject),
      missing,
      conditional,
      autoLinked: autoLinkedRecordCount(checklist),
      candidates,
      snoozedUntil: readSnoozedUntil(storedSnooze, now.getTime()),
    },
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

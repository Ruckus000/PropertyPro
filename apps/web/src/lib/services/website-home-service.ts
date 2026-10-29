/**
 * The website pages' loaders (website builder, Phase 4, D19): each manager
 * page reads everything it shows through one function here, and its
 * components render what that returns without querying anything themselves.
 *
 * - `loadSiteFacts`: the look picker (`/pm/website/looks`). What the site
 *   already shows ("Filled in for you"), which look is live and which is
 *   drafted, and how many other unpublished edits a Publish would carry.
 *
 * Read only: nothing here writes.
 *
 * AUTHZ: callers authorize. The look picker page verifies a management role
 * in the community, the `hasSiteEditor` plan feature and an entitled
 * subscription before calling.
 */
import { createScopedClient, siteBlocks, sitePages } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { isLazyDraftHome, pendingLook, type CommunityBranding, type CommunityType } from '@propertypro/shared';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';
import { getBrandingForCommunity, getCommunityPublicInfo } from '@/lib/api/branding';
import { NotFoundError } from '@/lib/api/errors';
import { loadChecklistWithStatus } from '@/lib/compliance/load-checklist-with-status';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { getCommunityProfile, type CommunityProfile } from '@/lib/services/community-profile-service';
import { recordsPostedTotals } from '@/lib/site-editor/records-status';
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

export async function loadSiteFacts(communityId: number): Promise<SiteFacts> {
  const info = await getCommunityPublicInfo(communityId);
  if (!info) throw new NotFoundError('Community not found');
  const communityType = info.communityType as CommunityType;
  const reader = getPublicCommunityScopedReader(communityId);

  const [profile, branding, meetings, news, checklist] = await Promise.all([
    getCommunityProfile(communityId),
    getBrandingForCommunity(communityId),
    // The public reader, so these are the meetings and posts a visitor sees.
    reader.listMeetings({ limit: SITE_FACTS_LIST_LIMIT, timeWindowDays: UPCOMING_MEETINGS_WINDOW_DAYS }),
    reader.listAnnouncements({ limit: SITE_FACTS_LIST_LIMIT }),
    // Apartments have no records list (Global Constraints).
    communityType === 'apartment'
      ? Promise.resolve([])
      : loadChecklistWithStatus(communityId, communityType),
  ]);
  const records = recordsPostedTotals(checklist as unknown as ChecklistItemData[]);
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

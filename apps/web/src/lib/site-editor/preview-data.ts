/**
 * Canvas preview data — the system-of-record rows the editor canvas renders.
 *
 * ## Why a superset plus client-side selection
 *
 * On the public site each SoR block runs its own query using its own config
 * (`limit`, `timeWindowDays`, `includeCategories`). The canvas cannot do that:
 * it is a client tree, and a query per block per keystroke would be both slow
 * and wrong (a half-typed `limit` of `1` would fire a request).
 *
 * So the page fetches ONE generous superset per SoR type and the canvas narrows
 * it with the pure selectors below. Editing a block's config re-filters
 * in memory — no request, no flicker.
 *
 * ## Where this is exact, and where it is an approximation
 *
 * The superset is fetched at `PREVIEW_LIMIT` rows over `PREVIEW_WINDOW_DAYS`,
 * both far above what any block can ask for (a block's `limit` is capped at 20
 * and its window at 365 by the shared schemas). Narrowing a superset reproduces
 * the site's result exactly **unless** an item the site would show ranks below
 * `PREVIEW_LIMIT` in the wider query — which needs more than `PREVIEW_LIMIT`
 * items ordered above it. With the ordering the reader uses (pinned first, then
 * newest) that takes a community with 100+ pinned-or-recent announcements.
 *
 * The published site remains authoritative. If that edge ever matters, the fix
 * is to refetch the superset when a SoR block's config changes — not to make
 * these selectors cleverer.
 */
import type {
  AnnouncementsBlockContent,
  ContactBlockContent,
  DocumentsBlockContent,
  MeetingsBlockContent,
} from '@propertypro/shared';
import type {
  PublicContactInfo,
  PublicDocument,
  PublicMeeting,
} from '@/lib/db/public-community-reader';
import type { AnnouncementViewItem } from '@/components/public-site/blocks/AnnouncementsBlockView';

/** Rows per SoR type in the superset. Well above the per-block cap of 20. */
export const PREVIEW_LIMIT = 100;
/** Widest window any block can ask for, per the shared schemas. */
export const PREVIEW_WINDOW_DAYS = 365;

export interface CanvasPreviewData {
  /** Bodies are already sanitized — see AnnouncementViewItem. */
  announcements: AnnouncementViewItem[];
  documents: PublicDocument[];
  meetings: PublicMeeting[];
  contact: PublicContactInfo;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Empty preview data — used before the fetch resolves and in tests. */
export const EMPTY_PREVIEW_DATA: CanvasPreviewData = {
  announcements: [],
  documents: [],
  meetings: [],
  contact: { management: null, board: [] },
};

/**
 * Announcements published within the window, newest-first order preserved.
 *
 * `now` is injected rather than read from the clock so the selector is
 * deterministic under test.
 */
export function selectAnnouncements(
  content: Pick<AnnouncementsBlockContent, 'limit' | 'timeWindowDays'>,
  all: readonly AnnouncementViewItem[],
  now: number,
): AnnouncementViewItem[] {
  const cutoff = now - content.timeWindowDays * DAY_MS;
  return all.filter((a) => a.publishedAt.getTime() >= cutoff).slice(0, content.limit);
}

/**
 * Documents in the selected categories.
 *
 * An empty `includeCategories` means "all categories" — the same convention the
 * public renderer uses. Documents with no category are only ever included by
 * that all-categories case, since there is no category name to match.
 */
export function selectDocuments(
  content: Pick<DocumentsBlockContent, 'limit' | 'includeCategories'>,
  all: readonly PublicDocument[],
): PublicDocument[] {
  const categories = content.includeCategories ?? [];
  const filtered =
    categories.length === 0
      ? all
      : all.filter((d) => d.categoryName !== null && categories.includes(d.categoryName as never));
  return filtered.slice(0, content.limit);
}

/** Meetings starting within the window, soonest-first order preserved. */
export function selectMeetings(
  content: Pick<MeetingsBlockContent, 'limit' | 'timeWindowDays'>,
  all: readonly PublicMeeting[],
  now: number,
): PublicMeeting[] {
  const cutoff = now + content.timeWindowDays * DAY_MS;
  return all.filter((m) => m.startsAt.getTime() <= cutoff).slice(0, content.limit);
}

/**
 * Contact info masked by the block's toggles.
 *
 * The superset is always fetched with both sides on, so turning a toggle off
 * must hide it here — otherwise the canvas would show details the published
 * page does not.
 */
export function selectContact(
  content: Pick<ContactBlockContent, 'showManagement' | 'showBoard'>,
  all: PublicContactInfo,
): PublicContactInfo {
  return {
    management: content.showManagement ? all.management : null,
    board: content.showBoard ? all.board : [],
  };
}

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
import {
  documentMatchesSectionCategories,
  type AnnouncementsBlockContent,
  type ContactBlockContent,
  type DocumentsBlockContent,
  type MeetingsBlockContent,
} from '@propertypro/shared';
import type {
  PublicContactInfo,
  PublicDocument,
  PublicMeeting,
} from '@/lib/db/public-community-reader';
import type { AnnouncementViewItem } from '@/components/public-site/blocks/AnnouncementsBlockView';
import type { BoardData } from '@/components/public-site/blocks/BoardBlockView';
import { contactHasContent } from '@/components/public-site/blocks/ContactBlockView';
import type { QuickLinksData } from '@/components/public-site/blocks/QuickLinksBlockView';

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

/** The Meetings and Announcements sections' default window, per their schemas. */
const DEFAULT_SECTION_WINDOW_DAYS = 30;

/** Empty preview data — used before the fetch resolves and in tests. */
export const EMPTY_PREVIEW_DATA: CanvasPreviewData = {
  announcements: [],
  documents: [],
  meetings: [],
  contact: { management: null, board: [], address: null, officeHours: null },
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
 * An empty `includeCategories` yields **nothing**, not everything. That is the
 * published site's actual behaviour: `listDocuments` returns `[]` when no
 * categories are selected, because "a DocumentsBlock with no category
 * selection is a no-op" (see `public-community-reader.ts`). Reading the empty
 * list as "all categories" is the intuitive guess and it is wrong — it would
 * make the canvas show every public document where the live page shows none,
 * which is precisely the kind of divergence the shared-view design exists to
 * prevent.
 */
export function selectDocuments(
  content: Pick<DocumentsBlockContent, 'limit' | 'includeCategories'>,
  all: readonly PublicDocument[],
): PublicDocument[] {
  const categories = content.includeCategories ?? [];
  if (categories.length === 0) return [];
  // Same match as the live site's reader — by meaning, not by name.
  return all
    .filter((d) => documentMatchesSectionCategories(d.categoryName, categories))
    .slice(0, content.limit);
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
 *
 * The office address and hours are NOT behind either toggle on the published
 * page (they are the association's, not a person's), so they pass through here
 * for the same reason: the canvas must show what the page shows. Listed one by
 * one rather than spread, so a field added to `PublicContactInfo` has to be
 * decided on here instead of passing through unmasked.
 */
export function selectContact(
  content: Pick<ContactBlockContent, 'showManagement' | 'showBoard'>,
  all: PublicContactInfo,
): PublicContactInfo {
  return {
    management: content.showManagement ? all.management : null,
    board: content.showBoard ? all.board : [],
    address: all.address,
    officeHours: all.officeHours,
  };
}

/**
 * The Quick links the canvas previews.
 *
 * An approximation, on purpose. On the live site a link shows only when its
 * section is on the same page and has something in it, read with that
 * section's own settings (see QuickLinksBlock). The canvas renders one section
 * at a time and cannot see the rest of the page, so it shows each link the
 * community's data supports, as it would look beside Meetings, News and Contact
 * sections with their default settings, which are what the looks use. The live
 * site also leaves out a link whose section is not on the page.
 */
export function selectQuickLinks(preview: CanvasPreviewData, now: number): QuickLinksData {
  const firstInDefaultWindow = { limit: 1, timeWindowDays: DEFAULT_SECTION_WINDOW_DAYS };
  const nextMeeting = selectMeetings(firstInDefaultWindow, preview.meetings, now)[0];
  return {
    nextMeeting: nextMeeting ? { startsAt: nextMeeting.startsAt.toISOString() } : null,
    showMeetings: nextMeeting !== undefined,
    showNews: selectAnnouncements(firstInDefaultWindow, preview.announcements, now).length > 0,
    showContact: contactHasContent(
      selectContact({ showManagement: true, showBoard: true }, preview.contact),
    ),
  };
}

/**
 * The Board members section's rows: the board from the contact superset, which
 * is always fetched with the board on. Name and title only, as on the live site.
 */
export function selectBoard(contact: PublicContactInfo): BoardData {
  return { members: contact.board.map(({ name, title }) => ({ name, title })) };
}

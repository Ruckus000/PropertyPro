/**
 * Florida-required website sections (v4 builder, Phase 2).
 *
 * One source of truth for "which sections must this community's site show",
 * shared by the canvas toolbar, SectionList, the top-bar requirements pill,
 * the publish sheet's checks and the server's delete guards — so the five can
 * never disagree about what is required.
 *
 * Keyed by `communityType` alone. The statutes also carry size thresholds
 * (condos of 25+ units, HOAs of 100+ parcels) that no community row records
 * today; every condo and HOA is treated as covered, which is the same
 * assumption `hasCompliance` makes. Copy therefore says what the law asks of
 * associations, never what this association owes — and never a fine amount:
 * the "$50 per day" figure in the design belongs to records-inspection
 * requests, not §718.111(12)(g) posting (see the v4 plan's legal-copy rule).
 *
 * Takes `communityType` as a plain string because this directory may import
 * only `zod` and the block schemas (see `types.ts`). An unrecognised type has
 * no requirements: failing open here costs a warning, failing closed would
 * lock sections on a site the law says nothing about.
 */
import { sectionTitle } from './diff';
import type { Issue, SiteSnapshot } from './types';

export type RequiredSectionType = 'documents' | 'meetings';

interface Requirement {
  blockType: RequiredSectionType;
  /** What the law asks to be posted, in a PM's words. */
  what: string;
}

interface Statute {
  citation: string;
  requirements: readonly Requirement[];
}

const WEBSITE_POSTING: readonly Requirement[] = [
  { blockType: 'documents', what: 'official records' },
  { blockType: 'meetings', what: 'meeting notices' },
];

/** Website-posting statute per community type. Apartments have none. */
const STATUTES: Readonly<Record<string, Statute>> = {
  condo_718: { citation: '§718.111(12)(g)', requirements: WEBSITE_POSTING },
  hoa_720: { citation: '§720.303', requirements: WEBSITE_POSTING },
};

/** The section types this community's site must show, in display order. */
export function requiredSectionTypes(communityType: string): readonly RequiredSectionType[] {
  return (STATUTES[communityType]?.requirements ?? []).map((r) => r.blockType);
}

export function isRequiredSectionType(communityType: string, blockType: string): boolean {
  return (requiredSectionTypes(communityType) as readonly string[]).includes(blockType);
}

/** The statute a community's required sections come from; null when none. */
export function requiredSectionStatute(communityType: string): string | null {
  return STATUTES[communityType]?.citation ?? null;
}

/**
 * The one sentence every surface uses to say why a section is required —
 * "Florida law (§718.111(12)(g)) asks associations to post meeting notices on
 * their website." Null when `blockType` is not required for this community.
 * Shared so the publish sheet, the hide confirmation and the server's refusal
 * cannot drift into three different legal claims.
 */
export function requiredSectionLaw(communityType: string, blockType: string): string | null {
  const statute = STATUTES[communityType];
  const requirement = statute?.requirements.find((r) => r.blockType === blockType);
  if (!statute || !requirement) return null;
  return `Florida law (${statute.citation}) asks associations to post ${requirement.what} on their website.`;
}

/** One page of the site, as `requiredSectionStatus` reads it. */
export interface RequiredSectionPage {
  pageId: string;
  snapshot: SiteSnapshot;
}

/**
 * `visible`: some page shows one. `hidden`: every copy is hidden.
 * `missing`: no page has one at all (or every copy is staged for removal).
 */
export type RequiredSectionState = 'visible' | 'hidden' | 'missing';

export interface RequiredSectionStatus {
  blockType: RequiredSectionType;
  /** "Documents section" — the same label the publish sheet uses. */
  title: string;
  state: RequiredSectionState;
  /** The first hidden copy, so a "show it" fix knows where to go. */
  hiddenAt?: { pageId: string; slot: number };
}

function isHidden(content: unknown): boolean {
  return (content as Record<string, unknown> | null)?.['hidden'] === true;
}

/**
 * The live (non-tombstoned) sections of one type across every page, in page
 * order. A slot staged for deletion is not going to be published, so it does
 * not satisfy a requirement.
 */
function liveSectionsOfType(pages: readonly RequiredSectionPage[], blockType: string) {
  return pages.flatMap(({ pageId, snapshot }) => {
    const tombstoned = new Set(snapshot.tombstonedSlots ?? []);
    return snapshot.sections
      .filter((s) => s.blockType === blockType && !tombstoned.has(s.slot))
      .sort((a, b) => a.slot - b.slot)
      .map((s) => ({ pageId, slot: s.slot, hidden: isHidden(s.content) }));
  });
}

/** How many live copies of `blockType` the site has, hidden ones included. */
export function countLiveSections(pages: readonly RequiredSectionPage[], blockType: string): number {
  return liveSectionsOfType(pages, blockType).length;
}

export function requiredSectionStatus(
  communityType: string,
  pages: readonly RequiredSectionPage[],
): RequiredSectionStatus[] {
  return requiredSectionTypes(communityType).map((blockType) => {
    const title = `${sectionTitle(blockType)} section`;
    const live = liveSectionsOfType(pages, blockType);
    if (live.length === 0) return { blockType, title, state: 'missing' };
    if (live.some((s) => !s.hidden)) return { blockType, title, state: 'visible' };
    const first = live[0]!;
    return { blockType, title, state: 'hidden', hiddenAt: { pageId: first.pageId, slot: first.slot } };
  });
}

/**
 * Publish-sheet checks: one WARNING per required section that visitors will
 * not see. Never an error — the design lets a PM publish anyway, and a gate
 * that blocks an unrelated typo fix is a gate PMs learn to route around (see
 * `validate.ts`).
 */
export function requiredSectionIssues(
  communityType: string,
  pages: readonly RequiredSectionPage[],
): Issue[] {
  return requiredSectionStatus(communityType, pages).flatMap((status): Issue[] => {
    if (status.state === 'visible') return [];
    const law = requiredSectionLaw(communityType, status.blockType)!;
    const field = `required.${status.blockType}`;
    if (status.state === 'missing') {
      return [{
        field,
        message: `No page has a ${status.title}. ${law}`,
        severity: 'warning',
        blockType: status.blockType,
      }];
    }
    return [{
      field,
      message: `The ${status.title} is hidden, so visitors will not see it once you publish. ${law}`,
      severity: 'warning',
      blockType: status.blockType,
      slot: status.hiddenAt!.slot,
      pageId: status.hiddenAt!.pageId,
    }];
  });
}

/** What is about to go: one section (by page and slot), or a whole page. */
export type RequiredSectionRemoval =
  | { kind: 'section'; pageId: string; slot: number }
  | { kind: 'page'; pageId: string };

function withoutRemoval(
  pages: readonly RequiredSectionPage[],
  removal: RequiredSectionRemoval,
): RequiredSectionPage[] {
  if (removal.kind === 'page') return pages.filter((p) => p.pageId !== removal.pageId);
  return pages.map((p) =>
    p.pageId !== removal.pageId
      ? p
      : {
          ...p,
          snapshot: {
            ...p.snapshot,
            sections: p.snapshot.sections.filter((s) => s.slot !== removal.slot),
          },
        },
  );
}

/**
 * Why `removal` must be refused, or null when it may go ahead — the rule the
 * server's delete guard enforces (`assertRequiredSectionsSurvive` in
 * `site-pages-service.ts`) and the editor's Remove lock mirrors.
 *
 * Refuses only a removal that takes the site's LAST live copy of a required
 * type. Hidden copies count as present: hiding is reversible and asked about
 * separately; deletion is what this guards. A type already absent before the
 * removal is not grounds to refuse — refusing could not restore it.
 *
 * `pages` must be the SURVIVING pages (none staged for deletion), each a
 * draft-wins snapshot with tombstoned slots removed or listed.
 */
export function requiredRemovalRefusal(
  communityType: string,
  pages: readonly RequiredSectionPage[],
  removal: RequiredSectionRemoval,
): string | null {
  const after = withoutRemoval(pages, removal);
  const lost = requiredSectionTypes(communityType).filter(
    (type) => countLiveSections(pages, type) > 0 && countLiveSections(after, type) === 0,
  );
  if (lost.length === 0) return null;

  const names = lost.map((type) => `${sectionTitle(type)} section`).join(' and ');
  const law = lost.map((type) => requiredSectionLaw(communityType, type)).join(' ');
  return removal.kind === 'page'
    ? `This page has your only ${names}. ${law} Add one to another page before removing this page.`
    : `This is your only ${names}. ${law} You can hide it or move it instead.`;
}

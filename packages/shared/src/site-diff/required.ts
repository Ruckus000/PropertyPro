/**
 * Florida-required website sections (v4 builder, Phase 2).
 *
 * One source of truth for "which sections must this community's site show",
 * shared by the canvas toolbar, SectionList, the top-bar requirements pill,
 * the publish sheet's checks and the server's delete guards — so the five can
 * never disagree about what is required.
 *
 * Keyed by a `ComplianceSubject`: the community type AND its unit (or parcel)
 * count, because the statutes only reach associations above a size threshold —
 * condos of 25+ units, HOAs of 100+ parcels (`requirementLevel`). Below it the
 * same sections are "recommended": badged, but never locked, confirmed or
 * warned about. An UNKNOWN count (`null`, every community created before
 * migration 0081 whose signup could not be recovered) is treated as covered —
 * a false "Required" is a nuisance, a false "not required" a legal exposure —
 * and the editor asks for the number. Copy says what the law asks of
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
  /** Smallest association the statute reaches: units (condo) or parcels (HOA). */
  minUnits: number;
  /** What `minUnits` counts, in a PM's words. */
  unitNoun: string;
  requirements: readonly Requirement[];
}

const WEBSITE_POSTING: readonly Requirement[] = [
  { blockType: 'documents', what: 'official records' },
  { blockType: 'meetings', what: 'meeting notices' },
];

/** Website-posting statute per community type. Apartments have none. */
const STATUTES: Readonly<Record<string, Statute>> = {
  condo_718: { citation: '§718.111(12)(g)', minUnits: 25, unitNoun: 'units', requirements: WEBSITE_POSTING },
  hoa_720: { citation: '§720.303', minUnits: 100, unitNoun: 'parcels', requirements: WEBSITE_POSTING },
};

/**
 * What the rules below are asked about: a community's type and its unit (condo)
 * or parcel (HOA) count — `communities.unit_count`, where `null` is UNKNOWN.
 */
export interface ComplianceSubject {
  communityType: string;
  unitCount: number | null;
}

/**
 * `required`    — the statute applies, or might (count unknown).
 * `recommended` — a condo or HOA below the statute's size threshold.
 * `none`        — no website statute for this community type (apartments).
 */
export type RequirementLevel = 'required' | 'recommended' | 'none';

export function requirementLevel({ communityType, unitCount }: ComplianceSubject): RequirementLevel {
  const statute = STATUTES[communityType];
  if (!statute) return 'none';
  if (unitCount === null) return 'required';
  return unitCount >= statute.minUnits ? 'required' : 'recommended';
}

/** True when the level hangs on a count nobody has given us yet. */
export function unitCountUnknown(subject: ComplianceSubject): boolean {
  return subject.unitCount === null && STATUTES[subject.communityType] !== undefined;
}

/** The size threshold, for copy: `{ minUnits: 25, unitNoun: 'units' }`; null when none. */
export function unitThreshold(communityType: string): { minUnits: number; unitNoun: string } | null {
  const statute = STATUTES[communityType];
  return statute ? { minUnits: statute.minUnits, unitNoun: statute.unitNoun } : null;
}

function sectionTypesFor(communityType: string): readonly RequiredSectionType[] {
  return (STATUTES[communityType]?.requirements ?? []).map((r) => r.blockType);
}

/** The section types this community's site must show, in display order. */
export function requiredSectionTypes(subject: ComplianceSubject): readonly RequiredSectionType[] {
  return requirementLevel(subject) === 'required' ? sectionTypesFor(subject.communityType) : [];
}

/** The same sections, for an association below the threshold: badge, never lock. */
export function recommendedSectionTypes(subject: ComplianceSubject): readonly RequiredSectionType[] {
  return requirementLevel(subject) === 'recommended' ? sectionTypesFor(subject.communityType) : [];
}

export function isRequiredSectionType(subject: ComplianceSubject, blockType: string): boolean {
  return (requiredSectionTypes(subject) as readonly string[]).includes(blockType);
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
  subject: ComplianceSubject,
  pages: readonly RequiredSectionPage[],
): RequiredSectionStatus[] {
  return requiredSectionTypes(subject).map((blockType) => {
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
  subject: ComplianceSubject,
  pages: readonly RequiredSectionPage[],
): Issue[] {
  return requiredSectionStatus(subject, pages).flatMap((status): Issue[] => {
    if (status.state === 'visible') return [];
    const law = requiredSectionLaw(subject.communityType, status.blockType)!;
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
  subject: ComplianceSubject,
  pages: readonly RequiredSectionPage[],
  removal: RequiredSectionRemoval,
): string | null {
  const { communityType } = subject;
  const after = withoutRemoval(pages, removal);
  const lost = requiredSectionTypes(subject).filter(
    (type) => countLiveSections(pages, type) > 0 && countLiveSections(after, type) === 0,
  );
  if (lost.length === 0) return null;

  const names = lost.map((type) => `${sectionTitle(type)} section`).join(' and ');
  const law = lost.map((type) => requiredSectionLaw(communityType, type)).join(' ');
  return removal.kind === 'page'
    ? `This page has your only ${names}. ${law} Add one to another page before removing this page.`
    : `This is your only ${names}. ${law} You can hide it or move it instead.`;
}

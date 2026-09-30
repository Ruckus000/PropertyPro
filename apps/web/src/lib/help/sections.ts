/**
 * Help sections — the three readerships the Help Center is written for.
 *
 * Every article lives in exactly one section
 * (`content/help/<section>/<category>/<slug>.mdx`). A task more than one role
 * performs is written once per section, in that role's words, under the SAME
 * slug — so `/help/<category>/<slug>` is one URL that shows each reader their
 * own version. A reader only ever sees their own section.
 *
 * The section is derived from the viewer's audience tokens
 * (`resolveHelpViewerTokens`): a manager reads the manager section even when
 * they also hold a board seat (their admin tools are a superset); a resident
 * with a board designation reads the board section; everyone else reads the
 * resident section.
 */
import { COMMUNITY_TYPES, hasBoardDesignation, type CommunityType } from '@propertypro/shared';

export const HELP_SECTIONS = ['resident', 'board', 'manager'] as const;
export type HelpSection = (typeof HELP_SECTIONS)[number];

export interface HelpSectionMeta {
  /** Plural reader label, e.g. "Board members". */
  label: string;
  /** Eyebrow on the help home hero. */
  who: string;
  /** One-line hero blurb. */
  blurb: string;
}

export const HELP_SECTION_META: Record<HelpSection, HelpSectionMeta> = {
  resident: {
    label: 'Residents',
    who: 'Owners and tenants',
    blurb: 'Read documents and notices, pay dues, and send requests to your association.',
  },
  board: {
    label: 'Board members',
    who: 'Directors and officers',
    blurb: 'Everything residents do, written for directors, plus exporting community records.',
  },
  manager: {
    label: 'Property managers',
    who: 'CAMs, site staff, and PM admins',
    blurb: 'Run the community: compliance, documents, residents, operations, and your portfolio.',
  },
};

export function isHelpSection(value: unknown): value is HelpSection {
  return typeof value === 'string' && (HELP_SECTIONS as readonly string[]).includes(value);
}

export function resolveHelpSection(tokens: readonly string[]): HelpSection {
  if (tokens.includes('manager')) return 'manager';
  if (tokens.some((token) => hasBoardDesignation(token))) return 'board';
  return 'resident';
}

export const HELP_COMMUNITY_TYPE_META: Record<
  CommunityType,
  { label: string; plural: string; short: string }
> = {
  condo_718: { label: 'Condominium', plural: 'condominiums', short: 'Condo' },
  hoa_720: { label: 'Homeowners association', plural: 'homeowners associations', short: 'HOA' },
  apartment: { label: 'Apartment community', plural: 'apartment communities', short: 'Apartment' },
};

/**
 * Community types a section may preview. Residents see only their own
 * community's help; board members and managers can preview another type.
 * Apartments have no board, so the board section has no apartment variant.
 */
export function previewableTypes(section: HelpSection): readonly CommunityType[] {
  if (section === 'resident') return [];
  if (section === 'board') return COMMUNITY_TYPES.filter((type) => type !== 'apartment');
  return COMMUNITY_TYPES;
}

/**
 * The community type whose help is shown: the reader's own, unless a board
 * member or manager asked to preview another (`?type=`). An unknown or
 * disallowed preview falls back to the reader's own type. A board member in an
 * apartment community (no board help exists there) reads condominium help.
 */
export function resolveHelpCommunityType(
  section: HelpSection,
  ownType: CommunityType,
  requested: string | null | undefined,
): CommunityType {
  const allowed = previewableTypes(section);
  if (requested && (allowed as readonly string[]).includes(requested)) {
    return requested as CommunityType;
  }
  if (section === 'board' && ownType === 'apartment') return 'condo_718';
  return ownType;
}

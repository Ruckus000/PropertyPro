/**
 * Help sections — the two readerships the Help Center is written for.
 *
 * Every article lives in exactly one section
 * (`content/help/<section>/<category>/<slug>.mdx`). A task both residents and
 * managers perform is written once per section, in that reader's words, under
 * the SAME slug — so `/help/<category>/<slug>` is one URL that shows each
 * reader their own version. A reader only ever sees their own section.
 *
 * Managers (property or root) read the manager section, even with a board
 * seat — their admin tools are a superset. Everyone else, board members
 * included, reads the resident section: a board seat changes almost nothing a
 * resident does, so what it adds is a handful of `boardOnly` resident articles
 * (lib/help/reader.ts `boardSeat`), not a parallel copy of the section.
 */
import { COMMUNITY_TYPES, type CommunityType } from '@propertypro/shared';

export const HELP_SECTIONS = ['resident', 'manager'] as const;
export type HelpSection = (typeof HELP_SECTIONS)[number];

export interface HelpSectionMeta {
  /** Plural reader label, e.g. "Residents". */
  label: string;
  /** Eyebrow on the help home hero. */
  who: string;
  /** One-line hero blurb. */
  blurb: string;
}

export const HELP_SECTION_META: Record<HelpSection, HelpSectionMeta> = {
  resident: {
    label: 'Residents',
    who: 'Owners, tenants and board members',
    blurb: 'Read documents and notices, pay dues, and send requests to your association.',
  },
  manager: {
    label: 'Property managers',
    who: 'CAMs, site staff, and PM admins',
    blurb: 'Run the community: compliance, documents, residents, operations, and your portfolio.',
  },
};

export function resolveHelpSection(tokens: readonly string[]): HelpSection {
  return tokens.includes('manager') ? 'manager' : 'resident';
}

export const HELP_COMMUNITY_TYPE_META: Record<
  CommunityType,
  { label: string; plural: string; short: string }
> = {
  condo_718: { label: 'Condominium', plural: 'condominiums', short: 'Condo' },
  hoa_720: { label: 'Homeowners association', plural: 'homeowners associations', short: 'HOA' },
  apartment: { label: 'Apartment community', plural: 'apartment communities', short: 'Apartment' },
};

/** Community types a section may preview: managers any, residents only their own. */
export function previewableTypes(section: HelpSection): readonly CommunityType[] {
  return section === 'manager' ? COMMUNITY_TYPES : [];
}

/**
 * The community type whose help is shown: the reader's own, unless a manager
 * asked to preview another (`?type=`). Anything else falls back to their own.
 */
export function resolveHelpCommunityType(
  section: HelpSection,
  ownType: CommunityType,
  requested: string | null | undefined,
): CommunityType {
  const allowed = previewableTypes(section);
  return requested && (allowed as readonly string[]).includes(requested) ? (requested as CommunityType) : ownType;
}

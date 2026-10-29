/**
 * The website's looks: Bayfront, Heritage, Palm Grove and Plain & Simple.
 *
 * A look is a whole site design (D1). It is three things, and its id, its layout
 * id and its colour set's slug are the same string (D2):
 *   - a layout, drawn by `components/public-site/layouts` (`LOOK_STYLES`);
 *   - a colour set, a `site_theme_presets` row seeded by migration 0097, which
 *     holds the look's colours and fonts;
 *   - the home page's default sections, defined here.
 *
 * This module also decides what switching looks does to the home page
 * (`planLookSwitch`, D5). It is one pure function, so the draft a switch writes
 * and the preview of a look cannot disagree.
 *
 * Pure, and it has to stay that way: nothing in its import graph may reach the
 * database. The look previews and the picker render from it, the picker in the
 * browser, and `@propertypro/db` throws at load without a DATABASE_URL. The
 * database half lives in `@/lib/services/site-look-service`.
 */
import type { z } from 'zod';
import {
  BLOCK_TYPES,
  blockSchemaRegistry,
  stableStringify,
  type BlockType,
  type CommunityType,
  type StockHeroPhoto,
} from '@propertypro/shared';
import type { LayoutId } from '@/components/public-site/blocks/types';

export const LOOK_IDS = ['bayfront', 'heritage', 'palm-grove', 'plain-simple'] as const;

export type LookId = (typeof LOOK_IDS)[number];

/** One of a look's default home-page sections. */
export interface LookSection {
  blockType: BlockType;
  content: unknown;
}

export interface LookDefinition {
  id: LookId;
  /** The look's name, as its `site_theme_presets` row has it. */
  name: string;
  /** One line about the look, as its catalog rows describe it. */
  description: string;
  layoutId: LayoutId;
  presetSlug: LookId;
  /** The home page's sections, in order. A new site gets exactly these. */
  sections: readonly LookSection[];
}

/** A section, its content checked against its schema's input when this compiles. */
function section<T extends BlockType>(
  blockType: T,
  content: z.input<(typeof blockSchemaRegistry)[T]>,
): LookSection {
  return { blockType, content };
}

/** Freezes every object and array inside `value`, so no caller can change a look for the next. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// The two stock photos are scenery, never a building an association could take
// for its own (D3). Heritage shares Bayfront's sunset.
const SUNSET: StockHeroPhoto = { stock: 'sunset', alt: 'Sunset over the water, with palm trees in silhouette' };
const PALMS: StockHeroPhoto = { stock: 'palms', alt: 'A quiet street lined with tall palm trees' };

/** Every look lists the same records: all five categories a Documents section can show. */
const RECORDS: z.input<(typeof blockSchemaRegistry)['documents']> = {
  limit: 5,
  includeCategories: ['budget', 'minutes', 'financial', 'rules', 'other'],
};

/**
 * The four looks. Frozen, since every request shares them: copy a section's
 * content before changing it.
 *
 * The welcome copy uses linked fields (D4), resolved when the page renders. A
 * sentence whose fact is missing is dropped, so each subtitle keeps a sentence
 * with no `{{city}}` or `{{units}}` in it: with neither known, a full sentence
 * still shows.
 */
export const LOOKS: readonly LookDefinition[] = deepFreeze<LookDefinition[]>([
  {
    id: 'bayfront',
    name: 'Bayfront',
    description: 'Photo-led and modern.',
    layoutId: 'bayfront',
    presetSlug: 'bayfront',
    sections: [
      section('hero', {
        headline: 'Welcome to {{name}}',
        subtitle:
          '{{units}} homes in {{city}}. Meeting notices, news and community records, all in one place.',
        photos: [SUNSET],
      }),
      section('quicklinks', {}),
      section('announcements', { limit: 3 }),
      section('meetings', { limit: 5 }),
      section('documents', RECORDS),
      section('contact', { showBoard: true, showManagement: true }),
    ],
  },
  {
    id: 'heritage',
    name: 'Heritage',
    description: 'Formal and official.',
    layoutId: 'heritage',
    presetSlug: 'heritage',
    sections: [
      section('hero', {
        headline: '{{name}}',
        subtitle: 'The website of {{name}}. Notices, meetings and records for owners and residents.',
        photos: [SUNSET],
      }),
      section('announcements', { limit: 5 }),
      section('meetings', { limit: 5 }),
      section('documents', RECORDS),
      section('board', {}),
      // Board members already lists the board, so Contact leaves it out (D16).
      section('contact', { showBoard: false, showManagement: true }),
    ],
  },
  {
    id: 'palm-grove',
    name: 'Palm Grove',
    description: 'Warm and friendly.',
    layoutId: 'palm-grove',
    presetSlug: 'palm-grove',
    sections: [
      section('hero', {
        headline: 'Welcome home to {{name}}',
        subtitle:
          'News, meetings and everyday information for our neighbors. {{units}} homes in {{city}}.',
        photos: [PALMS],
      }),
      section('announcements', { limit: 3 }),
      section('meetings', { limit: 5 }),
      section('documents', RECORDS),
      section('contact', { showBoard: true, showManagement: true }),
    ],
  },
  {
    id: 'plain-simple',
    name: 'Plain & Simple',
    description: 'No photos needed, larger text.',
    layoutId: 'plain-simple',
    presetSlug: 'plain-simple',
    sections: [
      section('hero', {
        headline: 'Welcome to {{name}}',
        subtitle: 'Meeting notices, news and community records, in one place.',
      }),
      section('quicklinks', {}),
      section('meetings', { limit: 5 }),
      section('announcements', { limit: 3 }),
      section('documents', RECORDS),
      section('contact', { showBoard: true, showManagement: true }),
    ],
  },
]);

export function getLook(id: string): LookDefinition | null {
  return LOOKS.find((look) => look.id === id) ?? null;
}

const SUGGESTED_LOOK: Readonly<Record<CommunityType, LookId>> = {
  condo_718: 'bayfront',
  hoa_720: 'palm-grove',
  apartment: 'plain-simple',
};

/** The look a new community of this type starts with. */
export function suggestedLookFor(type: CommunityType): LookId {
  return SUGGESTED_LOOK[type];
}

/**
 * The look a site's layout draws, or null for a legacy layout (tidewater,
 * boulevard, sable) or none.
 *
 * Keyed on the layout alone. A site can carry a look's colour set on a legacy
 * layout (migration 0097's colour sets were pickable before the looks shipped),
 * and that site is still on a legacy look.
 */
export function lookIdForLayout(layoutId: string | null | undefined): LookId | null {
  return LOOK_IDS.find((id) => id === layoutId) ?? null;
}

// ---------------------------------------------------------------------------
// Switching looks (D5)
// ---------------------------------------------------------------------------

/** One section of the home page, as the planner reads and returns it. */
export interface SiteSection {
  /** The row it came from. A section the plan keeps as it is keeps its id; one a look supplied has none. */
  id?: number;
  blockType: BlockType;
  content: unknown;
}

export interface PlanLookSwitchInput {
  /** The home page now, in order: what the editor shows, drafts over published. */
  current: readonly SiteSection[];
  /**
   * Every set of defaults the site could have received: the outgoing look's
   * sections or, for a site on a legacy layout, each version of its community
   * type's starter pack.
   */
  outgoingDefaults: readonly (readonly LookSection[])[];
  incoming: LookDefinition;
}

export interface LookSwitchCounts {
  /** Untouched sections replaced, in their slot, by the incoming look's section of the same type. */
  replaced: number;
  /** Edited or hidden sections kept as they are, in their slot. */
  kept: number;
  /** The incoming look's sections of a type the page did not have. */
  added: number;
  /** Untouched sections dropped: the incoming look has no section of their type left for them. */
  removed: number;
}

export interface LookSwitchPlan extends LookSwitchCounts {
  sections: SiteSection[];
}

/**
 * The home page after switching to `incoming` (D5).
 *
 * A section is UNTOUCHED when its content, parsed by its block schema, equals a
 * default the site could have received (`outgoingDefaults`), parsed the same
 * way. Parsing both sides is what makes a section stored with the schema's
 * defaults filled in, or with its keys in jsonb's order, still count. Anything
 * else is the manager's: edited content, a hidden section (no default is
 * hidden), and content that does not parse.
 *
 * - Every section untouched: the page becomes exactly the incoming look's
 *   sections, in its order.
 * - Otherwise each untouched section is replaced in its slot by the incoming
 *   look's section of its type, or dropped when there is none. Each of those is
 *   used once, so the incoming look's section never shows twice. Kept sections
 *   stay as they are, in their slots. The incoming look's types the page still
 *   lacks go in after the nearest section before them in the incoming look's
 *   order, or first.
 *
 * Content the look supplies is a copy; kept sections are handed back as given.
 */
export function planLookSwitch(input: PlanLookSwitchInput): SiteSection[] {
  return planLookSwitchWithCounts(input).sections;
}

/** `planLookSwitch`, with what it did to each section counted. */
export function planLookSwitchWithCounts({
  current,
  outgoingDefaults,
  incoming,
}: PlanLookSwitchInput): LookSwitchPlan {
  const defaults = defaultsByType(outgoingDefaults);
  const untouched = current.map((s) => isUntouched(s, defaults));

  if (untouched.every(Boolean)) {
    // Count by pairing each incoming section with an untouched one of its type.
    const unpaired = countByType(current);
    let replaced = 0;
    for (const { blockType } of incoming.sections) {
      const left = unpaired.get(blockType) ?? 0;
      if (left > 0) {
        unpaired.set(blockType, left - 1);
        replaced += 1;
      }
    }
    return {
      sections: incoming.sections.map(fromLook),
      replaced,
      kept: 0,
      added: incoming.sections.length - replaced,
      removed: current.length - replaced,
    };
  }

  const unused = new Map<string, LookSection[]>();
  for (const lookSection of incoming.sections) {
    unused.set(lookSection.blockType, [...(unused.get(lookSection.blockType) ?? []), lookSection]);
  }

  const sections: SiteSection[] = [];
  let replaced = 0;
  let kept = 0;
  let removed = 0;
  current.forEach((siteSection, i) => {
    if (!untouched[i]) {
      sections.push(keep(siteSection));
      kept += 1;
      return;
    }
    const replacement = unused.get(siteSection.blockType)?.shift();
    if (replacement) {
      sections.push(fromLook(replacement));
      replaced += 1;
    } else {
      removed += 1;
    }
  });

  let added = 0;
  incoming.sections.forEach((lookSection, i) => {
    if (sections.some((s) => s.blockType === lookSection.blockType)) return;
    sections.splice(insertionIndex(sections, incoming.sections.slice(0, i)), 0, fromLook(lookSection));
    added += 1;
  });

  return { sections, replaced, kept, added, removed };
}

function isBlockType(value: string): value is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(value);
}

/** The content as its block schema parses it, as canonical JSON; null when it does not parse. */
function parsedIdentity(blockType: string, content: unknown): string | null {
  if (!isBlockType(blockType)) return null;
  const parsed = blockSchemaRegistry[blockType].safeParse(content);
  return parsed.success ? stableStringify(parsed.data) : null;
}

function defaultsByType(sets: readonly (readonly LookSection[])[]): Map<string, Set<string>> {
  const byType = new Map<string, Set<string>>();
  for (const set of sets) {
    for (const lookSection of set) {
      const identity = parsedIdentity(lookSection.blockType, lookSection.content);
      if (identity === null) continue;
      const identities = byType.get(lookSection.blockType) ?? new Set<string>();
      identities.add(identity);
      byType.set(lookSection.blockType, identities);
    }
  }
  return byType;
}

function isUntouched(siteSection: SiteSection, defaults: ReadonlyMap<string, ReadonlySet<string>>): boolean {
  const identity = parsedIdentity(siteSection.blockType, siteSection.content);
  return identity !== null && (defaults.get(siteSection.blockType)?.has(identity) ?? false);
}

function countByType(sections: readonly SiteSection[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { blockType } of sections) counts.set(blockType, (counts.get(blockType) ?? 0) + 1);
  return counts;
}

/** A section kept as it is: its id, type and content, and nothing else the caller attached. */
function keep({ id, blockType, content }: SiteSection): SiteSection {
  return id === undefined ? { blockType, content } : { id, blockType, content };
}

/** A look's section for the page, as a copy the caller may change (look content is plain JSON). */
function fromLook({ blockType, content }: LookSection): SiteSection {
  return { blockType, content: JSON.parse(JSON.stringify(content)) as unknown };
}

/**
 * Where an added section goes: right after the last section on the page of the
 * nearest type that comes before it in the incoming look's order, else first.
 */
function insertionIndex(sections: readonly SiteSection[], before: readonly LookSection[]): number {
  for (let i = before.length - 1; i >= 0; i -= 1) {
    const type = before[i]?.blockType;
    for (let at = sections.length - 1; at >= 0; at -= 1) {
      if (sections[at]?.blockType === type) return at + 1;
    }
  }
  return 0;
}

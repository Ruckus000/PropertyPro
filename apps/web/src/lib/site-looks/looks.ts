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
  /**
   * The look the page has already been switched to as a draft (the drafted
   * layout's look), or null. Switching to it again changes nothing on the page.
   * Required, like `live`, so no caller can leave a rule out by accident.
   */
  draftedLookId: LookId | null;
  /** The live look, which a switch can return to; null when the live layout is a legacy one. */
  live: LiveHomePage | null;
  incoming: LookDefinition;
}

/** The live look and what the live home page shows. */
export interface LiveHomePage {
  lookId: LookId;
  /** The published home-page sections, in their live order. */
  sections: readonly SiteSection[];
  /** Whether a different layout is drafted over the live one: another look, or a layout that is not a look. */
  otherLayoutDrafted: boolean;
}

/**
 * What a switch is:
 * - `switch`: to a look the page is not on;
 * - `already-drafted`: to the look already drafted; the page stays as it is;
 * - `live-look`: to the live look, with no other layout drafted; nothing changes;
 * - `back-to-live`: to the live look from another drafted layout; the page
 *   returns to what is live.
 */
export type LookSwitchKind = 'switch' | 'already-drafted' | 'live-look' | 'back-to-live';

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
  kind: LookSwitchKind;
}

/**
 * The home page after switching to `incoming` (D5).
 *
 * A section is UNTOUCHED when its content, parsed by its block schema, equals a
 * default the site could have received (`outgoingDefaults`), parsed the same
 * way. Parsing both sides is what makes a section stored with the schema's
 * defaults filled in, or with its keys in jsonb's order, still count. Anything
 * else is the manager's: edited content, content that does not parse, and every
 * hidden section, even one whose default hides it too (an admin's starter-pack
 * version can).
 *
 * - `incoming` already drafted (`draftedLookId`): the page exactly as it is.
 *   Its sections were planned when that look was drafted, and planning again
 *   from that look's own defaults would take an edit that happens to equal one
 *   of them for untouched, and could move it. "Publish this look" repeats the
 *   card's draft (D9), so this keeps the second run from changing the first.
 * - `incoming` is the live look and no other layout is drafted: the page
 *   exactly as it is. Nothing is being switched.
 * - `incoming` is the live look and another layout is drafted: the switch back
 *   is planned as below, with the live home page's sections, in their live
 *   order, in place of the look's own. Untouched sections return to what is
 *   live, edits made under the other look stay, and a section removed from the
 *   live site does not come back.
 * - Every section untouched: the page becomes exactly the incoming sections,
 *   in their order.
 * - Otherwise each untouched section is replaced in its slot by the incoming
 *   section of its type, or dropped when there is none. Each incoming section
 *   is used once, so none shows twice. Kept sections stay as they are, in their
 *   slots. The incoming types the page still lacks go in after the nearest
 *   section before them in the incoming order, or first.
 *
 * Content the switch supplies is a copy; kept sections are handed back as given.
 */
export function planLookSwitch(input: PlanLookSwitchInput): SiteSection[] {
  return planLookSwitchWithCounts(input).sections;
}

/** `planLookSwitch`, with what it did to each section counted, and which kind of switch it was. */
export function planLookSwitchWithCounts({
  current,
  outgoingDefaults,
  draftedLookId,
  live,
  incoming,
}: PlanLookSwitchInput): LookSwitchPlan {
  if (draftedLookId === incoming.id) return asItIs(current, 'already-drafted');
  if (live !== null && live.lookId === incoming.id) {
    if (!live.otherLayoutDrafted) return asItIs(current, 'live-look');
    return { ...planAgainst(current, outgoingDefaults, live.sections), kind: 'back-to-live' };
  }
  return { ...planAgainst(current, outgoingDefaults, incoming.sections), kind: 'switch' };
}

/** The page as it is: nothing replaced, added or removed. */
function asItIs(current: readonly SiteSection[], kind: LookSwitchKind): LookSwitchPlan {
  return { sections: current.map(keep), replaced: 0, kept: current.length, added: 0, removed: 0, kind };
}

/** D5's switch of `current` to the `incoming` sections, untouched judged against `outgoingDefaults`. */
function planAgainst(
  current: readonly SiteSection[],
  outgoingDefaults: readonly (readonly LookSection[])[],
  incoming: readonly LookSection[],
): Omit<LookSwitchPlan, 'kind'> {
  const defaults = defaultsByType(outgoingDefaults);
  const untouched = current.map((s) => isUntouched(s, defaults));

  if (untouched.every(Boolean)) {
    // Count by pairing each incoming section with an untouched one of its type.
    const unpaired = countByType(current);
    let replaced = 0;
    for (const { blockType } of incoming) {
      const left = unpaired.get(blockType) ?? 0;
      if (left > 0) {
        unpaired.set(blockType, left - 1);
        replaced += 1;
      }
    }
    return {
      sections: incoming.map(fromLook),
      replaced,
      kept: 0,
      added: incoming.length - replaced,
      removed: current.length - replaced,
    };
  }

  const unused = new Map<string, LookSection[]>();
  for (const lookSection of incoming) {
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
  incoming.forEach((lookSection, i) => {
    if (sections.some((s) => s.blockType === lookSection.blockType)) return;
    sections.splice(insertionIndex(sections, incoming.slice(0, i)), 0, fromLook(lookSection));
    added += 1;
  });

  return { sections, replaced, kept, added, removed };
}

function isBlockType(value: string): value is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(value);
}

/** The content as its block schema parses it; null when the type is unknown or it does not parse. */
function parsedContent(blockType: string, content: unknown): { data: unknown } | null {
  if (!isBlockType(blockType)) return null;
  const parsed = blockSchemaRegistry[blockType].safeParse(content);
  return parsed.success ? { data: parsed.data } : null;
}

function defaultsByType(sets: readonly (readonly LookSection[])[]): Map<string, Set<string>> {
  const byType = new Map<string, Set<string>>();
  for (const set of sets) {
    for (const lookSection of set) {
      const parsed = parsedContent(lookSection.blockType, lookSection.content);
      if (parsed === null) continue;
      const identities = byType.get(lookSection.blockType) ?? new Set<string>();
      identities.add(stableStringify(parsed.data));
      byType.set(lookSection.blockType, identities);
    }
  }
  return byType;
}

function isUntouched(siteSection: SiteSection, defaults: ReadonlyMap<string, ReadonlySet<string>>): boolean {
  const parsed = parsedContent(siteSection.blockType, siteSection.content);
  // Hiding a section is the manager's choice, even where a default hides it too.
  if (parsed === null || isHidden(parsed.data)) return false;
  return defaults.get(siteSection.blockType)?.has(stableStringify(parsed.data)) ?? false;
}

function isHidden(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { hidden?: unknown }).hidden === true;
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

/** An incoming section for the page, as a copy the caller may change (section content is plain JSON). */
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

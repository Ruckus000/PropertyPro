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
  fingerprint,
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
// Slots
// ---------------------------------------------------------------------------

/** The hero is in slot 1; every other section takes 2, 3, … The publish check refuses a slot past 99. */
const HERO_SLOT = 1;
const FIRST_CONTENT_SLOT = 2;
const LAST_SLOT = 99;

/**
 * Each section with the slot it is staged in (`site_blocks.block_order`): how a
 * switch's draft is written and a new site's look published. The first hero
 * takes slot 1. The other sections take the page's published content slots in
 * order, so a section that is the same as the live one in that place needs no
 * draft, even where a removed section left a gap in the numbering; any left over
 * go after the last of them. When that would pass slot 99 they are numbered 2,
 * 3, … instead.
 */
export function assignSlots<T extends { blockType: string }>(
  sections: readonly T[],
  publishedSlots: Iterable<number>,
): Array<[number, T]> {
  const heroAt = sections.findIndex((s) => s.blockType === 'hero');
  const contentCount = sections.length - (heroAt === -1 ? 0 : 1);
  const live = [...publishedSlots].filter((slot) => slot >= FIRST_CONTENT_SLOT).sort((a, b) => a - b);
  const last = live[live.length - 1] ?? HERO_SLOT;
  const extra = Math.max(0, contentCount - live.length);
  const slots =
    last + extra <= LAST_SLOT
      ? [...live.slice(0, contentCount), ...Array.from({ length: extra }, (_, i) => last + 1 + i)]
      : Array.from({ length: contentCount }, (_, i) => FIRST_CONTENT_SLOT + i);
  let next = 0;
  return sections.map((s, i): [number, T] => (i === heroAt ? [HERO_SLOT, s] : [slots[next++]!, s]));
}

// ---------------------------------------------------------------------------
// Switching looks (D5)
// ---------------------------------------------------------------------------

/** One section of the home page, as the planner reads and returns it. */
export interface SiteSection {
  /** The row it came from. A section the plan keeps as it is keeps its id; one a look supplied has none. */
  id?: number;
  /**
   * Where a section read from the page sits on it (`site_blocks.block_order`).
   * A draft has the slot of the published row it covers. Only returning to the
   * live look reads it (`planBackToLive` says what it assumes when there is
   * none). The planner hands back no slots.
   */
  slot?: number;
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

/**
 * A published row of the live home page. Its id and its slot are what the
 * page's sections are matched to it by, so `loadLookSwitchInput` gives both.
 */
export interface LiveSection extends SiteSection {
  id: number;
}

/** The live look and what the live home page shows. */
export interface LiveHomePage {
  lookId: LookId;
  /** The published home-page rows, in their live (slot) order. */
  sections: readonly LiveSection[];
  /** Whether a different layout is drafted over the live one: another look, or a layout that is not a look. */
  otherLayoutDrafted: boolean;
}

/**
 * What a switch is:
 * - `switch`: to a look the page is not on;
 * - `already-drafted`: to the look already drafted; nothing changes;
 * - `live-look`: to the live look, with no other layout drafted; nothing changes;
 * - `back-to-live`: to the live look from another drafted layout; the page
 *   returns to the live page, row for row, keeping the manager's edits.
 */
export type LookSwitchKind = 'switch' | 'already-drafted' | 'live-look' | 'back-to-live';

/** What a switch did to each section. Returning to the live look counts against the live rows (`planBackToLive`). */
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
 * - `incoming` is the live look and another layout is drafted: the live home
 *   page, row for row, in its live order, matched to the page now by row id,
 *   slot and content, and by block type only where that cannot be a guess
 *   (`planBackToLive`). A live row the manager edited since keeps the edit in
 *   its place; a section with no live row that they added or edited goes after
 *   the nearest live row before it; the drafted look's untouched defaults go.
 *   So a section removed from the live page before the switch stays removed.
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
    return { ...planBackToLive(current, outgoingDefaults, live.sections), kind: 'back-to-live' };
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

/**
 * Back to the live look from another drafted layout: the live home page, row
 * for row and in its live order, except that
 *   1. a live row the manager edited while the other layout was drafted keeps
 *      the edit, in that row's place;
 *   2. a section with no live row that the manager added or edited keeps its
 *      content, right after the nearest live row before it on the page now
 *      (first, when no live row is before it).
 * The drafted look's untouched defaults with no live row are dropped. Every
 * other live row comes back as it is, wherever the switch had replaced, moved
 * or removed it, and so does one removed since.
 *
 * The page now is matched to the live rows by row, and by block type only where
 * that cannot put an edit over a row the manager did not edit:
 * - a published row on the page is the live row with its id (no draft covers
 *   its slot);
 * - a section with the exact content of the live row in its own slot is that
 *   row;
 * - an edited section with a live row's exact content is that row: the switch
 *   moved it, and staging wrote it as a new row in another slot, so its content
 *   is what is left to know it by. An untouched default never is, outside its
 *   own slot, since the drafted look's default can equal a live row it does
 *   not stand for;
 * - an edited draft over a live row of its own type is an edit of that row,
 *   when the live page has no other row of the type and the page now no other
 *   section of it. With two rows of a type, the switch can stage one row's copy
 *   in the other's slot;
 * - an edited section that is the only one of its type left is an edit of the
 *   one live row of its type left, as the editor's change list pairs them,
 *   when the matches above are surely right for the type: it has one live row,
 *   or its live rows all differ and none has the drafted look's default. The switch
 *   stages sections in other rows' slots whenever it drops one (every section
 *   after Quick links moves up when the new look has none), and this takes an
 *   edit back to its own row.
 * An edit matched to no row is a section the live page lacks: every live row
 * comes back, so the worst case is a section shown twice, never a live row
 * dropped.
 * A section given no slot is taken to be where `assignSlots` stages it over the
 * live rows (a plan handed back as it was returned), and a live row given none
 * where a look publishes it. `loadLookSwitchInput` gives every slot.
 *
 * Counted the way a switch is: `kept` are the sections of the page now that stay
 * (live rows, edits and added sections), `replaced` the dropped defaults a live
 * row comes back in place of (the row with their content, else the one in their
 * slot), `removed` the other dropped defaults, and `added` the live rows that
 * come back with nothing on the page standing in for them.
 */
function planBackToLive(
  current: readonly SiteSection[],
  outgoingDefaults: readonly (readonly LookSection[])[],
  live: readonly LiveSection[],
): Omit<LookSwitchPlan, 'kind'> {
  const defaults = defaultsByType(outgoingDefaults);
  const untouched = current.map((s) => isUntouched(s, defaults));
  const identity = current.map(contentIdentity);
  const liveIdentity = live.map(contentIdentity);
  const liveById = new Map(live.map((row, j) => [row.id, j]));
  // Without a slot, a live row is where a look publishes it, and a section of
  // the page now (a plan handed back as it was returned) is where staging puts
  // it over those rows. `loadLookSwitchInput` gives every slot.
  const publishedIn = assignSlots(live, []);
  const liveSlots = live.map((row, j) => row.slot ?? publishedIn[j]![0]);
  const stagedIn = assignSlots(current, liveSlots);
  const slots = current.map((s, i) => s.slot ?? stagedIn[i]![0]);
  const liveBySlot = new Map(liveSlots.map((slot, j) => [slot, j]));
  /** The live row in the slot of the page's section `i`, or -1. */
  const inSlot = (i: number): number => liveBySlot.get(slots[i]!) ?? -1;

  /** For each section of the page now, the live row it stands for, or -1. */
  const standsFor = current.map(() => -1);
  /** For each live row, the section of the page now that stands for it, or -1. */
  const standIn = live.map(() => -1);
  const pair = (i: number, j: number): void => {
    if (j === -1 || standsFor[i] !== -1 || standIn[j] !== -1) return;
    standsFor[i] = j;
    standIn[j] = i;
  };

  // How many live rows each type has. A section is matched to a row by type
  // only where that cannot put it over another row of the same type.
  const liveRowsOf = new Map<string, number>();
  for (const { blockType } of live) liveRowsOf.set(blockType, (liveRowsOf.get(blockType) ?? 0) + 1);
  /** Whether section `i` is the only section of its type that the matches so far left over. */
  const lastOfItsType = (i: number): boolean =>
    current.every((s, k) => k === i || standsFor[k] !== -1 || s.blockType !== current[i]!.blockType);
  /**
   * Whether the matches so far are surely right for a type's live rows: it has
   * one, or they all differ and none has the drafted look's own default. Else a
   * row can have been matched by content to a section that only looks like it
   * (another row's copy, or a default the switch put in its slot).
   */
  const surelyMatched = (type: string): boolean => {
    const rows = live.filter((row) => row.blockType === type);
    return (
      rows.length === 1 ||
      (new Set(rows.map(contentIdentity)).size === rows.length && !rows.some((row) => isUntouched(row, defaults)))
    );
  };

  // A published row is the live row with its id.
  current.forEach(({ id }, i) => pair(i, id === undefined ? -1 : (liveById.get(id) ?? -1)));
  // A section with the exact content of the live row in its own slot is that row.
  current.forEach((_, i) => {
    const j = inSlot(i);
    if (j !== -1 && identity[i] === liveIdentity[j]) pair(i, j);
  });
  // An edited section with a live row's exact content is that row, moved: the
  // first one left, in live order. An untouched default is not: the drafted
  // look's default can equal a live row it does not stand for.
  current.forEach((_, i) => {
    if (standsFor[i] !== -1 || untouched[i]) return;
    pair(i, liveIdentity.findIndex((id, j) => standIn[j] === -1 && id === identity[i]));
  });
  // A draft the manager made over the live row of its own type: an edit of that
  // row, when the live page has no other row of the type (the switch can stage
  // one same-type section in another's slot) and the page now no other section
  // of the type left.
  current.forEach((s, i) => {
    const j = inSlot(i);
    if (untouched[i] || j === -1 || live[j]?.blockType !== s.blockType) return;
    if (liveRowsOf.get(s.blockType) === 1 && lastOfItsType(i)) pair(i, j);
  });
  // An edited section that is the only one of its type left is an edit of the
  // one live row of its type left, as the editor's change list pairs them,
  // when that cannot be a guess (`surelyMatched`). Otherwise it is a section the
  // live page lacks: every live row stays, and the edit goes after the nearest.
  for (const type of new Set(current.map((s) => s.blockType))) {
    const left = current.flatMap((s, i) => (s.blockType === type && standsFor[i] === -1 ? [i] : []));
    const rows = live.flatMap((row, j) => (row.blockType === type && standIn[j] === -1 ? [j] : []));
    if (left.length === 1 && rows.length === 1 && !untouched[left[0]!] && surelyMatched(type)) {
      pair(left[0]!, rows[0]!);
    }
  }

  // Where each live row is on the page now, to place the added sections by: the
  // section standing for it; else an untouched default with its exact content
  // (the switch's stand-in for it) or, failing that, one in its slot. Placing is
  // not matching: it never changes what a row shows, only where an added
  // section goes.
  const placeOf = [...standsFor];
  const placed = new Set(standIn.flatMap((i, j) => (i === -1 ? [] : [j])));
  const place = (i: number, j: number): void => {
    if (j === -1 || placed.has(j)) return;
    placeOf[i] = j;
    placed.add(j);
  };
  current.forEach((_, i) => {
    if (placeOf[i] === -1 && untouched[i]) place(i, liveIdentity.findIndex((id, j) => !placed.has(j) && id === identity[i]));
  });
  current.forEach((_, i) => {
    if (placeOf[i] === -1 && untouched[i]) place(i, inSlot(i));
  });

  /** The added sections to go after each live row (-1: before every live row), in page order. */
  const addedAfter = new Map<number, SiteSection[]>();
  let lastLiveRow = -1;
  let kept = 0;
  let replaced = 0;
  let removed = 0;
  current.forEach((s, i) => {
    if (placeOf[i] !== -1) lastLiveRow = placeOf[i]!;
    if (standsFor[i] !== -1) {
      kept += 1;
    } else if (!untouched[i]) {
      addedAfter.set(lastLiveRow, [...(addedAfter.get(lastLiveRow) ?? []), keep(s)]);
      kept += 1;
    } else if (placeOf[i] !== -1) {
      replaced += 1;
    } else {
      removed += 1;
    }
  });

  const sections: SiteSection[] = [...(addedAfter.get(-1) ?? [])];
  let added = 0;
  live.forEach((row, j) => {
    const i = standIn[j]!;
    // A section standing for the row with other content is the manager's edit.
    sections.push(i !== -1 && identity[i] !== liveIdentity[j] ? keep(current[i]!) : keep(row));
    if (i === -1 && !placed.has(j)) added += 1;
    sections.push(...(addedAfter.get(j) ?? []));
  });

  return { sections, replaced, kept, added, removed };
}

/** A section's type and canonical content, as the editor's change list compares sections. */
function contentIdentity({ blockType, content }: SiteSection): string {
  // `fingerprint` reads no slot; its snapshot type only asks for one.
  return fingerprint({ slot: 0, blockType, content });
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

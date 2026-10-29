/**
 * The looks registry and the look-switch planner (website builder, Phase 2B).
 *
 * `planLookSwitch` decides what a look switch does to the home page for both the
 * draft it writes and the preview it shows (D5), so its rules are pinned here
 * case by case: an untouched site becomes exactly the new look; edited and
 * hidden sections keep their content and slot; the new look's own sections fill
 * in around them.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// looks.ts must stay free of the database: the look previews and the client-side
// picker render from it, and `@propertypro/db` throws at load without a
// DATABASE_URL. If anything in its import graph reached the database, one of
// these factories would run and the import below would fail with its message.
// They cover the two entry points that need a database at load; the static walk
// below ("looks.ts and the database") covers every entry point.
vi.mock('@propertypro/db', () => {
  throw new Error('looks.ts must not import @propertypro/db');
});
vi.mock('@propertypro/db/unsafe', () => {
  throw new Error('looks.ts must not import @propertypro/db/unsafe');
});

import { blockSchemaRegistry, diffSite, fingerprint, resolveLinkedText, type LinkedFacts } from '@propertypro/shared';
import { LAYOUT_IDS } from '@/components/public-site/blocks/types';
import { LOOK_STYLES } from '@/components/public-site/layouts/look-styles';
import {
  LOOKS,
  LOOK_IDS,
  assignSlots,
  getLook,
  lookIdForLayout,
  planLookSwitch,
  planLookSwitchWithCounts,
  planReturnToLive,
  suggestedLookFor,
  type LiveSection,
  type LookDefinition,
  type LookSection,
  type SiteSection,
} from '@/lib/site-looks/looks';
import { SITE_LOOK_PRESETS } from '../../fixtures/site-look-presets';

function look(id: string): LookDefinition {
  const found = getLook(id);
  if (!found) throw new Error(`No look "${id}"`);
  return found;
}

/** A home page exactly as a look would have published it, with row ids. */
function siteFrom(sections: readonly LookSection[], firstId = 100): SiteSection[] {
  return sections.map((section, i) => ({
    id: firstId + i,
    blockType: section.blockType,
    content: structuredClone(section.content),
  }));
}

/** A look's sections as the planner hands them back: no row id. */
function asPlanned(sections: readonly LookSection[]): SiteSection[] {
  return sections.map(({ blockType, content }) => ({ blockType, content }));
}

function sectionOf(sections: readonly LookSection[], blockType: string): LookSection {
  const found = sections.find((s) => s.blockType === blockType);
  if (!found) throw new Error(`No ${blockType} section`);
  return found;
}

function types(sections: readonly { blockType: string }[]): string[] {
  return sections.map((s) => s.blockType);
}

const EDITED_HERO = {
  headline: 'Harbor Pointe',
  subtitle: 'Notices and records for Harbor Pointe owners.',
};

function text(body: string): LookSection {
  return { blockType: 'text', content: { body } };
}

/** A live home page's published rows, as the loader reads them: ids from 1, slots 1, 2, 3 … unless given. */
function livePage(sections: readonly LookSection[], slots?: readonly number[]): LiveSection[] {
  return sections.map((section, i) => ({
    id: i + 1,
    slot: slots?.[i] ?? i + 1,
    blockType: section.blockType,
    content: structuredClone(section.content),
  }));
}

/** Live rows as the planner hands them back: no slot. */
function rowsOf(live: readonly LiveSection[]): SiteSection[] {
  return live.map(({ id, blockType, content }) => ({ id, blockType, content }));
}

let nextDraftId = 900;

/**
 * A plan staged over the live rows, and the page then read back as
 * `loadLookSwitchInput` reads it. site-look-service's `writeHomeDrafts` stages
 * with `assignSlots`; a section the same as the live row in its slot needs no
 * draft, so the page still shows that row, and every other section is a new
 * draft row. A live slot left empty gets a tombstone, so it drops off the page.
 * The service and integration tests run the real staging.
 */
function staged(live: readonly LiveSection[], planned: readonly SiteSection[]) {
  const bySlot = new Map(live.map((row) => [row.slot!, row]));
  const target = assignSlots(planned, bySlot.keys()).sort(([a], [b]) => a - b);
  const page: SiteSection[] = [];
  const drafts: SiteSection[] = [];
  for (const [slot, section] of target) {
    const row = bySlot.get(slot);
    if (row && sameContent(row, section)) {
      page.push(row);
    } else {
      const draft = { id: nextDraftId++, slot, blockType: section.blockType, content: section.content };
      page.push(draft);
      drafts.push(draft);
    }
  }
  const tombstones = [...bySlot.keys()].filter((slot) => !target.some(([taken]) => taken === slot));
  return { page, drafts, tombstones };
}

/** Compared as staging compares a section with the live row in its slot. */
function sameContent(a: SiteSection, b: SiteSection): boolean {
  const identity = ({ blockType, content }: SiteSection) => fingerprint({ slot: 0, blockType, content });
  return identity(a) === identity(b);
}

/** The page with the manager's edit to its one `blockType` section: a new draft row in that section's slot. */
function edited(page: readonly SiteSection[], blockType: string, content: unknown): SiteSection[] {
  return page.map((s) => (s.blockType === blockType ? { id: nextDraftId++, slot: s.slot, blockType: s.blockType, content } : s));
}

/** The page with the manager's edit to the section in `slot`: a new draft row there. */
function editedAt(page: readonly SiteSection[], slot: number, content: unknown): SiteSection[] {
  return page.map((s) => (s.slot === slot ? { id: nextDraftId++, slot, blockType: s.blockType, content } : s));
}

/** Every live row comes back unchanged and in its live order, and the edit is there once, as a section of its own. */
function expectNoLiveRowDropped(
  live: readonly LiveSection[],
  sections: readonly SiteSection[],
  edit: { blockType: LookSection['blockType']; content: unknown },
): void {
  const isEdit = (s: SiteSection) => sameContent(s, edit);
  expect(sections.filter(isEdit)).toHaveLength(1);
  expect(sections.filter((s) => !isEdit(s))).toEqual(rowsOf(live));
}

/**
 * The editor's change list for `planned` staged over the live rows, as kinds:
 * what the manager would review before publishing (`diffSite`).
 */
function changesStaged(live: readonly LiveSection[], planned: readonly SiteSection[]): string[] {
  const snapshot = (rows: Array<{ slot: number; blockType: string; content: unknown }>) => ({
    hero: rows.find((row) => row.slot === 1) ?? null,
    sections: rows.filter((row) => row.slot !== 1),
  });
  const published = live.map(({ slot, blockType, content }) => ({ slot: slot!, blockType, content }));
  const next = assignSlots(planned, published.map((row) => row.slot)).map(([slot, { blockType, content }]) => ({
    slot,
    blockType,
    content,
  }));
  return diffSite(snapshot(published), snapshot(next)).changes.map((change) => change.kind);
}

/**
 * A look's card, then the live look's card again: the switch to `to` is planned
 * from the live page and staged; `between` is what the manager does to the
 * drafted page; the way back is planned from what that leaves.
 */
function roundTrip(
  live: readonly LiveSection[],
  from: LookDefinition,
  to: LookDefinition,
  between: (page: SiteSection[]) => SiteSection[] = (page) => page,
) {
  const forward = planLookSwitch({
    current: live,
    outgoingDefaults: [from.sections],
    draftedLookId: null,
    live: { lookId: from.id, sections: live, otherLayoutDrafted: false },
    incoming: to,
  });
  const drafted = between(staged(live, forward).page);
  const back = planLookSwitchWithCounts({
    current: drafted,
    outgoingDefaults: [to.sections],
    draftedLookId: to.id,
    live: { lookId: from.id, sections: live, otherLayoutDrafted: true },
    incoming: from,
  });
  return { drafted, back };
}

const WEB_SRC = path.resolve(__dirname, '../../../src');
const PACKAGES = path.resolve(__dirname, '../../../../../packages');

/**
 * Every module specifier reachable from `entry`, type-only imports included.
 * The walk follows the app's own files and the workspace packages' sources, and
 * stops at third-party packages and at `@propertypro/db`, which is what it looks
 * for. A workspace import it cannot resolve fails the test instead of being
 * skipped.
 */
function importGraph(entry: string): { files: string[]; specifiers: string[] } {
  const files = new Set<string>();
  const specifiers = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const { fileName } of ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles) {
      specifiers.add(fileName);
      const resolved = resolveWorkspaceImport(fileName, file);
      if (resolved) queue.push(resolved);
    }
  }
  return { files: [...files], specifiers: [...specifiers] };
}

function resolveWorkspaceImport(specifier: string, from: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) {
    base = path.join(WEB_SRC, specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(from), specifier);
  } else if (specifier.startsWith('@propertypro/')) {
    const [, pkg, ...rest] = specifier.split('/');
    if (pkg === 'db') return null;
    base = path.join(PACKAGES, pkg!, 'src', ...rest);
  } else {
    return null;
  }
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx'), base]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Cannot resolve "${specifier}" from ${from}`);
}

// ---------------------------------------------------------------------------
// looks.ts and the database
// ---------------------------------------------------------------------------

describe('looks.ts and the database', () => {
  it('reaches no @propertypro/db entry point anywhere in its import graph', () => {
    const { files, specifiers } = importGraph(path.join(WEB_SRC, 'lib/site-looks/looks.ts'));

    // The walk went through the shared package's barrel down to the block schemas.
    expect(files).toEqual(
      expect.arrayContaining([
        path.join(PACKAGES, 'shared/src/index.ts'),
        path.join(PACKAGES, 'shared/src/site-blocks/index.ts'),
      ]),
    );
    const db = specifiers.filter((s) => s === '@propertypro/db' || s.startsWith('@propertypro/db/'));
    expect(db).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

describe('the looks registry', () => {
  it('lists the four looks, each drawn by the layout and colour set of its own id (D2)', () => {
    expect([...LOOK_IDS]).toEqual(['bayfront', 'heritage', 'palm-grove', 'plain-simple']);
    expect(LOOKS.map((l) => l.id)).toEqual([...LOOK_IDS]);
    for (const l of LOOKS) {
      expect(l.layoutId).toBe(l.id);
      expect(l.presetSlug).toBe(l.id);
      expect(LAYOUT_IDS).toContain(l.layoutId);
      expect(LOOK_STYLES).toHaveProperty(l.id);
      expect(getLook(l.id)).toBe(l);
    }
    expect(getLook('tidewater')).toBeNull();
    expect(getLook('')).toBeNull();
  });

  it("every look's sections parse with blockSchemaRegistry", () => {
    const failures: string[] = [];
    for (const l of LOOKS) {
      for (const section of l.sections) {
        const parsed = blockSchemaRegistry[section.blockType].safeParse(section.content);
        if (!parsed.success) failures.push(`${l.id} ${section.blockType}: ${parsed.error.message}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('every look starts with its welcome section and has exactly one of each section type', () => {
    for (const l of LOOKS) {
      expect(l.sections[0]?.blockType).toBe('hero');
      expect(new Set(types(l.sections)).size).toBe(l.sections.length);
    }
  });

  it('no look uses a Professional-only section type', () => {
    // FAQ, gallery and amenities need `hasSitePolishBlocks` (Professional); every
    // look has to work fully on every plan.
    const professionalOnly = new Set(['faq', 'gallery', 'amenities']);
    const used = LOOKS.flatMap((l) => l.sections.map((s) => `${l.id}:${s.blockType}`));
    expect(used.filter((entry) => professionalOnly.has(entry.split(':')[1]!))).toEqual([]);
  });

  it('a look with Board members leaves the board out of its Contact section (D16)', () => {
    for (const l of LOOKS) {
      const contact = sectionOf(l.sections, 'contact').content as { showBoard: boolean };
      expect({ look: l.id, showBoard: contact.showBoard }).toEqual({
        look: l.id,
        showBoard: !types(l.sections).includes('board'),
      });
    }
  });

  it('every look keeps the sections Florida law asks associations to post', () => {
    // A look switch never removes a section type the incoming look has, so this
    // is what keeps a switch from taking away the site's Meetings or Documents.
    for (const l of LOOKS) {
      expect(types(l.sections)).toEqual(expect.arrayContaining(['meetings', 'documents']));
    }
  });

  it('the presets mirrored for tests match migration 0097', () => {
    const sql = readFileSync(
      path.resolve(__dirname, '../../../../../packages/db/migrations/0097_site_looks_catalog.sql'),
      'utf8',
    );
    const presetInsert = sql.slice(
      sql.indexOf('INSERT INTO site_theme_presets'),
      sql.indexOf('INSERT INTO site_layout_metadata'),
    );
    expect(presetInsert).not.toBe('');

    expect(Object.keys(SITE_LOOK_PRESETS).sort()).toEqual([...LOOK_IDS].sort());
    for (const l of LOOKS) {
      // The row as 0097 writes it: slug, display name, description, then the
      // tokens as one compact JSON literal. The fixture's keys are in the
      // migration's order, so JSON.stringify reproduces the literal exactly.
      const row = `('${l.presetSlug}', '${l.name}', '${l.description}',\n   '${JSON.stringify(SITE_LOOK_PRESETS[l.id])}'::jsonb,`;
      expect(presetInsert).toContain(row);
    }
  });

  it("every look's welcome copy keeps a full sentence with no city and no unit count", () => {
    // Review Focus 2: with a fact missing, only the sentence that held it goes.
    const missingFacts: LinkedFacts = {
      name: 'Harbor Pointe Condominium Association, Inc.',
      shortName: null,
      city: null,
      unitCount: null,
    };
    const failures: string[] = [];
    for (const l of LOOKS) {
      const hero = sectionOf(l.sections, 'hero').content as { headline: string; subtitle?: string };
      const headline = resolveLinkedText(hero.headline, missingFacts);
      const subtitle = resolveLinkedText(hero.subtitle ?? '', missingFacts);
      if (headline === '' || headline.includes('{{')) failures.push(`${l.id} headline: "${headline}"`);
      if (!/^[A-Z][^{}]*[.!?]$/.test(subtitle)) failures.push(`${l.id} subtitle: "${subtitle}"`);
    }
    expect(failures).toEqual([]);

    // And with every fact known, the copy uses them.
    const allFacts: LinkedFacts = { name: 'Harbor Pointe', shortName: null, city: 'Naples', unitCount: 120 };
    const bayfrontHero = sectionOf(look('bayfront').sections, 'hero').content as { subtitle: string };
    expect(resolveLinkedText(bayfrontHero.subtitle, allFacts)).toBe(
      '120 homes in Naples. Meeting notices, news and community records, all in one place.',
    );
  });

  it('suggestedLookFor maps condo, HOA and apartment', () => {
    expect(suggestedLookFor('condo_718')).toBe('bayfront');
    expect(suggestedLookFor('hoa_720')).toBe('palm-grove');
    expect(suggestedLookFor('apartment')).toBe('plain-simple');
  });

  it('lookIdForLayout names a look only for one of the four look layouts', () => {
    expect(lookIdForLayout('heritage')).toBe('heritage');
    expect(lookIdForLayout('plain-simple')).toBe('plain-simple');
    // The legacy layouts, and no layout at all, are not looks.
    expect(lookIdForLayout('tidewater')).toBeNull();
    expect(lookIdForLayout('boulevard')).toBeNull();
    expect(lookIdForLayout('sable')).toBeNull();
    expect(lookIdForLayout(null)).toBeNull();
    expect(lookIdForLayout(undefined)).toBeNull();
    expect(lookIdForLayout('Heritage')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// planLookSwitch (D5)
// ---------------------------------------------------------------------------

describe('planLookSwitch', () => {
  const bayfront = look('bayfront');
  const heritage = look('heritage');
  const plainSimple = look('plain-simple');

  it('an untouched site becomes exactly the incoming look, in its order', () => {
    // Every pair of looks. Bayfront to Plain & Simple is the telling one: Plain
    // & Simple puts Meetings before Announcements, so replacing sections in
    // their slots would keep Bayfront's order instead.
    for (const from of LOOKS) {
      for (const to of LOOKS) {
        const result = planLookSwitch({
          current: siteFrom(from.sections),
          outgoingDefaults: [from.sections],
          draftedLookId: null,
          live: null,
          incoming: to,
        });
        expect({ from: from.id, to: to.id, result }).toEqual({
          from: from.id,
          to: to.id,
          result: asPlanned(to.sections),
        });
      }
    }

    // A page the manager only reordered is still untouched: it takes the look's order.
    const [hero, quicklinks, announcements, meetings, documents, contact] = siteFrom(bayfront.sections);
    const reordered = [hero!, documents!, contact!, quicklinks!, meetings!, announcements!];
    expect(planLookSwitch({ current: reordered, outgoingDefaults: [bayfront.sections], draftedLookId: null, live: null, incoming: heritage })).toEqual(
      asPlanned(heritage.sections),
    );

    // "Untouched" compares parsed content, so a section stored with the schema's
    // defaults filled in (as the editor saves it) is still untouched.
    const savedByTheEditor = bayfront.sections.map((s, i) => ({
      id: 200 + i,
      blockType: s.blockType,
      content: blockSchemaRegistry[s.blockType].parse(s.content),
    }));
    expect(
      planLookSwitch({ current: savedByTheEditor, outgoingDefaults: [bayfront.sections], draftedLookId: null, live: null, incoming: heritage }),
    ).toEqual(asPlanned(heritage.sections));

    // A site with no sections at all is untouched too.
    expect(planLookSwitch({ current: [], outgoingDefaults: [bayfront.sections], draftedLookId: null, live: null, incoming: heritage })).toEqual(
      asPlanned(heritage.sections),
    );
  });

  it('an edited hero keeps its text and slot; untouched neighbours are replaced in place', () => {
    // Review Focus 4.
    const current = siteFrom(bayfront.sections);
    current[0] = { id: 100, blockType: 'hero', content: EDITED_HERO };

    const result = planLookSwitch({ current, outgoingDefaults: [bayfront.sections], draftedLookId: null, live: null, incoming: heritage });

    expect(result).toEqual([
      { id: 100, blockType: 'hero', content: EDITED_HERO },
      // Bayfront's Quick links is untouched and Heritage has none: removed.
      sectionOf(heritage.sections, 'announcements'),
      sectionOf(heritage.sections, 'meetings'),
      sectionOf(heritage.sections, 'documents'),
      sectionOf(heritage.sections, 'board'),
      sectionOf(heritage.sections, 'contact'),
    ]);
    // Replaced, not kept: Heritage shows five announcements where Bayfront shows three.
    expect(result[1]?.content).toEqual({ limit: 5 });
  });

  it('a hidden section stays hidden', () => {
    // Review Focus 4. A hidden section never matches a default, so it is kept
    // with its content and slot, and no visible copy of its type is added.
    const current = siteFrom(bayfront.sections);
    const meetingsSlot = types(current).indexOf('meetings');
    current[meetingsSlot] = { id: 999, blockType: 'meetings', content: { limit: 5, hidden: true } };

    const result = planLookSwitch({ current, outgoingDefaults: [bayfront.sections], draftedLookId: null, live: null, incoming: plainSimple });

    expect(result[meetingsSlot]).toEqual({ id: 999, blockType: 'meetings', content: { limit: 5, hidden: true } });
    expect(types(result).filter((t) => t === 'meetings')).toHaveLength(1);
    // Its untouched neighbours become Plain & Simple's, in their own slots.
    expect(types(result)).toEqual(['hero', 'quicklinks', 'announcements', 'meetings', 'documents', 'contact']);
    expect(result[0]).toEqual(sectionOf(plainSimple.sections, 'hero'));
  });

  it('a hidden section is never untouched, even when a starter-pack version hides it too', () => {
    // An admin can publish a pack version with a hidden section, and the pack is
    // copied to a site verbatim, so the site's hidden section equals the pack's.
    // Hiding is still the manager's to undo: it stays, hidden.
    const hiddenMeetings = { limit: 10, timeWindowDays: 30, hidden: true };
    const pack: LookSection[] = [
      { blockType: 'hero', content: { headline: 'Welcome' } },
      { blockType: 'meetings', content: hiddenMeetings },
      { blockType: 'contact', content: { showBoard: true, showManagement: true } },
    ];

    const result = planLookSwitch({
      current: siteFrom(pack),
      outgoingDefaults: [pack],
      draftedLookId: null,
      live: null,
      incoming: bayfront,
    });

    expect(result).toContainEqual({ id: 101, blockType: 'meetings', content: hiddenMeetings });
    expect(types(result).filter((t) => t === 'meetings')).toHaveLength(1);
  });

  it('switching to the look already drafted hands back the page exactly as it is', () => {
    // A Heritage site whose only edit is Announcements 5 → 3, switched to Plain
    // & Simple. Its Announcements stays in its slot, before Meetings.
    const current = siteFrom(heritage.sections);
    current[1] = { id: 101, blockType: 'announcements', content: { limit: 3 } };
    const first = planLookSwitch({
      current,
      outgoingDefaults: [heritage.sections],
      draftedLookId: null,
      live: null,
      incoming: plainSimple,
    });
    expect(types(first)).toEqual(['hero', 'quicklinks', 'announcements', 'meetings', 'documents', 'contact']);

    // "Publish this look" switches to it again. Planned from Plain & Simple's own
    // defaults, that Announcements ({ limit: 3 }) would now count as untouched
    // and move after Meetings; the drafted look leaves the page as it is.
    const draftedPage = first.map((section, i) => ({ id: 700 + i, ...section }));
    expect(
      planLookSwitchWithCounts({
        current: draftedPage,
        outgoingDefaults: [plainSimple.sections],
        draftedLookId: 'plain-simple',
        live: null,
        incoming: plainSimple,
      }),
    ).toEqual({ sections: draftedPage, replaced: 0, kept: 6, added: 0, removed: 0, kind: 'already-drafted' });

    // A different look is still a switch.
    expect(
      planLookSwitchWithCounts({
        current: draftedPage,
        outgoingDefaults: [plainSimple.sections],
        draftedLookId: 'plain-simple',
        live: null,
        incoming: heritage,
      }).kind,
    ).toBe('switch');
  });

  describe('back to the live look', () => {
    // These pages are what the loader reads: live rows with their ids and slots,
    // and the drafted page as staging leaves it (`staged`).
    const bayfrontRows = (...types: string[]) => types.map((type) => sectionOf(bayfront.sections, type));

    it('choosing the live look with no other layout drafted changes nothing', () => {
      const live = livePage(bayfront.sections);
      expect(
        planLookSwitchWithCounts({
          current: live,
          outgoingDefaults: [bayfront.sections],
          draftedLookId: null,
          live: { lookId: 'bayfront', sections: live, otherLayoutDrafted: false },
          incoming: bayfront,
        }),
      ).toEqual({ sections: rowsOf(live), replaced: 0, kept: 6, added: 0, removed: 0, kind: 'live-look' });
    });

    it('returning to it restores what is live, and a section removed from it stays removed', () => {
      // A live Bayfront page whose manager removed Quick links: slot 2 is empty.
      const live = livePage(bayfrontRows('hero', 'announcements', 'meetings', 'documents', 'contact'), [1, 3, 4, 5, 6]);

      const { drafted, back } = roundTrip(live, bayfront, heritage);

      expect(types(drafted)).toEqual(types(heritage.sections));
      expect(back.kind).toBe('back-to-live');
      // What is live, in its live order: not Bayfront's own sections, so no Quick links.
      expect(back.sections).toEqual(rowsOf(live));
      expect(staged(live, back.sections)).toMatchObject({ drafts: [], tombstones: [] });
    });

    it("two sections of one type come back row for row, with nothing staged (the re-reviewer's case A)", () => {
      // Two text sections, Quick links after the first. The type-by-type plan
      // put Quick links back after the second text, and staged five drafts.
      const live = livePage([
        sectionOf(bayfront.sections, 'hero'),
        text('About us'),
        ...bayfrontRows('quicklinks', 'announcements', 'meetings', 'documents'),
        text('Pool hours'),
        sectionOf(bayfront.sections, 'contact'),
      ]);

      const { back } = roundTrip(live, bayfront, heritage);

      expect(back.sections).toEqual(rowsOf(live));
      expect(staged(live, back.sections)).toMatchObject({ drafts: [], tombstones: [] });
      // Heritage's Board members, untouched and with no live row, is gone. Its
      // Meetings and Documents equal the live ones but stand for no row: they
      // go too, the live rows coming back in their place.
      expect(back).toMatchObject({ kept: 2, replaced: 5, removed: 1, added: 1 });
    });

    it("an edited hero and two default Quick links come back with nothing staged (the re-reviewer's case C)", () => {
      // The type-by-type plan brought one Quick links back, and staged the loss of the other.
      const live = livePage([
        { blockType: 'hero', content: EDITED_HERO },
        ...bayfrontRows('quicklinks', 'quicklinks', 'announcements', 'meetings', 'documents', 'contact'),
      ]);

      const { back } = roundTrip(live, bayfront, heritage);

      expect(back.sections).toEqual(rowsOf(live));
      expect(staged(live, back.sections)).toMatchObject({ drafts: [], tombstones: [] });
    });

    it('a section the switch moved comes back to its live place', () => {
      // Heritage has no Quick links, so the switch stages the text after it one
      // slot up, as a new draft row: its content is what it is known by.
      const live = livePage([
        ...bayfrontRows('hero', 'quicklinks'),
        text('About us'),
        ...bayfrontRows('announcements', 'meetings', 'documents', 'contact'),
      ]);

      const { drafted, back } = roundTrip(live, bayfront, heritage);

      const moved = drafted.find((s) => s.blockType === 'text')!;
      expect(moved.slot).toBe(2);
      expect(live.map((row) => row.id)).not.toContain(moved.id);
      expect(back.sections).toEqual(rowsOf(live));
      expect(staged(live, back.sections)).toMatchObject({ drafts: [], tombstones: [] });
    });

    it('one edit between the clicks is the only change left, in its place (Plain & Simple, Heritage, hero edited, back)', () => {
      const live = livePage(plainSimple.sections);

      const { back } = roundTrip(live, plainSimple, heritage, (page) =>
        edited(page, 'hero', { headline: 'Harbor Pointe' }),
      );

      // The live page in its live order, the hero edited. Heritage's order is not kept.
      expect(back.sections.map(({ blockType, content }) => ({ blockType, content }))).toEqual(
        live.map(({ blockType, content }) =>
          blockType === 'hero' ? { blockType, content: { headline: 'Harbor Pointe' } } : { blockType, content },
        ),
      );
      // Exactly that edit is staged: the hero's draft in slot 1, and no reorder.
      const { drafts, tombstones } = staged(live, back.sections);
      expect(drafts).toEqual([expect.objectContaining({ slot: 1, blockType: 'hero', content: { headline: 'Harbor Pointe' } })]);
      expect(tombstones).toEqual([]);
    });

    it('a drafted look comes back off a legacy live page, keeping the edit made since (Keep my current look)', () => {
      // A site still on a legacy layout, showing a starter pack. No card can
      // return to it (its live layout is no look), so the picker's Keep this
      // look plans the way back from the live rows alone.
      const pack: LookSection[] = [
        { blockType: 'hero', content: { headline: 'Welcome' } },
        { blockType: 'announcements', content: { limit: 3, timeWindowDays: 30 } },
        { blockType: 'meetings', content: { limit: 10, timeWindowDays: 30 } },
        { blockType: 'contact', content: { showBoard: true, showManagement: true } },
      ];
      const live = livePage(pack);
      const forward = planLookSwitch({
        current: live,
        outgoingDefaults: [pack],
        draftedLookId: null,
        live: null,
        incoming: heritage,
      });
      const drafted = edited(staged(live, forward).page, 'hero', { headline: 'Harbor Pointe' });

      const back = planReturnToLive(drafted, [heritage.sections], live);

      expect(back.kind).toBe('back-to-live');
      // The live page in its live order, with the hero the manager edited.
      expect(back.sections.map(({ blockType, content }) => ({ blockType, content }))).toEqual(
        live.map(({ blockType, content }) =>
          blockType === 'hero' ? { blockType, content: { headline: 'Harbor Pointe' } } : { blockType, content },
        ),
      );
      // Only that edit is left to publish; Heritage's own sections are gone.
      const { drafts, tombstones } = staged(live, back.sections);
      expect(drafts).toEqual([expect.objectContaining({ slot: 1, blockType: 'hero', content: { headline: 'Harbor Pointe' } })]);
      expect(tombstones).toEqual([]);
    });

    it('an edit made to a live row while another look was drafted survives returning to it', () => {
      // Bayfront without Quick links: Heritage's Meetings equals the live one,
      // so the live row stays in its slot, and the manager's edit is a draft over it.
      const live = livePage(bayfrontRows('hero', 'announcements', 'meetings', 'documents', 'contact'), [1, 3, 4, 5, 6]);

      const { back } = roundTrip(live, bayfront, heritage, (page) => edited(page, 'meetings', { limit: 9 }));

      expect(back.sections).toEqual(
        rowsOf(live).map((row) => (row.blockType === 'meetings' ? expect.objectContaining({ content: { limit: 9 } }) : row)),
      );
      expect(staged(live, back.sections).drafts).toEqual([
        expect.objectContaining({ slot: 4, blockType: 'meetings', content: { limit: 9 } }),
      ]);
    });

    it('a section with no live row goes after the nearest live row before it on the page now', () => {
      // Under Heritage the manager edits Board members, which Bayfront lacks,
      // and adds a text section at the end.
      const live = livePage(bayfront.sections);

      const { back } = roundTrip(live, bayfront, heritage, (page) => [
        ...edited(page, 'board', { heading: 'Our volunteers' }),
        { id: nextDraftId++, slot: 7, blockType: 'text', content: { body: 'Parking' } },
      ]);

      // Board members after Documents, where it was; the text after Contact.
      expect(types(back.sections)).toEqual([...types(bayfront.sections).slice(0, 5), 'board', 'contact', 'text']);
      expect(back.sections[5]).toMatchObject({ blockType: 'board', content: { heading: 'Our volunteers' } });
      expect(back.sections.filter((s) => s.blockType !== 'board' && s.blockType !== 'text')).toEqual(rowsOf(live));
    });

    it('an edited section returns to its live row (Bayfront, Heritage with Announcements edited 5 → 4, back)', () => {
      // Heritage has no Quick links, so its Announcements is staged in the live
      // Quick links' slot. Edited there, it is no edit of Quick links (the editor
      // never changes a section's type), but it is the one edited Announcements
      // left, and the live Announcements the one such row left: an edit of that
      // row. One Announcements comes back, in its live slot, showing four, and
      // Quick links stays.
      const live = livePage(bayfront.sections);

      const { drafted, back } = roundTrip(live, bayfront, heritage, (page) => edited(page, 'announcements', { limit: 4 }));

      const quickLinksSlot = live.find((row) => row.blockType === 'quicklinks')!.slot;
      expect(drafted.find((s) => s.blockType === 'announcements')).toMatchObject({ slot: quickLinksSlot, content: { limit: 4 } });
      expect(back.sections).toEqual(
        rowsOf(live).map((row) =>
          row.blockType === 'announcements' ? expect.objectContaining({ blockType: 'announcements', content: { limit: 4 } }) : row,
        ),
      );
      // That edit is the only draft staged, in the live Announcements' slot.
      const announcementsSlot = live.find((row) => row.blockType === 'announcements')!.slot;
      expect(staged(live, back.sections)).toMatchObject({
        drafts: [{ slot: announcementsSlot, blockType: 'announcements', content: { limit: 4 } }],
        tombstones: [],
      });
    });

    it('does not guess which row an edited section belongs to when two could (two text sections, one edited)', () => {
      // Either way round, two text sections of one side are left over for one on
      // the other, so no pairing is made: the edit stays a section the live page
      // lacks, after the nearest live row before it, and every live row comes
      // back as it is. The placement from before there was a pairing step.
      const aboutUs = text('About us');

      // Two edited text sections left for one live row: About us, moved one
      // slot up by the switch and then edited, and a text section added.
      const oneRow = livePage([...bayfrontRows('hero', 'quicklinks'), aboutUs, ...bayfrontRows('announcements', 'meetings', 'documents', 'contact')]);
      const first = roundTrip(oneRow, bayfront, heritage, (page) => [
        ...edited(page, 'text', { body: 'About us, edited' }),
        { id: nextDraftId++, slot: 8, blockType: 'text', content: { body: 'Parking' } },
      ]);
      const [hero1, ...rest1] = rowsOf(oneRow);
      expect(first.back.sections).toEqual([
        hero1,
        expect.objectContaining({ content: { body: 'About us, edited' } }),
        ...rest1,
        expect.objectContaining({ content: { body: 'Parking' } }),
      ]);

      // Two live text rows left for one edited section: About us edited, and
      // Pool hours removed, while Heritage was drafted.
      const twoRows = livePage([
        ...bayfrontRows('hero', 'quicklinks'),
        aboutUs,
        text('Pool hours'),
        ...bayfrontRows('announcements', 'meetings', 'documents', 'contact'),
      ]);
      const second = roundTrip(twoRows, bayfront, heritage, (page) =>
        page.flatMap((s) => {
          const body = s.blockType === 'text' ? (s.content as { body: string }).body : null;
          if (body === 'Pool hours') return [];
          return body === 'About us' ? [{ ...s, id: nextDraftId++, content: { body: 'About us, edited' } }] : [s];
        }),
      );
      const [hero2, ...rest2] = rowsOf(twoRows);
      expect(second.back.sections).toEqual([hero2, expect.objectContaining({ content: { body: 'About us, edited' } }), ...rest2]);
    });

    it('an edit of one of two different text sections returns to its own row: the other is known by its content', () => {
      const live = livePage([
        ...bayfrontRows('hero', 'quicklinks'),
        text('About us'),
        text('Pool hours'),
        ...bayfrontRows('announcements', 'meetings', 'documents', 'contact'),
      ]);

      const { back } = roundTrip(live, bayfront, heritage, (page) =>
        page.map((s) =>
          s.blockType === 'text' && (s.content as { body: string }).body === 'Pool hours'
            ? { ...s, id: nextDraftId++, content: { body: 'Pool hours, edited' } }
            : s,
        ),
      );

      const poolHours = live.find((row) => (row.content as { body?: string }).body === 'Pool hours')!;
      expect(back.sections).toEqual(
        rowsOf(live).map((row) =>
          row.id === poolHours.id ? expect.objectContaining({ content: { body: 'Pool hours, edited' } }) : row,
        ),
      );
      expect(staged(live, back.sections).drafts).toEqual([
        expect.objectContaining({ slot: poolHours.slot, content: { body: 'Pool hours, edited' } }),
      ]);
    });

    it("never puts an edit over another row of its type staged in its slot (the re-reviewer's route A)", () => {
      // Bayfront's own Announcements (3) and the manager's (10, over a year).
      // Heritage has no Quick links, so the switch stages the manager's
      // Announcements in the default one's slot, where it is edited to 8. With
      // two live Announcements that slot says nothing about which row it is:
      // the edit comes back as a section of its own, and both rows as they are.
      const annual = { limit: 10, timeWindowDays: 365 };
      const live = livePage([
        ...bayfrontRows('hero', 'quicklinks', 'announcements'),
        { blockType: 'announcements', content: annual },
        ...bayfrontRows('meetings', 'documents', 'contact'),
      ]);
      const edit = { blockType: 'announcements' as const, content: { limit: 8, timeWindowDays: 365 } };

      const { drafted, back } = roundTrip(live, bayfront, heritage, (page) => {
        const copy = page.find((s) => sameContent(s, { blockType: 'announcements', content: annual }))!;
        return editedAt(page, copy.slot!, edit.content);
      });

      const defaultSlot = live.find((row) => row.blockType === 'announcements')!.slot;
      expect(drafted.find((s) => sameContent(s, edit))?.slot).toBe(defaultSlot);
      expectNoLiveRowDropped(live, back.sections, edit);
      // What the manager would review: one added section, nothing removed.
      expect(changesStaged(live, back.sections)).toEqual(['added']);
    });

    it("an untouched default never claims a live row by content outside its slot (the re-reviewer's route B)", () => {
      // Live Heritage with the manager's Contact (board shown) in slot 6, and
      // Heritage's own (board left out) in slot 7. The Bayfront card keeps the
      // manager's in place and stages Bayfront's Contact, which also shows the
      // board, in slot 7. The manager edits the one in slot 6. Bayfront's
      // Contact is an untouched default, so it does not stand for the live row
      // it equals, and Heritage's Contact cannot be taken for the edit's row.
      const live = livePage([
        ...(['hero', 'announcements', 'meetings', 'documents', 'board'] as const).map((type) => sectionOf(heritage.sections, type)),
        { blockType: 'contact', content: { showBoard: true, showManagement: true } },
        sectionOf(heritage.sections, 'contact'),
      ]);
      const edit = { blockType: 'contact' as const, content: { showBoard: true, showManagement: false } };

      const { drafted, back } = roundTrip(live, heritage, bayfront, (page) => editedAt(page, 6, edit.content));

      expect(drafted.filter((s) => s.blockType === 'contact').map((s) => s.slot)).toEqual([6, 7]);
      expectNoLiveRowDropped(live, back.sections, edit);
      expect(changesStaged(live, back.sections)).toEqual(['added']);
    });

    it('does not take a default that only looks like a live row for that row (two Announcements, one equal to the new look\'s)', () => {
      // Live Heritage with its own Announcements (5) and the manager's (3).
      // Bayfront's Announcements, standing in for Heritage's, is also 3, and it
      // lands in the manager's row's slot, so that row's published copy stays
      // there and is matched by its id. The manager's real copy, staged one slot
      // down, is then edited. Pairing it with the one row left by type would put
      // it over Heritage's Announcements: it is added instead.
      const live = livePage([
        ...(['hero', 'announcements'] as const).map((type) => sectionOf(heritage.sections, type)),
        { blockType: 'announcements', content: { limit: 3 } },
        ...(['meetings', 'documents', 'board', 'contact'] as const).map((type) => sectionOf(heritage.sections, type)),
      ]);
      const edit = { blockType: 'announcements' as const, content: { limit: 7 } };

      const { drafted, back } = roundTrip(live, heritage, bayfront, (page) => {
        const copies = page.filter((s) => sameContent(s, { blockType: 'announcements', content: { limit: 3 } }));
        expect(copies.map((s) => s.slot)).toEqual([3, 4]);
        return editedAt(page, 4, edit.content);
      });

      expect(drafted.find((s) => s.slot === 3)?.id).toBe(live[2]!.id);
      expectNoLiveRowDropped(live, back.sections, edit);
    });

    it('a section added under the drafted look never takes the place of the live row of its type', () => {
      // Heritage's Announcements stands in for the live one, in the Quick
      // links' slot. The manager adds a second Announcements: once at the end,
      // and once moved into the live Announcements' own slot (the editor's move
      // rewrites the slots it crosses). With two sections of the type left on
      // the page, neither is matched to the live row: it comes back, and the
      // new section is added.
      const live = livePage(bayfront.sections);
      const added = { blockType: 'announcements' as const, content: { limit: 2 } };

      const atTheEnd = roundTrip(live, bayfront, heritage, (page) => [...page, { id: nextDraftId++, slot: 7, ...added }]);
      expectNoLiveRowDropped(live, atTheEnd.back.sections, added);

      const movedIn = roundTrip(live, bayfront, heritage, (page) => {
        // Inserted after Heritage's Announcements (slot 2): the sections after it
        // move down a slot.
        const [hero, announcements, ...rest] = page;
        return [hero!, announcements!, { ...added, id: nextDraftId++, slot: 3 }, ...rest.map((s) => ({ ...s, id: nextDraftId++, slot: s.slot! + 1 }))];
      });
      const liveAnnouncementsSlot = live.find((row) => row.blockType === 'announcements')!.slot;
      expect(liveAnnouncementsSlot).toBe(3);
      expectNoLiveRowDropped(live, movedIn.back.sections, added);
    });

    it('never guesses between two identical live rows of a type: an edit of one comes back beside both', () => {
      const live = livePage([
        ...bayfrontRows('hero', 'quicklinks'),
        text('Same'),
        text('Same'),
        ...bayfrontRows('announcements', 'meetings', 'documents', 'contact'),
      ]);
      const edit = { blockType: 'text' as const, content: { body: 'Same, edited' } };

      const { back } = roundTrip(live, bayfront, heritage, (page) => {
        const second = page.filter((s) => s.blockType === 'text')[1]!;
        return editedAt(page, second.slot!, edit.content);
      });

      expectNoLiveRowDropped(live, back.sections, edit);
    });

    it('two text sections both edited come back as sections of their own, with no reorder staged (M2)', () => {
      // Both follow Quick links, so Heritage stages each one slot up, the second
      // in the first one's slot. Both edited there, neither can be matched to a
      // row without guessing between the two live texts.
      const live = livePage([
        ...bayfrontRows('hero', 'quicklinks'),
        text('About us'),
        text('Pool hours'),
        ...bayfrontRows('announcements', 'meetings', 'documents', 'contact'),
      ]);

      const { back } = roundTrip(live, bayfront, heritage, (page) =>
        page.map((s) =>
          s.blockType === 'text'
            ? { ...s, id: nextDraftId++, content: { body: `${(s.content as { body: string }).body}, edited` } }
            : s,
        ),
      );

      // The edits after the hero, where they were on the page; the live rows
      // after them, all of them, in their live order.
      const [hero, ...rest] = rowsOf(live);
      expect(back.sections).toEqual([
        hero,
        expect.objectContaining({ content: { body: 'About us, edited' } }),
        expect.objectContaining({ content: { body: 'Pool hours, edited' } }),
        ...rest,
      ]);
      // What the manager would review: two added sections, and no reorder.
      expect(changesStaged(live, back.sections)).toEqual(['added', 'added']);
    });

    it('a live row removed while another look was drafted comes back', () => {
      // The ruling keeps edits and added sections; a removal is neither.
      const live = livePage([sectionOf(bayfront.sections, 'hero'), text('About us'), ...bayfrontRows('announcements', 'contact')]);

      const { drafted, back } = roundTrip(live, bayfront, heritage, (page) => page.filter((s) => s.blockType !== 'text'));

      expect(types(drafted)).not.toContain('text');
      expect(back.sections).toEqual(rowsOf(live));
    });

    it('reads a plan handed back without slots as staged, and live rows without slots as a look publishes them', () => {
      // The re-reviewer's case D, passed the way their script passed it.
      const live = plainSimple.sections.map((s, i) => ({ id: i + 1, blockType: s.blockType, content: structuredClone(s.content) }));
      const forward = planLookSwitch({
        current: live,
        outgoingDefaults: [plainSimple.sections],
        draftedLookId: null,
        live: { lookId: 'plain-simple', sections: live, otherLayoutDrafted: false },
        incoming: heritage,
      });
      const drafted = forward.map((s, i) => ({ ...s, id: s.id ?? 900 + i }));
      drafted[0] = { ...drafted[0]!, content: { headline: 'Harbor Pointe' } };

      const back = planLookSwitch({
        current: drafted,
        outgoingDefaults: [heritage.sections],
        draftedLookId: 'heritage',
        live: { lookId: 'plain-simple', sections: live, otherLayoutDrafted: true },
        incoming: plainSimple,
      });

      expect(back).toEqual(live.map((row) => (row.blockType === 'hero' ? drafted[0] : row)));
    });

    it('a drafted layout that is not a look is undone the same way', () => {
      // Only the raw design route can draft one: no card is a legacy layout.
      const live = livePage(bayfrontRows('hero', 'announcements', 'meetings', 'documents', 'contact'), [1, 3, 4, 5, 6]);
      const back = planLookSwitchWithCounts({
        current: live,
        outgoingDefaults: [bayfront.sections],
        draftedLookId: null,
        live: { lookId: 'bayfront', sections: live, otherLayoutDrafted: true },
        incoming: bayfront,
      });
      expect(back.kind).toBe('back-to-live');
      expect(back.sections).toEqual(rowsOf(live));
    });
  });

  it('switching to heritage inserts Board members after Documents', () => {
    // The manager moved Documents above Meetings and edited the hero. Board
    // members, which the site does not have, goes right after Documents (the
    // section before it in Heritage's order), wherever Documents now is.
    const [hero, quicklinks, announcements, meetings, documents, contact] = siteFrom(bayfront.sections);
    const current = [{ ...hero!, content: EDITED_HERO }, quicklinks!, announcements!, documents!, meetings!, contact!];

    const result = planLookSwitch({ current, outgoingDefaults: [bayfront.sections], draftedLookId: null, live: null, incoming: heritage });

    expect(types(result)).toEqual(['hero', 'announcements', 'documents', 'board', 'meetings', 'contact']);
    expect(result[3]).toEqual(sectionOf(heritage.sections, 'board'));
  });

  it("a section the page lacks, with nothing before it in the look's order, goes first", () => {
    // A legacy page with no welcome section, and Announcements the manager edited.
    const current: SiteSection[] = [{ id: 300, blockType: 'announcements', content: { limit: 2 } }];

    const result = planLookSwitch({ current, outgoingDefaults: [bayfront.sections], draftedLookId: null, live: null, incoming: heritage });

    expect(result[0]).toEqual(sectionOf(heritage.sections, 'hero'));
    expect(types(result)).toEqual(['hero', 'announcements', 'meetings', 'documents', 'board', 'contact']);
    expect(result[1]).toEqual({ id: 300, blockType: 'announcements', content: { limit: 2 } });
  });

  it('leaving heritage removes an untouched Board members', () => {
    const current = siteFrom(heritage.sections);
    current[0] = { id: 100, blockType: 'hero', content: EDITED_HERO };

    const result = planLookSwitch({ current, outgoingDefaults: [heritage.sections], draftedLookId: null, live: null, incoming: bayfront });

    expect(result).toEqual([
      { id: 100, blockType: 'hero', content: EDITED_HERO },
      // Quick links, which Heritage does not have, goes right after the hero.
      sectionOf(bayfront.sections, 'quicklinks'),
      sectionOf(bayfront.sections, 'announcements'),
      sectionOf(bayfront.sections, 'meetings'),
      sectionOf(bayfront.sections, 'documents'),
      sectionOf(bayfront.sections, 'contact'),
    ]);

    // A Board members section the manager edited is theirs, and stays.
    const editedBoard = siteFrom(heritage.sections);
    const boardSlot = types(editedBoard).indexOf('board');
    editedBoard[boardSlot] = { id: 555, blockType: 'board', content: { heading: 'Our volunteers' } };
    const kept = planLookSwitch({ current: editedBoard, outgoingDefaults: [heritage.sections], draftedLookId: null, live: null, incoming: bayfront });
    expect(kept).toContainEqual({ id: 555, blockType: 'board', content: { heading: 'Our volunteers' } });
  });

  it("a legacy site's starter-pack sections count as untouched, for any pack version", () => {
    // Version 1 is migration 0004's condo pack, as `site_starter_packs.blocks`
    // holds it and as it was inserted into every site it was applied to.
    const condoV1: LookSection[] = [
      {
        blockType: 'hero',
        content: {
          headline: 'Welcome',
          subtitle: 'A welcoming Florida community.',
          ctaText: 'Resident Login',
          ctaTarget: '/auth/login',
        },
      },
      { blockType: 'announcements', content: { limit: 5, timeWindowDays: 30 } },
      { blockType: 'meetings', content: { limit: 10, timeWindowDays: 30 } },
      { blockType: 'documents', content: { limit: 5, includeCategories: ['budget', 'minutes', 'financial'] } },
      { blockType: 'contact', content: { showBoard: true, showManagement: true } },
    ];
    const condoV2: LookSection[] = [
      { blockType: 'hero', content: { headline: 'Welcome to our community' } },
      { blockType: 'announcements', content: { limit: 4 } },
      { blockType: 'meetings', content: { limit: 6 } },
      { blockType: 'text', content: { body: 'Our community has a pool and a clubhouse.' } },
      { blockType: 'contact', content: { showBoard: false, showManagement: true } },
    ];
    const packs = [condoV1, condoV2];

    for (const pack of packs) {
      const result = planLookSwitch({ current: siteFrom(pack), outgoingDefaults: packs, draftedLookId: null, live: null, incoming: bayfront });
      expect(result).toEqual(asPlanned(bayfront.sections));
    }

    // jsonb hands keys back in its own order; that is still the same section.
    const reordered = siteFrom(condoV1);
    reordered[1] = { id: 101, blockType: 'announcements', content: { timeWindowDays: 30, limit: 5 } };
    expect(planLookSwitch({ current: reordered, outgoingDefaults: packs, draftedLookId: null, live: null, incoming: bayfront })).toEqual(
      asPlanned(bayfront.sections),
    );

    // A section matching no version is the manager's, and stays in its slot.
    const edited = siteFrom(condoV1);
    edited[2] = { id: 102, blockType: 'meetings', content: { limit: 7, timeWindowDays: 30 } };
    const result = planLookSwitch({ current: edited, outgoingDefaults: packs, draftedLookId: null, live: null, incoming: bayfront });
    expect(result[3]).toEqual({ id: 102, blockType: 'meetings', content: { limit: 7, timeWindowDays: 30 } });
    expect(types(result)).toEqual(['hero', 'quicklinks', 'announcements', 'meetings', 'documents', 'contact']);
  });

  it('keeps a section whose content does not parse, or whose type it does not know', () => {
    const current: SiteSection[] = [
      ...siteFrom(bayfront.sections),
      // limit is capped at 20, so this fails its schema.
      { id: 900, blockType: 'announcements', content: { limit: 500 } },
    ];
    const result = planLookSwitch({ current, outgoingDefaults: [bayfront.sections], draftedLookId: null, live: null, incoming: heritage });
    expect(result).toContainEqual({ id: 900, blockType: 'announcements', content: { limit: 500 } });
  });

  it("uses each of the incoming look's sections once", () => {
    // Two untouched Announcements: the first takes Heritage's, the second goes,
    // rather than showing Heritage's Announcements twice.
    const [hero, quicklinks, announcements, meetings, documents, contact] = siteFrom(bayfront.sections);
    const current = [
      { ...hero!, content: EDITED_HERO },
      quicklinks!,
      announcements!,
      { ...announcements!, id: 300 },
      meetings!,
      documents!,
      contact!,
    ];

    const result = planLookSwitch({ current, outgoingDefaults: [bayfront.sections], draftedLookId: null, live: null, incoming: heritage });

    expect(types(result)).toEqual(['hero', 'announcements', 'meetings', 'documents', 'board', 'contact']);
  });

  it('counts what it replaced, kept, added and removed', () => {
    const edited = siteFrom(bayfront.sections);
    edited[0] = { id: 100, blockType: 'hero', content: EDITED_HERO };
    expect(
      planLookSwitchWithCounts({ current: edited, outgoingDefaults: [bayfront.sections], draftedLookId: null, live: null, incoming: heritage }),
    ).toMatchObject({ kept: 1, replaced: 4, removed: 1, added: 1 });

    // An untouched site: each section pairs with the incoming one of its type.
    expect(
      planLookSwitchWithCounts({
        current: siteFrom(bayfront.sections),
        outgoingDefaults: [bayfront.sections],
        draftedLookId: null,
        live: null,
        incoming: heritage,
      }),
    ).toMatchObject({ kept: 0, replaced: 5, removed: 1, added: 1 });
  });

  it('hands back copies, so changing the plan never changes the look', () => {
    const result = planLookSwitch({ current: [], outgoingDefaults: [], draftedLookId: null, live: null, incoming: heritage });
    (result[1]!.content as { limit: number }).limit = 20;
    expect(sectionOf(look('heritage').sections, 'announcements').content).toEqual({ limit: 5 });
  });
});

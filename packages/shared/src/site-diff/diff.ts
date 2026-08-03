/**
 * The draft-vs-published diff.
 *
 * The hard problem this solves is that **there is no stable section identity in
 * the data model.** Every write soft-deletes the old row and INSERTs a fresh
 * one, so `site_blocks.id` changes on every edit; draft and published rows
 * correlate only by `block_order`; and a reorder rewrites the slots. So identity
 * cannot be read off a row — it has to be derived by matching content.
 *
 * See docs/redesign/website-page/website-editor-v3-phase4-change-model-design.md
 * for the reasoning and the honest list of failure modes.
 */
import { TOMBSTONE_BLOCK_TYPE } from '../site-blocks/index';
import { fingerprint, parseSectionContent } from './canonical';
import {
  SITE_DIFF_SCHEMA_VERSION,
  type Change,
  type ChangeKey,
  type DiffResult,
  type SectionRef,
  type SiteSectionSnapshot,
  type SiteSnapshot,
} from './types';

/** Slot 1 is the hero and never participates in section ordering. */
const HERO_SLOT = 1;

const SECTION_TITLES: Record<string, string> = {
  hero: 'Welcome',
  text: 'Text',
  image: 'Image',
  documents: 'Documents',
  meetings: 'Meetings',
  announcements: 'Announcements',
  contact: 'Contact',
  faq: 'FAQ',
  gallery: 'Gallery',
  amenities: 'Amenities',
  payments: 'Payments',
};

/**
 * Human label for a block type. Falls back to the raw type rather than
 * "Unknown", so a type this build has no label for is still identifiable in a
 * review sheet.
 */
export function sectionTitle(blockType: string): string {
  return SECTION_TITLES[blockType] ?? blockType;
}

interface IndexedSection {
  slot: number;
  blockType: string;
  fp: string;
  degraded: boolean;
}

function index(sections: readonly SiteSectionSnapshot[]): IndexedSection[] {
  return sections
    .filter((s) => s.slot !== HERO_SLOT && s.blockType !== TOMBSTONE_BLOCK_TYPE)
    .map((s) => ({
      slot: s.slot,
      blockType: s.blockType,
      fp: fingerprint(s),
      degraded: parseSectionContent(s).degraded,
    }))
    .sort((a, b) => a.slot - b.slot);
}

const refP = (slot: number): SectionRef => `p${slot}`;
const refD = (slot: number): SectionRef => `d${slot}`;

/**
 * Diffs the last published site against the current draft.
 *
 * `published === null` means the site has never been published: everything is
 * `added`, and no `order` change is emitted — there is no previous order to
 * have changed.
 *
 * **Callers must pass `null`, not an empty snapshot, for a never-published
 * site.** The published side arrives over the wire as an empty ARRAY, and an
 * empty-but-present snapshot reports `firstPublish: false` with every section
 * as a plain `added` — which is not wrong, but loses the distinction the review
 * sheet uses to say "this will be your site's first publish". Coerce at the
 * boundary where you know the site has never been published.
 */
export function diffSite(published: SiteSnapshot | null, next: SiteSnapshot): DiffResult {
  const group = next.pageId ?? 'site';
  const changes: Change[] = [];

  /*
   * Page-qualify the three per-page keys — see `PageScopedChangeKey`.
   *
   * This function diffs ONE page and numbers sections by that page's slots, so
   * `block:d5`, `order` and `hero` are unique only within one call. Phase 11
   * concatenates one call per page, where two pages holding slot 5 would
   * otherwise both emit `block:d5` — a dedupe/revert key that names two
   * different sections, and a duplicated React key in the publish sheet.
   *
   * Only when a `pageId` is actually present: a page-unaware caller keeps
   * exactly the keys it had, so the prefix appears precisely where the
   * ambiguity it prevents could arise.
   */
  const qualify = <K extends string>(key: K): ChangeKey =>
    (next.pageId === undefined ? key : `${next.pageId}/${key}`) as ChangeKey;

  // --- hero ---------------------------------------------------------------
  // The hero is a block at slot 1 but is never reorderable and never
  // removable, so it gets its own key and is excluded from section matching.
  const publishedHero = published?.hero ?? null;
  const nextHero = next.hero ?? null;
  if (publishedHero || nextHero) {
    const heroChange = diffHero(publishedHero, nextHero, group);
    // Qualified here rather than inside `diffHero`, which is handed `group` and
    // so cannot tell a page-unaware caller (`pageId` undefined → `'site'`) from
    // a page literally named `site`. Only the hero KEY is page-scoped; the rest
    // of the change is unchanged.
    if (heroChange) changes.push({ ...heroChange, key: qualify('hero') });
  }

  // --- sections -----------------------------------------------------------
  const tombstoned = new Set(next.tombstonedSlots ?? []);
  const P = published ? index(published.sections) : [];
  const D = index(next.sections).filter((s) => !tombstoned.has(s.slot));

  const matchedP = new Array<boolean>(P.length).fill(false);
  /** draft index -> published index */
  const pairOf = new Map<number, number>();

  // Step 1: exact content match, preferring the same slot.
  //
  // The same-slot preference is what makes an unchanged site diff to nothing:
  // with several identical sections, matching greedily by first-available would
  // pair them across slots and report a reorder that did not happen.
  const byFp = new Map<string, number[]>();
  P.forEach((p, i) => {
    const bucket = byFp.get(p.fp);
    if (bucket) bucket.push(i);
    else byFp.set(p.fp, [i]);
  });

  D.forEach((d, di) => {
    const candidates = (byFp.get(d.fp) ?? []).filter((pi) => !matchedP[pi]);
    if (candidates.length === 0) return;
    const sameSlot = candidates.find((pi) => P[pi]!.slot === d.slot);
    const pick = sameSlot ?? candidates[0]!;
    pairOf.set(di, pick);
    matchedP[pick] = true;
  });

  // Step 2: same slot, same type => an edit in place.
  D.forEach((d, di) => {
    if (pairOf.has(di)) return;
    const pi = P.findIndex(
      (p, i) => !matchedP[i] && p.slot === d.slot && p.blockType === d.blockType,
    );
    if (pi !== -1) {
      pairOf.set(di, pi);
      matchedP[pi] = true;
    }
  });

  // Step 3: edited AND moved — only when it is unambiguous.
  //
  // Deliberately conservative: with two or more unmatched sections of the same
  // type on either side, any pairing is a guess. A wrong guess produces a
  // confidently mislabelled "edited" row and, in Phase 6, a per-change revert
  // that restores the wrong section. Two add/remove pairs are less tidy and
  // always true.
  const remainingTypes = new Set<string>();
  D.forEach((d, di) => {
    if (!pairOf.has(di)) remainingTypes.add(d.blockType);
  });
  for (const type of remainingTypes) {
    const leftoverD: number[] = [];
    const leftoverP: number[] = [];
    D.forEach((d, di) => {
      if (!pairOf.has(di) && d.blockType === type) leftoverD.push(di);
    });
    P.forEach((p, pi) => {
      if (!matchedP[pi] && p.blockType === type) leftoverP.push(pi);
    });
    if (leftoverD.length === 1 && leftoverP.length === 1) {
      pairOf.set(leftoverD[0]!, leftoverP[0]!);
      matchedP[leftoverP[0]!] = true;
    }
  }

  // --- reorder, over the MATCHED SUBSEQUENCE ONLY -------------------------
  //
  // This is the subtle part. Order must be judged on the sections that survive
  // in both versions, by their relative sequence — not on absolute slot
  // numbers. Deleting section 3 of 5 makes reorderSiteBlock renumber the rest,
  // so every trailing slot shifts while nothing has actually been reordered.
  // Comparing the matched subsequence makes that a non-event for free.
  const pairedDraftIndices = D.map((_, di) => di).filter((di) => pairOf.has(di));
  const sequence = pairedDraftIndices.map((di) => pairOf.get(di)!);
  const sortedSequence = [...sequence].sort((a, b) => a - b);
  const reordered = sequence.some((pi, i) => pi !== sortedSequence[i]);

  /** published index -> its position before and after, for alsoMoved */
  const positionBefore = new Map<number, number>();
  sortedSequence.forEach((pi, i) => positionBefore.set(pi, i));
  const positionAfter = new Map<number, number>();
  sequence.forEach((pi, i) => positionAfter.set(pi, i));

  // --- emission -----------------------------------------------------------
  D.forEach((d, di) => {
    const pi = pairOf.get(di);
    if (pi === undefined) {
      changes.push({
        key: qualify(`block:${refD(d.slot)}`),
        kind: 'added',
        group,
        title: `${sectionTitle(d.blockType)} section`,
        blockType: d.blockType,
        fromSlot: null,
        toSlot: d.slot,
        ...(d.degraded ? { degraded: true } : {}),
      });
      return;
    }
    const p = P[pi]!;
    if (p.fp === d.fp) return; // matched and identical — nothing to report
    const moved = positionBefore.get(pi) !== positionAfter.get(pi);
    changes.push({
      key: qualify(`block:${refP(p.slot)}`),
      kind: 'edited',
      group,
      title: `${sectionTitle(d.blockType)} section`,
      blockType: d.blockType,
      fromSlot: p.slot,
      toSlot: d.slot,
      ...(moved ? { alsoMoved: true } : {}),
      ...(p.degraded || d.degraded ? { degraded: true } : {}),
    });
  });

  P.forEach((p, pi) => {
    if (matchedP[pi]) return;
    changes.push({
      key: qualify(`block:${refP(p.slot)}`),
      kind: 'removed',
      group,
      title: `${sectionTitle(p.blockType)} section`,
      blockType: p.blockType,
      fromSlot: p.slot,
      toSlot: null,
      ...(p.degraded ? { degraded: true } : {}),
    });
  });

  if (reordered) {
    changes.push({
      key: qualify('order'),
      kind: 'reordered',
      group,
      title: 'Section order',
      blockType: null,
      fromSlot: null,
      toSlot: null,
      order: {
        from: sortedSequence.map((pi) => refP(P[pi]!.slot)),
        to: sequence.map((pi) => refP(P[pi]!.slot)),
      },
    });
  }

  return {
    schemaVersion: SITE_DIFF_SCHEMA_VERSION,
    changes,
    keys: changes.map((c) => c.key) as ChangeKey[],
    firstPublish: published === null,
  };
}

function diffHero(
  publishedHero: SiteSectionSnapshot | null,
  nextHero: SiteSectionSnapshot | null,
  group: string,
): Change | null {
  const base = {
    key: 'hero' as const,
    group,
    title: sectionTitle('hero'),
    blockType: 'hero' as string | null,
  };

  if (!publishedHero && nextHero) {
    return { ...base, kind: 'added', fromSlot: null, toSlot: nextHero.slot };
  }
  if (publishedHero && !nextHero) {
    return { ...base, kind: 'removed', fromSlot: publishedHero.slot, toSlot: null };
  }
  if (!publishedHero || !nextHero) return null;

  if (fingerprint(publishedHero) === fingerprint(nextHero)) return null;

  const degraded =
    parseSectionContent(publishedHero).degraded || parseSectionContent(nextHero).degraded;
  return {
    ...base,
    kind: 'edited',
    fromSlot: publishedHero.slot,
    toSlot: nextHero.slot,
    ...(degraded ? { degraded: true } : {}),
  };
}

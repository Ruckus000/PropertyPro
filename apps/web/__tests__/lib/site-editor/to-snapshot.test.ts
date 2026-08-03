/**
 * `toSnapshot` — the block-list → SiteSnapshot mapping.
 *
 * Tested on its own because every diff, every validation message and every
 * "Fix this" jump downstream is computed from this shape. An off-by-one here
 * does not throw; it silently reports the wrong section as changed.
 */
import { describe, it, expect } from 'vitest';
import { TOMBSTONE_BLOCK_TYPE } from '@propertypro/shared';
import { toSnapshot, issueTarget, HERO_SLOT } from '@/lib/site-editor/to-snapshot';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';

/** Phase 11b — every SiteBlockSummary carries the page it belongs to. */
const HOME_PAGE_ID = 10;

function block(overrides: Partial<SiteBlockSummary> = {}): SiteBlockSummary {
  return {
    id: 1,
    pageId: HOME_PAGE_ID,
    blockType: 'text',
    blockOrder: 2,
    content: { heading: 'Pool rules', body: 'No glass by the pool.' },
    isDraft: false,
    publishedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

const hero = (overrides: Partial<SiteBlockSummary> = {}) =>
  block({ id: 100, blockType: 'hero', blockOrder: HERO_SLOT, content: { headline: 'Hi' }, ...overrides });

describe('toSnapshot — hero', () => {
  it('lifts the slot-1 hero row out of the sections list', () => {
    const snapshot = toSnapshot([hero(), block({ id: 2, blockOrder: 2 })]);
    expect(snapshot.hero).toEqual({ slot: 1, blockType: 'hero', content: { headline: 'Hi' } });
    expect(snapshot.sections.map((s) => s.slot)).toEqual([2]);
  });

  it('is null when no hero has been authored', () => {
    expect(toSnapshot([block({ blockOrder: 2 })]).hero).toBeNull();
  });

  it('is null for an empty, undefined, or null list', () => {
    expect(toSnapshot([]).hero).toBeNull();
    expect(toSnapshot(undefined).sections).toEqual([]);
    expect(toSnapshot(null).sections).toEqual([]);
  });

  // The two cases the mapping must NOT paper over: hoisting any slot-1 row into
  // `hero` would hide the exact error siteIssues exists to report.
  it('leaves a non-hero row sitting at slot 1 in sections, so validation can see it', () => {
    const snapshot = toSnapshot([block({ id: 5, blockType: 'text', blockOrder: 1 })]);
    expect(snapshot.hero).toBeNull();
    expect(snapshot.sections).toEqual([
      { slot: 1, blockType: 'text', content: expect.anything() },
    ]);
  });

  it('leaves a hero-typed row that drifted off slot 1 in sections', () => {
    const snapshot = toSnapshot([hero({ blockOrder: 4 })]);
    expect(snapshot.hero).toBeNull();
    expect(snapshot.sections).toEqual([
      { slot: 4, blockType: 'hero', content: { headline: 'Hi' } },
    ]);
  });

  it('keeps only the first slot-1 hero and leaves any duplicate in sections', () => {
    const snapshot = toSnapshot([hero({ id: 100 }), hero({ id: 101, content: { headline: 'Dupe' } })]);
    expect(snapshot.hero?.content).toEqual({ headline: 'Hi' });
    expect(snapshot.sections).toHaveLength(1);
  });
});

describe('toSnapshot — sections', () => {
  it('orders sections by slot regardless of input order', () => {
    const snapshot = toSnapshot([
      block({ id: 3, blockOrder: 7 }),
      block({ id: 1, blockOrder: 2 }),
      block({ id: 2, blockOrder: 5 }),
    ]);
    expect(snapshot.sections.map((s) => s.slot)).toEqual([2, 5, 7]);
  });

  it('carries content through unparsed', () => {
    const content = { anything: { at: ['all'] } };
    expect(toSnapshot([block({ blockOrder: 3, content })]).sections[0]!.content).toBe(content);
  });

  it('keeps an out-of-range slot rather than filtering it, so validation can report it', () => {
    const snapshot = toSnapshot([block({ blockOrder: 400 })]);
    expect(snapshot.sections.map((s) => s.slot)).toEqual([400]);
  });

  it('preserves an unknown block type verbatim', () => {
    const snapshot = toSnapshot([block({ blockOrder: 2, blockType: 'from_a_newer_deploy' })]);
    expect(snapshot.sections[0]!.blockType).toBe('from_a_newer_deploy');
  });
});

describe('toSnapshot — tombstones', () => {
  it('turns a tombstone row into a tombstoned slot, not a section', () => {
    const snapshot = toSnapshot([
      hero(),
      block({ id: 2, blockOrder: 2 }),
      block({ id: 3, blockOrder: 3, blockType: TOMBSTONE_BLOCK_TYPE, content: {} }),
    ]);
    expect(snapshot.tombstonedSlots).toEqual([3]);
    expect(snapshot.sections.map((s) => s.slot)).toEqual([2]);
    expect(snapshot.sections.some((s) => s.blockType === TOMBSTONE_BLOCK_TYPE)).toBe(false);
  });

  it('omits tombstonedSlots entirely when nothing is staged for deletion', () => {
    expect(toSnapshot([hero()]).tombstonedSlots).toBeUndefined();
  });

  it('records every tombstoned slot, including one at the hero slot', () => {
    const snapshot = toSnapshot([
      block({ id: 1, blockOrder: 1, blockType: TOMBSTONE_BLOCK_TYPE, content: {} }),
      block({ id: 2, blockOrder: 4, blockType: TOMBSTONE_BLOCK_TYPE, content: {} }),
    ]);
    expect(snapshot.tombstonedSlots).toEqual([1, 4]);
    expect(snapshot.hero).toBeNull();
    expect(snapshot.sections).toEqual([]);
  });
});

describe('toSnapshot — options', () => {
  it('omits pageId and branding unless given', () => {
    const snapshot = toSnapshot([hero()]);
    expect('pageId' in snapshot).toBe(false);
    expect('branding' in snapshot).toBe(false);
  });

  it('passes pageId and branding through when given', () => {
    const snapshot = toSnapshot([hero()], { pageId: 'home', branding: { primaryColor: '#C2533A' } });
    expect(snapshot.pageId).toBe('home');
    expect(snapshot.branding).toEqual({ primaryColor: '#C2533A' });
  });
});

describe('issueTarget', () => {
  const snapshot = toSnapshot([
    hero(),
    block({ id: 2, blockOrder: 3, blockType: 'faq' }),
    block({ id: 3, blockOrder: 9, blockType: 'gallery' }),
  ]);

  it('resolves hero-scoped fields to the hero slot', () => {
    expect(issueTarget('hero', snapshot)).toEqual({ slot: 1, blockType: 'hero' });
    expect(issueTarget('hero.headline', snapshot)).toEqual({ slot: 1, blockType: 'hero' });
  });

  it('returns null for a hero field when there is no hero', () => {
    expect(issueTarget('hero', toSnapshot([]))).toBeNull();
  });

  // The whole point: `sections.1` is an INDEX, and index 1 here is slot 9.
  // Reading it as a slot would send the PM to the wrong section.
  it('reads sections.<n> as an array index, not a slot', () => {
    expect(issueTarget('sections.1.content.images', snapshot)).toEqual({
      slot: 9,
      blockType: 'gallery',
    });
    expect(issueTarget('sections.0.slot', snapshot)).toEqual({ slot: 3, blockType: 'faq' });
  });

  it('returns null for a field that names no section', () => {
    expect(issueTarget('primaryColor', snapshot)).toBeNull();
    expect(issueTarget('sections.99.slot', snapshot)).toBeNull();
    expect(issueTarget('sectionsfoo.1', snapshot)).toBeNull();
  });
});

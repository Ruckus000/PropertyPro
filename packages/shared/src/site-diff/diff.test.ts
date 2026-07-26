import { describe, it, expect } from 'vitest';
import { TOMBSTONE_BLOCK_TYPE } from '../site-blocks/index';
import { diffSite } from './diff';
import type { SiteSectionSnapshot, SiteSnapshot } from './types';

function text(slot: number, body: string): SiteSectionSnapshot {
  return { slot, blockType: 'text', content: { body } };
}
function image(slot: number, alt: string): SiteSectionSnapshot {
  return { slot, blockType: 'image', content: { imagePath: '42/content/a.webp', altText: alt } };
}
function hero(headline: string): SiteSectionSnapshot {
  return { slot: 1, blockType: 'hero', content: { headline } };
}
function snap(sections: SiteSectionSnapshot[], extra: Partial<SiteSnapshot> = {}): SiteSnapshot {
  return { hero: null, sections, ...extra };
}

describe('diffSite — first publish', () => {
  it('reports everything as added and never a reorder', () => {
    const next = snap([text(2, 'A'), text(3, 'B')], { hero: hero('Welcome') });
    const result = diffSite(null, next);

    expect(result.firstPublish).toBe(true);
    expect(result.changes.map((c) => c.kind)).toEqual(['added', 'added', 'added']);
    // There is no previous order, so "the order changed" is not a thing that
    // can have happened.
    expect(result.changes.some((c) => c.key === 'order')).toBe(false);
    expect(result.changes.find((c) => c.key === 'hero')?.kind).toBe('added');
  });
});

describe('diffSite — no change', () => {
  it('reports nothing for an identical site', () => {
    const site = snap([text(2, 'A'), text(3, 'B')], { hero: hero('Welcome') });
    expect(diffSite(site, site).changes).toEqual([]);
  });

  it('reports nothing when a stored row omits its schema defaults', () => {
    // `documents` defaults `limit` to 5. A legacy row stored as {} and a
    // freshly-written row stored as { limit: 5 } are byte-different and
    // semantically identical; a raw jsonb compare would report an edit on
    // every legacy row in the database.
    const published = snap([{ slot: 2, blockType: 'documents', content: {} }]);
    const next = snap([{ slot: 2, blockType: 'documents', content: { limit: 5 } }]);
    expect(diffSite(published, next).changes).toEqual([]);
  });

  it('reports nothing when key order differs', () => {
    const published = snap([
      { slot: 2, blockType: 'image', content: { imagePath: '42/content/a.webp', altText: 'A' } },
    ]);
    const next = snap([
      { slot: 2, blockType: 'image', content: { altText: 'A', imagePath: '42/content/a.webp' } },
    ]);
    expect(diffSite(published, next).changes).toEqual([]);
  });
});

describe('diffSite — single operations', () => {
  it('reports an in-place edit against the published slot', () => {
    const published = snap([text(2, 'A'), text(3, 'B')]);
    const next = snap([text(2, 'A edited'), text(3, 'B')]);
    const result = diffSite(published, next);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      key: 'block:p2',
      kind: 'edited',
      fromSlot: 2,
      toSlot: 2,
      blockType: 'text',
    });
    expect(result.changes[0]!.alsoMoved).toBeUndefined();
  });

  it('reports an added section against its draft slot', () => {
    const published = snap([text(2, 'A')]);
    const next = snap([text(2, 'A'), text(3, 'B')]);
    const result = diffSite(published, next);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ key: 'block:d3', kind: 'added', fromSlot: null, toSlot: 3 });
  });

  it('reports a tombstoned section as removed, with no reorder', () => {
    const published = snap([text(2, 'A'), text(3, 'B')]);
    const next = snap([text(2, 'A'), { ...text(3, 'B'), blockType: TOMBSTONE_BLOCK_TYPE, content: {} }]);
    const result = diffSite(published, next);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ key: 'block:p3', kind: 'removed', fromSlot: 3, toSlot: null });
    // Removing the last section does not reorder the ones above it.
    expect(result.changes.some((c) => c.key === 'order')).toBe(false);
  });

  it('honours tombstonedSlots as well as tombstone-typed rows', () => {
    const published = snap([text(2, 'A'), text(3, 'B')]);
    const next = snap([text(2, 'A'), text(3, 'B')], { tombstonedSlots: [3] });
    const result = diffSite(published, next);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ key: 'block:p3', kind: 'removed' });
  });

  it('reports a hero edit under the hero key, never as a reorder', () => {
    const published = snap([text(2, 'A')], { hero: hero('Old') });
    const next = snap([text(2, 'A')], { hero: hero('New') });
    const result = diffSite(published, next);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ key: 'hero', kind: 'edited' });
  });
});

describe('diffSite — reorder', () => {
  it('reports a pure swap as ONE order change and zero block changes', () => {
    const published = snap([text(2, 'A'), text(3, 'B'), text(4, 'C')]);
    // A and C swap slots. Content is untouched.
    const next = snap([text(2, 'C'), text(3, 'B'), text(4, 'A')]);
    const result = diffSite(published, next);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ key: 'order', kind: 'reordered' });
    expect(result.changes[0]!.order).toEqual({
      from: ['p2', 'p3', 'p4'],
      to: ['p4', 'p3', 'p2'],
    });
  });

  it('reports an edited-and-moved section as BOTH an edit and a reorder', () => {
    const published = snap([text(2, 'A'), text(3, 'B')]);
    // A moves to slot 3 and is edited on the way; B moves up to slot 2.
    const next = snap([text(2, 'B'), text(3, 'A edited')]);
    const result = diffSite(published, next);

    const edit = result.changes.find((c) => c.kind === 'edited');
    expect(edit).toMatchObject({ key: 'block:p2', fromSlot: 2, toSlot: 3, alsoMoved: true });
    expect(result.changes.some((c) => c.key === 'order')).toBe(true);
    expect(result.changes).toHaveLength(2);
  });

  it('does NOT report a reorder when surviving sections merely shift slots', () => {
    // The assertion the roadmap's test table omits. Five sections; the middle
    // one goes away and the rest close the gap. Every trailing slot number
    // changes, but nothing has been reordered — order is a property of the
    // relative sequence of survivors, not of absolute slot numbers.
    const published = snap([text(2, 'A'), text(3, 'B'), text(4, 'C'), text(5, 'D'), text(6, 'E')]);
    const next = snap([text(2, 'A'), text(3, 'B'), text(4, 'D'), text(5, 'E')]);
    const result = diffSite(published, next);

    expect(result.changes.some((c) => c.key === 'order')).toBe(false);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ key: 'block:p4', kind: 'removed' });
  });
});

describe('diffSite — ambiguity is reported honestly', () => {
  it('reports a type change at a slot as remove + add, not an edit', () => {
    // At the data layer that really is what happened: the row's type changed,
    // so calling it an "edit" would imply a content diff that does not exist.
    const published = snap([text(2, 'A')]);
    const next = snap([image(2, 'A')]);
    const result = diffSite(published, next);

    expect(result.changes.map((c) => c.kind).sort()).toEqual(['added', 'removed']);
  });

  it('refuses to guess when two same-type sections change on both sides', () => {
    // Two candidates each way: any pairing is a coin flip, and a wrong guess
    // produces a confidently mislabelled edit plus a per-change revert that
    // restores the wrong section.
    const published = snap([text(2, 'A'), text(3, 'B')]);
    const next = snap([text(2, 'X'), text(3, 'Y')]);
    const result = diffSite(published, next);

    // Step 2 matches same-slot-same-type, so these ARE edits — that is right,
    // because slot is real evidence. The ambiguous case needs the slots to move.
    expect(result.changes.map((c) => c.kind)).toEqual(['edited', 'edited']);
  });

  it('falls back to add + remove when same-type sections move AND change', () => {
    const published = snap([text(2, 'A'), text(4, 'B')]);
    // Both changed and neither is at its old slot: nothing distinguishes them.
    const next = snap([text(3, 'X'), text(5, 'Y')]);
    const result = diffSite(published, next);

    expect(result.changes.filter((c) => c.kind === 'added')).toHaveLength(2);
    expect(result.changes.filter((c) => c.kind === 'removed')).toHaveLength(2);
    expect(result.changes.some((c) => c.kind === 'edited')).toBe(false);
  });

  it('flags a section whose stored content no longer parses', () => {
    const published = snap([{ slot: 2, blockType: 'text', content: { body: 'A' } }]);
    // `body` is required and must be non-empty — this row predates the rule.
    const next = snap([{ slot: 2, blockType: 'text', content: { body: '' } }]);
    const result = diffSite(published, next);

    expect(result.changes[0]).toMatchObject({ kind: 'edited', degraded: true });
  });

  it('does not crash on a block type this build does not know', () => {
    const published = snap([{ slot: 2, blockType: 'payments', content: { target: '/payments' } }]);
    const next = snap([{ slot: 2, blockType: 'payments', content: { target: '/pay' } }]);
    const result = diffSite(published, next);
    expect(result.changes[0]).toMatchObject({ kind: 'edited', degraded: true });
  });
});

describe('diffSite — result invariants', () => {
  it('emits unique keys, since Phase 6 reverts by key', () => {
    const published = snap([text(2, 'A'), text(3, 'B'), text(4, 'C')], { hero: hero('Old') });
    const next = snap([text(2, 'A edited'), image(3, 'new'), text(4, 'C')], { hero: hero('New') });
    const result = diffSite(published, next);

    expect(new Set(result.keys).size).toBe(result.changes.length);
    expect(result.keys).toEqual(result.changes.map((c) => c.key));
  });

  it('keeps a removed slot and an added slot distinct even at the same number', () => {
    // p3 removed and d3 added must not collide into one key.
    const published = snap([text(3, 'A')]);
    const next = snap([image(3, 'B')]);
    const result = diffSite(published, next);
    expect(result.keys.sort()).toEqual(['block:d3', 'block:p3']);
  });

  it('stamps the schema version and groups by page', () => {
    const result = diffSite(snap([]), snap([text(2, 'A')], { pageId: 'home' }));
    expect(result.schemaVersion).toBe(1);
    expect(result.changes[0]!.group).toBe('home');
  });

  it('never emits a style change in this phase', () => {
    // Branding is unstaged and live-immediately, so both sides carry the same
    // value and there is nothing to diff until Phase 8 gives it a draft layer.
    const published = snap([text(2, 'A')], { branding: { primaryColor: '#C2533A' } });
    const next = snap([text(2, 'A')], { branding: { primaryColor: '#000000' } });
    expect(diffSite(published, next).changes).toEqual([]);
  });
});

/**
 * The Add catalog's seeds are hand-written literals, deliberately: importing
 * the schema registry to derive them would drag zod into the panel's chunk on a
 * route with a hard bundle budget.
 *
 * The cost of that choice is that a schema could tighten and the literal would
 * only fail at runtime — as a 400 the PM sees when they click "Text". This file
 * is the compensating control: it parses every seed against the SAME registry
 * the route uses, so a drift fails here first.
 */
import { describe, it, expect } from 'vitest';
import {
  BLOCK_TYPES,
  blockSchemaRegistry,
  TOMBSTONE_BLOCK_TYPE,
} from '@propertypro/shared';
import { siteIssues, publishBlocked } from '@propertypro/shared';
import {
  ADD_CATALOG,
  nextContentSlot,
  FIRST_CONTENT_SLOT,
  LAST_CONTENT_SLOT,
} from '@/components/pm/site-editor-v3/panels/add-catalog';

describe('ADD_CATALOG', () => {
  it('offers every block type except the hero', () => {
    const offered = ADD_CATALOG.map((e) => e.blockType).sort();
    const expected = BLOCK_TYPES.filter((t) => t !== 'hero')
      .slice()
      .sort();
    expect(offered).toEqual(expected);
  });

  it('never offers the hero or the tombstone sentinel', () => {
    const offered = ADD_CATALOG.map((e) => e.blockType as string);
    expect(offered).not.toContain('hero');
    expect(offered).not.toContain(TOMBSTONE_BLOCK_TYPE);
  });

  it('seeds content that the route will accept, for every non-image type', () => {
    // The route runs exactly this parse and 400s on a miss, so a failure here
    // is a failure the PM would have seen as "Invalid block content".
    for (const entry of ADD_CATALOG) {
      if (entry.needsImage) continue;
      expect(entry.seed, `${entry.blockType} must seed content`).not.toBeNull();
      const schema = blockSchemaRegistry[entry.blockType];
      const parsed = schema.safeParse(entry.seed);
      expect(
        parsed.success,
        `${entry.blockType} seed rejected: ${
          parsed.success ? '' : JSON.stringify(parsed.error.issues)
        }`,
      ).toBe(true);
    }
  });

  it('leaves the image-first types without a seed', () => {
    // Their schemas require a real uploaded storage path, so there is no valid
    // content to write before an upload. AddImageFlow builds it from the result.
    const imageFirst = ADD_CATALOG.filter((e) => e.needsImage).map((e) => e.blockType);
    expect(imageFirst.sort()).toEqual(['gallery', 'image']);
    for (const entry of ADD_CATALOG) {
      if (entry.needsImage) expect(entry.seed).toBeNull();
    }
  });

  it('marks exactly the Pro polish blocks', () => {
    // Must match POLISH_BLOCK_TYPES in the route, or the client either hides an
    // available type or offers one the server will 403.
    const polish = ADD_CATALOG.filter((e) => e.isPolish).map((e) => e.blockType);
    expect(polish.sort()).toEqual(['amenities', 'faq', 'gallery']);
  });

  it('seeds nothing that would block the community from publishing', () => {
    // The sharp edge this whole design avoids: siteIssues validates every draft
    // row and publishBlocked freezes publishing for the WHOLE community on any
    // error-severity issue. Seeded sections must never contribute one.
    const sections = ADD_CATALOG.filter((e) => !e.needsImage).map((entry, index) => ({
      slot: FIRST_CONTENT_SLOT + index,
      blockType: entry.blockType,
      content: entry.seed,
    }));
    const issues = siteIssues({
      hero: { slot: 1, blockType: 'hero', content: { headline: 'Welcome to the community' } },
      sections,
    });
    expect(publishBlocked(issues)).toBe(false);
  });
});

describe('nextContentSlot', () => {
  it('starts at the first content slot on an empty site', () => {
    expect(nextContentSlot([])).toBe(FIRST_CONTENT_SLOT);
  });

  it('appends after the hero when only the hero exists', () => {
    expect(nextContentSlot([{ blockOrder: 1 }])).toBe(2);
  });

  it('appends after the highest slot rather than filling a gap', () => {
    // Gaps are normal — reorders re-stamp the existing sparse sequence — and
    // filling one would drop the section mid-page with no explanation.
    expect(nextContentSlot([{ blockOrder: 1 }, { blockOrder: 2 }, { blockOrder: 7 }])).toBe(8);
  });

  it('counts a tombstoned slot as occupied', () => {
    // THE regression. A tombstone is a staged deletion that still holds its
    // slot; writing over it soft-deletes the tombstone, which cancels the
    // removal and republishes a section the PM deleted. Callers must pass raw
    // block rows, not movableSections.
    expect(nextContentSlot([{ blockOrder: 1 }, { blockOrder: 2 }, { blockOrder: 3 }])).toBe(4);
  });

  it('falls back to the first free slot once the end is reached', () => {
    const blocks = [{ blockOrder: 1 }, { blockOrder: 5 }, { blockOrder: LAST_CONTENT_SLOT }];
    expect(nextContentSlot(blocks)).toBe(2);
  });

  it('returns null when every content slot is taken', () => {
    const blocks = [{ blockOrder: 1 }];
    for (let slot = FIRST_CONTENT_SLOT; slot <= LAST_CONTENT_SLOT; slot += 1) {
      blocks.push({ blockOrder: slot });
    }
    expect(nextContentSlot(blocks)).toBeNull();
  });
});

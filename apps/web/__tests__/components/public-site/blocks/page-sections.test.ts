/**
 * Section anchors: which section a Quick links link lands on.
 *
 * The first section of each data type on a page carries its type as an id
 * (`#meetings`); later sections of that type carry none, so an id never
 * repeats. Quick links reads the same first section to decide whether its link
 * has anything to land on, so a link and its target cannot disagree.
 */
import { describe, it, expect } from 'vitest';
import { BLOCK_TYPES } from '@propertypro/shared';
import {
  ANCHORED_SECTION_TYPES,
  firstSectionOfType,
  sectionAnchorIds,
} from '@/components/public-site/blocks/page-sections';
import { hasView, isDataDrivenBlock } from '@/components/public-site/blocks/view-registry';

const PAGE = [
  { id: 1, blockType: 'hero', content: {} },
  { id: 2, blockType: 'quicklinks', content: {} },
  { id: 3, blockType: 'meetings', content: { timeWindowDays: 7 } },
  { id: 4, blockType: 'text', content: {} },
  { id: 5, blockType: 'meetings', content: { timeWindowDays: 90 } },
  { id: 6, blockType: 'documents', content: {} },
  { id: 7, blockType: 'contact', content: {} },
  { id: 8, blockType: 'board', content: {} },
  { id: 9, blockType: 'announcements', content: {} },
  { id: 10, blockType: 'contact', content: {} },
];

describe('sectionAnchorIds', () => {
  it('gives the first section of each data type its type as an id, and later ones none', () => {
    const anchors = sectionAnchorIds(PAGE);
    expect(Object.fromEntries(anchors)).toEqual({
      2: 'quicklinks',
      3: 'meetings',
      6: 'documents',
      7: 'contact',
      8: 'board',
      9: 'announcements',
    });
  });

  it('never hands out the same id twice', () => {
    const ids = [...sectionAnchorIds(PAGE).values()];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives authored sections no id', () => {
    const anchors = sectionAnchorIds(PAGE);
    expect(anchors.has(1)).toBe(false);
    expect(anchors.has(4)).toBe(false);
  });

  it('gives nothing to an empty page', () => {
    expect(sectionAnchorIds([]).size).toBe(0);
  });
});

describe('firstSectionOfType', () => {
  it('finds the first section of a type, the one its anchor is on', () => {
    expect(firstSectionOfType(PAGE, 'meetings')).toBe(PAGE[2]);
    expect(firstSectionOfType(PAGE, 'contact')?.id).toBe(7);
  });

  it('finds nothing for a type the page does not have', () => {
    expect(firstSectionOfType(PAGE, 'faq')).toBeUndefined();
  });
});

describe('ANCHORED_SECTION_TYPES', () => {
  it('is exactly the data-driven types, so every data view can be linked to', () => {
    const dataDriven = BLOCK_TYPES.filter((type) => hasView(type) && isDataDrivenBlock(type));
    expect([...ANCHORED_SECTION_TYPES].sort()).toEqual([...dataDriven].sort());
  });
});

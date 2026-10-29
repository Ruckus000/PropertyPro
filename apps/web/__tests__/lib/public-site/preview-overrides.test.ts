import { describe, it, expect } from 'vitest';
import {
  resolvePreviewLayoutId,
  applyPresetTokensToBranding,
  plannedSectionsToBlocks,
} from '@/lib/public-site/preview-overrides';

describe('resolvePreviewLayoutId', () => {
  it('uses a valid layout override', () => {
    expect(resolvePreviewLayoutId({ layoutId: 'tidewater' }, 'sable', 'condo_718')).toBe('sable');
  });

  it('falls back to the saved branding layout when override is invalid/absent', () => {
    expect(resolvePreviewLayoutId({ layoutId: 'boulevard' }, null, 'condo_718')).toBe('boulevard');
    expect(resolvePreviewLayoutId({ layoutId: 'boulevard' }, 'not-a-layout', 'condo_718')).toBe('boulevard');
  });

  it('falls back to the community-type default when nothing is set', () => {
    expect(resolvePreviewLayoutId(null, null, 'apartment')).toBe('sable');
    expect(resolvePreviewLayoutId(null, undefined, 'condo_718')).toBe('tidewater');
  });
});

describe('applyPresetTokensToBranding', () => {
  it('returns branding unchanged when there are no preset tokens', () => {
    const branding = { primaryColor: '#111111', fontHeading: 'Fraunces' };
    expect(applyPresetTokensToBranding(branding, null)).toBe(branding);
  });

  it('layers preset color + font tokens over branding (preset wins; font names mapped)', () => {
    const branding = { primaryColor: '#111111', secondaryColor: '#222222', fontHeading: 'Fraunces', fontBody: 'Manrope' };
    const result = applyPresetTokensToBranding(branding, {
      primaryColor: '#0e3338',
      accentColor: '#c66f49',
      headingFont: 'Newsreader',
      bodyFont: 'Inter',
    });
    expect(result).toMatchObject({
      primaryColor: '#0e3338', // preset wins
      secondaryColor: '#222222', // untouched (preset didn't set it)
      accentColor: '#c66f49',
      fontHeading: 'Newsreader', // headingFont → fontHeading
      fontBody: 'Inter', // bodyFont → fontBody
    });
  });

  it('works when branding is null (preset-only)', () => {
    const result = applyPresetTokensToBranding(null, { primaryColor: '#abcabc', bodyFont: 'Inter' });
    expect(result).toEqual({ primaryColor: '#abcabc', fontBody: 'Inter' });
  });
});

describe('plannedSectionsToBlocks', () => {
  it('numbers the sections in the order given, as a layout reads them', () => {
    const blocks = plannedSectionsToBlocks([
      { id: 30, blockType: 'hero', content: { headline: 'A' } },
      { id: 12, blockType: 'meetings', content: { limit: 5 } },
      { id: 21, blockType: 'contact', content: {} },
    ]);

    expect(blocks.map((b) => b.blockType)).toEqual(['hero', 'meetings', 'contact']);
    // The plan's order, not the row ids' or the slots' (the planner hands back no slots).
    expect(blocks.map((b) => b.blockOrder)).toEqual([1, 2, 3]);
  });

  it('keeps a section row’s id and content as they are', () => {
    const content = { headline: 'Harbor Pointe', hidden: true };
    const [block] = plannedSectionsToBlocks([{ id: 77, slot: 5, blockType: 'hero', content }]);

    expect(block).toEqual({ id: 77, blockType: 'hero', blockOrder: 1, content });
    expect(block!.content).toBe(content);
  });

  it('gives a section a look supplied an id no section on the page shares', () => {
    const blocks = plannedSectionsToBlocks([
      { blockType: 'hero', content: {} },
      { id: 41, blockType: 'announcements', content: {} },
      { blockType: 'board', content: {} },
      { id: 9, blockType: 'contact', content: {} },
      { blockType: 'quicklinks', content: {} },
    ]);

    const ids = blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => ![41, 9].includes(id)).every((id) => id > 41)).toBe(true);
    // The kept rows keep theirs.
    expect(blocks[1]!.id).toBe(41);
    expect(blocks[3]!.id).toBe(9);
  });

  it('gives an empty page no blocks', () => {
    expect(plannedSectionsToBlocks([])).toEqual([]);
  });

  it('numbers sections of a page with no rows from 1', () => {
    expect(plannedSectionsToBlocks([{ blockType: 'hero', content: {} }, { blockType: 'contact', content: {} }]).map((b) => b.id)).toEqual([1, 2]);
  });
});
